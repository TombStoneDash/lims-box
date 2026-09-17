import assert from 'node:assert/strict';
import test from 'node:test';

import {
  KNOWN_REFERENCE_LAB_IDS,
  SENDOUT_STATES,
  SendoutInputError,
  evaluateSendout,
  explainSendoutNextAction,
  explainSendoutReason,
  isKnownReferenceLab,
  type SendoutEvent,
  type SendoutInput,
  type SendoutReasonCode,
} from '../../lib/ohworks-sendout';

/**
 * All fabricated: synthetic reference-lab ids, courier references, and
 * timestamps. None of this represents a real specimen, patient, lab, or
 * shipment.
 */
function baselineEvents(): SendoutEvent[] {
  return [
    { state: 'prepared', occurredAt: '2026-01-01T09:00:00.000Z' },
    { state: 'shipped', occurredAt: '2026-01-01T12:00:00.000Z', courierReference: 'SYN-TRACK-0001' },
    { state: 'received_by_reference', occurredAt: '2026-01-02T09:00:00.000Z', courierReference: 'SYN-TRACK-0001' },
    { state: 'resulted', occurredAt: '2026-01-04T09:00:00.000Z', courierReference: 'SYN-TRACK-0001' },
    { state: 'returned', occurredAt: '2026-01-05T09:00:00.000Z', courierReference: 'SYN-RETURN-0002' },
  ];
}

function baselineInput(overrides: Partial<SendoutInput> = {}): SendoutInput {
  return {
    referenceLabId: 'REFLAB_ALPHA',
    declaredTurnaroundDays: 3,
    events: baselineEvents(),
    ...overrides,
  };
}

test('validates a well-formed, fully-progressed send-out', () => {
  const summary = evaluateSendout(baselineInput(), '2026-01-06T00:00:00.000Z');
  assert.equal(summary.status, 'VALID');
  assert.equal(summary.currentState, 'returned');
  assert.equal(summary.referenceLabId, 'REFLAB_ALPHA');
  assert.equal(summary.failure, undefined);
});

test('computes expected result date as received_by_reference plus declared turnaround', () => {
  const summary = evaluateSendout(baselineInput(), '2026-01-03T00:00:00.000Z');
  assert.equal(summary.expectedResultDate, '2026-01-05T09:00:00.000Z');
});

test('accepts a record that has only reached prepared', () => {
  const summary = evaluateSendout(
    baselineInput({ events: [{ state: 'prepared', occurredAt: '2026-01-01T09:00:00.000Z' }] }),
    '2026-06-01T00:00:00.000Z',
  );
  assert.equal(summary.status, 'VALID');
  assert.equal(summary.currentState, 'prepared');
  assert.equal(summary.expectedResultDate, undefined);
  assert.equal(summary.overdue, false);
});

test('a record stuck in shipping is never flagged overdue, however late "as of" is', () => {
  const events: SendoutEvent[] = [
    { state: 'prepared', occurredAt: '2026-01-01T09:00:00.000Z' },
    { state: 'shipped', occurredAt: '2026-01-01T12:00:00.000Z', courierReference: 'SYN-TRACK-0001' },
  ];
  const summary = evaluateSendout(baselineInput({ events }), '2027-01-01T00:00:00.000Z');
  assert.equal(summary.status, 'VALID');
  assert.equal(summary.expectedResultDate, undefined);
  assert.equal(summary.overdue, false);
  assert.equal(summary.daysOverdue, undefined);
});

test('flags a send-out overdue when "as of" is past the expected result date and no result yet', () => {
  const events: SendoutEvent[] = [
    { state: 'prepared', occurredAt: '2026-01-01T09:00:00.000Z' },
    { state: 'shipped', occurredAt: '2026-01-01T12:00:00.000Z', courierReference: 'SYN-TRACK-0001' },
    { state: 'received_by_reference', occurredAt: '2026-01-02T09:00:00.000Z', courierReference: 'SYN-TRACK-0001' },
  ];
  const summary = evaluateSendout(baselineInput({ events, declaredTurnaroundDays: 3 }), '2026-01-08T09:00:00.000Z');
  assert.equal(summary.status, 'VALID');
  assert.equal(summary.expectedResultDate, '2026-01-05T09:00:00.000Z');
  assert.equal(summary.overdue, true);
  assert.equal(summary.daysOverdue, 3);
});

