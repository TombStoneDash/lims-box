import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CriticalValueInputError,
  appendAcknowledgementEvent,
  currentAcknowledgementState,
  evaluateCriticalValue,
  initialAcknowledgementHistory,
  type AcknowledgementEvent,
  type AnalyteCriticalLimits,
  type EvaluateCriticalValueInput,
  type ObservedResult,
} from '../../lib/ohworks-critical-value';

/**
 * All fabricated: synthetic subject/analyte identifiers and made-up numeric
 * values. None of this represents a real patient, clinician, or result.
 */
function baselineResult(): ObservedResult {
  return {
    subjectId: 'subject-synthetic-a',
    analyteCode: 'ANALYTE-SYNTH-K',
    value: 7.2,
    unit: 'mmol/L',
  };
}

function baselineLimits(): AnalyteCriticalLimits {
  return {
    analyteCode: 'ANALYTE-SYNTH-K',
    unit: 'mmol/L',
    range: { low: null, high: 6.5 },
  };
}

function baselineInput(): EvaluateCriticalValueInput {
  return {
    result: baselineResult(),
    limits: baselineLimits(),
    identifiedAt: '2026-01-02T12:00:00.000Z',
    acknowledgementWindowMinutes: 30,
    notifyRoles: ['ORDERING_PROVIDER', 'CHARGE_NURSE'],
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function assertThrowsCode(fn: () => unknown, code: string): void {
  assert.throws(
    fn,
    (error: unknown) => error instanceof CriticalValueInputError && error.code === code,
  );
}

test('a value beyond the high bound is critical and produces one notification per declared role', () => {
  const evaluation = evaluateCriticalValue(baselineInput());
  assert.equal(evaluation.isCritical, true);
  assert.equal(evaluation.breached, 'high');
  assert.ok(evaluation.notifications);
  assert.equal(evaluation.notifications?.length, 2);
  assert.deepEqual(
    evaluation.notifications?.map((n) => n.role),
    ['ORDERING_PROVIDER', 'CHARGE_NURSE'],
  );
  for (const notification of evaluation.notifications ?? []) {
    assert.equal(notification.readBackRequired, true);
    assert.equal(notification.acknowledgementDeadline, '2026-01-02T12:30:00.000Z');
  }
});

test('a value beyond the low bound is critical with breached "low"', () => {
  const input = clone(baselineInput());
  input.limits = { analyteCode: 'ANALYTE-SYNTH-K', unit: 'mmol/L', range: { low: 2.5, high: null } };
  input.result.value = 2.0;
  const evaluation = evaluateCriticalValue(input);
  assert.equal(evaluation.isCritical, true);
  assert.equal(evaluation.breached, 'low');
});

test('a value strictly at the boundary is critical (inclusive breach)', () => {
  const input = clone(baselineInput());
  input.result.value = 6.5;
  const evaluation = evaluateCriticalValue(input);
  assert.equal(evaluation.isCritical, true);
  assert.equal(evaluation.breached, 'high');
});

test('a value within the declared range is not critical and produces no notifications', () => {
  const input = clone(baselineInput());
  input.result.value = 5.0;
  const evaluation = evaluateCriticalValue(input);
  assert.equal(evaluation.isCritical, false);
  assert.equal(evaluation.breached, null);
  assert.equal(evaluation.notifications, null);
});

test('the acknowledgement deadline is computed from the caller-supplied identifiedAt, not the system clock', () => {
  const input = clone(baselineInput());
  input.identifiedAt = '2026-03-14T08:00:00.000Z';
  input.acknowledgementWindowMinutes = 15;
  const evaluation = evaluateCriticalValue(input);
  assert.equal(evaluation.notifications?.[0].acknowledgementDeadline, '2026-03-14T08:15:00.000Z');
});

test('fails closed when limits are missing (null)', () => {
  const input = clone(baselineInput());
  input.limits = null;
  assertThrowsCode(() => evaluateCriticalValue(input), 'limits-missing');
});

test('fails closed when limits are missing (undefined)', () => {
  const input = clone(baselineInput());
  input.limits = undefined;
  assertThrowsCode(() => evaluateCriticalValue(input), 'limits-missing');
});

test('fails closed when limits are structurally malformed', () => {
  const input = clone(baselineInput());
  // @ts-expect-error intentionally malformed for the fail-closed path
  input.limits = { analyteCode: 'ANALYTE-SYNTH-K', unit: 'mmol/L' };
  assertThrowsCode(() => evaluateCriticalValue(input), 'limits-malformed');
});

test('fails closed when the declared critical range has no bound at all', () => {
  const input = clone(baselineInput());
  input.limits = { analyteCode: 'ANALYTE-SYNTH-K', unit: 'mmol/L', range: { low: null, high: null } };
  assertThrowsCode(() => evaluateCriticalValue(input), 'limits-range-empty');
});

test('fails closed when the declared critical range is inverted', () => {
  const input = clone(baselineInput());
  input.limits = { analyteCode: 'ANALYTE-SYNTH-K', unit: 'mmol/L', range: { low: 10, high: 1 } };
  assertThrowsCode(() => evaluateCriticalValue(input), 'limits-range-inverted');
});

test('fails closed on a unit mismatch between the result and its declared limits', () => {
  const input = clone(baselineInput());
  input.result.unit = 'mg/dL';
  assertThrowsCode(() => evaluateCriticalValue(input), 'unit-mismatch');
});

test('fails closed when the limits are declared for a different analyte than the result', () => {
  const input = clone(baselineInput());
  input.limits = { analyteCode: 'ANALYTE-SYNTH-OTHER', unit: 'mmol/L', range: { low: null, high: 6.5 } };
  assertThrowsCode(() => evaluateCriticalValue(input), 'analyte-mismatch');
});

test('fails closed on a non-numeric observed value', () => {
  const input = clone(baselineInput());
  input.result.value = 'not-a-number';
  assertThrowsCode(() => evaluateCriticalValue(input), 'value-invalid');
});

test('fails closed on an unparseable identifiedAt timestamp', () => {
  const input = clone(baselineInput());
  input.identifiedAt = 'not-a-timestamp';
  assertThrowsCode(() => evaluateCriticalValue(input), 'identified-at-invalid');
});

test('fails closed on a non-positive acknowledgement window', () => {
  const input = clone(baselineInput());
  input.acknowledgementWindowMinutes = 0;
  assertThrowsCode(() => evaluateCriticalValue(input), 'acknowledgement-window-invalid');
});

test('fails closed on an empty notifyRoles list', () => {
  const input = clone(baselineInput());
  input.notifyRoles = [];
  assertThrowsCode(() => evaluateCriticalValue(input), 'notify-roles-empty');
});

test('fails closed on an unrecognized notify role', () => {
  const input = clone(baselineInput());
  // @ts-expect-error intentionally invalid for the fail-closed path
  input.notifyRoles = ['UNKNOWN_ROLE'];
  assertThrowsCode(() => evaluateCriticalValue(input), 'notify-roles-invalid');
});

test('fails closed on a duplicate notify role', () => {
  const input = clone(baselineInput());
  input.notifyRoles = ['ORDERING_PROVIDER', 'ORDERING_PROVIDER'];
  assertThrowsCode(() => evaluateCriticalValue(input), 'notify-roles-invalid');
});

test('acknowledgement state machine: pending -> acknowledged is a valid, tracked transition', () => {
  const history = initialAcknowledgementHistory('2026-01-02T12:05:00.000Z');
  assert.equal(currentAcknowledgementState(history), 'pending');
  const next = appendAcknowledgementEvent(history, { state: 'acknowledged', at: '2026-01-02T12:10:00.000Z' });
  assert.equal(currentAcknowledgementState(next), 'acknowledged');
  assert.equal(history.length, 1, 'the original history is not mutated');
});

test('acknowledgement state machine: pending -> escalated -> acknowledged is a valid chain', () => {
  let history: AcknowledgementEvent[] = initialAcknowledgementHistory('2026-01-02T12:05:00.000Z');
  history = appendAcknowledgementEvent(history, { state: 'escalated', at: '2026-01-02T12:20:00.000Z' });
  assert.equal(currentAcknowledgementState(history), 'escalated');
  history = appendAcknowledgementEvent(history, { state: 'acknowledged', at: '2026-01-02T12:25:00.000Z' });
  assert.equal(currentAcknowledgementState(history), 'acknowledged');
  assert.equal(history.length, 3);
});

test('acknowledgement state machine fails closed on an out-of-order (non-increasing) timestamp', () => {
  const history = initialAcknowledgementHistory('2026-01-02T12:05:00.000Z');
  assertThrowsCode(
    () => appendAcknowledgementEvent(history, { state: 'acknowledged', at: '2026-01-02T12:00:00.000Z' }),
    'transition-not-after-previous',
  );
});

test('acknowledgement state machine fails closed on an equal (non-strictly-increasing) timestamp', () => {
  const history = initialAcknowledgementHistory('2026-01-02T12:05:00.000Z');
  assertThrowsCode(
    () => appendAcknowledgementEvent(history, { state: 'acknowledged', at: '2026-01-02T12:05:00.000Z' }),
    'transition-not-after-previous',
  );
});

test('acknowledgement state machine fails closed on a transition out of the terminal acknowledged state', () => {
  let history: AcknowledgementEvent[] = initialAcknowledgementHistory('2026-01-02T12:05:00.000Z');
  history = appendAcknowledgementEvent(history, { state: 'acknowledged', at: '2026-01-02T12:10:00.000Z' });
  assertThrowsCode(
    () => appendAcknowledgementEvent(history, { state: 'escalated', at: '2026-01-02T12:15:00.000Z' }),
    'transition-unreachable',
  );
});

test('acknowledgement state machine fails closed on escalated reverting to pending', () => {
  let history: AcknowledgementEvent[] = initialAcknowledgementHistory('2026-01-02T12:05:00.000Z');
  history = appendAcknowledgementEvent(history, { state: 'escalated', at: '2026-01-02T12:10:00.000Z' });
  assertThrowsCode(
    () => appendAcknowledgementEvent(history, { state: 'pending', at: '2026-01-02T12:15:00.000Z' }),
    'transition-unreachable',
  );
});

test('acknowledgement state machine fails closed on a malformed (empty) history', () => {
  assertThrowsCode(
    () => appendAcknowledgementEvent([], { state: 'acknowledged', at: '2026-01-02T12:10:00.000Z' }),
    'history-malformed',
  );
});

test('initialAcknowledgementHistory fails closed on an unparseable timestamp', () => {
  assertThrowsCode(() => initialAcknowledgementHistory('not-a-timestamp'), 'transition-timestamp-invalid');
});
