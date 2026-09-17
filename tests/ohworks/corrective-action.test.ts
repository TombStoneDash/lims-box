import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyCorrectiveActionEvent,
  CorrectiveActionInputError,
  explainCorrectiveActionBlock,
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
  tenantId: 'tenant-synthetic-1',
  recordId: 'ca-synthetic-1',
  initialFindingReference: 'finding-synthetic-1',
};

function baseFields(overrides: Partial<CorrectiveActionEventInput> = {}): CorrectiveActionEventInput {
  return {
    eventId: 'evt-1',
    recordId: CONTEXT.recordId,
    tenantId: CONTEXT.tenantId,
    kind: 'start_investigation',
    actorRole: 'investigator',
    actorId: 'actor-synthetic-1',
    occurredAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

function fullHappyPathEvents(): CorrectiveActionEventInput[] {
  return [
    baseFields({
      eventId: 'evt-1',
      kind: 'start_investigation',
      actorRole: 'investigator',
      occurredAt: '2026-01-01T12:00:00.000Z',
      investigationScope: 'Review synthetic batch deviation report.',
    }),
    baseFields({
      eventId: 'evt-2',
      kind: 'propose_action',
      actorRole: 'investigator',
      occurredAt: '2026-01-02T12:00:00.000Z',
      proposedAction: 'Retrain staff on synthetic sample logging procedure.',
      rootCause: 'TRAINING_GAP',
    }),
    baseFields({
      eventId: 'evt-3',
      kind: 'implement_action',
      actorRole: 'action_owner',
      occurredAt: '2026-01-03T12:00:00.000Z',
      implementationEvidence: 'synthetic-training-record-9001',
    }),
    baseFields({
      eventId: 'evt-4',
      kind: 'check_effectiveness',
      actorRole: 'qa_reviewer',
      occurredAt: '2026-01-04T12:00:00.000Z',
      effectivenessOutcome: 'effective',
    }),
    baseFields({
      eventId: 'evt-5',
      kind: 'close',
      actorRole: 'qa_reviewer',
      occurredAt: '2026-01-05T12:00:00.000Z',
      closureSummary: 'Retraining completed and verified effective on synthetic data.',
    }),
  ];
}

test('walks the full happy path from opened to closed', () => {
  const result = runCorrectiveActionWorkflow(CONTEXT, fullHappyPathEvents());
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'closed');
  assert.equal(result.history.length, 5);
  assert.equal(result.recordId, CONTEXT.recordId);
  assert.equal(result.tenantId, CONTEXT.tenantId);
});

test('reopens a closed record with a genuinely new finding and returns to investigating', () => {
  const events = [
    ...fullHappyPathEvents(),
    baseFields({
      eventId: 'evt-6',
      kind: 'reopen',
      actorRole: 'lab_director',
      occurredAt: '2026-01-06T12:00:00.000Z',
      newFinding: 'finding-synthetic-2',
    }),
  ];
  const result = runCorrectiveActionWorkflow(CONTEXT, events);
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'investigating');
  assert.equal(result.history.length, 6);
});

test('accepts an empty event list as trivially valid at the opened state', () => {
  const result = runCorrectiveActionWorkflow(CONTEXT, []);
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'opened');
  assert.deepEqual(result.history, []);
});

test('rejects an unsupported event kind', () => {
  const result = applyCorrectiveActionEvent('opened', baseFields({ kind: 'delete_record' as never }), [], CONTEXT);
  assert.deepEqual(result, { allowed: false, nextState: 'opened', blockCode: 'unsupported-event-kind' });
});

test('rejects an unknown actor role', () => {
  const result = applyCorrectiveActionEvent(
    'opened',
    baseFields({ actorRole: 'mystery_role' as never, investigationScope: 'x' }),
    [],
    CONTEXT,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: CorrectiveActionBlockCode }).blockCode, 'unknown-actor-role');
});

test('owner role check: rejects the wrong role for a valid kind', () => {
  const result = applyCorrectiveActionEvent(
    'opened',
    baseFields({ actorRole: 'qa_reviewer', investigationScope: 'x' }),
    [],
    CONTEXT,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: CorrectiveActionBlockCode }).blockCode, 'role-not-allowed-for-kind');
});

