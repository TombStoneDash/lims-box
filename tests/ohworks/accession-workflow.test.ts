import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyAccessionEvent,
  AccessionInputError,
  explainAccessionBlock,
  runAccessionWorkflow,
  type AccessionBlockCode,
  type AccessionContext,
  type AccessionEventInput,
} from '../../lib/ohworks-accession-workflow';

/**
 * All fabricated: synthetic sample/tenant identifiers and made-up event
 * data. None of this represents a real sample, patient, or customer.
 */
function baselineContext(): AccessionContext {
  return { tenantId: 'tenant-synthetic-a', sampleId: 'sample-synthetic-001' };
}

function event(overrides: Partial<AccessionEventInput> = {}): AccessionEventInput {
  return {
    eventId: 'evt-receive-1',
    sampleId: 'sample-synthetic-001',
    tenantId: 'tenant-synthetic-a',
    kind: 'receive',
    actorClass: 'submitter',
    reasonCode: 'sample-intake-logged',
    occurredAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

const ALL_BLOCK_CODES: AccessionBlockCode[] = [
  'unsupported-event-kind',
  'unknown-actor-class',
  'unknown-reason-code',
  'reason-code-not-allowed-for-kind',
  'accession-scope-violation',
  'tenant-mismatch',
  'sample-id-mismatch',
  'timestamp-invalid',
  'timestamp-not-utc',
  'timestamp-backwards',
  'duplicate-event-id-conflict',
  'duplicate-event-id-replay',
  'note-suspected-pii',
  'terminal-state',
  'skipped-transition',
];

const FORBIDDEN_WORDS = [/approved/i, /compliant/i, /accredited/i, /released?\b.*\bresult/i];

// ---------------------------------------------------------------------------
// Golden paths
// ---------------------------------------------------------------------------

test('RECEIVED -> ACCESSIONED directly is a valid path', () => {
  const events = [
    event({ eventId: 'e1', kind: 'receive', reasonCode: 'sample-intake-logged', occurredAt: '2026-01-01T12:00:00.000Z' }),
    event({ eventId: 'e2', kind: 'accession', actorClass: 'accessioner', reasonCode: 'requisition-verified', occurredAt: '2026-01-01T12:05:00.000Z' }),
  ];
  const result = runAccessionWorkflow(baselineContext(), events);
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'ACCESSIONED');
  assert.equal(result.history.length, 2);
});

test('RECEIVED -> HOLD -> ACCESSIONED is a valid path', () => {
  const events = [
    event({ eventId: 'e1', kind: 'receive', occurredAt: '2026-01-01T12:00:00.000Z' }),
    event({ eventId: 'e2', kind: 'hold', actorClass: 'accessioner', reasonCode: 'missing-requisition', occurredAt: '2026-01-01T12:05:00.000Z' }),
    event({ eventId: 'e3', kind: 'accession', actorClass: 'accessioner', reasonCode: 'hold-cleared', occurredAt: '2026-01-01T12:10:00.000Z' }),
  ];
  const result = runAccessionWorkflow(baselineContext(), events);
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'ACCESSIONED');
});

test('RECEIVED -> HOLD -> REJECTED is a valid path', () => {
  const events = [
    event({ eventId: 'e1', kind: 'receive', occurredAt: '2026-01-01T12:00:00.000Z' }),
    event({ eventId: 'e2', kind: 'hold', actorClass: 'accessioner', reasonCode: 'sample-integrity-compromised', occurredAt: '2026-01-01T12:05:00.000Z' }),
    event({ eventId: 'e3', kind: 'reject', actorClass: 'quality-reviewer', reasonCode: 'chain-of-custody-broken', occurredAt: '2026-01-01T12:10:00.000Z' }),
  ];
  const result = runAccessionWorkflow(baselineContext(), events);
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'REJECTED');
});

test('RECEIVED -> CANCELLED directly is a valid path', () => {
  const events = [
    event({ eventId: 'e1', kind: 'receive', occurredAt: '2026-01-01T12:00:00.000Z' }),
    event({ eventId: 'e2', kind: 'cancel', reasonCode: 'customer-requested-cancellation', occurredAt: '2026-01-01T12:05:00.000Z' }),
  ];
  const result = runAccessionWorkflow(baselineContext(), events);
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'CANCELLED');
});

