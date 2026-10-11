import assert from "node:assert/strict";
import test from "node:test";

import { resolveDemoLimit } from "../../lib/demo-route-limit";

test("numeric-prefix strings that are not plain integers or decimals default to 10", () => {
  for (const rawLimit of ["5abc", "3 apples", "1e3", "7,9", "12px"]) {
    assert.equal(resolveDemoLimit(rawLimit), 10);
  }
});

test("whitespace-padded plain integers still parse", () => {
  assert.equal(resolveDemoLimit(" 12 "), 12);
});

test("a plain decimal still truncates via parseInt", () => {
  assert.equal(resolveDemoLimit("5.9"), 5);
});

test("existing clamp behavior is unchanged", () => {
  assert.equal(resolveDemoLimit("-5"), 1);
  assert.equal(resolveDemoLimit("0"), 1);
  assert.equal(resolveDemoLimit("51"), 50);
  assert.equal(resolveDemoLimit("1000"), 50);
  assert.equal(resolveDemoLimit(null), 10);
  assert.equal(resolveDemoLimit(""), 10);
  assert.equal(resolveDemoLimit("abc"), 10);
  assert.equal(resolveDemoLimit("NaN"), 10);
  assert.equal(resolveDemoLimit("12"), 12);
});
