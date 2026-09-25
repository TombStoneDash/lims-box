import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyResultReviewEvent,
  explainResultReviewBlock,
  ResultReviewInputError,
  runResultReviewWorkflow,
  type ResultReviewBlockCode,
  type ResultReviewContext,
  type ResultReviewEventInput,
} from '../../lib/ohworks-result-review-state';

/**
 * All fabricated: synthetic tenant/result identifiers and made-up event
 * data. None of this represents a real sample, patient, or customer.
 */
function baselineContext(): ResultReviewContext {
  return { tenantId: 'tenant-synthetic-a', resultId: 'result-synthetic-001' };
}

function event(overrides: Partial<ResultReviewEventInput> = {}): ResultReviewEventInput {
  return {
    eventId: 'evt-submit-1',
    resultId: 'result-synthetic-001',
    tenantId: 'tenant-synthetic-a',
    kind: 'submit_for_review',
    actorRole: 'submitter',
    actorId: 'actor-synthetic-submitter-001',
    reasonCode: 'ready-for-review',
    occurredAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

const ALL_BLOCK_CODES: ResultReviewBlockCode[] = [
  'unsupported-event-kind',
  'unknown-actor-role',
  'unknown-reason-code',
  'role-not-allowed-for-kind',
  'reason-code-not-allowed-for-kind',
  'tenant-mismatch',
  'result-id-mismatch',
  'timestamp-invalid',
  'timestamp-not-utc',
  'timestamp-backwards',
  'duplicate-event-id-conflict',
  'duplicate-event-id-replay',
  'correction-reason-missing',
  'note-suspected-pii',
  'terminal-state',
  'skipped-transition',
];

const FORBIDDEN_WORDS = [/compliant/i, /accredited/i, /released?\b.*\bresult/i];

// ---------------------------------------------------------------------------
// Golden paths
// ---------------------------------------------------------------------------

test('draft -> ready_for_review -> approved is a valid path', () => {
  const events = [
    event({ eventId: 'e1', kind: 'submit_for_review', occurredAt: '2026-01-01T12:00:00.000Z' }),
    event({
      eventId: 'e2',
      kind: 'approve',
      actorRole: 'reviewer',
      actorId: 'actor-synthetic-reviewer-001',
      reasonCode: 'meets-acceptance-criteria',
      occurredAt: '2026-01-01T12:05:00.000Z',
    }),
  ];
  const result = runResultReviewWorkflow(baselineContext(), events);
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'approved');
  assert.equal(result.history.length, 2);
});

test('draft -> ready_for_review -> rejected -> draft is a valid rework path', () => {
  const events = [
    event({ eventId: 'e1', kind: 'submit_for_review', occurredAt: '2026-01-01T12:00:00.000Z' }),
    event({
      eventId: 'e2',
      kind: 'reject',
      actorRole: 'reviewer',
      actorId: 'actor-synthetic-reviewer-001',
      reasonCode: 'incomplete-documentation',
      occurredAt: '2026-01-01T12:05:00.000Z',
    }),
    event({ eventId: 'e3', kind: 'revise', reasonCode: 'resubmitted-after-revision', occurredAt: '2026-01-01T12:10:00.000Z' }),
  ];
  const result = runResultReviewWorkflow(baselineContext(), events);
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'draft');
});

test('approved -> corrected is a valid path when a reason and note are supplied', () => {
  const events = [
    event({ eventId: 'e1', kind: 'submit_for_review', occurredAt: '2026-01-01T12:00:00.000Z' }),
    event({
      eventId: 'e2',
      kind: 'approve',
      actorRole: 'reviewer',
      actorId: 'actor-synthetic-reviewer-001',
      reasonCode: 'meets-acceptance-criteria',
      occurredAt: '2026-01-01T12:05:00.000Z',
    }),
    event({
      eventId: 'e3',
      kind: 'correct',
      actorRole: 'reviewer',
      actorId: 'actor-synthetic-reviewer-001',
      reasonCode: 'transcription-error',
      occurredAt: '2026-01-01T12:10:00.000Z',
      note: 'Fabricated unit was transposed during synthetic transcription.',
    }),
  ];
  const result = runResultReviewWorkflow(baselineContext(), events);
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'corrected');
  assert.equal(result.priorDecision, 'approved');
  assert.equal(result.history.length, 3);
  assert.equal(result.history[1].kind, 'approve');
});

