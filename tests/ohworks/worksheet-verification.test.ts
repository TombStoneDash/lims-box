import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyWorksheetVerificationEvent,
  explainWorksheetVerificationBlock,
  isHighRiskWorksheetType,
  runWorksheetVerificationWorkflow,
  WorksheetVerificationInputError,
  type WorksheetBlockCode,
  type WorksheetContext,
  type WorksheetEvent,
  type WorksheetEventInput,
} from '../../lib/ohworks-worksheet-verification';

/**
 * All fabricated: synthetic tenant/worksheet identifiers, actor ids, and
 * timestamps. None of this represents a real lab, sample, or patient
 * record.
 */
const STANDARD_CONTEXT: WorksheetContext = {
  tenantId: 'tenant-synthetic-1',
  worksheetId: 'ws-synthetic-1',
  worksheetType: 'routine_chemistry',
};

const HIGH_RISK_CONTEXT: WorksheetContext = {
  tenantId: 'tenant-synthetic-1',
  worksheetId: 'ws-synthetic-2',
  worksheetType: 'blood_bank_crossmatch',
};

function baseFields(context: WorksheetContext, overrides: Partial<WorksheetEventInput> = {}): WorksheetEventInput {
  return {
    eventId: 'evt-1',
    worksheetId: context.worksheetId,
    tenantId: context.tenantId,
    kind: 'prepare',
    actorRole: 'preparer',
    actorId: 'actor-synthetic-preparer',
    occurredAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

function standardHappyPathEvents(): WorksheetEventInput[] {
  return [
    baseFields(STANDARD_CONTEXT, {
      eventId: 'evt-1',
      kind: 'prepare',
      actorRole: 'preparer',
      actorId: 'actor-synthetic-preparer',
      occurredAt: '2026-01-01T12:00:00.000Z',
      preparationNotes: 'Prepared synthetic routine chemistry worksheet.',
    }),
    baseFields(STANDARD_CONTEXT, {
      eventId: 'evt-2',
      kind: 'verify',
      actorRole: 'verifier',
      actorId: 'actor-synthetic-verifier',
      occurredAt: '2026-01-02T12:00:00.000Z',
      verificationNotes: 'Independently verified synthetic worksheet entries.',
    }),
    baseFields(STANDARD_CONTEXT, {
      eventId: 'evt-3',
      kind: 'lock',
      actorRole: 'verifier',
      actorId: 'actor-synthetic-verifier',
      occurredAt: '2026-01-03T12:00:00.000Z',
    }),
  ];
}

function highRiskHappyPathEvents(): WorksheetEventInput[] {
  return [
    baseFields(HIGH_RISK_CONTEXT, {
      eventId: 'evt-1',
      kind: 'prepare',
      actorRole: 'preparer',
      actorId: 'actor-synthetic-preparer',
      occurredAt: '2026-01-01T12:00:00.000Z',
      preparationNotes: 'Prepared synthetic blood bank crossmatch worksheet.',
    }),
    baseFields(HIGH_RISK_CONTEXT, {
      eventId: 'evt-2',
      kind: 'verify',
      actorRole: 'verifier',
      actorId: 'actor-synthetic-verifier',
      occurredAt: '2026-01-02T12:00:00.000Z',
      verificationNotes: 'Independently verified synthetic crossmatch entries.',
    }),
    baseFields(HIGH_RISK_CONTEXT, {
      eventId: 'evt-3',
      kind: 'sign_off',
      actorRole: 'third_party_reviewer',
      actorId: 'actor-synthetic-third-party',
      occurredAt: '2026-01-03T12:00:00.000Z',
      signOffNotes: 'Third-party sign-off recorded for synthetic crossmatch worksheet.',
    }),
    baseFields(HIGH_RISK_CONTEXT, {
      eventId: 'evt-4',
      kind: 'lock',
      actorRole: 'lab_director',
      actorId: 'actor-synthetic-director',
      occurredAt: '2026-01-04T12:00:00.000Z',
    }),
  ];
}

test('walks the standard-risk happy path from draft to locked without sign-off', () => {
  const result = runWorksheetVerificationWorkflow(STANDARD_CONTEXT, standardHappyPathEvents());
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'locked');
  assert.equal(result.history.length, 3);
  assert.equal(result.worksheetId, STANDARD_CONTEXT.worksheetId);
  assert.equal(result.tenantId, STANDARD_CONTEXT.tenantId);
});

test('walks the high-risk happy path from draft to locked via sign-off', () => {
  const result = runWorksheetVerificationWorkflow(HIGH_RISK_CONTEXT, highRiskHappyPathEvents());
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'locked');
  assert.equal(result.history.length, 4);
});

