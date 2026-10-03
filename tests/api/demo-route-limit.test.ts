import assert from "node:assert/strict";
import test from "node:test";

import { resolveDemoLimit } from "../../lib/demo-route-limit";

test("a missing limit defaults to 10", () => {
  assert.equal(resolveDemoLimit(null), 10);
});

test("valid in-range limits pass through as numbers", () => {
  for (const limit of [1, 12, 50]) {
    assert.equal(resolveDemoLimit(String(limit)), limit);
  }
});

test("limits above 50 clamp to 50", () => {
  for (const rawLimit of ["51", "1000"]) {
    assert.equal(resolveDemoLimit(rawLimit), 50);
  }
});

test("invalid, empty, and missing limits resolve to the finite default 10", () => {
  for (const rawLimit of ["abc", "", "NaN", null]) {
    const limit = resolveDemoLimit(rawLimit);
    assert.equal(limit, 10);
    assert.ok(Number.isFinite(limit));
  }
});

test("negative and zero limits clamp to 1 instead of slicing from the end", () => {
  for (const rawLimit of ["-5", "0"]) {
    const limit = resolveDemoLimit(rawLimit);
    assert.equal(limit, 1);
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7].slice(0, limit), [1]);
  }
});

test("a decimal limit of 5.9 truncates to 5 via parseInt", () => {
  assert.equal(resolveDemoLimit("5.9"), 5);
});
