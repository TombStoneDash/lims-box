import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_AS_OF_DATE,
  evaluateEquipmentStatus,
  evaluateInstrumentCalibration,
  type InstrumentCalibrationInput,
} from '../lib/senaite-demo-equipment';

const instrument: InstrumentCalibrationInput = {
  serialNumber: 'SN-1',
  name: 'Balance',
  calibrationStatus: 'Calibrated',
  nextCalibration: '2026-04-20',
};

for (const asOfDate of ['', 'not-a-date', '04/20/2026', '2026-4-20', '2026-04-20T00:00:00Z', '2026-02-30', '2026-02-29', '2026-13-01']) {
  test(`invalid snapshot ${JSON.stringify(asOfDate)} invalidates individuals and the aggregate`, () => {
    const instruments = [
      instrument,
      { ...instrument, serialNumber: 'SN-2', name: 'GC-MS', nextCalibration: '2026-04-01' },
    ];
    for (const input of instruments) {
      assert.deepEqual(evaluateInstrumentCalibration(input, asOfDate), {
        serialNumber: input.serialNumber,
        name: input.name,
        status: 'invalid',
        nextCalibration: null,
      });
    }
    assert.deepEqual(evaluateEquipmentStatus(instruments, asOfDate), {
      status: 'invalid',
      totalInstruments: 2,
      currentCount: 0,
      overdueCount: 0,
      invalidCount: 2,
      nextCalibrationDue: null,
      nextDueInstrumentName: null,
      overdueInstruments: [],
      invalidInstruments: ['Balance', 'GC-MS'],
    });
  });
}

for (const [asOfDate, status] of [
  ['2026-04-19', 'current'],
  ['2026-04-20', 'current'],
  ['2026-04-21', 'overdue'],
] as const) {
  test(`valid snapshot ${asOfDate} reports ${status} around the deadline`, () => {
    assert.deepEqual(evaluateInstrumentCalibration(instrument, asOfDate), {
      serialNumber: instrument.serialNumber,
      name: instrument.name,
      status,
      nextCalibration: instrument.nextCalibration,
    });
    const current = status === 'current';
    assert.deepEqual(evaluateEquipmentStatus([instrument], asOfDate), {
      status,
      totalInstruments: 1,
      currentCount: current ? 1 : 0,
      overdueCount: current ? 0 : 1,
      invalidCount: 0,
      nextCalibrationDue: current ? instrument.nextCalibration : null,
      nextDueInstrumentName: current ? instrument.name : null,
      overdueInstruments: current ? [] : [instrument.name],
      invalidInstruments: [],
    });
  });
}

test('a valid leap-day snapshot is accepted and same-day calibration remains current', () => {
  const leapDayInstrument = { ...instrument, nextCalibration: '2028-02-29' };
  assert.deepEqual(evaluateInstrumentCalibration(leapDayInstrument, '2028-02-29'), {
    serialNumber: instrument.serialNumber,
    name: instrument.name,
    status: 'current',
    nextCalibration: '2028-02-29',
  });
  assert.deepEqual(evaluateEquipmentStatus([leapDayInstrument], '2028-02-29'), {
    status: 'current',
    totalInstruments: 1,
    currentCount: 1,
    overdueCount: 0,
    invalidCount: 0,
    nextCalibrationDue: '2028-02-29',
    nextDueInstrumentName: instrument.name,
    overdueInstruments: [],
    invalidInstruments: [],
  });
});

test('omitting the snapshot preserves the synthetic default and same-day behavior', () => {
  assert.equal(DEMO_AS_OF_DATE, '2026-04-13');
  const sameDayInstrument = { ...instrument, nextCalibration: DEMO_AS_OF_DATE };
  assert.equal(evaluateInstrumentCalibration(sameDayInstrument).status, 'current');
  assert.deepEqual(
    evaluateInstrumentCalibration(sameDayInstrument),
    evaluateInstrumentCalibration(sameDayInstrument, DEMO_AS_OF_DATE),
  );
  assert.deepEqual(
    evaluateEquipmentStatus([sameDayInstrument]),
    evaluateEquipmentStatus([sameDayInstrument], DEMO_AS_OF_DATE),
  );
});