test('isHighRiskWorksheetType is true for declared high-risk types and false for standard types', () => {
  assert.equal(isHighRiskWorksheetType('blood_bank_crossmatch'), true);
  assert.equal(isHighRiskWorksheetType('molecular_pathology'), true);
  assert.equal(isHighRiskWorksheetType('critical_result_panel'), true);
  assert.equal(isHighRiskWorksheetType('routine_chemistry'), false);
  assert.equal(isHighRiskWorksheetType('routine_hematology'), false);
});

test('unlocks a locked worksheet with a declared reason and re-verifies before re-locking', () => {
  const events = [
    ...standardHappyPathEvents(),
    baseFields(STANDARD_CONTEXT, {
      eventId: 'evt-4',
      kind: 'unlock',
      actorRole: 'lab_director',
      actorId: 'actor-synthetic-director',
      occurredAt: '2026-01-04T12:00:00.000Z',
      unlockReason: 'Correcting a synthetic transcription error found after locking.',
    }),
    baseFields(STANDARD_CONTEXT, {
      eventId: 'evt-5',
      kind: 'edit',
      actorRole: 'preparer',
      actorId: 'actor-synthetic-preparer',
      occurredAt: '2026-01-05T12:00:00.000Z',
      editDescription: 'Corrected a synthetic transcription error.',
    }),
    baseFields(STANDARD_CONTEXT, {
      eventId: 'evt-6',
      kind: 'verify',
      actorRole: 'verifier',
      actorId: 'actor-synthetic-verifier',
      occurredAt: '2026-01-06T12:00:00.000Z',
      verificationNotes: 'Re-verified synthetic worksheet after correction.',
    }),
    baseFields(STANDARD_CONTEXT, {
      eventId: 'evt-7',
      kind: 'lock',
      actorRole: 'verifier',
      actorId: 'actor-synthetic-verifier',
      occurredAt: '2026-01-07T12:00:00.000Z',
    }),
  ];
  const result = runWorksheetVerificationWorkflow(STANDARD_CONTEXT, events);
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'locked');
  assert.equal(result.history.length, 7);
});

test('accepts an empty event list as trivially valid at the draft state', () => {
  const result = runWorksheetVerificationWorkflow(STANDARD_CONTEXT, []);
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'draft');
  assert.deepEqual(result.history, []);
});

test('rejects an unsupported event kind', () => {
  const result = applyWorksheetVerificationEvent(
    'draft',
    baseFields(STANDARD_CONTEXT, { kind: 'delete_worksheet' as never }),
    [],
    STANDARD_CONTEXT,
  );
  assert.deepEqual(result, { allowed: false, nextState: 'draft', blockCode: 'unsupported-event-kind' });
});

test('rejects an unknown actor role', () => {
  const result = applyWorksheetVerificationEvent(
    'draft',
    baseFields(STANDARD_CONTEXT, { actorRole: 'mystery_role' as never, preparationNotes: 'x' }),
    [],
    STANDARD_CONTEXT,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: WorksheetBlockCode }).blockCode, 'unknown-actor-role');
});

test('owner role check: rejects the wrong role for a valid kind', () => {
  const result = applyWorksheetVerificationEvent(
    'draft',
    baseFields(STANDARD_CONTEXT, { actorRole: 'verifier', preparationNotes: 'x' }),
    [],
    STANDARD_CONTEXT,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: WorksheetBlockCode }).blockCode, 'role-not-allowed-for-kind');
});

