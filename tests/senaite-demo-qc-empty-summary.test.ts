import assert from "node:assert/strict";
import test from "node:test";
import { evaluateQCSummary, type QCAnalyteInput } from "../lib/senaite-demo-qc";

test("empty summary is invalid with zero counts and no analyte names", () => {
  const analytes: QCAnalyteInput[] = [];

  assert.deepEqual(evaluateQCSummary(analytes), {
    status: "invalid",
    analyteCount: 0,
    totalRuns: 0,
    outOfRangeCount: 0,
    outOfRangeAnalytes: [],
    invalidAnalytes: [],
  });
  assert.deepEqual(analytes, []);
});

test("valid nonempty summary remains in-range", () => {
  assert.deepEqual(evaluateQCSummary([
    {
      name: "Synthetic A",
      mean: 10,
      sd: 1,
      runs: [{ date: "2026-01-14", result: 11 }],
    },
  ]), {
    status: "in-range",
    analyteCount: 1,
    totalRuns: 1,
    outOfRangeCount: 0,
    outOfRangeAnalytes: [],
    invalidAnalytes: [],
  });
});

test("invalid takes precedence over out-of-range in a mixed summary", () => {
  assert.deepEqual(evaluateQCSummary([
    {
      name: "Synthetic A",
      mean: 10,
      sd: 1,
      runs: [{ date: "2026-01-14", result: 14 }],
    },
    {
      name: "Synthetic B",
      mean: 10,
      sd: 1,
      runs: [],
    },
  ]), {
    status: "invalid",
    analyteCount: 2,
    totalRuns: 1,
    outOfRangeCount: 1,
    outOfRangeAnalytes: ["Synthetic A"],
    invalidAnalytes: ["Synthetic B"],
  });
});
