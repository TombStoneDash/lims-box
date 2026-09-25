import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CalibrationVerificationScheduleInputError,
  evaluateCalibrationVerificationSchedule,
  explainCalibrationVerificationReason,
  type CalibrationVerificationReasonCode,
  type CalibrationVerificationScheduleInput,
  type CalibrationVerificationScheduleOptions,
  type TriggerEventInput,
} from '../../lib/ohworks-calibration-verification';

/**
 * All fabricated: synthetic instrument/analyte identifiers and made-up
 * calibration verification data. None of this represents a real
 * instrument, sample, or customer.
 */
function scheduleInput(overrides: Partial<CalibrationVerificationScheduleInput> = {}): CalibrationVerificationScheduleInput {
  return {
    instrumentId: 'instrument-synthetic-001',
    analyteId: 'analyte-synthetic-glucose',
    lastVerifiedAt: '2026-01-01T00:00:00.000Z',
    maxIntervalDays: 30,
    triggerEvents: [],
    ...overrides,
  };
}

function event(overrides: Partial<TriggerEventInput> = {}): TriggerEventInput {
  return {
    kind: 'reagent-lot-change',
    occurredAt: '2026-01-05T00:00:00.000Z',
    ...overrides,
  };
}

const ALL_REASON_CODES: CalibrationVerificationReasonCode[] = [
  'max-interval-invalid',
  'last-verification-missing',
  'last-verification-timestamp-invalid',
  'as-of-timestamp-invalid',
  'last-verification-in-future',
  'trigger-event-kind-unknown',
  'trigger-event-timestamp-invalid',
  'trigger-event-before-last-verification',
  'trigger-event-required',
  'interval-current',
  'interval-due-soon',
  'interval-overdue',
];

const FORBIDDEN_WORDS = [/compliant/i, /accredited/i, /released?\b.*\bresult/i];

// ---------------------------------------------------------------------------
// Golden paths: calendar-only decisions
// ---------------------------------------------------------------------------

test('a verification well inside the interval with no events is CURRENT', () => {
  const input = scheduleInput();
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'CURRENT');
  assert.equal(result.reasonCode, 'interval-current');
  assert.equal(result.dueAt, '2026-01-31T00:00:00.000Z');
  assert.equal(result.governingTriggerKind, null);
});

test('a verification evaluated at the exact moment it was performed is CURRENT', () => {
  const input = scheduleInput();
  const result = evaluateCalibrationVerificationSchedule(input, input.lastVerifiedAt as string);
  assert.equal(result.decision, 'CURRENT');
});

test('a verification inside the default 7-day due-soon window is DUE_SOON', () => {
  const input = scheduleInput();
  // interval expires 2026-01-31T00:00:00.000Z; evaluate 5 days before that.
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-26T00:00:00.000Z');
  assert.equal(result.decision, 'DUE_SOON');
  assert.equal(result.reasonCode, 'interval-due-soon');
  assert.equal(result.dueAt, '2026-01-31T00:00:00.000Z');
});

test('a verification exactly dueSoonWarningDays before expiry is DUE_SOON', () => {
  const input = scheduleInput();
  // expiry is 2026-01-31T00:00:00.000Z; exactly 7 days before is the boundary.
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-24T00:00:00.000Z');
  assert.equal(result.decision, 'DUE_SOON');
});

test('a verification one instant more than dueSoonWarningDays before expiry is CURRENT', () => {
  const input = scheduleInput();
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-23T23:59:59.999Z');
  assert.equal(result.decision, 'CURRENT');
  assert.equal(result.reasonCode, 'interval-current');
});

test('a verification evaluated at the exact expiry instant is OVERDUE', () => {
  const input = scheduleInput();
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-31T00:00:00.000Z');
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'interval-overdue');
  assert.equal(result.dueAt, '2026-01-31T00:00:00.000Z');
});

test('a verification evaluated well past expiry is OVERDUE', () => {
  const input = scheduleInput();
  const result = evaluateCalibrationVerificationSchedule(input, '2026-03-01T00:00:00.000Z');
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'interval-overdue');
});

test('a custom dueSoonWarningDays of 0 disables the due-soon flag', () => {
  const input = scheduleInput();
  const options: CalibrationVerificationScheduleOptions = { dueSoonWarningDays: 0 };
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-26T00:00:00.000Z', options);
  assert.equal(result.decision, 'CURRENT');
  assert.equal(result.reasonCode, 'interval-current');
});

