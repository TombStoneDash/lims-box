import {
  createNonconformanceRecord,
  explainNonconformanceRefusal,
  transitionNonconformance,
  type NonconformanceActionInput,
  type NonconformanceActorRole,
  type NonconformanceRecord,
  type NonconformanceRefusalCode,
  type NonconformanceState,
} from './ohworks-nonconformance';
import {
  diffResultVersions,
  explainSignificanceReason,
  type ResultDiffSignificanceReason,
  type ResultRow,
  type ResultVersionDiff,
  type SignificanceThreshold,
} from './ohworks-result-diff';

export interface PilotQualityTimelineEntry {
  action: NonconformanceActionInput;
  actorRole: NonconformanceActorRole;
  occurredAt: string;
  fromState: NonconformanceState;
  state: NonconformanceState;
  status: 'accepted' | 'refused';
  refusalCode: NonconformanceRefusalCode | null;
  explanation: string;
  recordBefore: NonconformanceRecord;
  recordAfter: NonconformanceRecord;
}

export interface PilotQualityDiffEntry {
  analyte: string;
  kind: 'changed' | 'added' | 'unchanged';
  old: string;
  new: string;
  delta: string;
  significant: boolean | null;
  significanceLabel: string;
  reason: ResultDiffSignificanceReason | null;
  explanation: string;
}

export interface PilotQualityEventsView {
  record: NonconformanceRecord;
  timeline: PilotQualityTimelineEntry[];
  sampleId: string;
  originalVersion: ResultRow[];
  amendedVersion: ResultRow[];
  thresholds: SignificanceThreshold[];
  diff: ResultVersionDiff;
  diffEntries: PilotQualityDiffEntry[];
  counts: { accepted: number; refused: number; changed: number; added: number; unchanged: number; significant: number };
}

