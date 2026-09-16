import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CalibrationGateInputError,
  evaluateInstrumentCalibrationGate,
  explainCalibrationGateReason,
  type CalibrationGateOptions,
  type CalibrationReasonCode,
  type InstrumentCalibrationRegistry,
  type InstrumentRecordInput,
} from '../../lib/ohworks-instrument-calibration';

/**
 * All fabricated: synthetic instrument identifiers and made-up calibration
 * data. None of this represents a real instrument, sample, or customer.
 */
function record(overrides: Partial<InstrumentRecordInput> = {}): InstrumentRecordInput {
  return {
    instrumentId: 'instrument-synthetic-001',
    lastCalibratedAt: '2026-01-01T00:00:00.000Z',
    calibrationIntervalDays: 30,
    calibrationOutcome: 'pass',
    ...overrides,
  };
}

function registryOf(entry: InstrumentRecordInput): InstrumentCalibrationRegistry {
  return { [entry.instrumentId]: entry };
}

const ALL_REASON_CODES: CalibrationReasonCode[] = [
  'unknown-instrument',
  'run-timestamp-invalid',
  'calibration-timestamp-invalid',
  'calibration-interval-invalid',
  'run-before-calibration',
  'maintenance-lock-active',
  'unknown-calibration-outcome',
  'calibration-outcome-failed',
  'calibration-outcome-pending',
  'calibration-outcome-not-performed',
  'calibration-interval-expired',
  'calibration-outcome-conditional-pass',
  'calibration-interval-near-expiry',
  'calibration-current-and-passed',
];

const FORBIDDEN_WORDS = [/compliant/i, /accredited/i, /released?\b.*\bresult/i];

// ---------------------------------------------------------------------------
// Golden paths
// ---------------------------------------------------------------------------

test('a current, clean pass well inside the interval is releasable', () => {
  const entry = record();
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'releasable');
  assert.equal(result.reasonCode, 'calibration-current-and-passed');
});

test('a run at the exact moment of calibration is releasable', () => {
  const entry = record();
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, entry.lastCalibratedAt);
  assert.equal(result.decision, 'releasable');
});

test('a conditional pass, still within interval and outside the warning window, is releasable_with_flag', () => {
  const entry = record({ calibrationOutcome: 'conditional-pass' });
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'releasable_with_flag');
  assert.equal(result.reasonCode, 'calibration-outcome-conditional-pass');
});

test('a clean pass inside the default 3-day near-expiry warning window is releasable_with_flag', () => {
  const entry = record();
  // interval expires 2026-01-31T00:00:00.000Z; run 2 days before that.
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-29T00:00:00.000Z');
  assert.equal(result.decision, 'releasable_with_flag');
  assert.equal(result.reasonCode, 'calibration-interval-near-expiry');
});

test('a clean pass exactly nearExpiryWarningDays before expiry is releasable_with_flag', () => {
  const entry = record();
  // expiry is 2026-01-31T00:00:00.000Z; exactly 3 days before is the boundary.
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-28T00:00:00.000Z');
  assert.equal(result.decision, 'releasable_with_flag');
  assert.equal(result.reasonCode, 'calibration-interval-near-expiry');
});

test('a clean pass one instant more than nearExpiryWarningDays before expiry is releasable', () => {
  const entry = record();
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-27T23:59:59.999Z');
  assert.equal(result.decision, 'releasable');
  assert.equal(result.reasonCode, 'calibration-current-and-passed');
});

test('a conditional pass takes precedence over the near-expiry flag', () => {
  const entry = record({ calibrationOutcome: 'conditional-pass' });
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-29T00:00:00.000Z');
  assert.equal(result.decision, 'releasable_with_flag');
  assert.equal(result.reasonCode, 'calibration-outcome-conditional-pass');
});

test('a custom nearExpiryWarningDays of 0 disables the near-expiry flag', () => {
  const entry = record();
  const options: CalibrationGateOptions = { nearExpiryWarningDays: 0 };
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-29T00:00:00.000Z', options);
  assert.equal(result.decision, 'releasable');
  assert.equal(result.reasonCode, 'calibration-current-and-passed');
});

test('a custom, wider nearExpiryWarningDays flags earlier runs', () => {
  const entry = record();
  const options: CalibrationGateOptions = { nearExpiryWarningDays: 10 };
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-25T00:00:00.000Z', options);
  assert.equal(result.decision, 'releasable_with_flag');
  assert.equal(result.reasonCode, 'calibration-interval-near-expiry');
});

