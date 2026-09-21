import assert from 'node:assert/strict';
import test from 'node:test';
import { projectUpcomingCalibrations } from '../lib/senaite-demo-calibration-schedule';
import { evaluateInstrumentCalibration, type InstrumentCalibrationInput } from '../lib/senaite-demo-equipment';

const asOf = new Date('2026-04-13T00:00:00Z');
const instrument = (nextCalibration: string, serialNumber = 'SN-001', name = 'Balance'): InstrumentCalibrationInput => ({
  serialNumber, name, calibrationStatus: 'Calibrated', nextCalibration,
});

test('includes an instrument due tomorrow with its existing evaluation', () => {
  const tomorrow = instrument('2026-04-14');
  assert.deepEqual(projectUpcomingCalibrations([tomorrow], asOf, 7), [{
    instrument: tomorrow,
    dueInDays: 1,
    evaluation: evaluateInstrumentCalibration(tomorrow, '2026-04-13'),
  }]);
});

test('excludes instruments due after the horizon', () => {
  assert.deepEqual(projectUpcomingCalibrations([instrument('2026-04-21')], asOf, 7), []);
});

test('always includes overdue instruments first, even with a zero or negative horizon', () => {
  const overdue = instrument('2026-03-01');
  const today = instrument('2026-04-13', 'SN-002');
  const result = projectUpcomingCalibrations([today, overdue], asOf, 0);
  assert.deepEqual(result.map(row => row.instrument), [overdue, today]);
  assert.equal(result[0].evaluation.status, 'overdue');
  assert.equal(result[0].dueInDays, -43);
  assert.deepEqual(projectUpcomingCalibrations([today, overdue], asOf, -100).map(row => row.instrument), [overdue]);
});

test('returns an empty array for no instruments', () => {
  assert.deepEqual(projectUpcomingCalibrations([], asOf, 7), []);
});

test('includes both window boundaries and sorts ties by serial number then name without mutation', () => {
  const inputs = [instrument('2026-04-20', 'B'), instrument('2026-04-20', 'A', 'Zulu'),
    instrument('2026-04-13', 'C'), instrument('2026-04-20', 'A', 'Alpha')];
  const before = structuredClone(inputs);
  inputs.forEach(Object.freeze);
  Object.freeze(inputs);
  const result = projectUpcomingCalibrations(inputs, asOf, 7);
  assert.deepEqual(result.map(row => row.instrument), [inputs[2], inputs[3], inputs[1], inputs[0]]);
  assert.deepEqual(result.map(row => row.dueInDays), [0, 7, 7, 7]);
  assert.deepEqual(inputs, before);
  assert.equal(asOf.toISOString(), '2026-04-13T00:00:00.000Z');
});

test('excludes invalid instruments using the existing evaluator', () => {
  assert.deepEqual(projectUpcomingCalibrations([
    instrument('bad-date'),
    { ...instrument('2026-04-14'), calibrationStatus: 'Uncalibrated' },
  ], asOf, 7), []);
});

test('uses the exact instant for window bounds and fractional dueInDays', () => {
  const noon = new Date('2026-04-13T12:00:00Z');
  const tomorrow = instrument('2026-04-14');
  const result = projectUpcomingCalibrations([instrument('2026-04-13'), tomorrow], noon, 0.5);
  assert.equal(result.length, 1);
  assert.equal(result[0].instrument, tomorrow);
  assert.equal(result[0].dueInDays, 0.5);
});
