import { test } from "node:test";
import assert from "node:assert/strict";
import { worstCompetencyStatus } from "../lib/personnel-competency-status";

const NOW = new Date("2026-10-01T00:00:00Z");
const YESTERDAY = new Date("2026-09-30T00:00:00Z");
const NEXT_YEAR = new Date("2027-10-01T00:00:00Z");

test("completed but expired yesterday, only row of its type -> overdue", () => {
  const comps = [
    { type: "pipetting", status: "completed", expiresAt: YESTERDAY, createdAt: new Date("2025-09-01T00:00:00Z") },
  ];
  assert.equal(worstCompetencyStatus(comps, NOW), "overdue");
});

test("expired completed row plus a newer completed row expiring next year -> completed", () => {
  const comps = [
    { type: "pipetting", status: "completed", expiresAt: YESTERDAY, createdAt: new Date("2025-09-01T00:00:00Z") },
    { type: "pipetting", status: "completed", expiresAt: NEXT_YEAR, createdAt: new Date("2026-09-01T00:00:00Z") },
  ];
  assert.equal(worstCompetencyStatus(comps, NOW), "completed");
});

test("newer row of same type is expired -> overdue even if older row is valid", () => {
  const comps = [
    { type: "pipetting", status: "completed", expiresAt: NEXT_YEAR, createdAt: new Date("2025-09-01T00:00:00Z") },
    { type: "pipetting", status: "completed", expiresAt: YESTERDAY, createdAt: new Date("2026-09-01T00:00:00Z") },
  ];
  assert.equal(worstCompetencyStatus(comps, NOW), "overdue");
});

test("status due -> due", () => {
  const comps = [
    { type: "pipetting", status: "due", expiresAt: null, createdAt: new Date("2026-01-01T00:00:00Z") },
  ];
  assert.equal(worstCompetencyStatus(comps, NOW), "due");
});

test("empty -> no records", () => {
  assert.equal(worstCompetencyStatus([], NOW), "no records");
});

test("stored overdue -> overdue", () => {
  const comps = [
    { type: "pipetting", status: "overdue", expiresAt: NEXT_YEAR, createdAt: new Date("2026-01-01T00:00:00Z") },
  ];
  assert.equal(worstCompetencyStatus(comps, NOW), "overdue");
});

test("two types where only one is expired -> overdue", () => {
  const comps = [
    { type: "pipetting", status: "completed", expiresAt: NEXT_YEAR, createdAt: new Date("2026-01-01T00:00:00Z") },
    { type: "biosafety", status: "completed", expiresAt: YESTERDAY, createdAt: new Date("2025-01-01T00:00:00Z") },
  ];
  assert.equal(worstCompetencyStatus(comps, NOW), "overdue");
});
