import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CriticalValueInputError,
  applyAcknowledgementEvent,
  createAcknowledgementRecord,
  evaluateCriticalValue,
  type AcknowledgementRecord,
  type CriticalLimits,
  type CriticalResultInput,
} from '../../lib/ohworks-critical-value';

/**
 * All fabricated: synthetic subject/analyte identifiers and made-up numeric
 * values. None of this represents a real patient, clinician, or result.
 */
function baselineResult(): CriticalResultInput {
  return {
    subjectId: 'subject-synthetic-a',
    analyteCode: 'ANALYTE-SYNTH-K',
    value: 7.2,
    unit: 'mmol/L',
  };
}

function baselineLimits(): CriticalLimits {
  return {
    analyteCode: 'ANALYTE-SYNTH-K',
    unit: 'mmol/L',
    low: null,
    high: 6.5,
    notifyRoles: ['ORDERING_PROVIDER', 'CHARGE_NURSE'],
    readBackRequired: true,
    acknowledgeWithinMinutes: 30,
  };
}

const IDENTIFIED_AT = '2026-01-02T12:00:00.000Z';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

test('a value breaching the high bound is critical and produces a notification record', () => {
  const decision = evaluateCriticalValue(baselineResult(), baselineLimits(), IDENTIFIED_AT);
  assert.equal(decision.isCritical, true);
  assert.ok(decision.notification);
  assert.deepEqual(decision.notification?.notifyRoles, ['ORDERING_PROVIDER', 'CHARGE_NURSE']);
  assert.equal(decision.notification?.readBackRequired, true);
  assert.equal(decision.notification?.identifiedAt, IDENTIFIED_AT);
  assert.equal(decision.notification?.acknowledgeByDeadline, '2026-01-02T12:30:00.000Z');
});

test('a value breaching the low bound is critical', () => {
  const result: CriticalResultInput = { ...baselineResult(), value: 2.5 };
  const limits: CriticalLimits = { ...baselineLimits(), low: 3.0, high: null };
  const decision = evaluateCriticalValue(result, limits, IDENTIFIED_AT);
  assert.equal(decision.isCritical, true);
  assert.equal(decision.notification?.value, 2.5);
});

test('a value exactly at a declared bound is critical (bounds are inclusive)', () => {
  const result: CriticalResultInput = { ...baselineResult(), value: 6.5 };
  const decision = evaluateCriticalValue(result, baselineLimits(), IDENTIFIED_AT);
  assert.equal(decision.isCritical, true);
});

test('a value within the declared range is not critical and no notification is produced', () => {
  const result: CriticalResultInput = { ...baselineResult(), value: 5.0 };
  const decision = evaluateCriticalValue(result, baselineLimits(), IDENTIFIED_AT);
  assert.equal(decision.isCritical, false);
  assert.equal(decision.notification, null);
});

test('a missing limits declaration fails closed', () => {
  assert.throws(
    () => evaluateCriticalValue(baselineResult(), undefined as unknown as CriticalLimits, IDENTIFIED_AT),
    (error: unknown) => error instanceof CriticalValueInputError && error.code === 'limits-missing',
  );
});

test('a malformed limits declaration fails closed', () => {
  assert.throws(
    () => evaluateCriticalValue(baselineResult(), 'not-an-object' as unknown as CriticalLimits, IDENTIFIED_AT),
    (error: unknown) => error instanceof CriticalValueInputError && error.code === 'limits-malformed',
  );
});

test('a unit mismatch between the result and the declared limits fails closed', () => {
  const limits: CriticalLimits = { ...baselineLimits(), unit: 'mg/dL' };
  assert.throws(
    () => evaluateCriticalValue(baselineResult(), limits, IDENTIFIED_AT),
    (error: unknown) => error instanceof CriticalValueInputError && error.code === 'limits-unit-mismatch',
  );
});

test('an empty critical range fails closed', () => {
  const limits: CriticalLimits = { ...baselineLimits(), low: null, high: null };
  assert.throws(
    () => evaluateCriticalValue(baselineResult(), limits, IDENTIFIED_AT),
    (error: unknown) => error instanceof CriticalValueInputError && error.code === 'limits-range-empty',
  );
});

test('an inverted critical range fails closed', () => {
  const limits: CriticalLimits = { ...baselineLimits(), low: 10, high: 5 };
  assert.throws(
    () => evaluateCriticalValue(baselineResult(), limits, IDENTIFIED_AT),
    (error: unknown) => error instanceof CriticalValueInputError && error.code === 'limits-range-inverted',
  );
});

test('an empty notifyRoles list fails closed', () => {
  const limits: CriticalLimits = { ...baselineLimits(), notifyRoles: [] };
  assert.throws(
    () => evaluateCriticalValue(baselineResult(), limits, IDENTIFIED_AT),
    (error: unknown) => error instanceof CriticalValueInputError && error.code === 'limits-roles-empty',
  );
});

