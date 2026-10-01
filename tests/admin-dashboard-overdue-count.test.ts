import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { countOverdueCurrentCompetencies } from "../lib/personnel-competency-status";

const NOW = new Date("2026-10-01T00:00:00Z");
const YESTERDAY = new Date("2026-09-30T00:00:00Z");
const NEXT_YEAR = new Date("2027-10-01T00:00:00Z");

test("expired completed row, only row of its type -> counts", () => {
  const rows = [
    {
      personId: "p1",
      type: "pipetting",
      status: "completed",
      expiresAt: YESTERDAY,
      createdAt: new Date("2025-09-01T00:00:00Z"),
    },
  ];
  assert.equal(countOverdueCurrentCompetencies(rows, NOW), 1);
});

test("old expired row of a renewed type does not count", () => {
  const rows = [
    {
      personId: "p1",
      type: "pipetting",
      status: "completed",
      expiresAt: YESTERDAY,
      createdAt: new Date("2025-09-01T00:00:00Z"),
    },
    {
      personId: "p1",
      type: "pipetting",
      status: "completed",
      expiresAt: NEXT_YEAR,
      createdAt: new Date("2026-09-01T00:00:00Z"),
    },
  ];
  assert.equal(countOverdueCurrentCompetencies(rows, NOW), 0);
});

test("two people with the same type are counted separately", () => {
  const rows = [
    {
      personId: "p1",
      type: "pipetting",
      status: "completed",
      expiresAt: YESTERDAY,
      createdAt: new Date("2025-09-01T00:00:00Z"),
    },
    {
      personId: "p2",
      type: "pipetting",
      status: "completed",
      expiresAt: YESTERDAY,
      createdAt: new Date("2025-09-01T00:00:00Z"),
    },
  ];
  assert.equal(countOverdueCurrentCompetencies(rows, NOW), 2);
});

test("stored overdue current row counts", () => {
  const rows = [
    {
      personId: "p1",
      type: "pipetting",
      status: "overdue",
      expiresAt: NEXT_YEAR,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
  ];
  assert.equal(countOverdueCurrentCompetencies(rows, NOW), 1);
});

test("app/admin/page.tsx uses countOverdueCurrentCompetencies and drops the stale status filter", () => {
  const source = readFileSync(join(__dirname, "..", "app", "admin", "page.tsx"), "utf8");
  assert.match(source, /countOverdueCurrentCompetencies/);
  assert.doesNotMatch(source, /status:\s*\{\s*not:\s*"completed"\s*\}/);
});