test('RECEIVED -> HOLD -> CANCELLED is a valid path', () => {
  const events = [
    event({ eventId: 'e1', kind: 'receive', occurredAt: '2026-01-01T12:00:00.000Z' }),
    event({ eventId: 'e2', kind: 'hold', actorClass: 'accessioner', reasonCode: 'insufficient-sample-volume', occurredAt: '2026-01-01T12:05:00.000Z' }),
    event({ eventId: 'e3', kind: 'cancel', reasonCode: 'submitted-in-error', occurredAt: '2026-01-01T12:10:00.000Z' }),
  ];
  const result = runAccessionWorkflow(baselineContext(), events);
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'CANCELLED');
});

test('a workflow with zero events stays at RECEIVED, unblocked', () => {
  const result = runAccessionWorkflow(baselineContext(), []);
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'RECEIVED');
  assert.deepEqual(result.history, []);
});

// ---------------------------------------------------------------------------
// Skipped transitions
// ---------------------------------------------------------------------------

test('a second "hold" while already on HOLD is a skipped transition', () => {
  const events = [
    event({ eventId: 'e1', kind: 'receive' }),
    event({ eventId: 'e2', kind: 'hold', actorClass: 'accessioner', reasonCode: 'missing-requisition', occurredAt: '2026-01-01T12:05:00.000Z' }),
    event({ eventId: 'e3', kind: 'hold', actorClass: 'accessioner', reasonCode: 'insufficient-sample-volume', occurredAt: '2026-01-01T12:10:00.000Z' }),
  ];
  const result = runAccessionWorkflow(baselineContext(), events);
  assert.equal(result.blocked, true);
  assert.equal(result.finalState, 'HOLD');
  assert.equal(result.steps.at(-1)?.allowed, false);
  assert.equal((result.steps.at(-1) as { blockCode: AccessionBlockCode }).blockCode, 'skipped-transition');
});

test('a second "receive" after the workflow has already started is a skipped transition', () => {
  const events = [
    event({ eventId: 'e1', kind: 'receive', occurredAt: '2026-01-01T12:00:00.000Z' }),
    event({ eventId: 'e2', kind: 'receive', occurredAt: '2026-01-01T12:05:00.000Z' }),
  ];
  const result = runAccessionWorkflow(baselineContext(), events);
  assert.equal(result.blocked, true);
  assert.equal((result.steps.at(-1) as { blockCode: AccessionBlockCode }).blockCode, 'skipped-transition');
});

test('accessioning without ever receiving is still a legitimate direct path, not skipped', () => {
  const result = runAccessionWorkflow(baselineContext(), [
    event({ eventId: 'e1', kind: 'accession', actorClass: 'accessioner', reasonCode: 'requisition-verified' }),
  ]);
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'ACCESSIONED');
});

test('attempting to accession from a terminal REJECTED state fails closed', () => {
  const events = [
    event({ eventId: 'e1', kind: 'reject', actorClass: 'quality-reviewer', reasonCode: 'duplicate-submission', occurredAt: '2026-01-01T12:00:00.000Z' }),
    event({ eventId: 'e2', kind: 'accession', actorClass: 'accessioner', reasonCode: 'requisition-verified', occurredAt: '2026-01-01T12:05:00.000Z' }),
  ];
  const result = runAccessionWorkflow(baselineContext(), events);
  assert.equal(result.blocked, true);
  assert.equal(result.finalState, 'REJECTED');
  assert.equal((result.steps.at(-1) as { blockCode: AccessionBlockCode }).blockCode, 'terminal-state');
});

test('attempting to cancel an already-ACCESSIONED sample fails closed as terminal', () => {
  const events = [
    event({ eventId: 'e1', kind: 'accession', actorClass: 'accessioner', reasonCode: 'requisition-verified', occurredAt: '2026-01-01T12:00:00.000Z' }),
    event({ eventId: 'e2', kind: 'cancel', reasonCode: 'submitted-in-error', occurredAt: '2026-01-01T12:05:00.000Z' }),
  ];
  const result = runAccessionWorkflow(baselineContext(), events);
  assert.equal(result.blocked, true);
  assert.equal((result.steps.at(-1) as { blockCode: AccessionBlockCode }).blockCode, 'terminal-state');
});

test('once blocked, later events in the batch are never evaluated', () => {
  const events = [
    event({ eventId: 'e1', kind: 'accession', actorClass: 'accessioner', reasonCode: 'requisition-verified', occurredAt: '2026-01-01T12:00:00.000Z' }),
    event({ eventId: 'e2', kind: 'cancel', reasonCode: 'submitted-in-error', occurredAt: '2026-01-01T12:05:00.000Z' }),
    event({ eventId: 'e3', kind: 'reject', actorClass: 'quality-reviewer', reasonCode: 'duplicate-submission', occurredAt: '2026-01-01T12:10:00.000Z' }),
  ];
  const result = runAccessionWorkflow(baselineContext(), events);
  assert.equal(result.steps.length, 2);
  assert.equal(result.finalState, 'ACCESSIONED');
});

