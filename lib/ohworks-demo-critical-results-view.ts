import { evaluateCriticalRepeat, explainCriticalRepeatReason } from './ohworks-critical-repeat';
import { buildCriticalValueNotificationLog, explainCriticalValueLogReason, type CriticalValueLogInput } from './ohworks-critical-value-log';
import { planNextEscalationContact, type EscalationContact, type PlanNextEscalationContactInput } from './ohworks-critical-notification-escalation';

export const DEMO_NOW = '2026-01-02T13:00:00.000Z';
const analyteCode = 'SYNTHETIC-ANALYTE-1';
const unit = 'mmol/L';
const escalationChain: EscalationContact[] = (['ordering_provider', 'covering_provider', 'charge_nurse', 'lab_director'] as const)
  .map((role, index) => ({ role, name: `SYNTHETIC-CONTACT-${index + 1}`, contactMethod: 'synthetic-pager' }));
const exhaustedAttempts = (chainIndex: number) => [
  { chainIndex, attemptedAt: '2026-01-02T12:00:00.000Z', reached: false },
  { chainIndex, attemptedAt: '2026-01-02T12:20:00.000Z', reached: false },
];

/** Every identifier, value, timestamp, limit and interval is fabricated, not regulatory guidance. */
export const DEMO_FIXTURES = {
  repeats: [[], [], [10.2], [12, 13]].map((values, index) => {
    const first = { subjectId: `SYNTHETIC-SUBJECT-00${index + 1}`, analyteCode, value: 10, unit, capturedAt: '2026-01-02T12:00:00.000Z' };
    return {
      first,
      repeats: values.map((value, repeatIndex) => ({ ...first, value, capturedAt: `2026-01-02T12:${repeatIndex === 0 ? '05' : '10'}:00.000Z` })),
      policy: { analyteCode, unit, repeatRequired: index !== 0, tolerance: { absolute: 0.5, percent: null }, maxRepeats: 2 },
    };
  }),
  logs: ([
    [{ sequence: 1, contactRole: 'PRIMARY', contactId: 'SYNTHETIC-CONTACT-1', calledAt: '2026-01-02T12:05:00.000Z', readBackConfirmed: true }],
    [
      { sequence: 1, contactRole: 'PRIMARY', contactId: 'SYNTHETIC-CONTACT-1', calledAt: '2026-01-02T12:20:00.000Z', readBackConfirmed: false },
      { sequence: 2, contactRole: 'ESCALATION', contactId: 'SYNTHETIC-CONTACT-2', calledAt: '2026-01-02T12:40:00.000Z', readBackConfirmed: true },
    ],
    [{ sequence: 1, contactRole: 'PRIMARY', contactId: 'SYNTHETIC-CONTACT-1', calledAt: '2026-01-02T12:05:00.000Z', readBackConfirmed: false }],
    [{ sequence: 1, contactRole: 'ESCALATION', contactId: 'SYNTHETIC-CONTACT-2', calledAt: '2026-01-02T12:05:00.000Z', readBackConfirmed: true }],
  ] satisfies CriticalValueLogInput['attempts'][]).map((attempts, index) => ({
    result: { subjectId: `SYNTHETIC-SUBJECT-00${index + 5}`, analyteCode, value: 10, unit, criticalRange: { low: 2, high: 8 }, identifiedAt: '2026-01-02T12:00:00.000Z' },
    attempts,
    policy: { escalationTimeoutMinutes: 30, complianceWindowMinutes: 30 },
  })),
  escalations: [
    { situation: 'Nobody tried yet', attemptsSoFar: [] },
    { situation: 'Last attempt too recent', attemptsSoFar: [{ chainIndex: 0, attemptedAt: '2026-01-02T12:55:20.000Z', reached: false }] },
    { situation: 'First contact exhausted', attemptsSoFar: exhaustedAttempts(0) },
    { situation: 'Every contact exhausted', attemptsSoFar: escalationChain.flatMap((_, index) => exhaustedAttempts(index)) },
  ].map(({ situation, attemptsSoFar }): { situation: string; input: PlanNextEscalationContactInput } => ({
    situation,
    input: { escalationChain, attemptsSoFar, maxAttemptsPerContact: 2, now: DEMO_NOW, minMinutesBetweenAttemptsToSameContact: 15 },
  })),
};

function buildRows() {
  const repeatRows = DEMO_FIXTURES.repeats.map((input) => {
    const outcome = evaluateCriticalRepeat(input);
    return { subject: input.first.subjectId, analyte: input.first.analyteCode, firstValue: input.first.value, unit: input.first.unit,
      repeatValues: input.repeats.map((repeat) => repeat.value), ...outcome, explanation: explainCriticalRepeatReason(outcome.reasonCode) };
  });
  const logRows = DEMO_FIXTURES.logs.map((input) => {
    const outcome = buildCriticalValueNotificationLog(input);
    return { ...outcome, entryHash: outcome.entryHash.slice(0, 12), explanation: explainCriticalValueLogReason(outcome.reasonCode) };
  });
  const escalationRows = DEMO_FIXTURES.escalations.map(({ situation, input }) => {
    const outcome = planNextEscalationContact(input);
    return { situation, ...outcome, targetRole: outcome.targetContact?.role ?? null, waitMinutes: Number(outcome.waitMinutes.toFixed(1)) };
  });
  return { repeatRows, logRows, escalationRows };
}

export type PilotCriticalResultsView = ReturnType<typeof buildRows> & {
  now: string;
  counts: { notifyBlocked: number; outsideWindowOrUnconfirmed: number; exhaustedChains: number };
};

/** Local pure rule evaluation only; no notification, transport, persistence or SENAITE connection. */
export function buildPilotCriticalResultsView(): PilotCriticalResultsView {
  const rows = buildRows();
  return { now: DEMO_NOW, ...rows, counts: {
    notifyBlocked: rows.repeatRows.filter((row) => !row.notifyAllowed).length,
    outsideWindowOrUnconfirmed: rows.logRows.filter((row) => !row.windowSatisfied).length,
    exhaustedChains: rows.escalationRows.filter((row) => row.action === 'escalation_chain_exhausted').length,
  } };
}