test('an unrecognized notifyRoles entry fails closed', () => {
  const limits = { ...baselineLimits(), notifyRoles: ['NOT_A_ROLE'] } as unknown as CriticalLimits;
  assert.throws(
    () => evaluateCriticalValue(baselineResult(), limits, IDENTIFIED_AT),
    (error: unknown) => error instanceof CriticalValueInputError && error.code === 'limits-roles-unknown',
  );
});

test('a non-positive acknowledgement window fails closed', () => {
  const limits: CriticalLimits = { ...baselineLimits(), acknowledgeWithinMinutes: 0 };
  assert.throws(
    () => evaluateCriticalValue(baselineResult(), limits, IDENTIFIED_AT),
    (error: unknown) => error instanceof CriticalValueInputError && error.code === 'limits-acknowledge-window-invalid',
  );
});

test('a nonnumeric result value fails closed', () => {
  const result: CriticalResultInput = { ...baselineResult(), value: 'seven' };
  assert.throws(
    () => evaluateCriticalValue(result, baselineLimits(), IDENTIFIED_AT),
    (error: unknown) => error instanceof CriticalValueInputError && error.code === 'result-value-invalid',
  );
});

test('an unparseable identifiedAt timestamp fails closed', () => {
  assert.throws(
    () => evaluateCriticalValue(baselineResult(), baselineLimits(), 'not-a-timestamp'),
    (error: unknown) => error instanceof CriticalValueInputError && error.code === 'identified-at-invalid',
  );
});

test('an impossible calendar date fails closed rather than rolling over', () => {
  assert.throws(
    () => evaluateCriticalValue(baselineResult(), baselineLimits(), '2026-04-31T00:00:00.000Z'),
    (error: unknown) => error instanceof CriticalValueInputError && error.code === 'identified-at-invalid',
  );
});

test('the notification record is frozen and resists mutation', () => {
  const decision = evaluateCriticalValue(baselineResult(), baselineLimits(), IDENTIFIED_AT);
  assert.equal(Object.isFrozen(decision.notification), true);
  try {
    (decision.notification as unknown as { value: number }).value = 999;
  } catch {
    // Strict mode throws on assignment to a frozen property; sloppy mode silently no-ops.
    // Either way the value below must remain unchanged.
  }
  assert.equal(decision.notification?.value, 7.2);
});

test('mutating the input limits after the decision does not affect the returned notifyRoles', () => {
  const limits = baselineLimits();
  const decision = evaluateCriticalValue(baselineResult(), limits, IDENTIFIED_AT);
  (limits.notifyRoles as NotificationRoleArray).push('LAB_DIRECTOR');
  assert.deepEqual(decision.notification?.notifyRoles, ['ORDERING_PROVIDER', 'CHARGE_NURSE']);
});
type NotificationRoleArray = Array<CriticalLimits['notifyRoles'][number]>;

test('acknowledgement lifecycle: pending can move directly to acknowledged', () => {
  const record = createAcknowledgementRecord(IDENTIFIED_AT);
  assert.equal(record.state, 'pending');
  const acknowledged = applyAcknowledgementEvent(record, { type: 'acknowledge', at: '2026-01-02T12:10:00.000Z' });
  assert.equal(acknowledged.state, 'acknowledged');
  assert.equal(acknowledged.history.length, 2);
});

test('acknowledgement lifecycle: pending can move to escalated, then to acknowledged', () => {
  const record = createAcknowledgementRecord(IDENTIFIED_AT);
  const escalated = applyAcknowledgementEvent(record, { type: 'escalate', at: '2026-01-02T12:30:00.000Z' });
  assert.equal(escalated.state, 'escalated');
  const acknowledged = applyAcknowledgementEvent(escalated, { type: 'acknowledge', at: '2026-01-02T12:40:00.000Z' });
  assert.equal(acknowledged.state, 'acknowledged');
  assert.equal(acknowledged.history.length, 3);
});

test('acknowledgement lifecycle: a second escalation is rejected as an invalid transition', () => {
  const record = createAcknowledgementRecord(IDENTIFIED_AT);
  const escalated = applyAcknowledgementEvent(record, { type: 'escalate', at: '2026-01-02T12:30:00.000Z' });
  assert.throws(
    () => applyAcknowledgementEvent(escalated, { type: 'escalate', at: '2026-01-02T12:40:00.000Z' }),
    (error: unknown) => error instanceof CriticalValueInputError && error.code === 'acknowledgement-invalid-transition',
  );
});

test('acknowledgement lifecycle: acknowledged is terminal', () => {
  const record = createAcknowledgementRecord(IDENTIFIED_AT);
  const acknowledged = applyAcknowledgementEvent(record, { type: 'acknowledge', at: '2026-01-02T12:10:00.000Z' });
  assert.throws(
    () => applyAcknowledgementEvent(acknowledged, { type: 'escalate', at: '2026-01-02T12:20:00.000Z' }),
    (error: unknown) => error instanceof CriticalValueInputError && error.code === 'acknowledgement-invalid-transition',
  );
  assert.throws(
    () => applyAcknowledgementEvent(acknowledged, { type: 'acknowledge', at: '2026-01-02T12:20:00.000Z' }),
    (error: unknown) => error instanceof CriticalValueInputError && error.code === 'acknowledgement-invalid-transition',
  );
});

