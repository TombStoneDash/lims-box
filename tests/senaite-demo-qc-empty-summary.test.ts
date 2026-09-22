import assert from "node:assert/strict";
import test from "node:test";
import { evaluateQCSummary, type QCAnalyteInput } from "../lib/senaite-demo-qc";

test("empty analyte collection is invalid with zero counts and empty name lists", () => {
  const analytes: QCAnalyteInput[] = [];
  const before = structuredClone(analytes);

  assert.deepEqual(evaluateQCSummary(analytes), {
    status: "invalid",
    analyteCount: 0,
    totalRuns: 0,
    outOfRangeCount: 0,
    outOfRangeAnalytes: [],
    invalidAnalytes: [],
  });
  assert.deepEqual(analytes, before);
});

const healthy: QCAnalyteInput = {
  name: "Healthy",
  mean: 10,
  sd: 1,
  runs: [{ date: "2026-01-14", result: 10 }],
};
const breached: QCAnalyteInput = {
  name: "Breached",
  mean: 10,
  sd: 1,
  runs: [{ date: "2026-01-14", result: 14 }],
};
const invalid: QCAnalyteInput = {
  name: "Invalid",
  mean: 10,
  sd: 1,
  runs: [],
};

for (const control of [
  { name: "healthy", analytes: [healthy], status: "in-range", totalRuns: 1, breached: [], invalid: [] },
  { name: "breached overrides healthy", analytes: [healthy, breached], status: "out-of-range", totalRuns: 2, breached: ["Breached"], invalid: [] },
  { name: "invalid", analytes: [invalid], status: "invalid", totalRuns: 0, breached: [], invalid: ["Invalid"] },
  { name: "invalid overrides healthy and breached", analytes: [healthy, breached, invalid], status: "invalid", totalRuns: 2, breached: ["Breached"], invalid: ["Invalid"] },
]) {
  test(`nonempty summary: ${control.name}; inputs remain unchanged`, () => {
    const analytes = structuredClone(control.analytes);
    const before = structuredClone(analytes);

    assert.deepEqual(evaluateQCSummary(analytes), {
      status: control.status,
      analyteCount: analytes.length,
      totalRuns: control.totalRuns,
      outOfRangeCount: control.breached.length,
      outOfRangeAnalytes: control.breached,
      invalidAnalytes: control.invalid,
    });
    assert.deepEqual(analytes, before);
  });
}