test('a workflow with zero events stays at draft, unblocked', () => {
  const result = runResultReviewWorkflow(baselineContext(), []);
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'draft');
  assert.deepEqual(result.history, []);
  assert.equal(result.priorDecision, undefined);
});

// ---------------------------------------------------------------------------
// Correction preserves the prior decision
// ---------------------------------------------------------------------------

test('correcting an approved result preserves the approval event untouched in history', () => {
  const approveEvent = event({
    eventId: 'e2',
    kind: 'approve',
    actorRole: 'reviewer',
    actorId: 'actor-synthetic-reviewer-001',
    reasonCode: 'meets-acceptance-criteria',
    occurredAt: '2026-01-01T12:05:00.000Z',
  });
  const events = [
    event({ eventId: 'e1', kind: 'submit_for_review', occurredAt: '2026-01-01T12:00:00.000Z' }),
    approveEvent,
    event({
      eventId: 'e3',
      kind: 'correct',
      actorRole: 'reviewer',
      actorId: 'actor-synthetic-reviewer-001',
      reasonCode: 'reference-range-updated',
      occurredAt: '2026-01-01T12:10:00.000Z',
      note: 'Reference range updated after synthetic method revalidation.',
    }),
  ];
  const result = runResultReviewWorkflow(baselineContext(), events);
  assert.equal(result.blocked, false);
  const preserved = result.history[1];
  assert.equal(preserved.kind, 'approve');
  assert.equal(preserved.reasonCode, 'meets-acceptance-criteria');
  assert.equal(preserved.eventId, approveEvent.eventId);

  const correctStep = result.steps.find((step) => step.allowed && step.event.kind === 'correct');
  assert.ok(correctStep);
  assert.equal((correctStep as { priorState: string }).priorState, 'approved');
});

test('a correction event without a note fails closed as a missing correction reason', () => {
  const events = [
    event({ eventId: 'e1', kind: 'submit_for_review', occurredAt: '2026-01-01T12:00:00.000Z' }),
    event({
      eventId: 'e2',
      kind: 'approve',
      actorRole: 'reviewer',
      actorId: 'actor-synthetic-reviewer-001',
      reasonCode: 'meets-acceptance-criteria',
      occurredAt: '2026-01-01T12:05:00.000Z',
    }),
    event({
      eventId: 'e3',
      kind: 'correct',
      actorRole: 'reviewer',
      actorId: 'actor-synthetic-reviewer-001',
      reasonCode: 'transcription-error',
      occurredAt: '2026-01-01T12:10:00.000Z',
    }),
  ];
  const result = runResultReviewWorkflow(baselineContext(), events);
  assert.equal(result.blocked, true);
  assert.equal(result.finalState, 'approved');
  assert.equal((result.steps.at(-1) as { blockCode: ResultReviewBlockCode }).blockCode, 'correction-reason-missing');
});

test('a correction event with only whitespace in the note fails closed as a missing correction reason', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent(
    'approved',
    event({
      kind: 'correct',
      actorRole: 'reviewer',
      actorId: 'actor-synthetic-reviewer-001',
      reasonCode: 'transcription-error',
      note: '   ',
    }),
    [],
    context,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'correction-reason-missing');
});

test('a correction attempted directly from ready_for_review (never approved) fails closed as skipped', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent(
    'ready_for_review',
    event({
      kind: 'correct',
      actorRole: 'reviewer',
      actorId: 'actor-synthetic-reviewer-001',
      reasonCode: 'transcription-error',
      note: 'Attempted correction before approval.',
    }),
    [],
    context,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'skipped-transition');
});

