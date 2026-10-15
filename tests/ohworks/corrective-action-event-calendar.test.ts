import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyCorrectiveActionEvent,
  runCorrectiveActionWorkflow,
  type CorrectiveActionBlockCode,
  type CorrectiveActionContext,
  type CorrectiveActionEvent,
  type CorrectiveActionEventInput,
} from '../../lib/ohworks-corrective-action';

/**
 * All fabricated: synthetic tenant/record/finding identifiers, actor ids,
 * and timestamps. None of this represents a real lab, sample, or patient
 * record.
 */
const CONTEXT: CorrectiveActionContext = {
  tenantId: 'tenant-synthetic-cal',
  recordId: 'ca-synthetic-cal',
  initialFindingReference: 'finding-synthetic-cal',
};

function baseFields(overrides: Partial<CorrectiveActionEventInput> = {}): CorrectiveActionEventInput {
  return {
    eventId: 'evt-cal-1',
    recordId: CONTEXT.recordId,
    tenantId: CONTEXT.tenantId,
    kind: 'start_investigation',
    actorRole: 'investigator',
    actorId: 'actor-synthetic-cal-1',
    occurredAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

test('reproduction: a start_investigation event at the nonexistent 2026-02-30T12:00:00Z fails closed', () => {
  const event = baseFields({
    eventId: 'evt-cal-repro-1',
    occurredAt: '2026-02-30T12:00:00Z',
    investigationScope: 'Fabricated scope: review the synthetic reproduction case.',
  });

  const single = applyCorrectiveActionEvent('opened', event, [], CONTEXT);
  assert.equal(single.allowed, false);
  assert.equal((single as { blockCode: CorrectiveActionBlockCode }).blockCode, 'timestamp-invalid');
  assert.equal((single as { nextState: unknown }).nextState, 'opened');

  const result = runCorrectiveActionWorkflow(CONTEXT, [event]);
  assert.equal(result.blocked, true);
  assert.equal(result.finalState, 'opened');
  assert.deepEqual(result.history, []);
  assert.equal(result.steps.length, 1);
  const lastStep = result.steps.at(-1);
  assert.equal(lastStep?.allowed, false);
  assert.equal((lastStep as { blockCode: CorrectiveActionBlockCode }).blockCode, 'timestamp-invalid');
});

test('an invalid later event after valid history fails closed without disturbing prior history or state', () => {
  const validStart = baseFields({
    eventId: 'evt-cal-2-start',
    occurredAt: '2026-01-01T12:00:00.000Z',
    investigationScope: 'Fabricated scope: review the synthetic calibration log.',
  });
  const invalidPropose = baseFields({
    eventId: 'evt-cal-2-propose',
    kind: 'propose_action',
    actorRole: 'investigator',
    occurredAt: '2026-04-31T09:00:00.000Z',
    proposedAction: 'Fabricated action: recalibrate the synthetic analyzer.',
    rootCause: 'EQUIPMENT_MALFUNCTION',
  });

  const result = runCorrectiveActionWorkflow(CONTEXT, [validStart, invalidPropose]);
  assert.equal(result.blocked, true);
  assert.equal(result.finalState, 'investigating');
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0].eventId, 'evt-cal-2-start');
  assert.equal(result.steps.length, 2);
  const lastStep = result.steps.at(-1);
  assert.equal(lastStep?.allowed, false);
  assert.equal((lastStep as { blockCode: CorrectiveActionBlockCode }).blockCode, 'timestamp-invalid');
});

test('rejects the nonexistent calendar date April 31st', () => {
  const result = applyCorrectiveActionEvent(
    'opened',
    baseFields({ eventId: 'evt-cal-apr31', occurredAt: '2026-04-31T08:00:00.000Z', investigationScope: 'x' }),
    [],
    CONTEXT,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: CorrectiveActionBlockCode }).blockCode, 'timestamp-invalid');
  assert.equal((result as { nextState: unknown }).nextState, 'opened');
});

test('rejects February 29th in a non-leap year', () => {
  const result = applyCorrectiveActionEvent(
    'opened',
    baseFields({ eventId: 'evt-cal-feb29-non-leap', occurredAt: '2025-02-29T08:00:00.000Z', investigationScope: 'x' }),
    [],
    CONTEXT,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: CorrectiveActionBlockCode }).blockCode, 'timestamp-invalid');
  assert.equal((result as { nextState: unknown }).nextState, 'opened');
});

test('accepts a valid leap-day timestamp (Feb 29 in a leap year)', () => {
  const result = applyCorrectiveActionEvent(
    'opened',
    baseFields({ eventId: 'evt-cal-feb29-leap', occurredAt: '2024-02-29T08:00:00.000Z', investigationScope: 'x' }),
    [],
    CONTEXT,
  );
  assert.equal(result.allowed, true);
  assert.equal((result as { nextState: unknown }).nextState, 'investigating');
  assert.equal((result as { event: CorrectiveActionEvent }).event.occurredAt, '2024-02-29T08:00:00.000Z');
});

test('accepts a valid fractional-second UTC timestamp', () => {
  const result = applyCorrectiveActionEvent(
    'opened',
    baseFields({ eventId: 'evt-cal-fractional', occurredAt: '2026-01-01T12:00:00.123456Z', investigationScope: 'x' }),
    [],
    CONTEXT,
  );
  assert.equal(result.allowed, true);
  assert.equal((result as { nextState: unknown }).nextState, 'investigating');
});

test('still blocks an otherwise-valid non-UTC timestamp as timestamp-not-utc, not timestamp-invalid', () => {
  const result = applyCorrectiveActionEvent(
    'opened',
    baseFields({ eventId: 'evt-cal-offset', occurredAt: '2026-01-01T12:00:00.000+05:00', investigationScope: 'x' }),
    [],
    CONTEXT,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: CorrectiveActionBlockCode }).blockCode, 'timestamp-not-utc');
});

test('a full happy path with a valid leap-day transition reaches closed and keeps every event in history', () => {
  const events: CorrectiveActionEventInput[] = [
    baseFields({
      eventId: 'evt-cal-happy-1',
      occurredAt: '2024-02-29T08:00:00.000Z',
      investigationScope: 'Fabricated scope: review the synthetic leap-day batch deviation report.',
    }),
    baseFields({
      eventId: 'evt-cal-happy-2',
      kind: 'propose_action',
      actorRole: 'investigator',
      occurredAt: '2024-03-01T08:00:00.000Z',
      proposedAction: 'Fabricated action: retrain synthetic staff on the logging procedure.',
      rootCause: 'TRAINING_GAP',
    }),
  ];
  const result = runCorrectiveActionWorkflow(CONTEXT, events);
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'action_proposed');
  assert.equal(result.history.length, 2);
});