test('a custom, wider dueSoonWarningDays flags earlier evaluations', () => {
  const input = scheduleInput();
  const options: CalibrationVerificationScheduleOptions = { dueSoonWarningDays: 15 };
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-20T00:00:00.000Z', options);
  assert.equal(result.decision, 'DUE_SOON');
  assert.equal(result.reasonCode, 'interval-due-soon');
});

// ---------------------------------------------------------------------------
// Trigger events outrank the calendar
// ---------------------------------------------------------------------------

test('a reagent lot change since last verification is REQUIRED_BY_EVENT even though the calendar is current', () => {
  const input = scheduleInput({ triggerEvents: [event({ occurredAt: '2026-01-05T00:00:00.000Z' })] });
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'REQUIRED_BY_EVENT');
  assert.equal(result.reasonCode, 'trigger-event-required');
  assert.equal(result.governingTriggerKind, 'reagent-lot-change');
  assert.equal(result.dueAt, '2026-01-05T00:00:00.000Z');
});

test('major maintenance since last verification is REQUIRED_BY_EVENT even though the calendar would say due soon', () => {
  const input = scheduleInput({ triggerEvents: [event({ kind: 'major-maintenance', occurredAt: '2026-01-25T00:00:00.000Z' })] });
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-26T00:00:00.000Z');
  assert.equal(result.decision, 'REQUIRED_BY_EVENT');
  assert.equal(result.governingTriggerKind, 'major-maintenance');
});

test('a QC shift since last verification is REQUIRED_BY_EVENT even though the calendar interval already expired', () => {
  const input = scheduleInput({ triggerEvents: [event({ kind: 'qc-shift', occurredAt: '2026-02-01T00:00:00.000Z' })] });
  const result = evaluateCalibrationVerificationSchedule(input, '2026-03-01T00:00:00.000Z');
  assert.equal(result.decision, 'REQUIRED_BY_EVENT');
  assert.equal(result.reasonCode, 'trigger-event-required');
});

test('a manufacturer requirement event is REQUIRED_BY_EVENT', () => {
  const input = scheduleInput({ triggerEvents: [event({ kind: 'manufacturer-requirement', occurredAt: '2026-01-05T00:00:00.000Z' })] });
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'REQUIRED_BY_EVENT');
  assert.equal(result.governingTriggerKind, 'manufacturer-requirement');
});

test('with multiple events, the earliest occurredAt governs the due instant and kind', () => {
  const input = scheduleInput({
    triggerEvents: [
      event({ kind: 'manufacturer-requirement', occurredAt: '2026-01-10T00:00:00.000Z' }),
      event({ kind: 'qc-shift', occurredAt: '2026-01-06T00:00:00.000Z' }),
      event({ kind: 'reagent-lot-change', occurredAt: '2026-01-20T00:00:00.000Z' }),
    ],
  });
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-25T00:00:00.000Z');
  assert.equal(result.decision, 'REQUIRED_BY_EVENT');
  assert.equal(result.governingTriggerKind, 'qc-shift');
  assert.equal(result.dueAt, '2026-01-06T00:00:00.000Z');
});

test('with a tied earliest occurredAt across events, kind priority order breaks the tie', () => {
  const input = scheduleInput({
    triggerEvents: [
      event({ kind: 'qc-shift', occurredAt: '2026-01-06T00:00:00.000Z' }),
      event({ kind: 'major-maintenance', occurredAt: '2026-01-06T00:00:00.000Z' }),
    ],
  });
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.equal(result.governingTriggerKind, 'major-maintenance');
});

test('an empty trigger events array falls back to the calendar decision', () => {
  const input = scheduleInput({ triggerEvents: [] });
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'CURRENT');
  assert.equal(result.governingTriggerKind, null);
});

// ---------------------------------------------------------------------------
// Fail closed: interval, verification, and evaluation timestamp
// ---------------------------------------------------------------------------

test('a zero maximum interval is OVERDUE as invalid', () => {
  const input = scheduleInput({ maxIntervalDays: 0 });
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'max-interval-invalid');
  assert.equal(result.dueAt, null);
});

test('a negative maximum interval is OVERDUE as invalid', () => {
  const input = scheduleInput({ maxIntervalDays: -30 });
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'max-interval-invalid');
});

test('a non-finite maximum interval is OVERDUE as invalid', () => {
  const input = scheduleInput({ maxIntervalDays: Infinity });
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'max-interval-invalid');
});

test('a NaN maximum interval is OVERDUE as invalid', () => {
  const input = scheduleInput({ maxIntervalDays: NaN });
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'max-interval-invalid');
});

test('a null last-verified-at is OVERDUE as missing', () => {
  const input = scheduleInput({ lastVerifiedAt: null });
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'last-verification-missing');
  assert.equal(result.dueAt, null);
});

