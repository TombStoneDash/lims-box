import assert from "node:assert/strict";
import test from "node:test";
import { parseTrainingHours } from "../lib/training-hours";

test("rejects non-decimal numeric syntax", () => {
  assert.throws(() => parseTrainingHours("0x10"), /hours must be a finite number/);
  assert.throws(() => parseTrainingHours("1e3"), /hours must be a finite number/);
  assert.throws(() => parseTrainingHours("0b11"), /hours must be a finite number/);
  assert.throws(() => parseTrainingHours("0o7"), /hours must be a finite number/);
  assert.throws(() => parseTrainingHours("12abc"), /hours must be a finite number/);
  assert.throws(() => parseTrainingHours("1,5"), /hours must be a finite number/);
});

test("accepts plain decimal text", () => {
  assert.equal(parseTrainingHours(""), null);
  assert.equal(parseTrainingHours("  "), null);
  assert.equal(parseTrainingHours("0"), 0);
  assert.equal(parseTrainingHours("1.5"), 1.5);
  assert.equal(parseTrainingHours(".5"), 0.5);
  assert.equal(parseTrainingHours("8"), 8);
  assert.equal(parseTrainingHours(" 2.25 "), 2.25);
});

test("normalizes negative zero to positive zero", () => {
  assert.equal(Object.is(parseTrainingHours("-0"), 0), true);
});

test("still rejects negative training hours", () => {
  assert.throws(() => parseTrainingHours("-2"), /hours must not be negative/);
});