test('rejects a tenant mismatch', () => {
  const result = applyCorrectiveActionEvent(
    'opened',
    baseFields({ tenantId: 'tenant-other', investigationScope: 'x' }),
    [],
    CONTEXT,
  );
  assert.equal((result as { blockCode: CorrectiveActionBlockCode }).blockCode, 'tenant-mismatch');
});

test('rejects a record id mismatch', () => {
  const result = applyCorrectiveActionEvent(
    'opened',
    baseFields({ recordId: 'ca-other', investigationScope: 'x' }),
    [],
    CONTEXT,
  );
  assert.equal((result as { blockCode: CorrectiveActionBlockCode }).blockCode, 'record-id-mismatch');
});

test('rejects an unparseable timestamp', () => {
  const result = applyCorrectiveActionEvent(
    'opened',
    baseFields({ occurredAt: 'not-a-date', investigationScope: 'x' }),
    [],
    CONTEXT,
  );
  assert.equal((result as { blockCode: CorrectiveActionBlockCode }).blockCode, 'timestamp-invalid');
});

test('rejects a non-UTC timestamp', () => {
  const result = applyCorrectiveActionEvent(
    'opened',
    baseFields({ occurredAt: '2026-01-01T12:00:00.000+05:00', investigationScope: 'x' }),
    [],
    CONTEXT,
  );
  assert.equal((result as { blockCode: CorrectiveActionBlockCode }).blockCode, 'timestamp-not-utc');
});

test('rejects a timestamp that does not come after the prior event', () => {
  const first = applyCorrectiveActionEvent(
    'opened',
    baseFields({ eventId: 'evt-1', investigationScope: 'x', occurredAt: '2026-01-02T12:00:00.000Z' }),
    [],
    CONTEXT,
  );
  assert.equal(first.allowed, true);
  const history = [(first as { event: CorrectiveActionEvent }).event];
  const second = applyCorrectiveActionEvent(
    'investigating',
    baseFields({
      eventId: 'evt-2',
      kind: 'propose_action',
      actorRole: 'investigator',
      occurredAt: '2026-01-01T12:00:00.000Z',
      proposedAction: 'y',
      rootCause: 'TRAINING_GAP',
    }),
    history,
    CONTEXT,
  );
  assert.equal((second as { blockCode: CorrectiveActionBlockCode }).blockCode, 'timestamp-backwards');
});

test('rejects a replayed duplicate event id with identical content', () => {
  const event = baseFields({ investigationScope: 'x' });
  const first = applyCorrectiveActionEvent('opened', event, [], CONTEXT);
  const history = [(first as { event: CorrectiveActionEvent }).event];
  const replay = applyCorrectiveActionEvent('investigating', event, history, CONTEXT);
  assert.equal((replay as { blockCode: CorrectiveActionBlockCode }).blockCode, 'duplicate-event-id-replay');
});

test('rejects a duplicate event id with conflicting content', () => {
  const event = baseFields({ investigationScope: 'x' });
  const first = applyCorrectiveActionEvent('opened', event, [], CONTEXT);
  const history = [(first as { event: CorrectiveActionEvent }).event];
  const conflicting = applyCorrectiveActionEvent(
    'investigating',
    baseFields({ investigationScope: 'a different scope entirely' }),
    history,
    CONTEXT,
  );
  assert.equal((conflicting as { blockCode: CorrectiveActionBlockCode }).blockCode, 'duplicate-event-id-conflict');
});

test('fails closed on a skipped state: cannot propose an action before investigating', () => {
  const result = applyCorrectiveActionEvent(
    'opened',
    baseFields({ kind: 'propose_action', actorRole: 'investigator', proposedAction: 'x', rootCause: 'TRAINING_GAP' }),
    [],
    CONTEXT,
  );
  assert.equal((result as { blockCode: CorrectiveActionBlockCode }).blockCode, 'skipped-transition');
});