// ---------------------------------------------------------------------------
// Actor-role checks
// ---------------------------------------------------------------------------

test('a submitter cannot approve a result', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent(
    'ready_for_review',
    event({ kind: 'approve', actorRole: 'submitter', reasonCode: 'meets-acceptance-criteria' }),
    [],
    context,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'role-not-allowed-for-kind');
});

test('a reviewer cannot submit a draft for review', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent(
    'draft',
    event({ kind: 'submit_for_review', actorRole: 'reviewer', actorId: 'actor-synthetic-reviewer-001' }),
    [],
    context,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'role-not-allowed-for-kind');
});

test('a submitter cannot record a correction', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent(
    'approved',
    event({ kind: 'correct', actorRole: 'submitter', reasonCode: 'transcription-error', note: 'Synthetic attempt.' }),
    [],
    context,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'role-not-allowed-for-kind');
});

test('an unknown actor role fails closed', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent(
    'draft',
    event({ actorRole: 'robot-overlord' as ResultReviewEventInput['actorRole'] }),
    [],
    context,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'unknown-actor-role');
});

// ---------------------------------------------------------------------------
// Skipped / terminal transitions
// ---------------------------------------------------------------------------

test('approving directly from draft (skipping submission) fails closed', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent(
    'draft',
    event({ kind: 'approve', actorRole: 'reviewer', actorId: 'actor-synthetic-reviewer-001', reasonCode: 'meets-acceptance-criteria' }),
    [],
    context,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'skipped-transition');
});

test('a corrected result is terminal and rejects further events', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent(
    'corrected',
    event({ kind: 'submit_for_review' }),
    [],
    context,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'terminal-state');
});

test('once blocked, later events in the batch are never evaluated', () => {
  const events = [
    event({ eventId: 'e1', kind: 'submit_for_review', occurredAt: '2026-01-01T12:00:00.000Z' }),
    event({
      eventId: 'e2',
      kind: 'approve',
      actorRole: 'submitter',
      reasonCode: 'meets-acceptance-criteria',
      occurredAt: '2026-01-01T12:05:00.000Z',
    }),
    event({
      eventId: 'e3',
      kind: 'reject',
      actorRole: 'reviewer',
      actorId: 'actor-synthetic-reviewer-001',
      reasonCode: 'qc-failure',
      occurredAt: '2026-01-01T12:10:00.000Z',
    }),
  ];
  const result = runResultReviewWorkflow(baselineContext(), events);
  assert.equal(result.steps.length, 2);
  assert.equal(result.finalState, 'ready_for_review');
});

// ---------------------------------------------------------------------------
// Conflicting / replay duplicates
// ---------------------------------------------------------------------------

test('an exact replay of a prior event id fails closed', () => {
  const first = event({ eventId: 'e1', kind: 'submit_for_review', occurredAt: '2026-01-01T12:00:00.000Z' });
  const result = runResultReviewWorkflow(baselineContext(), [first, { ...first }]);
  assert.equal(result.blocked, true);
  assert.equal((result.steps.at(-1) as { blockCode: ResultReviewBlockCode }).blockCode, 'duplicate-event-id-replay');
});

test('a conflicting duplicate event id (different content) fails closed', () => {
  const events = [
    event({ eventId: 'e1', kind: 'submit_for_review', occurredAt: '2026-01-01T12:00:00.000Z' }),
    event({
      eventId: 'e1',
      kind: 'approve',
      actorRole: 'reviewer',
      actorId: 'actor-synthetic-reviewer-001',
      reasonCode: 'meets-acceptance-criteria',
      occurredAt: '2026-01-01T12:05:00.000Z',
    }),
  ];
  const result = runResultReviewWorkflow(baselineContext(), events);
  assert.equal(result.blocked, true);
  assert.equal((result.steps.at(-1) as { blockCode: ResultReviewBlockCode }).blockCode, 'duplicate-event-id-conflict');
});