test('rejects a tenant mismatch', () => {
  const result = applyWorksheetVerificationEvent(
    'draft',
    baseFields(STANDARD_CONTEXT, { tenantId: 'tenant-other', preparationNotes: 'x' }),
    [],
    STANDARD_CONTEXT,
  );
  assert.equal((result as { blockCode: WorksheetBlockCode }).blockCode, 'tenant-mismatch');
});

test('rejects a worksheet id mismatch', () => {
  const result = applyWorksheetVerificationEvent(
    'draft',
    baseFields(STANDARD_CONTEXT, { worksheetId: 'ws-other', preparationNotes: 'x' }),
    [],
    STANDARD_CONTEXT,
  );
  assert.equal((result as { blockCode: WorksheetBlockCode }).blockCode, 'worksheet-id-mismatch');
});

test('rejects an unparseable timestamp', () => {
  const result = applyWorksheetVerificationEvent(
    'draft',
    baseFields(STANDARD_CONTEXT, { occurredAt: 'not-a-date', preparationNotes: 'x' }),
    [],
    STANDARD_CONTEXT,
  );
  assert.equal((result as { blockCode: WorksheetBlockCode }).blockCode, 'timestamp-invalid');
});

test('rejects a non-UTC timestamp', () => {
  const result = applyWorksheetVerificationEvent(
    'draft',
    baseFields(STANDARD_CONTEXT, { occurredAt: '2026-01-01T12:00:00.000+05:00', preparationNotes: 'x' }),
    [],
    STANDARD_CONTEXT,
  );
  assert.equal((result as { blockCode: WorksheetBlockCode }).blockCode, 'timestamp-not-utc');
});

test('rejects a timestamp that does not come after the prior event', () => {
  const first = applyWorksheetVerificationEvent(
    'draft',
    baseFields(STANDARD_CONTEXT, { eventId: 'evt-1', preparationNotes: 'x', occurredAt: '2026-01-02T12:00:00.000Z' }),
    [],
    STANDARD_CONTEXT,
  );
  assert.equal(first.allowed, true);
  const history = [(first as { event: WorksheetEvent }).event];
  const second = applyWorksheetVerificationEvent(
    'prepared',
    baseFields(STANDARD_CONTEXT, {
      eventId: 'evt-2',
      kind: 'verify',
      actorRole: 'verifier',
      actorId: 'actor-synthetic-verifier',
      occurredAt: '2026-01-01T12:00:00.000Z',
      verificationNotes: 'y',
    }),
    history,
    STANDARD_CONTEXT,
  );
  assert.equal((second as { blockCode: WorksheetBlockCode }).blockCode, 'timestamp-backwards');
});

test('rejects a replayed duplicate event id with identical content', () => {
  const event = baseFields(STANDARD_CONTEXT, { preparationNotes: 'x' });
  const first = applyWorksheetVerificationEvent('draft', event, [], STANDARD_CONTEXT);
  const history = [(first as { event: WorksheetEvent }).event];
  const replay = applyWorksheetVerificationEvent('prepared', event, history, STANDARD_CONTEXT);
  assert.equal((replay as { blockCode: WorksheetBlockCode }).blockCode, 'duplicate-event-id-replay');
});

test('rejects a duplicate event id with conflicting content', () => {
  const event = baseFields(STANDARD_CONTEXT, { preparationNotes: 'x' });
  const first = applyWorksheetVerificationEvent('draft', event, [], STANDARD_CONTEXT);
  const history = [(first as { event: WorksheetEvent }).event];
  const conflicting = applyWorksheetVerificationEvent(
    'prepared',
    baseFields(STANDARD_CONTEXT, { preparationNotes: 'a different set of notes entirely' }),
    history,
    STANDARD_CONTEXT,
  );
  assert.equal((conflicting as { blockCode: WorksheetBlockCode }).blockCode, 'duplicate-event-id-conflict');
});

test('fails closed on a skipped state: cannot verify before preparing', () => {
  const result = applyWorksheetVerificationEvent(
    'draft',
    baseFields(STANDARD_CONTEXT, {
      kind: 'verify',
      actorRole: 'verifier',
      actorId: 'actor-synthetic-verifier',
      verificationNotes: 'x',
    }),
    [],
    STANDARD_CONTEXT,
  );
  assert.equal((result as { blockCode: WorksheetBlockCode }).blockCode, 'skipped-transition');
});

