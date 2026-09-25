import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateEquipmentStatus,
  evaluateInstrumentCalibration,
  type InstrumentCalibrationInput,
} from '../lib/senaite-demo-equipment';

const instrument = (nextCalibration: string, serialNumber = 'SN-001'): InstrumentCalibrationInput => ({
  serialNumber,
  name: `Balance ${serialNumber}`,
  calibrationStatus: 'Calibrated',
  nextCalibration,
});

const overflowDates = ['2026-02-29', '2026-02-30', '2026-02-31', '2026-04-31'];

for (const nextCalibration of overflowDates) {
  test(`rejects calendar overflow ${nextCalibration} with a null nextCalibration`, () => {
    const input = instrument(nextCalibration);
    assert.deepEqual(evaluateInstrumentCalibration(input, '2026-02-01'), {
      serialNumber: input.serialNumber,
      name: input.name,
      status: 'invalid',
      nextCalibration: null,
    });
  });
}

test('preserves a valid leap day and the same-day current boundary', () => {
  const input = instrument('2028-02-29');
  for (const asOfDate of ['2028-02-28', '2028-02-29']) {
    assert.deepEqual(evaluateInstrumentCalibration(input, asOfDate), {
      serialNumber: input.serialNumber,
      name: input.name,
      status: 'current',
      nextCalibration: '2028-02-29',
    });
  }
  assert.equal(evaluateInstrumentCalibration(input, '2028-03-01').status, 'overdue');
});

test('summary counts overflow dates as invalid and excludes them from next due selection', () => {
  const invalidInputs = overflowDates.map((date, index) => instrument(date, `INVALID-${index}`));
  const overdue = instrument('2026-01-31', 'OVERDUE');
  const currentA = instrument('2026-05-01', 'A');
  const currentB = instrument('2026-05-01', 'B');

  for (const currentInputs of [[currentB, currentA], [currentA, currentB]]) {
    assert.deepEqual(evaluateEquipmentStatus([...invalidInputs, overdue, ...currentInputs], '2026-02-01'), {
      status: 'invalid',
      totalInstruments: 7,
      currentCount: 2,
      overdueCount: 1,
      invalidCount: 4,
      nextCalibrationDue: '2026-05-01',
      nextDueInstrumentName: currentA.name,
      overdueInstruments: [overdue.name],
      invalidInstruments: invalidInputs.map(input => input.name),
    });
  }

  const invalidOnly = evaluateEquipmentStatus(invalidInputs, '2026-02-01');
  assert.equal(invalidOnly.status, 'invalid');
  assert.equal(invalidOnly.invalidCount, 4);
  assert.equal(invalidOnly.currentCount, 0);
  assert.equal(invalidOnly.overdueCount, 0);
  assert.equal(invalidOnly.nextCalibrationDue, null);
  assert.equal(invalidOnly.nextDueInstrumentName, null);
});