// ---------------------------------------------------------------------------
// Backwards / invalid time
// ---------------------------------------------------------------------------

test('an event timestamped before the prior event fails closed', () => {
  const events = [
    event({ eventId: 'e1', kind: 'submit_for_review', occurredAt: '2026-01-01T12:10:00.000Z' }),
    event({
      eventId: 'e2',
      kind: 'approve',
      actorRole: 'reviewer',
      actorId: 'actor-synthetic-reviewer-001',
      reasonCode: 'meets-acceptance-criteria',
      occurredAt: '2026-01-01T12:00:00.000Z',
    }),
  ];
  const result = runResultReviewWorkflow(baselineContext(), events);
  assert.equal(result.blocked, true);
  assert.equal((result.steps.at(-1) as { blockCode: ResultReviewBlockCode }).blockCode, 'timestamp-backwards');
});

test('an event with the exact same timestamp as the prior event fails closed as backwards', () => {
  const events = [
    event({ eventId: 'e1', kind: 'submit_for_review', occurredAt: '2026-01-01T12:00:00.000Z' }),
    event({
      eventId: 'e2',
      kind: 'approve',
      actorRole: 'reviewer',
      actorId: 'actor-synthetic-reviewer-001',
      reasonCode: 'meets-acceptance-criteria',
      occurredAt: '2026-01-01T12:00:00.000Z',
    }),
  ];
  const result = runResultReviewWorkflow(baselineContext(), events);
  assert.equal(result.blocked, true);
  assert.equal((result.steps.at(-1) as { blockCode: ResultReviewBlockCode }).blockCode, 'timestamp-backwards');
});

test('an unparsable timestamp fails closed', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ occurredAt: 'not-a-timestamp' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'timestamp-invalid');
});

test('a non-UTC (offset, non-"Z") timestamp fails closed', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ occurredAt: '2026-01-01T12:00:00.000+00:00' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'timestamp-not-utc');
});

// ---------------------------------------------------------------------------
// Impossible calendar dates: Date.parse silently rolls these forward
// (e.g. "2026-02-30" becomes March 2) instead of rejecting them, so this
// workflow must catch the rollover itself rather than trust Date.parse.
// ---------------------------------------------------------------------------

test('an impossible date in ordinary ISO form (Feb 30, non-leap year, with milliseconds) fails closed as invalid', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ occurredAt: '2026-02-30T12:00:00.000Z' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'timestamp-invalid');
});

test('an impossible date in one-digit month-day form fails closed as invalid', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ occurredAt: '2026-2-30 12:00:00Z' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'timestamp-invalid');
});

test('an impossible date in space-separated form fails closed as invalid', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ occurredAt: '2026-02-30 12:00:00Z' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'timestamp-invalid');
});

test('an impossible date-only timestamp fails closed as invalid', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ occurredAt: '2026-02-30Z' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'timestamp-invalid');
});

test('an impossible date in signed extended-year form fails closed as invalid', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ occurredAt: '+002026-02-30T12:00:00.000Z' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'timestamp-invalid');
});

test('a negative signed extended-year timestamp with an impossible date fails closed as invalid', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ occurredAt: '-000001-02-29T12:00:00.000Z' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'timestamp-invalid');
});

test('Feb 29 in a non-leap year fails closed as invalid', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ occurredAt: '2026-02-29T12:00:00.000Z' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'timestamp-invalid');
});

test('Feb 29 on a century boundary that is not a leap year (1900) fails closed as invalid', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ occurredAt: '1900-02-29T12:00:00.000Z' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'timestamp-invalid');
});

test('a day beyond the length of a 30-day month (April 31) fails closed as invalid', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ occurredAt: '2026-04-31T12:00:00.000Z' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'timestamp-invalid');
});

test('an ordinary ISO timestamp with milliseconds on a valid date is accepted', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ occurredAt: '2026-03-15T12:00:00.000Z' }), [], context);
  assert.equal(result.allowed, true);
});