test('an unparsable last-verified-at is OVERDUE as invalid', () => {
  const input = scheduleInput({ lastVerifiedAt: 'not-a-timestamp' });
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'last-verification-timestamp-invalid');
});

test('a non-UTC (offset, non-"Z") last-verified-at is OVERDUE as invalid', () => {
  const input = scheduleInput({ lastVerifiedAt: '2026-01-01T00:00:00.000+00:00' });
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'last-verification-timestamp-invalid');
});

test('an unparsable evaluation timestamp is OVERDUE as invalid', () => {
  const input = scheduleInput();
  const result = evaluateCalibrationVerificationSchedule(input, 'not-a-timestamp');
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'as-of-timestamp-invalid');
});

test('a non-UTC (offset, non-"Z") evaluation timestamp is OVERDUE as invalid', () => {
  const input = scheduleInput();
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000+05:00');
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'as-of-timestamp-invalid');
});

test('a non-finite-valued evaluation timestamp is OVERDUE as invalid', () => {
  const input = scheduleInput();
  const result = evaluateCalibrationVerificationSchedule(input, 'Infinity-Z');
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'as-of-timestamp-invalid');
});

test('a last-verified-at after the evaluation timestamp is OVERDUE as future-dated', () => {
  const input = scheduleInput({ lastVerifiedAt: '2026-01-10T00:00:00.000Z' });
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'last-verification-in-future');
  assert.equal(result.dueAt, null);
});

test('max-interval-invalid is checked before a trigger event would otherwise apply', () => {
  const input = scheduleInput({ maxIntervalDays: 0, triggerEvents: [event()] });
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'max-interval-invalid');
});

// ---------------------------------------------------------------------------
// Fail closed: trigger events
// ---------------------------------------------------------------------------

test('an unrecognized trigger event kind is OVERDUE as invalid', () => {
  const input = scheduleInput({ triggerEvents: [event({ kind: 'looks-important-probably' as TriggerEventInput['kind'] })] });
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'trigger-event-kind-unknown');
  assert.equal(result.dueAt, null);
});

test('an unparsable trigger event timestamp is OVERDUE as invalid', () => {
  const input = scheduleInput({ triggerEvents: [event({ occurredAt: 'not-a-timestamp' })] });
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'trigger-event-timestamp-invalid');
});

test('a non-UTC trigger event timestamp is OVERDUE as invalid', () => {
  const input = scheduleInput({ triggerEvents: [event({ occurredAt: '2026-01-05T00:00:00.000+00:00' })] });
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'trigger-event-timestamp-invalid');
});

test('a trigger event before the last verification is OVERDUE as invalid', () => {
  const input = scheduleInput({ triggerEvents: [event({ occurredAt: '2025-12-31T00:00:00.000Z' })] });
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'trigger-event-before-last-verification');
  assert.equal(result.dueAt, null);
});

test('one bad trigger event among several invalidates the whole evaluation', () => {
  const input = scheduleInput({
    triggerEvents: [event({ occurredAt: '2026-01-06T00:00:00.000Z' }), event({ kind: 'not-a-real-kind' as TriggerEventInput['kind'] })],
  });
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'trigger-event-kind-unknown');
});

// ---------------------------------------------------------------------------
// Structurally malformed input throws, rather than guessing
// ---------------------------------------------------------------------------

test('a null input throws a sanitized typed error', () => {
  assert.throws(
    () => evaluateCalibrationVerificationSchedule(null as unknown as CalibrationVerificationScheduleInput, '2026-01-10T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof CalibrationVerificationScheduleInputError);
      assert.equal((error as CalibrationVerificationScheduleInputError).code, 'input-malformed');
      return true;
    },
  );
});

test('an array input throws a sanitized typed error', () => {
  assert.throws(
    () => evaluateCalibrationVerificationSchedule([] as unknown as CalibrationVerificationScheduleInput, '2026-01-10T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof CalibrationVerificationScheduleInputError);
      assert.equal((error as CalibrationVerificationScheduleInputError).code, 'input-malformed');
      return true;
    },
  );
});

test('an empty-string instrument id throws a sanitized typed error', () => {
  const input = scheduleInput({ instrumentId: '' });
  assert.throws(
    () => evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof CalibrationVerificationScheduleInputError);
      assert.equal((error as CalibrationVerificationScheduleInputError).code, 'instrument-id-malformed');
      return true;
    },
  );
});

test('an empty-string analyte id throws a sanitized typed error', () => {
  const input = scheduleInput({ analyteId: '' });
  assert.throws(
    () => evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z'),
    CalibrationVerificationScheduleInputError,
  );
});