test('does not flag overdue when "as of" is before the expected result date', () => {
  const events: SendoutEvent[] = [
    { state: 'prepared', occurredAt: '2026-01-01T09:00:00.000Z' },
    { state: 'shipped', occurredAt: '2026-01-01T12:00:00.000Z', courierReference: 'SYN-TRACK-0001' },
    { state: 'received_by_reference', occurredAt: '2026-01-02T09:00:00.000Z', courierReference: 'SYN-TRACK-0001' },
  ];
  const summary = evaluateSendout(baselineInput({ events, declaredTurnaroundDays: 3 }), '2026-01-03T00:00:00.000Z');
  assert.equal(summary.overdue, false);
  assert.equal(summary.daysOverdue, undefined);
});

test('flags resultedLate when the result arrived after the expected result date', () => {
  const events: SendoutEvent[] = [
    { state: 'prepared', occurredAt: '2026-01-01T09:00:00.000Z' },
    { state: 'shipped', occurredAt: '2026-01-01T12:00:00.000Z', courierReference: 'SYN-TRACK-0001' },
    { state: 'received_by_reference', occurredAt: '2026-01-02T09:00:00.000Z', courierReference: 'SYN-TRACK-0001' },
    { state: 'resulted', occurredAt: '2026-01-10T09:00:00.000Z', courierReference: 'SYN-TRACK-0001' },
  ];
  const summary = evaluateSendout(baselineInput({ events, declaredTurnaroundDays: 3 }), '2026-01-11T00:00:00.000Z');
  assert.equal(summary.status, 'VALID');
  assert.equal(summary.resultedLate, true);
  assert.equal(summary.overdue, false, 'a resulted record is not "overdue", it is "resultedLate"');
});

test('does not flag resultedLate when the result arrived on time', () => {
  const summary = evaluateSendout(baselineInput(), '2026-01-06T00:00:00.000Z');
  assert.equal(summary.resultedLate, false);
});

test('rejects an unrecognized reference lab', () => {
  const summary = evaluateSendout(baselineInput({ referenceLabId: 'REFLAB_MYSTERY' }), '2026-01-06T00:00:00.000Z');
  assert.equal(summary.status, 'INVALID');
  assert.deepEqual(summary.failure, { eventIndex: -1, code: 'reference-lab-unknown' });
});

test('rejects an unknown event state', () => {
  const events = baselineEvents();
  events[1] = { ...events[1], state: 'in_transit' as SendoutEvent['state'] };
  const summary = evaluateSendout(baselineInput({ events }), '2026-01-06T00:00:00.000Z');
  assert.deepEqual(summary.failure, { eventIndex: 1, code: 'state-unknown' });
});

test('rejects a record whose first event is not prepared', () => {
  const events = baselineEvents().slice(1);
  const summary = evaluateSendout(baselineInput({ events }), '2026-01-06T00:00:00.000Z');
  assert.deepEqual(summary.failure, { eventIndex: 0, code: 'first-event-not-prepared' });
});

test('rejects a repeated state', () => {
  const events = baselineEvents().slice(0, 2);
  events.push({ ...events[1] });
  const summary = evaluateSendout(baselineInput({ events }), '2026-01-06T00:00:00.000Z');
  assert.deepEqual(summary.failure, { eventIndex: 2, code: 'state-repeated' });
});

test('rejects a state that moves backward', () => {
  const events = baselineEvents().slice(0, 3);
  events.push({ state: 'shipped', occurredAt: '2026-01-03T09:00:00.000Z', courierReference: 'SYN-TRACK-0001' });
  const summary = evaluateSendout(baselineInput({ events }), '2026-01-06T00:00:00.000Z');
  assert.deepEqual(summary.failure, { eventIndex: 3, code: 'state-out-of-order' });
});

test('rejects a skipped state', () => {
  const events: SendoutEvent[] = [
    { state: 'prepared', occurredAt: '2026-01-01T09:00:00.000Z' },
    { state: 'received_by_reference', occurredAt: '2026-01-02T09:00:00.000Z', courierReference: 'SYN-TRACK-0001' },
  ];
  const summary = evaluateSendout(baselineInput({ events }), '2026-01-06T00:00:00.000Z');
  assert.deepEqual(summary.failure, { eventIndex: 1, code: 'state-skipped' });
});

test('rejects an unparsable timestamp', () => {
  const events = baselineEvents();
  events[0] = { ...events[0], occurredAt: 'not-a-timestamp' };
  const summary = evaluateSendout(baselineInput({ events }), '2026-01-06T00:00:00.000Z');
  assert.deepEqual(summary.failure, { eventIndex: 0, code: 'timestamp-invalid' });
});