test('fails closed on a skipped state: cannot close directly from opened', () => {
  const result = applyCorrectiveActionEvent(
    'opened',
    baseFields({ kind: 'close', actorRole: 'qa_reviewer', closureSummary: 'x' }),
    [],
    CONTEXT,
  );
  assert.equal((result as { blockCode: CorrectiveActionBlockCode }).blockCode, 'skipped-transition');
});

test('fails closed on a skipped state: cannot implement an action while still investigating', () => {
  const result = applyCorrectiveActionEvent(
    'investigating',
    baseFields({ kind: 'implement_action', actorRole: 'action_owner', implementationEvidence: 'x' }),
    [],
    CONTEXT,
  );
  assert.equal((result as { blockCode: CorrectiveActionBlockCode }).blockCode, 'skipped-transition');
});

test('rejects starting an investigation with a missing investigation scope', () => {
  const result = applyCorrectiveActionEvent('opened', baseFields({}), [], CONTEXT);
  assert.equal((result as { blockCode: CorrectiveActionBlockCode }).blockCode, 'investigation-scope-missing');
});

test('rejects proposing an action with a missing proposed action', () => {
  const result = applyCorrectiveActionEvent(
    'investigating',
    baseFields({ kind: 'propose_action', actorRole: 'investigator', rootCause: 'TRAINING_GAP' }),
    [],
    CONTEXT,
  );
  assert.equal((result as { blockCode: CorrectiveActionBlockCode }).blockCode, 'proposed-action-missing');
});

test('rejects proposing an action with a missing root cause', () => {
  const result = applyCorrectiveActionEvent(
    'investigating',
    baseFields({ kind: 'propose_action', actorRole: 'investigator', proposedAction: 'x' }),
    [],
    CONTEXT,
  );
  assert.equal((result as { blockCode: CorrectiveActionBlockCode }).blockCode, 'root-cause-missing');
});

test('rejects proposing an action with an unknown root cause', () => {
  const result = applyCorrectiveActionEvent(
    'investigating',
    baseFields({
      kind: 'propose_action',
      actorRole: 'investigator',
      proposedAction: 'x',
      rootCause: 'MYSTERY_ROOT_CAUSE',
    }),
    [],
    CONTEXT,
  );
  assert.equal((result as { blockCode: CorrectiveActionBlockCode }).blockCode, 'root-cause-unknown');
});

test('rejects implementing an action with missing implementation evidence', () => {
  const result = applyCorrectiveActionEvent(
    'action_proposed',
    baseFields({ kind: 'implement_action', actorRole: 'action_owner' }),
    [],
    CONTEXT,
  );
  assert.equal((result as { blockCode: CorrectiveActionBlockCode }).blockCode, 'implementation-evidence-missing');
});

test('rejects checking effectiveness with a missing outcome', () => {
  const result = applyCorrectiveActionEvent(
    'action_implemented',
    baseFields({ kind: 'check_effectiveness', actorRole: 'qa_reviewer' }),
    [],
    CONTEXT,
  );
  assert.equal((result as { blockCode: CorrectiveActionBlockCode }).blockCode, 'effectiveness-outcome-missing');
});

test('rejects checking effectiveness with an unknown outcome', () => {
  const result = applyCorrectiveActionEvent(
    'action_implemented',
    baseFields({ kind: 'check_effectiveness', actorRole: 'qa_reviewer', effectivenessOutcome: 'sort_of' }),
    [],
    CONTEXT,
  );
  assert.equal((result as { blockCode: CorrectiveActionBlockCode }).blockCode, 'effectiveness-outcome-unknown');
});

test('rejects closing with a missing closure summary', () => {
  const events = fullHappyPathEvents().slice(0, 4);
  const result = runCorrectiveActionWorkflow(CONTEXT, [
    ...events,
    baseFields({ eventId: 'evt-5', kind: 'close', actorRole: 'qa_reviewer', occurredAt: '2026-01-05T12:00:00.000Z' }),
  ]);
  assert.equal(result.blocked, true);
  const lastStep = result.steps.at(-1);
  assert.equal(lastStep?.allowed, false);
  assert.equal((lastStep as { blockCode: CorrectiveActionBlockCode }).blockCode, 'closure-summary-missing');
});