test('fails closed on a skipped state: cannot lock directly from prepared', () => {
  const result = applyWorksheetVerificationEvent(
    'prepared',
    baseFields(STANDARD_CONTEXT, { kind: 'lock', actorRole: 'verifier', actorId: 'actor-synthetic-verifier' }),
    [],
    STANDARD_CONTEXT,
  );
  assert.equal((result as { blockCode: WorksheetBlockCode }).blockCode, 'skipped-transition');
});

test('rejects preparing with missing preparation notes', () => {
  const result = applyWorksheetVerificationEvent('draft', baseFields(STANDARD_CONTEXT, {}), [], STANDARD_CONTEXT);
  assert.equal((result as { blockCode: WorksheetBlockCode }).blockCode, 'preparation-notes-missing');
});

test('rejects editing with a missing edit description', () => {
  const result = applyWorksheetVerificationEvent(
    'prepared',
    baseFields(STANDARD_CONTEXT, { kind: 'edit', actorRole: 'preparer' }),
    [],
    STANDARD_CONTEXT,
  );
  assert.equal((result as { blockCode: WorksheetBlockCode }).blockCode, 'edit-description-missing');
});

test('rejects verifying with missing verification notes', () => {
  const result = applyWorksheetVerificationEvent(
    'prepared',
    baseFields(STANDARD_CONTEXT, { kind: 'verify', actorRole: 'verifier', actorId: 'actor-synthetic-verifier' }),
    [],
    STANDARD_CONTEXT,
  );
  assert.equal((result as { blockCode: WorksheetBlockCode }).blockCode, 'verification-notes-missing');
});

test('fail closed: rejects self-verification when the verifier is the same actor as the preparer', () => {
  const events = [
    baseFields(STANDARD_CONTEXT, {
      eventId: 'evt-1',
      kind: 'prepare',
      actorRole: 'preparer',
      actorId: 'actor-synthetic-same',
      preparationNotes: 'Prepared synthetic worksheet.',
      occurredAt: '2026-01-01T12:00:00.000Z',
    }),
    baseFields(STANDARD_CONTEXT, {
      eventId: 'evt-2',
      kind: 'verify',
      actorRole: 'verifier',
      actorId: 'actor-synthetic-same',
      verificationNotes: 'Attempting to verify my own work.',
      occurredAt: '2026-01-02T12:00:00.000Z',
    }),
  ];
  const result = runWorksheetVerificationWorkflow(STANDARD_CONTEXT, events);
  assert.equal(result.blocked, true);
  const lastStep = result.steps.at(-1);
  assert.equal(lastStep?.allowed, false);
  assert.equal((lastStep as { blockCode: WorksheetBlockCode }).blockCode, 'self-verification-rejected');
});

test('fail closed: rejects locking a high-risk worksheet without a recorded sign-off', () => {
  const events = [
    baseFields(HIGH_RISK_CONTEXT, {
      eventId: 'evt-1',
      kind: 'prepare',
      actorRole: 'preparer',
      actorId: 'actor-synthetic-preparer',
      preparationNotes: 'Prepared synthetic high-risk worksheet.',
      occurredAt: '2026-01-01T12:00:00.000Z',
    }),
    baseFields(HIGH_RISK_CONTEXT, {
      eventId: 'evt-2',
      kind: 'verify',
      actorRole: 'verifier',
      actorId: 'actor-synthetic-verifier',
      verificationNotes: 'Independently verified synthetic worksheet.',
      occurredAt: '2026-01-02T12:00:00.000Z',
    }),
    baseFields(HIGH_RISK_CONTEXT, {
      eventId: 'evt-3',
      kind: 'lock',
      actorRole: 'verifier',
      actorId: 'actor-synthetic-verifier',
      occurredAt: '2026-01-03T12:00:00.000Z',
    }),
  ];
  const result = runWorksheetVerificationWorkflow(HIGH_RISK_CONTEXT, events);
  assert.equal(result.blocked, true);
  const lastStep = result.steps.at(-1);
  assert.equal((lastStep as { blockCode: WorksheetBlockCode }).blockCode, 'sign-off-required-for-high-risk');
});

