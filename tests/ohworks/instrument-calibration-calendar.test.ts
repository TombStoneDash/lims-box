import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateInstrumentCalibrationGate,
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

// ---------------------------------------------------------------------------
// lastCalibratedAt: calendar-invalid values must block, not roll forward
// ---------------------------------------------------------------------------

test('a lastCalibratedAt of Feb 30 is blocked as calibration-timestamp-invalid', () => {
  const entry = record({ lastCalibratedAt: '2026-02-30T00:00:00.000Z' });
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-03-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'calibration-timestamp-invalid');
});

test('a lastCalibratedAt of Apr 31 is blocked as calibration-timestamp-invalid', () => {
  const entry = record({ lastCalibratedAt: '2026-04-31T00:00:00.000Z' });
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-05-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'calibration-timestamp-invalid');
});

test('a lastCalibratedAt of 2026-02-29 (non-leap year) is blocked as calibration-timestamp-invalid', () => {
  const entry = record({ lastCalibratedAt: '2026-02-29T00:00:00.000Z' });
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-03-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'calibration-timestamp-invalid');
});

test('a lastCalibratedAt with month 13 is blocked as calibration-timestamp-invalid', () => {
  const entry = record({ lastCalibratedAt: '2026-13-01T00:00:00.000Z' });
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-03-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'calibration-timestamp-invalid');
});

// ---------------------------------------------------------------------------
// runAt: calendar-invalid values must block, not roll forward
// ---------------------------------------------------------------------------

test('a runAt of Feb 30 is blocked as run-timestamp-invalid', () => {
  const entry = record();
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-02-30T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'run-timestamp-invalid');
});

test('a runAt of Apr 31 is blocked as run-timestamp-invalid', () => {
  const entry = record();
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-04-31T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'run-timestamp-invalid');
});

test('a runAt of 2026-02-29 (non-leap year) is blocked as run-timestamp-invalid', () => {
  const entry = record();
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-02-29T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'run-timestamp-invalid');
});

test('a runAt with month 13 is blocked as run-timestamp-invalid', () => {
  const entry = record();
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2026-13-01T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'run-timestamp-invalid');
});

// ---------------------------------------------------------------------------
// Leap-year day stays valid
// ---------------------------------------------------------------------------

test('2028-02-29 (a real leap day) still passes as a valid calendar timestamp', () => {
  const entry = record({ lastCalibratedAt: '2028-02-29T00:00:00.000Z' });
  const result = evaluateInstrumentCalibrationGate(registryOf(entry), entry.instrumentId, '2028-03-01T00:00:00.000Z');
  assert.equal(result.decision, 'releasable');
  assert.equal(result.reasonCode, 'calibration-current-and-passed');
});
