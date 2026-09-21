import assert from "node:assert/strict";
import test from "node:test";
import { evaluateQCSummary, type QCAnalyteInput } from "../lib/senaite-demo-qc";

const passing: QCAnalyteInput = {
  name: "Synthetic A",
  mean: 10,
  sd: 1,
  runs: [{ date: "2026-01-14", result: 10 }],
};
const breached: QCAnalyteInput = {
  ...passing,
  name: "Synthetic B",
  runs: [{ date: "2026-01-14", result: 14 }],
};

test("empty analyte collection is invalid with zero counts and no analyte names", () => {
  assert.deepEqual(evaluateQCSummary([]), {
    status: "invalid",
    analyteCount: 0,
    totalRuns: 0,
    outOfRangeCount: 0,
    outOfRangeAnalytes: [],
    invalidAnalytes: [],
  });
});

test("non-empty passing collection remains in range", () => {
  assert.deepEqual(evaluateQCSummary([passing]), {
    status: "in-range",
    analyteCount: 1,
    totalRuns: 1,
    outOfRangeCount: 0,
    outOfRangeAnalytes: [],
    invalidAnalytes: [],
  });
});

test("breached collection retains out-of-range counts and names", () => {
  assert.deepEqual(evaluateQCSummary([passing, breached]), {
    status: "out-of-range",
    analyteCount: 2,
    totalRuns: 2,
    outOfRangeCount: 1,
    outOfRangeAnalytes: ["Synthetic B"],
    invalidAnalytes: [],
  });
});

test("invalid analyte takes precedence over a breach without losing breach evidence", () => {
  const invalid: QCAnalyteInput = { ...passing, name: "Synthetic C", runs: [] };
  assert.deepEqual(evaluateQCSummary([passing, breached, invalid]), {
    status: "invalid",
    analyteCount: 3,
    totalRuns: 2,
    outOfRangeCount: 1,
    outOfRangeAnalytes: ["Synthetic B"],
    invalidAnalytes: ["Synthetic C"],
  });
});