test('rejects a sign-off attempt on a standard-risk worksheet type', () => {
  const result = applyWorksheetVerificationEvent(
    'verified',
    baseFields(STANDARD_CONTEXT, {
      kind: 'sign_off',
      actorRole: 'third_party_reviewer',
      actorId: 'actor-synthetic-third-party',
      signOffNotes: 'x',
    }),
    [],
    STANDARD_CONTEXT,
  );
  assert.equal((result as { blockCode: WorksheetBlockCode }).blockCode, 'sign-off-not-applicable-for-standard-risk');
});

test('rejects a sign-off with missing sign-off notes', () => {
  const result = applyWorksheetVerificationEvent(
    'verified',
    baseFields(HIGH_RISK_CONTEXT, { kind: 'sign_off', actorRole: 'third_party_reviewer', actorId: 'actor-synthetic-third-party' }),
    [],
    HIGH_RISK_CONTEXT,
  );
  assert.equal((result as { blockCode: WorksheetBlockCode }).blockCode, 'sign-off-notes-missing');
});

test('fail closed: rejects editing a locked worksheet without an unlock reason', () => {
  const events = [
    ...standardHappyPathEvents(),
    baseFields(STANDARD_CONTEXT, {
      eventId: 'evt-4',
      kind: 'edit',
      actorRole: 'preparer',
      actorId: 'actor-synthetic-preparer',
      occurredAt: '2026-01-04T12:00:00.000Z',
      editDescription: 'Attempting to edit a locked worksheet.',
    }),
  ];
  const result = runWorksheetVerificationWorkflow(STANDARD_CONTEXT, events);
  assert.equal(result.blocked, true);
  const lastStep = result.steps.at(-1);
  assert.equal((lastStep as { blockCode: WorksheetBlockCode }).blockCode, 'edit-rejected-worksheet-locked');
});

test('rejects unlocking with a missing declared reason', () => {
  const events = [
    ...standardHappyPathEvents(),
    baseFields(STANDARD_CONTEXT, {
      eventId: 'evt-4',
      kind: 'unlock',
      actorRole: 'lab_director',
      actorId: 'actor-synthetic-director',
      occurredAt: '2026-01-04T12:00:00.000Z',
    }),
  ];
  const result = runWorksheetVerificationWorkflow(STANDARD_CONTEXT, events);
  assert.equal(result.blocked, true);
  const lastStep = result.steps.at(-1);
  assert.equal((lastStep as { blockCode: WorksheetBlockCode }).blockCode, 'unlock-reason-missing');
});

test('rejects unlocking attempted by a role other than the authorized lab_director', () => {
  const events = [
    ...standardHappyPathEvents(),
    baseFields(STANDARD_CONTEXT, {
      eventId: 'evt-4',
      kind: 'unlock',
      actorRole: 'verifier',
      actorId: 'actor-synthetic-verifier',
      occurredAt: '2026-01-04T12:00:00.000Z',
      unlockReason: 'Attempting an unauthorized unlock.',
    }),
  ];
  const result = runWorksheetVerificationWorkflow(STANDARD_CONTEXT, events);
  assert.equal(result.blocked, true);
  const lastStep = result.steps.at(-1);
  assert.equal((lastStep as { blockCode: WorksheetBlockCode }).blockCode, 'role-not-allowed-for-kind');
});

test('rejects a note that looks like PII', () => {
  const result = applyWorksheetVerificationEvent(
    'draft',
    baseFields(STANDARD_CONTEXT, { preparationNotes: 'x', note: 'contact patient at jane.doe@example.com' }),
    [],
    STANDARD_CONTEXT,
  );
  assert.equal((result as { blockCode: WorksheetBlockCode }).blockCode, 'note-suspected-pii');
});

