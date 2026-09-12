import assert from "node:assert/strict";
import test from "node:test";
import { evaluateEquipmentStatus, evaluateInstrumentCalibration, DEMO_AS_OF_DATE } from "../lib/senaite-demo-equipment";

function instrument(overrides: Partial<Parameters<typeof evaluateInstrumentCalibration>[0]> = {}) {
  return {
    serialNumber: "SN-1",
    name: "ICP-MS",
    calibrationStatus: "Calibrated",
    nextCalibration: "2026-04-20",
    ...overrides,
  };
}

test("all-current: every instrument due after the as-of date reports current", () => {
  const summary = evaluateEquipmentStatus([
    instrument({ serialNumber: "SN-1", name: "ICP-MS", nextCalibration: "2026-04-20" }),
    instrument({ serialNumber: "SN-2", name: "GC-MS", nextCalibration: "2026-05-05" }),
  ]);
  assert.equal(summary.status, "current");
  assert.equal(summary.currentCount, 2);
  assert.equal(summary.overdueCount, 0);
  assert.equal(summary.invalidCount, 0);
  assert.equal(summary.nextCalibrationDue, "2026-04-20");
  assert.equal(summary.nextDueInstrumentName, "ICP-MS");
});

test("overdue: an instrument due before the as-of date is flagged overdue", () => {
  const summary = evaluateEquipmentStatus([
    instrument({ serialNumber: "SN-1", name: "ICP-MS", nextCalibration: "2026-04-01" }),
    instrument({ serialNumber: "SN-2", name: "GC-MS", nextCalibration: "2026-05-05" }),
  ]);
  assert.equal(summary.status, "overdue");
  assert.equal(summary.overdueCount, 1);
  assert.deepEqual(summary.overdueInstruments, ["ICP-MS"]);
  assert.equal(evaluateInstrumentCalibration(instrument({ nextCalibration: DEMO_AS_OF_DATE })).status, "current");
});

test("invalid-date: a malformed or non-ISO nextCalibration fails closed to invalid", () => {
  const summary = evaluateEquipmentStatus([
    instrument({ serialNumber: "SN-1", name: "ICP-MS", nextCalibration: "04/20/2026" }),
  ]);
  assert.equal(summary.status, "invalid");
  assert.equal(summary.invalidCount, 1);
  assert.deepEqual(summary.invalidInstruments, ["ICP-MS"]);
});

test("invalid-status: an unrecognized calibrationStatus fails closed to invalid", () => {
  const summary = evaluateEquipmentStatus([
    instrument({ serialNumber: "SN-1", name: "ICP-MS", calibrationStatus: "Unknown" }),
  ]);
  assert.equal(summary.status, "invalid");
  assert.equal(summary.invalidCount, 1);
  assert.deepEqual(summary.invalidInstruments, ["ICP-MS"]);
});

test("invalid takes precedence in the overall badge even when others are current", () => {
  const summary = evaluateEquipmentStatus([
    instrument({ serialNumber: "SN-1", name: "ICP-MS", nextCalibration: "2026-04-20" }),
    instrument({ serialNumber: "SN-2", name: "GC-MS", calibrationStatus: "" }),
  ]);
  assert.equal(summary.status, "invalid");
  assert.equal(summary.currentCount, 1);
  assert.equal(summary.invalidCount, 1);
});

test("empty-list: no instruments fails closed to invalid, not current", () => {
  const summary = evaluateEquipmentStatus([]);
  assert.equal(summary.status, "invalid");
  assert.equal(summary.totalInstruments, 0);
  assert.equal(summary.nextCalibrationDue, null);
  assert.equal(summary.nextDueInstrumentName, null);
});

test("tie: two instruments sharing the earliest next-calibration date resolve deterministically by serial number", () => {
  const summary = evaluateEquipmentStatus([
    instrument({ serialNumber: "SN-9", name: "UV-Vis", nextCalibration: "2026-04-20" }),
    instrument({ serialNumber: "SN-2", name: "GC-MS", nextCalibration: "2026-04-20" }),
  ]);
  assert.equal(summary.nextCalibrationDue, "2026-04-20");
  assert.equal(summary.nextDueInstrumentName, "GC-MS");
});
