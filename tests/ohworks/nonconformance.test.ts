import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNonconformanceRecord,
  explainNonconformanceRefusal,
  NonconformanceInputError,
  NONCONFORMANCE_TRANSITIONS,
  transitionNonconformance,
  type NonconformanceActionInput,
  type NonconformanceRecord,
  type NonconformanceRefusalCode,
} from '../../lib/ohworks-nonconformance';

/**
 * All fabricated: synthetic record/tenant identifiers, actor ids, and
 * timestamps. None of this represents a real lab, sample, or patient
 * record.
 */
const RECORD = (): NonconformanceRecord => createNonconformanceRecord('nc-synthetic-1', 'tenant-synthetic-1');

function contain(overrides: Partial<NonconformanceActionInput> = {}): NonconformanceActionInput {
  return { kind: 'CONTAIN', actorId: 'actor-investigator-1', containmentAction: 'Quarantine synthetic batch.', ...overrides };
}

function recordRootCause(overrides: Partial<NonconformanceActionInput> = {}): NonconformanceActionInput {
  return { kind: 'RECORD_ROOT_CAUSE', actorId: 'actor-investigator-1', rootCause: 'TRAINING_GAP', ...overrides };
}

function assignCorrectiveAction(overrides: Partial<NonconformanceActionInput> = {}): NonconformanceActionInput {
  return {
    kind: 'ASSIGN_CORRECTIVE_ACTION',
    actorId: 'actor-quality-1',
    correctiveActionId: 'ca-synthetic-1',
    correctiveActionDescription: 'Retrain staff on synthetic sample logging procedure.',
    ...overrides,
  };
}

function scheduleEffectivenessCheck(overrides: Partial<NonconformanceActionInput> = {}): NonconformanceActionInput {
  return { kind: 'SCHEDULE_EFFECTIVENESS_CHECK', actorId: 'actor-quality-1', correctiveActionId: 'ca-synthetic-1', ...overrides };
}

function recordEffectivenessCheck(overrides: Partial<NonconformanceActionInput> = {}): NonconformanceActionInput {
  return {
    kind: 'RECORD_EFFECTIVENESS_CHECK',
    actorId: 'actor-verifier-1',
    correctiveActionId: 'ca-synthetic-1',
    effectivenessOutcome: 'passed',
    ...overrides,
  };
}

function close(overrides: Partial<NonconformanceActionInput> = {}): NonconformanceActionInput {
  return { kind: 'CLOSE', actorId: 'actor-quality-1', closureSummary: 'Verified effective on synthetic data.', ...overrides };
}

function voidAction(overrides: Partial<NonconformanceActionInput> = {}): NonconformanceActionInput {
  return { kind: 'VOID', actorId: 'actor-director-1', voidReason: 'Duplicate synthetic record.', ...overrides };
}

/** Walks a fresh synthetic record through the full happy path to CLOSED. */
function walkToClosed(): NonconformanceRecord {
  let record = RECORD();
  const steps: Array<[NonconformanceActionInput, string, string]> = [
    [contain(), 'investigator', '2026-01-01T12:00:00.000Z'],
    [recordRootCause(), 'investigator', '2026-01-02T12:00:00.000Z'],
    [assignCorrectiveAction(), 'quality_officer', '2026-01-03T12:00:00.000Z'],
    [scheduleEffectivenessCheck(), 'quality_officer', '2026-01-04T12:00:00.000Z'],
    [recordEffectivenessCheck(), 'effectiveness_verifier', '2026-01-05T12:00:00.000Z'],
    [close(), 'quality_officer', '2026-01-06T12:00:00.000Z'],
  ];
  for (const [action, role, ts] of steps) {
    const result = transitionNonconformance(record, action, role as never, ts);
    assert.equal(result.ok, true, `expected ${action.kind} to succeed`);
    record = (result as { ok: true; record: NonconformanceRecord }).record;
  }
  return record;
}