test('reports the first failing event and stops processing the rest', () => {
  const events = [
    standardHappyPathEvents()[0],
    baseFields(STANDARD_CONTEXT, {
      eventId: 'evt-2',
      kind: 'verify',
      actorRole: 'verifier',
      actorId: 'actor-synthetic-verifier',
      occurredAt: '2026-01-02T12:00:00.000Z',
    }),
    standardHappyPathEvents()[2],
  ];
  const result = runWorksheetVerificationWorkflow(STANDARD_CONTEXT, events);
  assert.equal(result.blocked, true);
  assert.equal(result.history.length, 1);
  assert.equal(result.steps.length, 2);
  assert.equal(result.finalState, 'prepared');
});

test('throws WorksheetVerificationInputError when events is not an array', () => {
  assert.throws(
    () => runWorksheetVerificationWorkflow(STANDARD_CONTEXT, 'not-an-array' as unknown as unknown[]),
    (error: unknown) => error instanceof WorksheetVerificationInputError && error.code === 'events-not-array',
  );
});

test('throws WorksheetVerificationInputError for a malformed context', () => {
  assert.throws(
    () => runWorksheetVerificationWorkflow({ tenantId: '', worksheetId: 'x', worksheetType: 'routine_chemistry' }, []),
    (error: unknown) => error instanceof WorksheetVerificationInputError && error.code === 'context-malformed',
  );
});

test('throws WorksheetVerificationInputError for a context with an unrecognized worksheet type', () => {
  assert.throws(
    () => runWorksheetVerificationWorkflow({ tenantId: 't', worksheetId: 'w', worksheetType: 'mystery_type' }, []),
    (error: unknown) => error instanceof WorksheetVerificationInputError && error.code === 'context-malformed',
  );
});

test('throws WorksheetVerificationInputError for an event missing a required core field', () => {
  const malformed = { ...baseFields(STANDARD_CONTEXT, { preparationNotes: 'x' }), actorId: undefined };
  assert.throws(
    () => applyWorksheetVerificationEvent('draft', malformed, [], STANDARD_CONTEXT),
    (error: unknown) => error instanceof WorksheetVerificationInputError && error.code === 'event-malformed',
  );
});

test('throws WorksheetVerificationInputError for a non-object event', () => {
  assert.throws(
    () => applyWorksheetVerificationEvent('draft', null, [], STANDARD_CONTEXT),
    (error: unknown) => error instanceof WorksheetVerificationInputError && error.code === 'event-malformed',
  );
});

test('throws WorksheetVerificationInputError for a non-string kind-specific field', () => {
  const malformed = { ...baseFields(STANDARD_CONTEXT, {}), preparationNotes: 12345 };
  assert.throws(
    () => applyWorksheetVerificationEvent('draft', malformed, [], STANDARD_CONTEXT),
    (error: unknown) => error instanceof WorksheetVerificationInputError && error.code === 'event-malformed',
  );
});

test('explainWorksheetVerificationBlock covers every block code with a non-empty message', () => {
  const codes: WorksheetBlockCode[] = [
    'unsupported-event-kind',
    'unknown-actor-role',
    'role-not-allowed-for-kind',
    'tenant-mismatch',
    'worksheet-id-mismatch',
    'timestamp-invalid',
    'timestamp-not-utc',
    'timestamp-backwards',
    'duplicate-event-id-conflict',
    'duplicate-event-id-replay',
    'skipped-transition',
    'preparation-notes-missing',
    'edit-description-missing',
    'edit-rejected-worksheet-locked',
    'verification-notes-missing',
    'self-verification-rejected',
    'sign-off-notes-missing',
    'sign-off-not-applicable-for-standard-risk',
    'sign-off-required-for-high-risk',
    'unlock-reason-missing',
    'note-suspected-pii',
  ];
  for (const code of codes) {
    const message = explainWorksheetVerificationBlock(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

test('run result exposes exactly the documented shape', () => {
  const result = runWorksheetVerificationWorkflow(STANDARD_CONTEXT, standardHappyPathEvents());
  assert.deepEqual(Object.keys(result).sort(), ['blocked', 'finalState', 'history', 'steps', 'tenantId', 'worksheetId']);
});