test('rejects a duplicate timestamp', () => {
  const events = baselineEvents();
  events[1] = { ...events[1], occurredAt: events[0].occurredAt };
  const summary = evaluateSendout(baselineInput({ events }), '2026-01-06T00:00:00.000Z');
  assert.deepEqual(summary.failure, { eventIndex: 1, code: 'timestamp-duplicate' });
});

test('rejects an out-of-order timestamp', () => {
  const events = baselineEvents();
  events[1] = { ...events[1], occurredAt: '2025-01-01T00:00:00.000Z' };
  const summary = evaluateSendout(baselineInput({ events }), '2026-01-06T00:00:00.000Z');
  assert.deepEqual(summary.failure, { eventIndex: 1, code: 'timestamp-out-of-order' });
});

test('rejects a shipped event missing a courier reference', () => {
  const events = baselineEvents();
  events[1] = { state: 'shipped', occurredAt: events[1].occurredAt };
  const summary = evaluateSendout(baselineInput({ events }), '2026-01-06T00:00:00.000Z');
  assert.deepEqual(summary.failure, { eventIndex: 1, code: 'courier-reference-missing' });
});

test('rejects a malformed courier reference', () => {
  const events = baselineEvents();
  events[1] = { ...events[1], courierReference: 'nope!' };
  const summary = evaluateSendout(baselineInput({ events }), '2026-01-06T00:00:00.000Z');
  assert.deepEqual(summary.failure, { eventIndex: 1, code: 'courier-reference-invalid' });
});

test('rejects a courier reference that disagrees with the outbound shipment', () => {
  const events = baselineEvents();
  events[2] = { ...events[2], courierReference: 'SYN-TRACK-9999' };
  const summary = evaluateSendout(baselineInput({ events }), '2026-01-06T00:00:00.000Z');
  assert.deepEqual(summary.failure, { eventIndex: 2, code: 'courier-reference-mismatch' });
});

test('allows the returned event to carry a distinct courier reference from the outbound shipment', () => {
  const summary = evaluateSendout(baselineInput(), '2026-01-06T00:00:00.000Z');
  assert.equal(summary.status, 'VALID');
});

test('reports the first failing rule when multiple events are broken', () => {
  const events = baselineEvents();
  events[1] = { ...events[1], courierReference: undefined };
  events[2] = { ...events[2], courierReference: 'SYN-TRACK-9999' };
  const summary = evaluateSendout(baselineInput({ events }), '2026-01-06T00:00:00.000Z');
  assert.deepEqual(summary.failure, { eventIndex: 1, code: 'courier-reference-missing' });
});

test('invalid summary carries no result-computation fields', () => {
  const summary = evaluateSendout(baselineInput({ referenceLabId: 'REFLAB_MYSTERY' }), '2026-01-06T00:00:00.000Z');
  assert.equal(summary.currentState, undefined);
  assert.equal(summary.expectedResultDate, undefined);
  assert.equal(summary.daysOverdue, undefined);
  assert.equal(summary.resultedLate, undefined);
});

test('throws SendoutInputError for non-object input', () => {
  assert.throws(
    () => evaluateSendout('not-an-object', '2026-01-06T00:00:00.000Z'),
    (error: unknown) => error instanceof SendoutInputError && error.code === 'input-not-object',
  );
});

test('throws SendoutInputError for an invalid reference lab id', () => {
  assert.throws(
    () => evaluateSendout(baselineInput({ referenceLabId: '' }), '2026-01-06T00:00:00.000Z'),
    (error: unknown) => error instanceof SendoutInputError && error.code === 'reference-lab-id-invalid',
  );
});

test('throws SendoutInputError for a non-integer declared turnaround', () => {
  assert.throws(
    () => evaluateSendout(baselineInput({ declaredTurnaroundDays: 2.5 }), '2026-01-06T00:00:00.000Z'),
    (error: unknown) => error instanceof SendoutInputError && error.code === 'turnaround-days-invalid',
  );
});

test('throws SendoutInputError for a declared turnaround out of range', () => {
  for (const declaredTurnaroundDays of [0, -1, 366]) {
    assert.throws(
      () => evaluateSendout(baselineInput({ declaredTurnaroundDays }), '2026-01-06T00:00:00.000Z'),
      (error: unknown) => error instanceof SendoutInputError && error.code === 'turnaround-days-invalid',
      `expected ${declaredTurnaroundDays} to be rejected`,
    );
  }
});