test('walks the full happy path from OPEN to CLOSED', () => {
  const record = walkToClosed();
  assert.equal(record.state, 'CLOSED');
  assert.equal(record.history.length, 6);
  assert.equal(record.recordId, 'nc-synthetic-1');
  assert.equal(record.tenantId, 'tenant-synthetic-1');
});

test('createNonconformanceRecord starts OPEN with empty frozen history', () => {
  const record = RECORD();
  assert.equal(record.state, 'OPEN');
  assert.deepEqual(record.history, []);
  assert.throws(() => (record.history as unknown[]).push({}));
});

test('appends an immutable history entry on each accepted transition', () => {
  const record = RECORD();
  const result = transitionNonconformance(record, contain(), 'investigator', '2026-01-01T12:00:00.000Z');
  assert.equal(result.ok, true);
  const next = (result as { ok: true; record: NonconformanceRecord }).record;
  assert.equal(next.history.length, 1);
  assert.equal(next.history[0].fromState, 'OPEN');
  assert.equal(next.history[0].toState, 'CONTAINED');
  assert.throws(() => Object.assign(next.history[0], { toState: 'CLOSED' }));
  assert.throws(() => (next.history as unknown[]).push({}));
  // original record is untouched
  assert.equal(record.history.length, 0);
});

test('allows assigning more than one corrective action while CORRECTIVE_ACTION_ASSIGNED', () => {
  let record = RECORD();
  record = (transitionNonconformance(record, contain(), 'investigator', '2026-01-01T12:00:00.000Z') as { ok: true; record: NonconformanceRecord }).record;
  record = (transitionNonconformance(record, recordRootCause(), 'investigator', '2026-01-02T12:00:00.000Z') as { ok: true; record: NonconformanceRecord }).record;
  record = (transitionNonconformance(record, assignCorrectiveAction(), 'quality_officer', '2026-01-03T12:00:00.000Z') as { ok: true; record: NonconformanceRecord }).record;
  const second = transitionNonconformance(
    record,
    assignCorrectiveAction({ correctiveActionId: 'ca-synthetic-2', correctiveActionDescription: 'Add a second synthetic control.' }),
    'quality_officer',
    '2026-01-03T13:00:00.000Z',
  );
  assert.equal(second.ok, true);
  assert.equal((second as { ok: true; record: NonconformanceRecord }).record.state, 'CORRECTIVE_ACTION_ASSIGNED');
  assert.equal((second as { ok: true; record: NonconformanceRecord }).record.history.length, 4);
});

test('a failed effectiveness check demands a new corrective action assignment', () => {
  let record = RECORD();
  record = (transitionNonconformance(record, contain(), 'investigator', '2026-01-01T12:00:00.000Z') as { ok: true; record: NonconformanceRecord }).record;
  record = (transitionNonconformance(record, recordRootCause(), 'investigator', '2026-01-02T12:00:00.000Z') as { ok: true; record: NonconformanceRecord }).record;
  record = (transitionNonconformance(record, assignCorrectiveAction(), 'quality_officer', '2026-01-03T12:00:00.000Z') as { ok: true; record: NonconformanceRecord }).record;
  record = (transitionNonconformance(record, scheduleEffectivenessCheck(), 'quality_officer', '2026-01-04T12:00:00.000Z') as { ok: true; record: NonconformanceRecord }).record;
  const failed = transitionNonconformance(
    record,
    recordEffectivenessCheck({ effectivenessOutcome: 'failed' }),
    'effectiveness_verifier',
    '2026-01-05T12:00:00.000Z',
  );
  assert.equal(failed.ok, true);
  record = (failed as { ok: true; record: NonconformanceRecord }).record;
  assert.equal(record.state, 'EFFECTIVENESS_CHECK_DUE');

  const reassigned = transitionNonconformance(
    record,
    assignCorrectiveAction({ correctiveActionId: 'ca-synthetic-2', correctiveActionDescription: 'Escalated synthetic corrective action.' }),
    'quality_officer',
    '2026-01-06T12:00:00.000Z',
  );
  assert.equal(reassigned.ok, true);
  assert.equal((reassigned as { ok: true; record: NonconformanceRecord }).record.state, 'CORRECTIVE_ACTION_ASSIGNED');
});