test('an ordinary ISO timestamp without milliseconds on a valid date is accepted', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ occurredAt: '2026-03-15T12:00:00Z' }), [], context);
  assert.equal(result.allowed, true);
});

test('a leap day in year 2000 (century boundary divisible by 400) is accepted', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ occurredAt: '2000-02-29T12:00:00.000Z' }), [], context);
  assert.equal(result.allowed, true);
});

test('a leap day in year zero is accepted', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ occurredAt: '0000-02-29T12:00:00.000Z' }), [], context);
  assert.equal(result.allowed, true);
});

test('a one-digit month-day, space-separated timestamp on a valid date is accepted', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ occurredAt: '2026-1-1 2:00:00Z' }), [], context);
  assert.equal(result.allowed, true);
});

test('a date-only timestamp on a valid date is accepted', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ occurredAt: '2026-03-15Z' }), [], context);
  assert.equal(result.allowed, true);
});

test('a signed extended-year timestamp on a valid date is accepted', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ occurredAt: '+002026-03-15T12:00:00.000Z' }), [], context);
  assert.equal(result.allowed, true);
});

test('an ISO next-day midnight (24:00:00Z) timestamp is accepted', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ occurredAt: '2026-01-01T24:00:00.000Z' }), [], context);
  assert.equal(result.allowed, true);
});

test('an RFC-style UTC timestamp on a valid date is accepted', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ occurredAt: 'Thu, 01 Jan 2026 12:00:00 Z' }), [], context);
  assert.equal(result.allowed, true);
});

test('an impossible-date event blocks the workflow and prevents any state advancement', () => {
  const events = [event({ eventId: 'e1', kind: 'submit_for_review', occurredAt: '2026-02-30T12:00:00.000Z' })];
  const result = runResultReviewWorkflow(baselineContext(), events);
  assert.equal(result.blocked, true);
  assert.equal(result.finalState, 'draft');
  assert.deepEqual(result.history, []);
  assert.equal((result.steps.at(-1) as { blockCode: ResultReviewBlockCode }).blockCode, 'timestamp-invalid');
});

test('an impossible-date event later in a batch halts the workflow at that step without applying it', () => {
  const events = [
    event({ eventId: 'e1', kind: 'submit_for_review', occurredAt: '2026-01-01T12:00:00.000Z' }),
    event({
      eventId: 'e2',
      kind: 'approve',
      actorRole: 'reviewer',
      actorId: 'actor-synthetic-reviewer-001',
      reasonCode: 'meets-acceptance-criteria',
      occurredAt: '2026-04-31T12:00:00.000Z',
    }),
  ];
  const result = runResultReviewWorkflow(baselineContext(), events);
  assert.equal(result.blocked, true);
  assert.equal(result.finalState, 'ready_for_review');
  assert.equal(result.history.length, 1);
  assert.equal((result.steps.at(-1) as { blockCode: ResultReviewBlockCode }).blockCode, 'timestamp-invalid');
});

test('rejecting an impossible-date event does not mutate the caller-supplied event object', () => {
  const context = baselineContext();
  const raw = event({ occurredAt: '2026-02-30T12:00:00.000Z' });
  const before = JSON.stringify(raw);
  const result = applyResultReviewEvent('draft', raw, [], context);
  assert.equal(result.allowed, false);
  assert.equal(JSON.stringify(raw), before);
});