test('throws SendoutInputError when events is not an array', () => {
  assert.throws(
    () => evaluateSendout(baselineInput({ events: 'not-an-array' as unknown as SendoutEvent[] }), '2026-01-06T00:00:00.000Z'),
    (error: unknown) => error instanceof SendoutInputError && error.code === 'events-not-array',
  );
});

test('throws SendoutInputError for an empty event list', () => {
  assert.throws(
    () => evaluateSendout(baselineInput({ events: [] }), '2026-01-06T00:00:00.000Z'),
    (error: unknown) => error instanceof SendoutInputError && error.code === 'events-empty',
  );
});

test('throws SendoutInputError for a malformed event', () => {
  const malformed = { state: 'prepared' };
  assert.throws(
    () => evaluateSendout(baselineInput({ events: [malformed as unknown as SendoutEvent] }), '2026-01-06T00:00:00.000Z'),
    (error: unknown) => error instanceof SendoutInputError && error.code === 'event-malformed',
  );
});

test('throws SendoutInputError for a non-object event', () => {
  assert.throws(
    () => evaluateSendout(baselineInput({ events: [null as unknown as SendoutEvent] }), '2026-01-06T00:00:00.000Z'),
    (error: unknown) => error instanceof SendoutInputError && error.code === 'event-malformed',
  );
});

test('throws SendoutInputError for an invalid "as of" timestamp', () => {
  assert.throws(
    () => evaluateSendout(baselineInput(), 'not-a-timestamp'),
    (error: unknown) => error instanceof SendoutInputError && error.code === 'as-of-timestamp-invalid',
  );
});

test('rejects an impossible calendar date instead of rolling it over', () => {
  const events = baselineEvents();
  events[0] = { ...events[0], occurredAt: '2026-02-30T12:00:00Z' };
  const summary = evaluateSendout(baselineInput({ events }), '2026-01-06T00:00:00.000Z');
  assert.deepEqual(summary.failure, { eventIndex: 0, code: 'timestamp-invalid' });
});

test('rejects a timestamp with no timezone designator', () => {
  const events = baselineEvents();
  events[0] = { ...events[0], occurredAt: '2026-01-01T09:00:00' };
  const summary = evaluateSendout(baselineInput({ events }), '2026-01-06T00:00:00.000Z');
  assert.deepEqual(summary.failure, { eventIndex: 0, code: 'timestamp-invalid' });
});

test('validation and date math are invariant across process timezones', () => {
  const originalTz = process.env.TZ;
  const input = baselineInput();
  const zones = ['UTC', 'Pacific/Kiritimati', 'Pacific/Niue', 'Asia/Kathmandu'];

  try {
    const results = zones.map((zone) => {
      process.env.TZ = zone;
      return evaluateSendout(input, '2026-01-06T00:00:00.000Z');
    });
    for (const result of results) {
      assert.deepEqual(result, results[0]);
    }
    assert.equal(results[0].status, 'VALID');
    assert.equal(results[0].expectedResultDate, '2026-01-05T09:00:00.000Z');
  } finally {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  }
});

test('KNOWN_REFERENCE_LAB_IDS and isKnownReferenceLab agree', () => {
  for (const id of KNOWN_REFERENCE_LAB_IDS) {
    assert.ok(isKnownReferenceLab(id));
  }
  assert.equal(isKnownReferenceLab('REFLAB_MYSTERY'), false);
  assert.equal(isKnownReferenceLab(42), false);
});

test('SENDOUT_STATES enumerates the five states in fixed order', () => {
  assert.deepEqual(SENDOUT_STATES, ['prepared', 'shipped', 'received_by_reference', 'resulted', 'returned']);
});

test('explainSendoutReason and explainSendoutNextAction cover every reason code', () => {
  const codes: SendoutReasonCode[] = [
    'reference-lab-unknown',
    'state-unknown',
    'first-event-not-prepared',
    'state-repeated',
    'state-out-of-order',
    'state-skipped',
    'timestamp-invalid',
    'timestamp-duplicate',
    'timestamp-out-of-order',
    'courier-reference-missing',
    'courier-reference-invalid',
    'courier-reference-mismatch',
  ];
  for (const code of codes) {
    const reason = explainSendoutReason(code);
    const nextAction = explainSendoutNextAction(code);
    assert.equal(typeof reason, 'string');
    assert.ok(reason.length > 0);
    assert.equal(typeof nextAction, 'string');
    assert.ok(nextAction.length > 0);
  }
});
