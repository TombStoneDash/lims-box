import assert from "node:assert/strict";
import test from "node:test";
import { evaluateQCSummary } from "../lib/senaite-demo-qc";

test("empty analyte collection reports invalid with zero counters and empty name arrays", () => {
  assert.deepEqual(evaluateQCSummary([]), {
    status: "invalid",
    analyteCount: 0,
    totalRuns: 0,
    outOfRangeCount: 0,
    outOfRangeAnalytes: [],
    invalidAnalytes: [],
  });
});

test("valid nonempty collection still reports in-range", () => {
  const summary = evaluateQCSummary([
    {
      name: "Lead (Pb)",
      mean: 10,
      sd: 1,
      runs: [{ date: "2026-01-14", result: 11 }],
    },
  ]);
  assert.deepEqual(summary, {
    status: "in-range",
    analyteCount: 1,
    totalRuns: 1,
    outOfRangeCount: 0,
    outOfRangeAnalytes: [],
    invalidAnalytes: [],
  });
});

test("invalid status retains precedence over out-of-range in a mixed collection", () => {
  const summary = evaluateQCSummary([
    {
      name: "Lead (Pb)",
      mean: 10,
      sd: 1,
      runs: [{ date: "2026-01-14", result: 13 }],
    },
    {
      name: "Arsenic (As)",
      mean: 5,
      sd: 0.2,
      runs: [],
    },
  ]);
  assert.deepEqual(summary, {
    status: "invalid",
    analyteCount: 2,
    totalRuns: 1,
    outOfRangeCount: 1,
    outOfRangeAnalytes: ["Lead (Pb)"],
    invalidAnalytes: ["Arsenic (As)"],
  });
});