test('voids an open record', () => {
  const result = transitionNonconformance(RECORD(), voidAction(), 'lab_director', '2026-01-01T12:00:00.000Z');
  assert.equal(result.ok, true);
  assert.equal((result as { ok: true; record: NonconformanceRecord }).record.state, 'VOID');
});

test('rejects an unknown action', () => {
  const result = transitionNonconformance(RECORD(), { kind: 'DELETE' as never, actorId: 'x' }, 'investigator', '2026-01-01T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'unknown-action' });
});

test('rejects an unknown actor role', () => {
  const result = transitionNonconformance(RECORD(), contain(), 'mystery_role' as never, '2026-01-01T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'unknown-actor-role' });
});

test('fails closed on an unknown record state', () => {
  const record = { ...RECORD(), state: 'MYSTERY_STATE' as never };
  const result = transitionNonconformance(record, contain(), 'investigator', '2026-01-01T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'unknown-state' });
});

test('rejects an unparseable timestamp', () => {
  const result = transitionNonconformance(RECORD(), contain(), 'investigator', 'not-a-date');
  assert.deepEqual(result, { ok: false, refusalCode: 'timestamp-invalid' });
});

test('rejects a non-finite timestamp expressed as NaN', () => {
  const result = transitionNonconformance(RECORD(), contain(), 'investigator', 'NaN');
  assert.deepEqual(result, { ok: false, refusalCode: 'timestamp-invalid' });
});

test('rejects a non-UTC timestamp', () => {
  const result = transitionNonconformance(RECORD(), contain(), 'investigator', '2026-01-01T12:00:00.000+05:00');
  assert.deepEqual(result, { ok: false, refusalCode: 'timestamp-not-utc' });
});

test('rejects a timestamp that does not come after the prior history entry', () => {
  const first = transitionNonconformance(RECORD(), contain(), 'investigator', '2026-01-02T12:00:00.000Z');
  const record = (first as { ok: true; record: NonconformanceRecord }).record;
  const second = transitionNonconformance(record, recordRootCause(), 'investigator', '2026-01-01T12:00:00.000Z');
  assert.deepEqual(second, { ok: false, refusalCode: 'timestamp-backwards' });
});

test('rejects an equal timestamp as backwards (strictly monotonic)', () => {
  const first = transitionNonconformance(RECORD(), contain(), 'investigator', '2026-01-02T12:00:00.000Z');
  const record = (first as { ok: true; record: NonconformanceRecord }).record;
  const second = transitionNonconformance(record, recordRootCause(), 'investigator', '2026-01-02T12:00:00.000Z');
  assert.deepEqual(second, { ok: false, refusalCode: 'timestamp-backwards' });
});

test('rejects a role not allowed for the action (role check)', () => {
  const result = transitionNonconformance(RECORD(), contain(), 'lab_director', '2026-01-01T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'role-not-allowed-for-action' });
});

test('fails closed on a skipped transition: cannot record root cause before containment', () => {
  const result = transitionNonconformance(RECORD(), recordRootCause(), 'investigator', '2026-01-01T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'invalid-transition' });
});

test('fails closed on a skipped transition: cannot close directly from OPEN', () => {
  const result = transitionNonconformance(RECORD(), close(), 'quality_officer', '2026-01-01T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'invalid-transition' });
});

test('fails closed on acting against a terminal CLOSED record', () => {
  const record = walkToClosed();
  const result = transitionNonconformance(record, voidAction(), 'lab_director', '2026-01-07T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'invalid-transition' });
});

test('fails closed on acting against a terminal VOID record', () => {
  const voided = transitionNonconformance(RECORD(), voidAction(), 'lab_director', '2026-01-01T12:00:00.000Z');
  const record = (voided as { ok: true; record: NonconformanceRecord }).record;
  const result = transitionNonconformance(record, contain(), 'investigator', '2026-01-02T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'invalid-transition' });
});

test('rejects containment with a missing containment action', () => {
  const result = transitionNonconformance(RECORD(), contain({ containmentAction: undefined }), 'investigator', '2026-01-01T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'containment-action-missing' });
});

test('rejects recording a root cause with a missing root cause', () => {
  const contained = transitionNonconformance(RECORD(), contain(), 'investigator', '2026-01-01T12:00:00.000Z');
  const record = (contained as { ok: true; record: NonconformanceRecord }).record;
  const result = transitionNonconformance(record, recordRootCause({ rootCause: undefined }), 'investigator', '2026-01-02T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'root-cause-missing' });
});

test('rejects recording an unknown root cause', () => {
  const contained = transitionNonconformance(RECORD(), contain(), 'investigator', '2026-01-01T12:00:00.000Z');
  const record = (contained as { ok: true; record: NonconformanceRecord }).record;
  const result = transitionNonconformance(record, recordRootCause({ rootCause: 'MYSTERY_ROOT_CAUSE' }), 'investigator', '2026-01-02T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'root-cause-unknown' });
});

function toRootCauseRecorded(): NonconformanceRecord {
  let record = RECORD();
  record = (transitionNonconformance(record, contain(), 'investigator', '2026-01-01T12:00:00.000Z') as { ok: true; record: NonconformanceRecord }).record;
  record = (transitionNonconformance(record, recordRootCause(), 'investigator', '2026-01-02T12:00:00.000Z') as { ok: true; record: NonconformanceRecord }).record;
  return record;
}

test('rejects assigning a corrective action with a missing id', () => {
  const record = toRootCauseRecorded();
  const result = transitionNonconformance(record, assignCorrectiveAction({ correctiveActionId: undefined }), 'quality_officer', '2026-01-03T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'corrective-action-id-missing' });
});

test('rejects assigning a corrective action with a missing description', () => {
  const record = toRootCauseRecorded();
  const result = transitionNonconformance(record, assignCorrectiveAction({ correctiveActionDescription: undefined }), 'quality_officer', '2026-01-03T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'corrective-action-description-missing' });
});

test('rejects assigning a duplicate corrective action id', () => {
  const record = (transitionNonconformance(toRootCauseRecorded(), assignCorrectiveAction(), 'quality_officer', '2026-01-03T12:00:00.000Z') as { ok: true; record: NonconformanceRecord }).record;
  const result = transitionNonconformance(
    record,
    assignCorrectiveAction({ correctiveActionDescription: 'A different description entirely.' }),
    'quality_officer',
    '2026-01-03T13:00:00.000Z',
  );
  assert.deepEqual(result, { ok: false, refusalCode: 'corrective-action-id-duplicate' });
});

test('rejects scheduling an effectiveness check for an unassigned corrective action id', () => {
  const record = (transitionNonconformance(toRootCauseRecorded(), assignCorrectiveAction(), 'quality_officer', '2026-01-03T12:00:00.000Z') as { ok: true; record: NonconformanceRecord }).record;
  const result = transitionNonconformance(record, scheduleEffectivenessCheck({ correctiveActionId: 'ca-unknown' }), 'quality_officer', '2026-01-04T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'corrective-action-id-unknown' });
});

function toEffectivenessCheckDue(): NonconformanceRecord {
  let record = toRootCauseRecorded();
  record = (transitionNonconformance(record, assignCorrectiveAction(), 'quality_officer', '2026-01-03T12:00:00.000Z') as { ok: true; record: NonconformanceRecord }).record;
  record = (transitionNonconformance(record, scheduleEffectivenessCheck(), 'quality_officer', '2026-01-04T12:00:00.000Z') as { ok: true; record: NonconformanceRecord }).record;
  return record;
}

test('rejects recording an effectiveness check for an unassigned corrective action id', () => {
  const record = toEffectivenessCheckDue();
  const result = transitionNonconformance(record, recordEffectivenessCheck({ correctiveActionId: 'ca-unknown' }), 'effectiveness_verifier', '2026-01-05T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'corrective-action-id-unknown' });
});

test('rejects recording an effectiveness check with a missing outcome', () => {
  const record = toEffectivenessCheckDue();
  const result = transitionNonconformance(record, recordEffectivenessCheck({ effectivenessOutcome: undefined }), 'effectiveness_verifier', '2026-01-05T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'effectiveness-outcome-missing' });
});

test('rejects recording an effectiveness check with an unknown outcome', () => {
  const record = toEffectivenessCheckDue();
  const result = transitionNonconformance(record, recordEffectivenessCheck({ effectivenessOutcome: 'sort_of' }), 'effectiveness_verifier', '2026-01-05T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'effectiveness-outcome-unknown' });
});

test('segregation of duties: the corrective action assigner may not verify its effectiveness', () => {
  const record = toEffectivenessCheckDue();
  const result = transitionNonconformance(
    record,
    recordEffectivenessCheck({ actorId: 'actor-quality-1' }),
    'lab_director',
    '2026-01-05T12:00:00.000Z',
  );
  assert.deepEqual(result, { ok: false, refusalCode: 'assigner-cannot-verify-effectiveness' });
});

test('segregation of duties is keyed on actor id, not role: a different actor in the assigning role may verify', () => {
  const record = toEffectivenessCheckDue();
  const result = transitionNonconformance(
    record,
    recordEffectivenessCheck({ actorId: 'actor-quality-2' }),
    'lab_director',
    '2026-01-05T12:00:00.000Z',
  );
  assert.equal(result.ok, true);
});

test('rejects closing with a missing closure summary', () => {
  let record = toEffectivenessCheckDue();
  record = (transitionNonconformance(record, recordEffectivenessCheck(), 'effectiveness_verifier', '2026-01-05T12:00:00.000Z') as { ok: true; record: NonconformanceRecord }).record;
  const result = transitionNonconformance(record, close({ closureSummary: undefined }), 'quality_officer', '2026-01-06T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'closure-summary-missing' });
});

test('fails closed on closing without a recorded root cause', () => {
  // Build a record that reaches EFFECTIVENESS_CHECK_DUE without ever having recorded a root cause
  // is structurally impossible via the transition table, so directly probe the CLOSE guard by
  // constructing a record whose history omits RECORD_ROOT_CAUSE despite being in the right state.
  const contained = transitionNonconformance(RECORD(), contain(), 'investigator', '2026-01-01T12:00:00.000Z');
  const containedRecord = (contained as { ok: true; record: NonconformanceRecord }).record;
  const fabricated: NonconformanceRecord = Object.freeze({
    ...containedRecord,
    state: 'EFFECTIVENESS_CHECK_DUE',
  });
  const result = transitionNonconformance(fabricated, close(), 'quality_officer', '2026-01-02T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'close-requires-root-cause' });
});

test('fails closed on closing without any assigned corrective action', () => {
  const rootCauseRecorded = toRootCauseRecorded();
  const fabricated: NonconformanceRecord = Object.freeze({
    ...rootCauseRecorded,
    state: 'EFFECTIVENESS_CHECK_DUE',
  });
  const result = transitionNonconformance(fabricated, close(), 'quality_officer', '2026-01-03T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'close-requires-corrective-action' });
});

test('fails closed on closing without a passed effectiveness check', () => {
  const record = toEffectivenessCheckDue();
  const result = transitionNonconformance(record, close(), 'quality_officer', '2026-01-05T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'close-requires-passed-effectiveness-check' });
});

test('fails closed on closing when the only recorded effectiveness check failed', () => {
  let record = toEffectivenessCheckDue();
  record = (
    transitionNonconformance(record, recordEffectivenessCheck({ effectivenessOutcome: 'failed' }), 'effectiveness_verifier', '2026-01-05T12:00:00.000Z') as {
      ok: true;
      record: NonconformanceRecord;
    }
  ).record;
  const result = transitionNonconformance(record, close(), 'quality_officer', '2026-01-06T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'close-requires-passed-effectiveness-check' });
});

test('rejects voiding with a missing reason', () => {
  const result = transitionNonconformance(RECORD(), voidAction({ voidReason: undefined }), 'lab_director', '2026-01-01T12:00:00.000Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'void-reason-missing' });
});

test('throws NonconformanceInputError for a non-object record', () => {
  assert.throws(
    () => transitionNonconformance(null as unknown as NonconformanceRecord, contain(), 'investigator', '2026-01-01T12:00:00.000Z'),
    (error: unknown) => error instanceof NonconformanceInputError && error.code === 'record-malformed',
  );
});

test('throws NonconformanceInputError for a record with a non-array history', () => {
  const malformed = { ...RECORD(), history: 'not-an-array' as unknown as [] };
  assert.throws(
    () => transitionNonconformance(malformed, contain(), 'investigator', '2026-01-01T12:00:00.000Z'),
    (error: unknown) => error instanceof NonconformanceInputError && error.code === 'record-malformed',
  );
});

test('throws NonconformanceInputError for a non-object action', () => {
  assert.throws(
    () => transitionNonconformance(RECORD(), null as unknown as NonconformanceActionInput, 'investigator', '2026-01-01T12:00:00.000Z'),
    (error: unknown) => error instanceof NonconformanceInputError && error.code === 'action-malformed',
  );
});

test('throws NonconformanceInputError for an action missing a required core field', () => {
  const malformed = { ...contain(), actorId: undefined };
  assert.throws(
    () => transitionNonconformance(RECORD(), malformed as unknown as NonconformanceActionInput, 'investigator', '2026-01-01T12:00:00.000Z'),
    (error: unknown) => error instanceof NonconformanceInputError && error.code === 'action-malformed',
  );
});

test('throws NonconformanceInputError for a non-string kind-specific action field', () => {
  const malformed = { ...contain(), containmentAction: 12345 };
  assert.throws(
    () => transitionNonconformance(RECORD(), malformed as unknown as NonconformanceActionInput, 'investigator', '2026-01-01T12:00:00.000Z'),
    (error: unknown) => error instanceof NonconformanceInputError && error.code === 'action-malformed',
  );
});

test('the allowed-transition table has no outgoing transitions from CLOSED or VOID', () => {
  for (const fromStates of Object.values(NONCONFORMANCE_TRANSITIONS)) {
    assert.equal(fromStates.CLOSED, undefined);
    assert.equal(fromStates.VOID, undefined);
  }
});

test('explainNonconformanceRefusal covers every refusal code with a non-empty message', () => {
  const codes: NonconformanceRefusalCode[] = [
    'unknown-action',
    'unknown-actor-role',
    'unknown-state',
    'timestamp-invalid',
    'timestamp-not-utc',
    'timestamp-backwards',
    'role-not-allowed-for-action',
    'invalid-transition',
    'containment-action-missing',
    'root-cause-missing',
    'root-cause-unknown',
    'corrective-action-id-missing',
    'corrective-action-description-missing',
    'corrective-action-id-duplicate',
    'corrective-action-id-unknown',
    'effectiveness-outcome-missing',
    'effectiveness-outcome-unknown',
    'assigner-cannot-verify-effectiveness',
    'closure-summary-missing',
    'close-requires-root-cause',
    'close-requires-corrective-action',
    'close-requires-passed-effectiveness-check',
    'void-reason-missing',
  ];
  for (const code of codes) {
    const message = explainNonconformanceRefusal(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

test('transition result exposes exactly the documented record shape on success', () => {
  const result = transitionNonconformance(RECORD(), contain(), 'investigator', '2026-01-01T12:00:00.000Z');
  assert.equal(result.ok, true);
  const record = (result as { ok: true; record: NonconformanceRecord }).record;
  assert.deepEqual(Object.keys(record).sort(), ['history', 'recordId', 'state', 'tenantId']);
});