test('all accepted timestamp families reject impossible dates while preserving paired valid controls', () => {
  const context = baselineContext();
  const pairs = [
    ['ISO minute precision', '2026-02-28T10:00Z', '2026-02-30T10:00Z'],
    ['space minute precision', '2026-02-28 10:00Z', '2026-02-30 10:00Z'],
    ['RFC day first', '28 Feb 2026 10:00:00 Z', '30 Feb 2026 10:00:00 Z'],
    ['text month first', 'Feb 28 2026 10:00:00 Z', 'Feb 30 2026 10:00:00 Z'],
    ['slash year first', '2026/02/28 10:00:00Z', '2026/02/30 10:00:00Z'],
    ['slash month first', '02/28/2026 10:00:00Z', '02/30/2026 10:00:00Z'],
  ] as const;

  for (const [label, valid, impossible] of pairs) {
    const accepted = applyResultReviewEvent('draft', event({ eventId: `valid-${label}`, occurredAt: valid }), [], context);
    assert.equal(accepted.allowed, true, `${label}: valid control must remain accepted`);
    assert.equal(accepted.nextState, 'ready_for_review', `${label}: valid control must advance normally`);

    const rejected = applyResultReviewEvent(
      'draft',
      event({ eventId: `invalid-${label}`, occurredAt: impossible }),
      [],
      context,
    );
    assert.equal(rejected.allowed, false, `${label}: impossible date must fail closed`);
    assert.equal(rejected.nextState, 'draft', `${label}: impossible date must not advance the workflow`);
    assert.equal(
      (rejected as { blockCode: ResultReviewBlockCode }).blockCode,
      'timestamp-invalid',
      `${label}: impossible date must use the stable timestamp-invalid reason`,
    );
  }
});

// ---------------------------------------------------------------------------
// PII in audit metadata
// ---------------------------------------------------------------------------

test('a note containing an email address fails closed', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent(
    'draft',
    event({ note: 'Contact reviewer at jane.synthetic@example.com for details.' }),
    [],
    context,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'note-suspected-pii');
});

test('a note containing a phone number fails closed', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ note: 'Call 555-123-4567 to confirm.' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'note-suspected-pii');
});

test('a note mentioning "patient name" fails closed even without a value', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ note: 'Form still shows patient name field filled in.' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'note-suspected-pii');
});

test('an operational note with no PII is accepted', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ note: 'Synthetic transcription double-checked before submission.' }), [], context);
  assert.equal(result.allowed, true);
});

test('no note at all is accepted for non-correction events', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({}), [], context);
  assert.equal(result.allowed, true);
});

// ---------------------------------------------------------------------------
// Tenant / result mismatch
// ---------------------------------------------------------------------------

test('an event from a different tenant fails closed', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ tenantId: 'tenant-synthetic-intruder' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'tenant-mismatch');
});

test('an event for a different result fails closed', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({ resultId: 'result-synthetic-other' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'result-id-mismatch');
});

// ---------------------------------------------------------------------------
// Bounded field validation
// ---------------------------------------------------------------------------

test('an unknown reason code fails closed', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent(
    'draft',
    event({ reasonCode: 'because-i-said-so' as ResultReviewEventInput['reasonCode'] }),
    [],
    context,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'unknown-reason-code');
});

test('a reason code that is known but not allowed for the given kind fails closed', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent(
    'draft',
    event({ kind: 'submit_for_review', reasonCode: 'meets-acceptance-criteria' }),
    [],
    context,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'reason-code-not-allowed-for-kind');
});

test('an unsupported event kind fails closed', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent(
    'draft',
    event({ kind: 'release' as ResultReviewEventInput['kind'], reasonCode: 'ready-for-review' }),
    [],
    context,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'unsupported-event-kind');
});

// ---------------------------------------------------------------------------
// Immutability and purity
// ---------------------------------------------------------------------------

test('accepted events are frozen and cannot be mutated', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent('draft', event({}), [], context);
  assert.equal(result.allowed, true);
  const accepted = (result as { event: ResultReviewEventInput }).event;
  assert.ok(Object.isFrozen(accepted));
  const mutationSucceeded = Reflect.set(accepted, 'occurredAt', '2099-01-01T00:00:00.000Z');
  assert.equal(mutationSucceeded, false);
  assert.equal(accepted.occurredAt, '2026-01-01T12:00:00.000Z');
});

test('runResultReviewWorkflow returns a frozen history array and frozen steps array', () => {
  const result = runResultReviewWorkflow(baselineContext(), [event({ eventId: 'e1' })]);
  assert.ok(Object.isFrozen(result.history));
  assert.ok(Object.isFrozen(result.steps));
});

