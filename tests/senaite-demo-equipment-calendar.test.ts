import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateEquipmentStatus, evaluateInstrumentCalibration, type InstrumentCalibrationInput } from '../lib/senaite-demo-equipment';

function instrument(nextCalibration: string, serialNumber = 'SN-1'): InstrumentCalibrationInput {
  return { serialNumber, name: `Instrument ${serialNumber}`, calibrationStatus: 'Calibrated', nextCalibration };
}

for (const nextCalibration of ['2026-02-30', '2026-02-29', '2026-04-31', '2100-02-29']) {
  test(`rejects nonexistent calendar date ${nextCalibration} in evaluations and summaries`, () => {
    const input = instrument(nextCalibration);
    const asOfDate = `${nextCalibration.slice(0, 4)}-02-01`;
    assert.deepEqual(evaluateInstrumentCalibration(input, asOfDate), {
      serialNumber: input.serialNumber,
      name: input.name,
      status: 'invalid',
      nextCalibration: null,
    });
    assert.deepEqual(evaluateEquipmentStatus([input], asOfDate), {
      status: 'invalid',
      totalInstruments: 1,
      currentCount: 0,
      overdueCount: 0,
      invalidCount: 1,
      nextCalibrationDue: null,
      nextDueInstrumentName: null,
      overdueInstruments: [],
      invalidInstruments: [input.name],
    });

    const valid = instrument(`${nextCalibration.slice(0, 4)}-05-01`, 'SN-2');
    const summary = evaluateEquipmentStatus([input, valid], asOfDate);
    assert.equal(summary.status, 'invalid');
    assert.equal(summary.invalidCount, 1);
    assert.equal(summary.currentCount, 1);
    assert.equal(summary.nextCalibrationDue, valid.nextCalibration);
    assert.equal(summary.nextDueInstrumentName, valid.name);
  });
}

for (const nextCalibration of ['2028-02-29', '2000-02-29', '2026-02-28', '2026-04-30', '2026-12-31']) {
  test(`preserves valid calendar date ${nextCalibration} and date ordering`, () => {
    const input = instrument(nextCalibration);
    for (const asOfDate of [`${nextCalibration.slice(0, 4)}-01-01`, nextCalibration, '9999-12-31']) {
      const status = asOfDate === '9999-12-31' ? 'overdue' : 'current';
      assert.deepEqual(evaluateInstrumentCalibration(input, asOfDate), {
        serialNumber: input.serialNumber,
        name: input.name,
        status,
        nextCalibration,
      });
      const summary = evaluateEquipmentStatus([input], asOfDate);
      assert.equal(summary.status, status);
      assert.equal(summary.invalidCount, 0);
      assert.equal(summary.nextCalibrationDue, status === 'current' ? nextCalibration : null);
      assert.equal(summary.nextDueInstrumentName, status === 'current' ? input.name : null);
    }
  });
}

test('invalid dates take precedence over overdue dates while valid next deadlines retain their ordering', () => {
  const summary = evaluateEquipmentStatus([
    instrument('2026-05-01', 'SN-5'),
    instrument('2026-02-30', 'SN-1'),
    instrument('2026-01-31', 'SN-2'),
    instrument('2026-04-30', 'SN-4'),
    instrument('2026-04-30', 'SN-3'),
  ], '2026-02-01');
  assert.equal(summary.status, 'invalid');
  assert.equal(summary.invalidCount, 1);
  assert.equal(summary.overdueCount, 1);
  assert.equal(summary.currentCount, 3);
  assert.equal(summary.nextCalibrationDue, '2026-04-30');
  assert.equal(summary.nextDueInstrumentName, 'Instrument SN-3');
});