// ---------------------------------------------------------------------------
// Fail closed: unknown instrument
// ---------------------------------------------------------------------------

test('an instrument absent from the registry is blocked as unknown', () => {
  const entry = record();
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), 'instrument-synthetic-does-not-exist', '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'unknown-instrument');
});

test('an empty registry blocks every lookup as unknown', () => {
  const result = evaluateInstrumentCalibrationGate({}, 'instrument-synthetic-001', '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'unknown-instrument');
});

// ---------------------------------------------------------------------------
// Fail closed: calibration outcome
// ---------------------------------------------------------------------------

test('a failed calibration is blocked', () => {
  const entry = record({ calibrationOutcome: 'fail' });
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'calibration-outcome-failed');
});

test('a pending calibration is blocked', () => {
  const entry = record({ calibrationOutcome: 'pending' });
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'calibration-outcome-pending');
});

test('an instrument that has never been calibrated is blocked', () => {
  const entry = record({ calibrationOutcome: 'not-performed' });
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'calibration-outcome-not-performed');
});

test('an unrecognized calibration outcome value is blocked', () => {
  const entry = record({ calibrationOutcome: 'looks-fine-probably' as InstrumentRecordInput['calibrationOutcome'] });
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'unknown-calibration-outcome');
});

// ---------------------------------------------------------------------------
// Fail closed: expired interval
// ---------------------------------------------------------------------------

test('a run at the exact expiry instant is blocked as expired', () => {
  const entry = record();
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-31T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'calibration-interval-expired');
});

test('a run well past the interval is blocked as expired', () => {
  const entry = record();
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-03-01T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'calibration-interval-expired');
});

test('interval expiry is checked before the conditional-pass flag', () => {
  const entry = record({ calibrationOutcome: 'conditional-pass' });
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-31T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'calibration-interval-expired');
});

// ---------------------------------------------------------------------------
// Fail closed: active maintenance lock
// ---------------------------------------------------------------------------

test('an active maintenance lock blocks an otherwise clean pass', () => {
  const entry = record({
    maintenanceLock: {
      active: true,
      reasonCode: 'unscheduled-repair',
      engagedAt: '2026-01-04T00:00:00.000Z',
    },
  });
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'maintenance-lock-active');
});

test('an active maintenance lock takes precedence over a failed calibration outcome', () => {
  const entry = record({
    calibrationOutcome: 'fail',
    maintenanceLock: {
      active: true,
      reasonCode: 'incident-investigation',
      engagedAt: '2026-01-04T00:00:00.000Z',
    },
  });
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'maintenance-lock-active');
});

test('an inactive (resolved) maintenance lock does not block a clean pass', () => {
  const entry = record({
    maintenanceLock: {
      active: false,
      reasonCode: 'preventive-maintenance',
      engagedAt: '2026-01-02T00:00:00.000Z',
    },
  });
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'releasable');
  assert.equal(result.reasonCode, 'calibration-current-and-passed');
});

// ---------------------------------------------------------------------------
// Fail closed: malformed timestamps and interval, as blocked reason codes
// ---------------------------------------------------------------------------

test('an unparsable run timestamp is blocked', () => {
  const entry = record();
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, 'not-a-timestamp');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'run-timestamp-invalid');
});

test('a non-UTC (offset, non-"Z") run timestamp is blocked', () => {
  const entry = record();
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000+00:00');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'run-timestamp-invalid');
});

test('an unparsable last-calibration timestamp is blocked', () => {
  const entry = record({ lastCalibratedAt: 'not-a-timestamp' });
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'calibration-timestamp-invalid');
});

test('a non-UTC last-calibration timestamp is blocked', () => {
  const entry = record({ lastCalibratedAt: '2026-01-01T00:00:00.000+05:00' });
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'calibration-timestamp-invalid');
});

test('a zero calibration interval is blocked as invalid', () => {
  const entry = record({ calibrationIntervalDays: 0 });
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'calibration-interval-invalid');
});

test('a negative calibration interval is blocked as invalid', () => {
  const entry = record({ calibrationIntervalDays: -30 });
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'calibration-interval-invalid');
});

test('a non-integer calibration interval is blocked as invalid', () => {
  const entry = record({ calibrationIntervalDays: 30.5 });
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'calibration-interval-invalid');
});

test('a run timestamp before the last calibration is blocked', () => {
  const entry = record();
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2025-12-31T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'run-before-calibration');
});

// ---------------------------------------------------------------------------
// Structurally malformed input throws, rather than guessing
// ---------------------------------------------------------------------------