// ---------------------------------------------------------------------------
// Conflicting duplicates
// ---------------------------------------------------------------------------

test('an exact replay of a prior event id fails closed', () => {
  const first = event({ eventId: 'e1', kind: 'receive', occurredAt: '2026-01-01T12:00:00.000Z' });
  const result = runAccessionWorkflow(baselineContext(), [first, { ...first }]);
  assert.equal(result.blocked, true);
  assert.equal((result.steps.at(-1) as { blockCode: AccessionBlockCode }).blockCode, 'duplicate-event-id-replay');
});

test('a conflicting duplicate event id (different content) fails closed', () => {
  const events = [
    event({ eventId: 'e1', kind: 'receive', occurredAt: '2026-01-01T12:00:00.000Z' }),
    event({ eventId: 'e1', kind: 'hold', actorClass: 'accessioner', reasonCode: 'missing-requisition', occurredAt: '2026-01-01T12:05:00.000Z' }),
  ];
  const result = runAccessionWorkflow(baselineContext(), events);
  assert.equal(result.blocked, true);
  assert.equal((result.steps.at(-1) as { blockCode: AccessionBlockCode }).blockCode, 'duplicate-event-id-conflict');
});

// ---------------------------------------------------------------------------
// Backwards time
// ---------------------------------------------------------------------------

test('an event timestamped before the prior event fails closed', () => {
  const events = [
    event({ eventId: 'e1', kind: 'receive', occurredAt: '2026-01-01T12:10:00.000Z' }),
    event({ eventId: 'e2', kind: 'accession', actorClass: 'accessioner', reasonCode: 'requisition-verified', occurredAt: '2026-01-01T12:00:00.000Z' }),
  ];
  const result = runAccessionWorkflow(baselineContext(), events);
  assert.equal(result.blocked, true);
  assert.equal((result.steps.at(-1) as { blockCode: AccessionBlockCode }).blockCode, 'timestamp-backwards');
});

test('an event with the exact same timestamp as the prior event fails closed as backwards', () => {
  const events = [
    event({ eventId: 'e1', kind: 'receive', occurredAt: '2026-01-01T12:00:00.000Z' }),
    event({ eventId: 'e2', kind: 'accession', actorClass: 'accessioner', reasonCode: 'requisition-verified', occurredAt: '2026-01-01T12:00:00.000Z' }),
  ];
  const result = runAccessionWorkflow(baselineContext(), events);
  assert.equal(result.blocked, true);
  assert.equal((result.steps.at(-1) as { blockCode: AccessionBlockCode }).blockCode, 'timestamp-backwards');
});

test('an unparsable timestamp fails closed', () => {
  const context = baselineContext();
  const result = applyAccessionEvent('RECEIVED', event({ occurredAt: 'not-a-timestamp' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: AccessionBlockCode }).blockCode, 'timestamp-invalid');
});

test('a non-UTC (offset, non-"Z") timestamp fails closed', () => {
  const context = baselineContext();
  const result = applyAccessionEvent('RECEIVED', event({ occurredAt: '2026-01-01T12:00:00.000+00:00' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: AccessionBlockCode }).blockCode, 'timestamp-not-utc');
});

// ---------------------------------------------------------------------------
// PII
// ---------------------------------------------------------------------------

test('a note containing an email address fails closed', () => {
  const context = baselineContext();
  const result = applyAccessionEvent('RECEIVED', event({ note: 'Contact submitter at jane.synthetic@example.com for details.' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: AccessionBlockCode }).blockCode, 'note-suspected-pii');
});

test('a note containing a phone number fails closed', () => {
  const context = baselineContext();
  const result = applyAccessionEvent('RECEIVED', event({ note: 'Call 555-123-4567 to confirm.' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: AccessionBlockCode }).blockCode, 'note-suspected-pii');
});

test('a note containing an SSN-shaped number fails closed', () => {
  const context = baselineContext();
  const result = applyAccessionEvent('RECEIVED', event({ note: 'Reference 123-45-6789 on file.' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: AccessionBlockCode }).blockCode, 'note-suspected-pii');
});

test('a note mentioning "date of birth" fails closed even without a value', () => {
  const context = baselineContext();
  const result = applyAccessionEvent('RECEIVED', event({ note: 'Submitter provided date of birth on the form.' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: AccessionBlockCode }).blockCode, 'note-suspected-pii');
});