test('fails closed on closing without a recorded effectiveness check confirming "effective"', () => {
  const events = [
    fullHappyPathEvents()[0],
    fullHappyPathEvents()[1],
    fullHappyPathEvents()[2],
    baseFields({
      eventId: 'evt-4',
      kind: 'check_effectiveness',
      actorRole: 'qa_reviewer',
      occurredAt: '2026-01-04T12:00:00.000Z',
      effectivenessOutcome: 'not_effective',
    }),
    baseFields({
      eventId: 'evt-5',
      kind: 'close',
      actorRole: 'qa_reviewer',
      occurredAt: '2026-01-05T12:00:00.000Z',
      closureSummary: 'Attempting closure despite an ineffective corrective action.',
    }),
  ];
  const result = runCorrectiveActionWorkflow(CONTEXT, events);
  assert.equal(result.blocked, true);
  const lastStep = result.steps.at(-1);
  assert.equal((lastStep as { blockCode: CorrectiveActionBlockCode }).blockCode, 'effectiveness-not-confirmed');
});

test('fails closed on reopening a closed record without a new finding (missing field)', () => {
  const events = [
    ...fullHappyPathEvents(),
    baseFields({ eventId: 'evt-6', kind: 'reopen', actorRole: 'lab_director', occurredAt: '2026-01-06T12:00:00.000Z' }),
  ];
  const result = runCorrectiveActionWorkflow(CONTEXT, events);
  assert.equal(result.blocked, true);
  const lastStep = result.steps.at(-1);
  assert.equal((lastStep as { blockCode: CorrectiveActionBlockCode }).blockCode, 'reopen-finding-missing');
});

test('fails closed on reopening a closed record by reusing the original finding', () => {
  const events = [
    ...fullHappyPathEvents(),
    baseFields({
      eventId: 'evt-6',
      kind: 'reopen',
      actorRole: 'lab_director',
      occurredAt: '2026-01-06T12:00:00.000Z',
      newFinding: CONTEXT.initialFindingReference,
    }),
  ];
  const result = runCorrectiveActionWorkflow(CONTEXT, events);
  assert.equal(result.blocked, true);
  const lastStep = result.steps.at(-1);
  assert.equal((lastStep as { blockCode: CorrectiveActionBlockCode }).blockCode, 'reopen-finding-reused');
});

test('fails closed on reopening a second time by reusing a finding from an earlier reopen', () => {
  const events = [
    ...fullHappyPathEvents(),
    baseFields({
      eventId: 'evt-6',
      kind: 'reopen',
      actorRole: 'lab_director',
      occurredAt: '2026-01-06T12:00:00.000Z',
      newFinding: 'finding-synthetic-2',
    }),
    baseFields({
      eventId: 'evt-7',
      kind: 'propose_action',
      actorRole: 'investigator',
      occurredAt: '2026-01-07T12:00:00.000Z',
      proposedAction: 'Escalate to a stronger corrective action.',
      rootCause: 'INADEQUATE_PROCEDURE',
    }),
    baseFields({
      eventId: 'evt-8',
      kind: 'implement_action',
      actorRole: 'action_owner',
      occurredAt: '2026-01-08T12:00:00.000Z',
      implementationEvidence: 'synthetic-training-record-9002',
    }),
    baseFields({
      eventId: 'evt-9',
      kind: 'check_effectiveness',
      actorRole: 'qa_reviewer',
      occurredAt: '2026-01-09T12:00:00.000Z',
      effectivenessOutcome: 'effective',
    }),
    baseFields({
      eventId: 'evt-10',
      kind: 'close',
      actorRole: 'qa_reviewer',
      occurredAt: '2026-01-10T12:00:00.000Z',
      closureSummary: 'Second closure after escalation.',
    }),
    baseFields({
      eventId: 'evt-11',
      kind: 'reopen',
      actorRole: 'lab_director',
      occurredAt: '2026-01-11T12:00:00.000Z',
      newFinding: CONTEXT.initialFindingReference,
    }),
  ];
  const result = runCorrectiveActionWorkflow(CONTEXT, events);
  assert.equal(result.blocked, true);
  const lastStep = result.steps.at(-1);
  assert.equal((lastStep as { blockCode: CorrectiveActionBlockCode }).blockCode, 'reopen-finding-reused');
});

