import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseTrainingHours } from "../lib/training-hours";

test("rejects negative training hours", () => {
  assert.throws(() => parseTrainingHours("-0.5"));
  assert.throws(() => parseTrainingHours("-2"));
});

test("rejects non-finite training hours", () => {
  assert.throws(() => parseTrainingHours("Infinity"));
  assert.throws(() => parseTrainingHours("NaN"));
});

test("accepts blank, zero, and positive fractional training hours", () => {
  assert.equal(parseTrainingHours(""), null);
  assert.equal(parseTrainingHours("0"), 0);
  assert.equal(parseTrainingHours("1.5"), 1.5);
});

test("server action calls parseTrainingHours, not just imports it", () => {
  const source = readFileSync(
    path.join(__dirname, "..", "app", "admin", "actions.ts"),
    "utf8"
  );
  assert.match(source, /import\s*\{\s*parseTrainingHours\s*\}\s*from\s*"@\/lib\/training-hours"/);
  assert.match(source, /parseTrainingHours\(\s*str\(formData\.get\("hours"\)\)\s*\)/);
});

test("new training form marks the hours input with min=\"0\"", () => {
  const source = readFileSync(
    path.join(__dirname, "..", "app", "admin", "trainings", "new", "page.tsx"),
    "utf8"
  );
  assert.match(source, /name="hours"[^/]*min="0"/);
});