test('acknowledgement lifecycle: an out-of-order event timestamp fails closed', () => {
  const record = createAcknowledgementRecord(IDENTIFIED_AT);
  assert.throws(
    () => applyAcknowledgementEvent(record, { type: 'acknowledge', at: '2026-01-02T11:00:00.000Z' }),
    (error: unknown) => error instanceof CriticalValueInputError && error.code === 'acknowledgement-event-out-of-order',
  );
});

test('acknowledgement lifecycle: an event timestamp equal to the prior transition fails closed', () => {
  const record = createAcknowledgementRecord(IDENTIFIED_AT);
  assert.throws(
    () => applyAcknowledgementEvent(record, { type: 'acknowledge', at: IDENTIFIED_AT }),
    (error: unknown) => error instanceof CriticalValueInputError && error.code === 'acknowledgement-event-out-of-order',
  );
});

test('acknowledgement lifecycle: an unparseable event timestamp fails closed', () => {
  const record = createAcknowledgementRecord(IDENTIFIED_AT);
  assert.throws(
    () => applyAcknowledgementEvent(record, { type: 'acknowledge', at: 'not-a-timestamp' }),
    (error: unknown) => error instanceof CriticalValueInputError && error.code === 'acknowledgement-event-timestamp-invalid',
  );
});

test('acknowledgement lifecycle: a malformed event fails closed', () => {
  const record = createAcknowledgementRecord(IDENTIFIED_AT);
  assert.throws(
    () => applyAcknowledgementEvent(record, { type: 'reject' } as unknown as { type: 'acknowledge'; at: string }),
    (error: unknown) => error instanceof CriticalValueInputError && error.code === 'acknowledgement-event-malformed',
  );
});

test('acknowledgement lifecycle: a malformed record fails closed', () => {
  assert.throws(
    () =>
      applyAcknowledgementEvent({ state: 'pending', history: [] } as unknown as AcknowledgementRecord, {
        type: 'acknowledge',
        at: '2026-01-02T12:10:00.000Z',
      }),
    (error: unknown) => error instanceof CriticalValueInputError && error.code === 'acknowledgement-record-malformed',
  );
});

test('applyAcknowledgementEvent does not mutate the input record', () => {
  const record = createAcknowledgementRecord(IDENTIFIED_AT);
  const snapshot = clone(record);
  applyAcknowledgementEvent(record, { type: 'acknowledge', at: '2026-01-02T12:10:00.000Z' });
  assert.deepEqual(clone(record), snapshot);
});

test('createAcknowledgementRecord fails closed on an unparseable identifiedAt', () => {
  assert.throws(
    () => createAcknowledgementRecord('not-a-timestamp'),
    (error: unknown) => error instanceof CriticalValueInputError && error.code === 'identified-at-invalid',
  );
});


test('same-unit limits for another analyte fail closed before decision', () => {
  for (const high of [100, 6.5]) {
    assert.throws(
      () => evaluateCriticalValue(baselineResult(), { ...baselineLimits(), analyteCode: 'OTHER-SYNTH', high }, IDENTIFIED_AT),
      (error: unknown) => error instanceof CriticalValueInputError && error.code === 'limits-analyte-mismatch',
    );
  }
});

test('fresh acknowledgement history is frozen', () => {
  const record = createAcknowledgementRecord(IDENTIFIED_AT);
  assert.ok(Object.isFrozen(record.history));
  assert.ok(Object.isFrozen(record.history[0]));
});

test('deserialized acknowledgement histories cannot bypass terminal or ordering rules', () => {
  const cases = [
    { state: 'pending', history: [{ state: 'pending', at: IDENTIFIED_AT }, { state: 'acknowledged', at: '2026-01-02T12:10:00.000Z' }] },
    { state: 'escalated', history: [{ state: 'pending', at: IDENTIFIED_AT }, { state: 'acknowledged', at: '2026-01-02T12:10:00.000Z' }, { state: 'escalated', at: '2026-01-02T12:20:00.000Z' }] },
    { state: 'pending', history: [{ state: 'pending', at: IDENTIFIED_AT }, { state: 'pending', at: '2026-01-02T12:10:00.000Z' }] },
    { state: 'escalated', history: [{ state: 'pending', at: IDENTIFIED_AT }, { state: 'escalated', at: IDENTIFIED_AT }] },
    { state: 'pending', history: [null] },
  ];
  for (const record of cases) {
    assert.throws(
      () => applyAcknowledgementEvent(record as unknown as AcknowledgementRecord, { type: 'escalate', at: '2026-01-02T12:40:00.000Z' }),
      (error: unknown) => error instanceof CriticalValueInputError && error.code === 'acknowledgement-record-malformed',
    );
  }
});

test('accepted deserialized history is copied and frozen in returned record', () => {
  const record = clone(createAcknowledgementRecord(IDENTIFIED_AT));
  const next = applyAcknowledgementEvent(record, { type: 'escalate', at: '2026-01-02T12:10:00.000Z' });
  assert.ok(Object.isFrozen(next.history[0]));
  assert.notEqual(next.history[0], record.history[0]);
});