test('rejects a note that looks like PII', () => {
  const result = applyCorrectiveActionEvent(
    'opened',
    baseFields({ investigationScope: 'x', note: 'contact patient at jane.doe@example.com' }),
    [],
    CONTEXT,
  );
  assert.equal((result as { blockCode: CorrectiveActionBlockCode }).blockCode, 'note-suspected-pii');
});

test('reports the first failing event and stops processing the rest', () => {
  const events = [
    fullHappyPathEvents()[0],
    baseFields({
      eventId: 'evt-2',
      kind: 'propose_action',
      actorRole: 'investigator',
      occurredAt: '2026-01-02T12:00:00.000Z',
      proposedAction: 'x',
      rootCause: 'MYSTERY_ROOT_CAUSE',
    }),
    fullHappyPathEvents()[2],
  ];
  const result = runCorrectiveActionWorkflow(CONTEXT, events);
  assert.equal(result.blocked, true);
  assert.equal(result.history.length, 1);
  assert.equal(result.steps.length, 2);
  assert.equal(result.finalState, 'investigating');
});

test('throws CorrectiveActionInputError when events is not an array', () => {
  assert.throws(
    () => runCorrectiveActionWorkflow(CONTEXT, 'not-an-array' as unknown as unknown[]),
    (error: unknown) => error instanceof CorrectiveActionInputError && error.code === 'events-not-array',
  );
});

test('throws CorrectiveActionInputError for a malformed context', () => {
  assert.throws(
    () => runCorrectiveActionWorkflow({ tenantId: '', recordId: 'x', initialFindingReference: 'y' }, []),
    (error: unknown) => error instanceof CorrectiveActionInputError && error.code === 'context-malformed',
  );
});

test('throws CorrectiveActionInputError for an event missing a required core field', () => {
  const malformed = { ...baseFields({ investigationScope: 'x' }), actorId: undefined };
  assert.throws(
    () => applyCorrectiveActionEvent('opened', malformed, [], CONTEXT),
    (error: unknown) => error instanceof CorrectiveActionInputError && error.code === 'event-malformed',
  );
});

test('throws CorrectiveActionInputError for a non-object event', () => {
  assert.throws(
    () => applyCorrectiveActionEvent('opened', null, [], CONTEXT),
    (error: unknown) => error instanceof CorrectiveActionInputError && error.code === 'event-malformed',
  );
});

test('throws CorrectiveActionInputError for a non-string kind-specific field', () => {
  const malformed = { ...baseFields({}), investigationScope: 12345 };
  assert.throws(
    () => applyCorrectiveActionEvent('opened', malformed, [], CONTEXT),
    (error: unknown) => error instanceof CorrectiveActionInputError && error.code === 'event-malformed',
  );
});

test('explainCorrectiveActionBlock covers every block code with a non-empty message', () => {
  const codes: CorrectiveActionBlockCode[] = [
    'unsupported-event-kind',
    'unknown-actor-role',
    'role-not-allowed-for-kind',
    'tenant-mismatch',
    'record-id-mismatch',
    'timestamp-invalid',
    'timestamp-not-utc',
    'timestamp-backwards',
    'duplicate-event-id-conflict',
    'duplicate-event-id-replay',
    'skipped-transition',
    'investigation-scope-missing',
    'proposed-action-missing',
    'root-cause-missing',
    'root-cause-unknown',
    'implementation-evidence-missing',
    'effectiveness-outcome-missing',
    'effectiveness-outcome-unknown',
    'closure-summary-missing',
    'effectiveness-not-confirmed',
    'root-cause-not-recorded',
    'reopen-finding-missing',
    'reopen-finding-reused',
    'note-suspected-pii',
  ];
  for (const code of codes) {
    const message = explainCorrectiveActionBlock(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

test('run result exposes exactly the documented shape', () => {
  const result = runCorrectiveActionWorkflow(CONTEXT, fullHappyPathEvents());
  assert.deepEqual(Object.keys(result).sort(), ['blocked', 'finalState', 'history', 'recordId', 'steps', 'tenantId']);
});