test('an operational note with no PII is accepted', () => {
  const context = baselineContext();
  const result = applyAccessionEvent('RECEIVED', event({ note: 'Sample container was intact on arrival.' }), [], context);
  assert.equal(result.allowed, true);
});

test('no note at all is accepted', () => {
  const context = baselineContext();
  const result = applyAccessionEvent('RECEIVED', event({}), [], context);
  assert.equal(result.allowed, true);
});

// ---------------------------------------------------------------------------
// Tenant mismatch
// ---------------------------------------------------------------------------

test('an event from a different tenant fails closed', () => {
  const context = baselineContext();
  const result = applyAccessionEvent('RECEIVED', event({ tenantId: 'tenant-synthetic-intruder' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: AccessionBlockCode }).blockCode, 'tenant-mismatch');
});

test('an event for a different sample fails closed', () => {
  const context = baselineContext();
  const result = applyAccessionEvent('RECEIVED', event({ sampleId: 'sample-synthetic-other' }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: AccessionBlockCode }).blockCode, 'sample-id-mismatch');
});

// ---------------------------------------------------------------------------
// Testing / release can never be treated as accession
// ---------------------------------------------------------------------------

test('an event kind of "testing" is not a supported transition and fails closed', () => {
  const context = baselineContext();
  const result = applyAccessionEvent(
    'RECEIVED',
    event({ kind: 'testing' as AccessionEventInput['kind'], reasonCode: 'sample-intake-logged' }),
    [],
    context,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: AccessionBlockCode }).blockCode, 'unsupported-event-kind');
});

test('an event kind of "release" is not a supported transition and fails closed', () => {
  const context = baselineContext();
  const result = applyAccessionEvent(
    'ACCESSIONED',
    event({ kind: 'release' as AccessionEventInput['kind'], reasonCode: 'requisition-verified' }),
    [],
    context,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: AccessionBlockCode }).blockCode, 'unsupported-event-kind');
});

test('an "accession" event whose note describes testing fails closed as a scope violation', () => {
  const context = baselineContext();
  const result = applyAccessionEvent(
    'RECEIVED',
    event({ kind: 'accession', actorClass: 'accessioner', reasonCode: 'requisition-verified', note: 'Please treat this as a testing request.' }),
    [],
    context,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: AccessionBlockCode }).blockCode, 'accession-scope-violation');
});

test('an "accession" event whose note describes release fails closed as a scope violation', () => {
  const context = baselineContext();
  const result = applyAccessionEvent(
    'RECEIVED',
    event({ kind: 'accession', actorClass: 'accessioner', reasonCode: 'requisition-verified', note: 'Go ahead and release these results too.' }),
    [],
    context,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: AccessionBlockCode }).blockCode, 'accession-scope-violation');
});

test('the reason code reserved for testing/release out-of-scope attempts is only valid on reject', () => {
  const context = baselineContext();
  const onAccession = applyAccessionEvent(
    'RECEIVED',
    event({ kind: 'accession', actorClass: 'accessioner', reasonCode: 'testing-or-release-out-of-scope' }),
    [],
    context,
  );
  assert.equal(onAccession.allowed, false);
  assert.equal((onAccession as { blockCode: AccessionBlockCode }).blockCode, 'reason-code-not-allowed-for-kind');

  const onReject = applyAccessionEvent(
    'RECEIVED',
    event({ kind: 'reject', actorClass: 'quality-reviewer', reasonCode: 'testing-or-release-out-of-scope' }),
    [],
    context,
  );
  assert.equal(onReject.allowed, true);
});

// ---------------------------------------------------------------------------
// Bounded field validation
// ---------------------------------------------------------------------------

test('an unknown actor class fails closed', () => {
  const context = baselineContext();
  const result = applyAccessionEvent('RECEIVED', event({ actorClass: 'robot-overlord' as AccessionEventInput['actorClass'] }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: AccessionBlockCode }).blockCode, 'unknown-actor-class');
});

test('an unknown reason code fails closed', () => {
  const context = baselineContext();
  const result = applyAccessionEvent('RECEIVED', event({ reasonCode: 'because-i-said-so' as AccessionEventInput['reasonCode'] }), [], context);
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: AccessionBlockCode }).blockCode, 'unknown-reason-code');
});

