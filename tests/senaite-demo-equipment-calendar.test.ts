import assert from "node:assert/strict";
import test from "node:test";
import { evaluateEquipmentStatus, evaluateInstrumentCalibration } from "../lib/senaite-demo-equipment";

function instrument(nextCalibration: string) {
  return {
    serialNumber: "SYNTHETIC-1",
    name: "Synthetic instrument",
    calibrationStatus: "Calibrated",
    nextCalibration,
  };
}

for (const date of ["2026-02-30", "2026-04-31", "2026-02-29", "2100-02-29"]) {
  test(`impossible calendar date ${date} preserves the invalid result shape`, () => {
    assert.deepEqual(evaluateInstrumentCalibration(instrument(date), "2026-02-01"), {
      serialNumber: "SYNTHETIC-1",
      name: "Synthetic instrument",
      status: "invalid",
      nextCalibration: null,
    });
  });

  test(`equipment summary excludes impossible date ${date} from next due`, () => {
    const invalid = instrument(date);
    const valid = { ...instrument("2101-01-01"), serialNumber: "SYNTHETIC-2", name: "Valid instrument" };
    const summary = evaluateEquipmentStatus([invalid, valid], "2026-02-01");
    assert.equal(summary.status, "invalid");
    assert.equal(summary.invalidCount, 1);
    assert.equal(summary.currentCount, 1);
    assert.equal(summary.overdueCount, 0);
    assert.deepEqual(summary.invalidInstruments, [invalid.name]);
    assert.equal(summary.nextCalibrationDue, valid.nextCalibration);
    assert.equal(summary.nextDueInstrumentName, valid.name);

    const invalidOnly = evaluateEquipmentStatus([invalid], "2026-02-01");
    assert.equal(invalidOnly.status, "invalid");
    assert.equal(invalidOnly.nextCalibrationDue, null);
    assert.equal(invalidOnly.nextDueInstrumentName, null);
  });
}

for (const date of ["2028-02-29", "2000-02-29", "2026-02-28", "2026-04-30", "2026-12-31"]) {
  test(`real calendar date ${date} remains current when due today`, () => {
    assert.deepEqual(evaluateInstrumentCalibration(instrument(date), date), {
      serialNumber: "SYNTHETIC-1",
      name: "Synthetic instrument",
      status: "current",
      nextCalibration: date,
    });
  });
}

test("normal dates retain overdue and future behavior", () => {
  assert.equal(evaluateInstrumentCalibration(instrument("2026-02-01"), "2026-02-02").status, "overdue");
  assert.equal(evaluateInstrumentCalibration(instrument("2026-02-03"), "2026-02-02").status, "current");
});