/** Fixed, fabricated fixtures only. This evaluates rules in memory and performs no I/O. */
export function buildPilotQualityEventsView(): PilotQualityEventsView {
  let record = createNonconformanceRecord('SYNTHETIC-NC-001', 'tenant-synthetic-ohworks');
  const correctiveActionId = 'SYNTHETIC-CA-001';
  const steps: Array<{ action: NonconformanceActionInput; role: NonconformanceActorRole; at: string }> = [
    { action: { kind: 'CONTAIN', actorId: 'synthetic-investigator', containmentAction: 'Hold the fabricated batch.' }, role: 'investigator', at: '2026-01-01T08:00:00.000Z' },
    { action: { kind: 'RECORD_ROOT_CAUSE', actorId: 'synthetic-investigator', rootCause: 'DOCUMENTATION_ERROR' }, role: 'investigator', at: '2026-01-02T08:00:00.000Z' },
    { action: { kind: 'ASSIGN_CORRECTIVE_ACTION', actorId: 'synthetic-quality-officer', correctiveActionId, correctiveActionDescription: 'Correct the fabricated logging procedure.' }, role: 'quality_officer', at: '2026-01-03T08:00:00.000Z' },
    { action: { kind: 'SCHEDULE_EFFECTIVENESS_CHECK', actorId: 'synthetic-quality-officer', correctiveActionId }, role: 'quality_officer', at: '2026-01-04T08:00:00.000Z' },
    { action: { kind: 'RECORD_EFFECTIVENESS_CHECK', actorId: 'synthetic-verifier', correctiveActionId, effectivenessOutcome: 'passed' }, role: 'effectiveness_verifier', at: '2026-01-05T08:00:00.000Z' },
    { action: { kind: 'CLOSE', actorId: 'synthetic-investigator', closureSummary: 'Attempt to close the fabricated record.' }, role: 'investigator', at: '2026-01-06T08:00:00.000Z' },
    { action: { kind: 'CLOSE', actorId: 'synthetic-lab-director', closureSummary: 'Fabricated corrective action checked by a separate synthetic actor.' }, role: 'lab_director', at: '2026-01-07T08:00:00.000Z' },
  ];
  const timeline: PilotQualityTimelineEntry[] = steps.map(({ action, role, at }) => {
    const before = record;
    const result = transitionNonconformance(before, action, role, at);
    if (result.ok === true) record = result.record;
    return {
      action, actorRole: role, occurredAt: at, fromState: before.state, state: record.state,
      status: result.ok === true ? 'accepted' : 'refused',
      refusalCode: result.ok === true ? null : result.refusalCode,
      explanation: result.ok === true
        ? 'Accepted by the lifecycle rules for this fabricated record.'
        : explainNonconformanceRefusal(result.refusalCode),
      recordBefore: before, recordAfter: record,
    };
  });

  const originalVersion: ResultRow[] = [
    { analyteCode: 'SYNTHETIC-ANALYTE-UNCHANGED', value: 40, unit: 'mg/L' },
    { analyteCode: 'SYNTHETIC-ANALYTE-ABOVE', value: 100, unit: 'mg/L' },
    { analyteCode: 'SYNTHETIC-ANALYTE-BELOW', value: 100, unit: 'mg/L' },
    { analyteCode: 'SYNTHETIC-ANALYTE-FLAG', value: 5, unit: 'mg/L', flags: ['synthetic-normal'] },
  ];
  const amendedVersion: ResultRow[] = [
    { ...originalVersion[0] },
    { ...originalVersion[1], value: 120 },
    { ...originalVersion[2], value: 102 },
    { ...originalVersion[3], flags: ['synthetic-review'] },
    { analyteCode: 'SYNTHETIC-ANALYTE-ADDED', value: 12, unit: 'mg/L' },
  ];
  const thresholds: SignificanceThreshold[] = [
    { analyteCode: 'SYNTHETIC-ANALYTE-ABOVE', absolute: 5, percent: null },
    { analyteCode: 'SYNTHETIC-ANALYTE-BELOW', absolute: 5, percent: null },
  ];
  const diff = diffResultVersions(originalVersion, amendedVersion, thresholds);
  const formatValue = (value: number | string, unit: string | null | undefined, flags: readonly string[] = []) =>
    `${value}${unit ? ` ${unit}` : ''}${flags.length ? ` [${flags.join(', ')}]` : ''}`;
  const diffEntries: PilotQualityDiffEntry[] = amendedVersion.map((row) => {
    const changed = diff.changed.find((entry) => entry.analyteCode === row.analyteCode);
    if (changed) {
      return {
        analyte: changed.analyteCode, kind: 'changed',
        old: formatValue(changed.oldValue, changed.unit, changed.oldFlags),
        new: formatValue(changed.newValue, changed.unit, changed.newFlags),
        delta: changed.delta ? `${changed.delta.absolute} ${changed.unit ?? ''} (${changed.delta.percent ?? 'undefined'}%)`.trim() : 'Not numeric',
        significant: changed.significant, significanceLabel: changed.significant ? 'Yes — significant' : 'No',
        reason: changed.significanceReason, explanation: explainSignificanceReason(changed.significanceReason),
      };
    }
    const added = diff.added.find((entry) => entry.analyteCode === row.analyteCode);
    return {
      analyte: row.analyteCode, kind: added ? 'added' : 'unchanged',
      old: added ? 'Not present' : formatValue(row.value, row.unit, row.flags),
      new: formatValue(row.value, row.unit, row.flags), delta: added ? 'Not applicable' : 'No change',
      significant: added ? null : false, significanceLabel: added ? 'Not classified' : 'No', reason: null,
      explanation: added ? 'Added fabricated row; the diff rules do not classify additions for significance.' : 'No value or flag change in this fabricated row.',
    };
  });

  return {
    record, timeline, sampleId: 'SYNTHETIC-SAMPLE-001', originalVersion, amendedVersion, thresholds, diff, diffEntries,
    counts: {
      accepted: timeline.filter((entry) => entry.status === 'accepted').length,
      refused: timeline.filter((entry) => entry.status === 'refused').length,
      changed: diff.changed.length, added: diff.added.length,
      unchanged: diffEntries.filter((entry) => entry.kind === 'unchanged').length,
      significant: diff.changed.filter((entry) => entry.significant).length,
    },
  };
}