test('runResultReviewWorkflow does not mutate its input events array or objects', () => {
  const events = [
    event({ eventId: 'e1' }),
    event({
      eventId: 'e2',
      kind: 'approve',
      actorRole: 'reviewer',
      actorId: 'actor-synthetic-reviewer-001',
      reasonCode: 'meets-acceptance-criteria',
      occurredAt: '2026-01-01T12:05:00.000Z',
    }),
  ];
  const before = JSON.stringify(events);
  runResultReviewWorkflow(baselineContext(), events);
  assert.equal(JSON.stringify(events), before);
});

test('runResultReviewWorkflow is deterministic across repeated calls with equivalent input', () => {
  const events = () => [
    event({ eventId: 'e1' }),
    event({
      eventId: 'e2',
      kind: 'approve',
      actorRole: 'reviewer',
      actorId: 'actor-synthetic-reviewer-001',
      reasonCode: 'meets-acceptance-criteria',
      occurredAt: '2026-01-01T12:05:00.000Z',
    }),
  ];
  const first = runResultReviewWorkflow(baselineContext(), events());
  const second = runResultReviewWorkflow(baselineContext(), events());
  assert.deepEqual(first, second);
});

// ---------------------------------------------------------------------------
// Structurally malformed input throws, rather than guessing
// ---------------------------------------------------------------------------

test('a non-array events input throws a sanitized typed error', () => {
  assert.throws(
    () => runResultReviewWorkflow(baselineContext(), 'not-an-array'),
    (error: unknown) => {
      assert.ok(error instanceof ResultReviewInputError);
      assert.equal((error as ResultReviewInputError).code, 'events-not-array');
      return true;
    },
  );
});

test('a malformed context throws a sanitized typed error', () => {
  assert.throws(
    () => runResultReviewWorkflow({ tenantId: 'tenant-synthetic-a' } as unknown as ResultReviewContext, []),
    (error: unknown) => {
      assert.ok(error instanceof ResultReviewInputError);
      assert.equal((error as ResultReviewInputError).code, 'context-malformed');
      return true;
    },
  );
});

test('an event missing a required field throws a sanitized typed error', () => {
  const context = baselineContext();
  const malformed = event({});
  delete (malformed as Partial<ResultReviewEventInput>).eventId;
  assert.throws(
    () => applyResultReviewEvent('draft', malformed, [], context),
    (error: unknown) => {
      assert.ok(error instanceof ResultReviewInputError);
      assert.equal((error as ResultReviewInputError).code, 'event-malformed');
      return true;
    },
  );
});

test('a non-object raw event throws a sanitized typed error', () => {
  const context = baselineContext();
  assert.throws(
    () => applyResultReviewEvent('draft', 'garbage-payload-with-secret-token-abc123', [], context),
    ResultReviewInputError,
  );
});

test('a typed input error message never echoes any submitted data', () => {
  try {
    runResultReviewWorkflow(baselineContext(), 'super-secret-raw-payload' as unknown as unknown[]);
    assert.fail('expected runResultReviewWorkflow to throw');
  } catch (error) {
    assert.ok(error instanceof ResultReviewInputError);
    assert.doesNotMatch((error as Error).message, /super-secret-raw-payload/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch((error as Error).message, pattern);
    }
  }
});

// ---------------------------------------------------------------------------
// Explanations
// ---------------------------------------------------------------------------

test('every block code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_BLOCK_CODES) {
    const message = explainResultReviewBlock(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /tenant-synthetic|result-synthetic/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(explainResultReviewBlock('tenant-mismatch'), explainResultReviewBlock('tenant-mismatch'));
});

test('no result-review states use compliance or accreditation language', () => {
  const states = ['draft', 'ready_for_review', 'approved', 'rejected', 'corrected'];
  for (const state of states) {
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(state, pattern);
    }
  }
});
