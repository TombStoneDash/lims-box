import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAnalyteQC, evaluateQCSummary, QCAnalyteInput } from "../lib/senaite-demo-qc";

test("a null run entry fails closed to invalid instead of throwing", () => {
  const result = evaluateAnalyteQC({
    name: "Lead (Pb)",
    mean: 1,
    sd: 0.1,
    runs: [null, { date: "2026-04-01", result: 1 }] as unknown as QCAnalyteInput["runs"],
  });
  assert.equal(result.status, "invalid");
  assert.equal(result.outOfRangeCount, 0);
  assert.deepEqual(result.runs, []);
});

test("a sparse (hole-containing) runs list fails closed to invalid instead of passing validation", () => {
  const runs = [, { date: "2026-04-01", result: 1 }] as unknown as QCAnalyteInput["runs"];
  const result = evaluateAnalyteQC({
    name: "Lead (Pb)",
    mean: 1,
    sd: 0.1,
    runs,
  });
  assert.equal(result.status, "invalid");
  assert.equal(result.outOfRangeCount, 0);
  assert.deepEqual(result.runs, []);
});

test("a non-object analyte fails closed to invalid instead of throwing", () => {
  const result = evaluateAnalyteQC(null as unknown as QCAnalyteInput);
  assert.equal(result.status, "invalid");
  assert.equal(result.name, "");
  assert.equal(result.totalRuns, 0);
  assert.deepEqual(result.runs, []);
});

test("a sparse (hole-containing) analytes list fails closed to invalid instead of throwing or passing", () => {
  const validAnalyte: QCAnalyteInput = {
    name: "Arsenic (As)",
    mean: 5,
    sd: 0.2,
    runs: [{ date: "2026-01-14", result: 5.05 }],
  };
  const analytes = [, validAnalyte] as unknown as QCAnalyteInput[];
  const summary = evaluateQCSummary(analytes);
  assert.equal(summary.status, "invalid");
  assert.equal(summary.analyteCount, 2);
  assert.deepEqual(summary.invalidAnalytes, [""]);
});

test("a null analytes list entry fails closed to invalid instead of throwing", () => {
  const summary = evaluateQCSummary([null] as unknown as QCAnalyteInput[]);
  assert.equal(summary.status, "invalid");
  assert.equal(summary.analyteCount, 1);
  assert.deepEqual(summary.invalidAnalytes, [""]);
});

test("evaluateQCSummary fails closed to invalid (not throwing) when analytes is not an array", () => {
  const summary = evaluateQCSummary(null as unknown as QCAnalyteInput[]);
  assert.equal(summary.status, "invalid");
  assert.equal(summary.analyteCount, 0);
  assert.equal(summary.totalRuns, 0);
  assert.deepEqual(summary.invalidAnalytes, []);
});

test("a valid analyte alongside malformed entries is still evaluated correctly", () => {
  const validAnalyte: QCAnalyteInput = {
    name: "Lead (Pb)",
    mean: 10,
    sd: 0.4,
    runs: [
      { date: "2026-01-14", result: 10.1 },
      { date: "2026-01-15", result: 9.9 },
    ],
  };
  const result = evaluateAnalyteQC(validAnalyte);
  assert.equal(result.status, "in-range");
  assert.equal(result.outOfRangeCount, 0);
  assert.equal(result.totalRuns, 2);

  const summary = evaluateQCSummary([null, validAnalyte] as unknown as QCAnalyteInput[]);
  assert.equal(summary.status, "invalid");
  assert.equal(summary.analyteCount, 2);
  assert.equal(summary.totalRuns, 2);
  assert.deepEqual(summary.invalidAnalytes, [""]);
  assert.deepEqual(summary.outOfRangeAnalytes, []);
});