test('a null registry throws a sanitized typed error', () => {
  assert.throws(
    () => evaluateInstrumentCalibrationGate(null as unknown as InstrumentCalibrationRegistry, 'instrument-synthetic-001', '2026-01-05T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof CalibrationGateInputError);
      assert.equal((error as CalibrationGateInputError).code, 'registry-malformed');
      return true;
    },
  );
});

test('an array registry throws a sanitized typed error', () => {
  assert.throws(
    () => evaluateInstrumentCalibrationGate([] as unknown as InstrumentCalibrationRegistry, 'instrument-synthetic-001', '2026-01-05T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof CalibrationGateInputError);
      assert.equal((error as CalibrationGateInputError).code, 'registry-malformed');
      return true;
    },
  );
});

test('an empty-string instrument id throws a sanitized typed error', () => {
  const entry = record();
  assert.throws(
    () => evaluateInstrumentCalibrationGate(registryOf(entry), '', '2026-01-05T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof CalibrationGateInputError);
      assert.equal((error as CalibrationGateInputError).code, 'instrument-id-malformed');
      return true;
    },
  );
});

test('a non-string run timestamp throws a sanitized typed error', () => {
  const entry = record();
  assert.throws(
    () => evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, 12345 as unknown as string),
    (error: unknown) => {
      assert.ok(error instanceof CalibrationGateInputError);
      assert.equal((error as CalibrationGateInputError).code, 'run-timestamp-malformed');
      return true;
    },
  );
});

test('a negative nearExpiryWarningDays option throws a sanitized typed error', () => {
  const entry = record();
  assert.throws(
    () => evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z', { nearExpiryWarningDays: -1 }),
    (error: unknown) => {
      assert.ok(error instanceof CalibrationGateInputError);
      assert.equal((error as CalibrationGateInputError).code, 'options-malformed');
      return true;
    },
  );
});

test('a registry entry missing a required field throws a sanitized typed error', () => {
  const malformed = record();
  delete (malformed as Partial<InstrumentRecordInput>).calibrationOutcome;
  assert.throws(
    () => evaluateInstrumentCalibrationGate({ [malformed.instrumentId]: malformed } as unknown as InstrumentCalibrationRegistry, malformed.instrumentId, '2026-01-05T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof CalibrationGateInputError);
      assert.equal((error as CalibrationGateInputError).code, 'instrument-record-malformed');
      return true;
    },
  );
});

test('a registry entry with a malformed maintenance lock throws a sanitized typed error', () => {
  const entry = record({ maintenanceLock: { active: 'yes' } as unknown as InstrumentRecordInput['maintenanceLock'] });
  assert.throws(
    () => evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z'),
    CalibrationGateInputError,
  );
});

test('a typed input error message never echoes any submitted data', () => {
  try {
    evaluateInstrumentCalibrationGate(null as unknown as InstrumentCalibrationRegistry, 'instrument-secret-token-abc123', '2026-01-05T00:00:00.000Z');
    assert.fail('expected evaluateInstrumentCalibrationGate to throw');
  } catch (error) {
    assert.ok(error instanceof CalibrationGateInputError);
    assert.doesNotMatch((error as Error).message, /instrument-secret-token-abc123/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch((error as Error).message, pattern);
    }
  }
});

// ---------------------------------------------------------------------------
// Determinism, purity, and immutability
// ---------------------------------------------------------------------------

test('the result is deterministic across repeated calls with equivalent input', () => {
  const entry = record();
  const first = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  const second = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.deepEqual(first, second);
});

test('the result object is frozen', () => {
  const entry = record();
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.ok(Object.isFrozen(result));
  const mutationSucceeded = Reflect.set(result, 'decision', 'releasable');
  assert.equal(mutationSucceeded, false);
  assert.equal(result.decision, 'releasable');
});

test('evaluateInstrumentCalibrationGate does not mutate its registry input', () => {
  const entry = record();
  const registry = registryOf(entry);
  const before = JSON.stringify(registry);
  evaluateInstrumentCalibrationGate(registry, entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(JSON.stringify(registry), before);
});

// ---------------------------------------------------------------------------
// Explanations
// ---------------------------------------------------------------------------

test('every reason code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainCalibrationGateReason(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /instrument-synthetic/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(explainCalibrationGateReason('maintenance-lock-active'), explainCalibrationGateReason('maintenance-lock-active'));
});

test('the reason field on a result matches explainCalibrationGateReason for its reasonCode', () => {
  const entry = record();
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.reason, explainCalibrationGateReason(result.reasonCode));
});