test('a reason code that is known but not allowed for the given kind fails closed', () => {
  const context = baselineContext();
  const result = applyAccessionEvent(
    'RECEIVED',
    event({ kind: 'cancel', reasonCode: 'requisition-verified' as AccessionEventInput['reasonCode'] }),
    [],
    context,
  );
  assert.equal(result.allowed, false);
  assert.equal((result as { blockCode: AccessionBlockCode }).blockCode, 'reason-code-not-allowed-for-kind');
});

// ---------------------------------------------------------------------------
// Immutability and purity
// ---------------------------------------------------------------------------

test('accepted events are frozen and cannot be mutated', () => {
  const context = baselineContext();
  const result = applyAccessionEvent('RECEIVED', event({}), [], context);
  assert.equal(result.allowed, true);
  const accepted = (result as { event: AccessionEventInput }).event;
  assert.ok(Object.isFrozen(accepted));
  const mutationSucceeded = Reflect.set(accepted, 'kind', 'accession');
  assert.equal(mutationSucceeded, false);
  assert.equal(accepted.kind, 'receive');
});

test('runAccessionWorkflow returns a frozen history array and frozen steps array', () => {
  const result = runAccessionWorkflow(baselineContext(), [event({ eventId: 'e1' })]);
  assert.ok(Object.isFrozen(result.history));
  assert.ok(Object.isFrozen(result.steps));
});

test('runAccessionWorkflow does not mutate its input events array or objects', () => {
  const events = [event({ eventId: 'e1' }), event({ eventId: 'e2', kind: 'accession', actorClass: 'accessioner', reasonCode: 'requisition-verified', occurredAt: '2026-01-01T12:05:00.000Z' })];
  const before = JSON.stringify(events);
  runAccessionWorkflow(baselineContext(), events);
  assert.equal(JSON.stringify(events), before);
});

test('runAccessionWorkflow is deterministic across repeated calls with equivalent input', () => {
  const events = () => [
    event({ eventId: 'e1' }),
    event({ eventId: 'e2', kind: 'accession', actorClass: 'accessioner', reasonCode: 'requisition-verified', occurredAt: '2026-01-01T12:05:00.000Z' }),
  ];
  const first = runAccessionWorkflow(baselineContext(), events());
  const second = runAccessionWorkflow(baselineContext(), events());
  assert.deepEqual(first, second);
});

// ---------------------------------------------------------------------------
// Structurally malformed input throws, rather than guessing
// ---------------------------------------------------------------------------

test('a non-array events input throws a sanitized typed error', () => {
  assert.throws(
    () => runAccessionWorkflow(baselineContext(), 'not-an-array'),
    (error: unknown) => {
      assert.ok(error instanceof AccessionInputError);
      assert.equal((error as AccessionInputError).code, 'events-not-array');
      return true;
    },
  );
});

test('a malformed context throws a sanitized typed error', () => {
  assert.throws(
    () => runAccessionWorkflow({ tenantId: 'tenant-synthetic-a' } as unknown as AccessionContext, []),
    (error: unknown) => {
      assert.ok(error instanceof AccessionInputError);
      assert.equal((error as AccessionInputError).code, 'context-malformed');
      return true;
    },
  );
});

test('an event missing a required field throws a sanitized typed error', () => {
  const context = baselineContext();
  const malformed = event({});
  delete (malformed as Partial<AccessionEventInput>).eventId;
  assert.throws(
    () => applyAccessionEvent('RECEIVED', malformed, [], context),
    (error: unknown) => {
      assert.ok(error instanceof AccessionInputError);
      assert.equal((error as AccessionInputError).code, 'event-malformed');
      return true;
    },
  );
});

test('a non-object raw event throws a sanitized typed error', () => {
  const context = baselineContext();
  assert.throws(
    () => applyAccessionEvent('RECEIVED', 'garbage-payload-with-secret-token-abc123', [], context),
    AccessionInputError,
  );
});

test('a typed input error message never echoes any submitted data', () => {
  try {
    runAccessionWorkflow(baselineContext(), 'super-secret-raw-payload' as unknown as unknown[]);
    assert.fail('expected runAccessionWorkflow to throw');
  } catch (error) {
    assert.ok(error instanceof AccessionInputError);
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
    const message = explainAccessionBlock(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /tenant-synthetic|sample-synthetic/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(explainAccessionBlock('tenant-mismatch'), explainAccessionBlock('tenant-mismatch'));
});

test('no accession states use testing, release, or approval language', () => {
  const states = ['RECEIVED', 'ACCESSIONED', 'HOLD', 'REJECTED', 'CANCELLED'];
  for (const state of states) {
    assert.doesNotMatch(state, /TEST|RELEASE/i);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(state, pattern);
    }
  }
});