test('a non-string, non-null last-verified-at throws a sanitized typed error', () => {
  const input = scheduleInput({ lastVerifiedAt: 12345 as unknown as string });
  assert.throws(
    () => evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z'),
    CalibrationVerificationScheduleInputError,
  );
});

test('a non-number maximum interval throws a sanitized typed error', () => {
  const input = scheduleInput({ maxIntervalDays: '30' as unknown as number });
  assert.throws(
    () => evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z'),
    CalibrationVerificationScheduleInputError,
  );
});

test('a non-array trigger events field throws a sanitized typed error', () => {
  const input = scheduleInput({ triggerEvents: {} as unknown as TriggerEventInput[] });
  assert.throws(
    () => evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof CalibrationVerificationScheduleInputError);
      assert.equal((error as CalibrationVerificationScheduleInputError).code, 'trigger-events-malformed');
      return true;
    },
  );
});

test('a trigger event missing a required field throws a sanitized typed error', () => {
  const malformedEvent = event();
  delete (malformedEvent as Partial<TriggerEventInput>).occurredAt;
  const input = scheduleInput({ triggerEvents: [malformedEvent] });
  assert.throws(
    () => evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof CalibrationVerificationScheduleInputError);
      assert.equal((error as CalibrationVerificationScheduleInputError).code, 'trigger-event-malformed');
      return true;
    },
  );
});

test('a non-string evaluation timestamp throws a sanitized typed error', () => {
  const input = scheduleInput();
  assert.throws(
    () => evaluateCalibrationVerificationSchedule(input, 12345 as unknown as string),
    (error: unknown) => {
      assert.ok(error instanceof CalibrationVerificationScheduleInputError);
      assert.equal((error as CalibrationVerificationScheduleInputError).code, 'as-of-malformed');
      return true;
    },
  );
});

test('an empty-string evaluation timestamp throws a sanitized typed error', () => {
  const input = scheduleInput();
  assert.throws(
    () => evaluateCalibrationVerificationSchedule(input, ''),
    CalibrationVerificationScheduleInputError,
  );
});

test('a negative dueSoonWarningDays option throws a sanitized typed error', () => {
  const input = scheduleInput();
  assert.throws(
    () => evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z', { dueSoonWarningDays: -1 }),
    (error: unknown) => {
      assert.ok(error instanceof CalibrationVerificationScheduleInputError);
      assert.equal((error as CalibrationVerificationScheduleInputError).code, 'options-malformed');
      return true;
    },
  );
});

test('a typed input error message never echoes any submitted data', () => {
  const input = scheduleInput({ instrumentId: 'instrument-secret-token-abc123' });
  try {
    evaluateCalibrationVerificationSchedule(null as unknown as CalibrationVerificationScheduleInput, '2026-01-10T00:00:00.000Z');
    assert.fail('expected evaluateCalibrationVerificationSchedule to throw');
  } catch (error) {
    assert.ok(error instanceof CalibrationVerificationScheduleInputError);
    assert.doesNotMatch((error as Error).message, /instrument-secret-token-abc123/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch((error as Error).message, pattern);
    }
  }
  void input;
});

// ---------------------------------------------------------------------------
// Determinism, purity, and immutability
// ---------------------------------------------------------------------------

test('the result is deterministic across repeated calls with equivalent input', () => {
  const input = scheduleInput();
  const first = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  const second = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.deepEqual(first, second);
});

test('the result object is frozen', () => {
  const input = scheduleInput();
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.ok(Object.isFrozen(result));
  const mutationSucceeded = Reflect.set(result, 'decision', 'CURRENT');
  assert.equal(mutationSucceeded, false);
  assert.equal(result.decision, 'CURRENT');
});

test('evaluateCalibrationVerificationSchedule does not mutate its input', () => {
  const input = scheduleInput({ triggerEvents: [event()] });
  const before = JSON.stringify(input);
  evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.equal(JSON.stringify(input), before);
});

// ---------------------------------------------------------------------------
// Explanations
// ---------------------------------------------------------------------------

test('every reason code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainCalibrationVerificationReason(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /instrument-synthetic/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(
    explainCalibrationVerificationReason('trigger-event-required'),
    explainCalibrationVerificationReason('trigger-event-required'),
  );
});

test('the reason field on a result matches explainCalibrationVerificationReason for its reasonCode', () => {
  const input = scheduleInput();
  const result = evaluateCalibrationVerificationSchedule(input, '2026-01-10T00:00:00.000Z');
  assert.equal(result.reason, explainCalibrationVerificationReason(result.reasonCode));
});
