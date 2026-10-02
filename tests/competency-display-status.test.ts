import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { competencyDisplayStatus } from "../lib/competency-display-status";

const NOW = new Date("2026-10-01T00:00:00Z");
const YESTERDAY = new Date("2026-09-30T00:00:00Z");
const NEXT_YEAR = new Date("2027-10-01T00:00:00Z");

test("expired completed current row displays as overdue", () => {
  const rows = [
    {
      type: "pipetting",
      status: "completed",
      expiresAt: YESTERDAY,
      createdAt: new Date("2025-09-01T00:00:00Z"),
    },
  ];
  assert.equal(competencyDisplayStatus(rows[0], rows, NOW), "overdue");
});

test("old expired row of a renewed type keeps its stored status", () => {
  const rows = [
    {
      type: "pipetting",
      status: "completed",
      expiresAt: YESTERDAY,
      createdAt: new Date("2025-09-01T00:00:00Z"),
    },
    {
      type: "pipetting",
      status: "completed",
      expiresAt: NEXT_YEAR,
      createdAt: new Date("2026-09-01T00:00:00Z"),
    },
  ];
  assert.equal(competencyDisplayStatus(rows[0], rows, NOW), "completed");
});

test("valid completed current row displays as completed", () => {
  const rows = [
    {
      type: "pipetting",
      status: "completed",
      expiresAt: NEXT_YEAR,
      createdAt: new Date("2026-09-01T00:00:00Z"),
    },
  ];
  assert.equal(competencyDisplayStatus(rows[0], rows, NOW), "completed");
});

test("stored due current row that has not expired displays as due", () => {
  const rows = [
    {
      type: "pipetting",
      status: "due",
      expiresAt: NEXT_YEAR,
      createdAt: new Date("2026-09-01T00:00:00Z"),
    },
  ];
  assert.equal(competencyDisplayStatus(rows[0], rows, NOW), "due");
});

test("app/admin/people/[id]/page.tsx calls competencyDisplayStatus for the status badge", () => {
  const source = readFileSync(
    join(__dirname, "..", "app", "admin", "people", "[id]", "page.tsx"),
    "utf8",
  );
  assert.match(source, /\bcompetencyDisplayStatus\s*\(/);
});

test("mutation check: removing the call (keeping the import) would fail the prior assertion", () => {
  const source = readFileSync(
    join(__dirname, "..", "app", "admin", "people", "[id]", "page.tsx"),
    "utf8",
  );
  const mutated = source.replace(
    /competencyDisplayStatus\s*\([^)]*\)/,
    "c.status",
  );
  assert.doesNotMatch(mutated, /\bcompetencyDisplayStatus\s*\(/);
  assert.match(mutated, /import\s*\{\s*competencyDisplayStatus\s*\}/);
});
