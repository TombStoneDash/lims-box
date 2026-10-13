import assert from 'node:assert/strict';
import test from 'node:test';
import { projectUpcomingCalibrations } from '../lib/senaite-demo-calibration-schedule';
import type { InstrumentCalibrationInput } from '../lib/senaite-demo-equipment';

const asOf = new Date('2026-04-13T00:00:00Z');
const instrument = (nextCalibration: string, serialNumber = 'SN-001', name = 'Balance'): InstrumentCalibrationInput => ({
  serialNumber, name, calibrationStatus: 'Calibrated', nextCalibration,
});

test('throws a TypeError for an Invalid Date asOf', () => {
  assert.throws(() => projectUpcomingCalibrations([instrument('2026-04-14')], new Date('x'), 7), TypeError);
});

test('throws a TypeError for a string asOf', () => {
  assert.throws(
    () => projectUpcomingCalibrations([instrument('2026-04-14')], '2026-04-13T00:00:00Z' as unknown as Date, 7),
    TypeError,
  );
});

test('throws a TypeError for a NaN horizonDays', () => {
  assert.throws(() => projectUpcomingCalibrations([instrument('2026-04-14')], asOf, NaN), TypeError);
});

test('throws a TypeError for an Infinity horizonDays', () => {
  assert.throws(() => projectUpcomingCalibrations([instrument('9999-12-31')], asOf, Infinity), TypeError);
});

test('throws a TypeError for a -Infinity horizonDays', () => {
  assert.throws(() => projectUpcomingCalibrations([instrument('2026-04-14')], asOf, -Infinity), TypeError);
});

test('throws a TypeError for a non-array instruments', () => {
  assert.throws(
    () => projectUpcomingCalibrations('not-an-array' as unknown as InstrumentCalibrationInput[], asOf, 7),
    TypeError,
  );
});

test('still projects a valid instrument within the horizon', () => {
  const tomorrow = instrument('2026-04-14');
  const result = projectUpcomingCalibrations([tomorrow], asOf, 7);
  assert.equal(result.length, 1);
  assert.equal(result[0].instrument, tomorrow);
  assert.equal(result[0].dueInDays, 1);
});
