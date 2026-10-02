import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { countDueSoonCurrentCompetencies } from "../lib/personnel-competency-status";

const NOW = new Date("2026-10-01T00:00:00Z");
const IN_10_DAYS = new Date("2026-10-11T00:00:00Z");
const IN_31_DAYS = new Date("2026-11-01T00:00:00Z");
const NEXT_YEAR = new Date("2027-10-01T00:00:00Z");
const IN_30_DAYS = new Date("2026-10-31T00:00:00Z");

test("current due row expiring in 10 days counts", () => {
  const rows = [
    {
      personId: "p1",
      type: "pipetting",
      status: "due",
      expiresAt: IN_10_DAYS,
      createdAt: new Date("2026-09-01T00:00:00Z"),
    },
  ];
  assert.equal(countDueSoonCurrentCompetencies(rows, NOW, IN_30_DAYS), 1);
});

test("old due row of a renewed type does not count", () => {
  const rows = [
    {
      personId: "p1",
      type: "pipetting",
      status: "due",
      expiresAt: IN_10_DAYS,
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
  assert.equal(countDueSoonCurrentCompetencies(rows, NOW, IN_30_DAYS), 0);
});

test("current completed row expiring in 10 days does not count", () => {
  const rows = [
    {
      personId: "p1",
      type: "pipetting",
      status: "completed",
      expiresAt: IN_10_DAYS,
      createdAt: new Date("2026-09-01T00:00:00Z"),
    },
  ];
  assert.equal(countDueSoonCurrentCompetencies(rows, NOW, IN_30_DAYS), 0);
});

test("row expiring in 31 days does not count", () => {
  const rows = [
    {
      personId: "p1",
      type: "pipetting",
      status: "due",
      expiresAt: IN_31_DAYS,
      createdAt: new Date("2026-09-01T00:00:00Z"),
    },
  ];
  assert.equal(countDueSoonCurrentCompetencies(rows, NOW, IN_30_DAYS), 0);
});

test("two people with the same type are counted separately", () => {
  const rows = [
    {
      personId: "p1",
      type: "pipetting",
      status: "due",
      expiresAt: IN_10_DAYS,
      createdAt: new Date("2026-09-01T00:00:00Z"),
    },
    {
      personId: "p2",
      type: "pipetting",
      status: "overdue",
      expiresAt: IN_10_DAYS,
      createdAt: new Date("2026-09-01T00:00:00Z"),
    },
  ];
  assert.equal(countDueSoonCurrentCompetencies(rows, NOW, IN_30_DAYS), 2);
});

test("app/admin/page.tsx uses countDueSoonCurrentCompetencies", () => {
  const source = readFileSync(join(__dirname, "..", "app", "admin", "page.tsx"), "utf8");
  assert.match(source, /countDueSoonCurrentCompetencies/);
});
