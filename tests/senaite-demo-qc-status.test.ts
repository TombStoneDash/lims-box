import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAnalyteQC, evaluateQCSummary } from "../lib/senaite-demo-qc.ts";

test("in-range analyte reports in-range with no flagged runs", () => {
  const result = evaluateAnalyteQC({
    name: "Lead (Pb)",
    mean: 10,
    sd: 0.4,
    runs: [
      { date: "2026-01-14", result: 10.1 },
      { date: "2026-01-15", result: 9.9 },
      { date: "2026-01-16", result: 10.5 },
    ],
  });
  assert.equal(result.status, "in-range");
  assert.equal(result.outOfRangeCount, 0);
  assert.equal(result.totalRuns, 3);
});

test("a result exactly at 3 SD is flagged out of range (boundary is inclusive)", () => {
  // mean 10, sd 0.4, result 11.2 is decimally exact at 3 SD, but
  // (11.2 - 10) / 0.4 === 2.9999999999999996 in IEEE 754 float math —
  // the evaluator must still classify this as out of range.
  const result = evaluateAnalyteQC({
    name: "Lead (Pb)",
    mean: 10,
    sd: 0.4,
    runs: [{ date: "2026-01-14", result: 11.2 }],
  });
  assert.equal(result.status, "out-of-range");
  assert.equal(result.outOfRangeCount, 1);
  assert.equal(result.runs[0].outOfRange, true);
});

test("a result beyond 3 SD is out of range", () => {
  const result = evaluateAnalyteQC({
    name: "Arsenic (As)",
    mean: 5,
    sd: 0.2,
    runs: [
      { date: "2026-01-14", result: 5.05 },
      { date: "2026-01-15", result: 5 + 4 * 0.2 },
    ],
  });
  assert.equal(result.status, "out-of-range");
  assert.equal(result.outOfRangeCount, 1);
});

test("invalid (non-positive) SD fails closed to invalid, not in-range", () => {
  const result = evaluateAnalyteQC({
    name: "Nitrate (NO3)",
    mean: 5,
    sd: 0,
    runs: [{ date: "2026-01-14", result: 5 }],
  });
  assert.equal(result.status, "invalid");
  assert.equal(result.outOfRangeCount, 0);
  assert.deepEqual(result.runs, []);
});

test("empty runs fail closed to invalid, not in-range", () => {
  const result = evaluateAnalyteQC({
    name: "Lead (Pb)",
    mean: 10,
    sd: 0.4,
    runs: [],
  });
  assert.equal(result.status, "invalid");
  assert.equal(result.totalRuns, 0);
});

test("summary escalates to out-of-range when any analyte breaches", () => {
  const summary = evaluateQCSummary([
    {
      name: "A",
      mean: 10,
      sd: 1,
      runs: [{ date: "2026-01-14", result: 10 }],
    },
    {
      name: "B",
      mean: 10,
      sd: 1,
      runs: [{ date: "2026-01-14", result: 14 }],
    },
  ]);
  assert.equal(summary.status, "out-of-range");
  assert.deepEqual(summary.outOfRangeAnalytes, ["B"]);
  assert.equal(summary.outOfRangeCount, 1);
  assert.equal(summary.totalRuns, 2);
});

test("summary fails closed to invalid when any analyte has invalid inputs, even if none breach", () => {
  const summary = evaluateQCSummary([
    {
      name: "A",
      mean: 10,
      sd: 1,
      runs: [{ date: "2026-01-14", result: 10 }],
    },
    {
      name: "B",
      mean: 10,
      sd: Number.NaN,
      runs: [{ date: "2026-01-14", result: 10 }],
    },
  ]);
  assert.equal(summary.status, "invalid");
  assert.deepEqual(summary.invalidAnalytes, ["B"]);
});
