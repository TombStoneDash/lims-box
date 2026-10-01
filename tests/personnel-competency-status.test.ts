import { test } from "node:test";
import assert from "node:assert/strict";
import { worstCompetencyStatus } from "../lib/personnel-competency-status";

const now = new Date("2026-10-01T00:00:00Z");
const yesterday = new Date("2026-09-30T00:00:00Z");
const tomorrow = new Date("2026-10-02T00:00:00Z");

test("completed but expired yesterday is overdue", () => {
  const comps = [{ status: "completed", expiresAt: yesterday }];
  assert.equal(worstCompetencyStatus(comps, now), "overdue");
});

test("completed and expiring tomorrow is completed", () => {
  const comps = [{ status: "completed", expiresAt: tomorrow }];
  assert.equal(worstCompetencyStatus(comps, now), "completed");
});

test("status due is due", () => {
  const comps = [{ status: "due", expiresAt: null }];
  assert.equal(worstCompetencyStatus(comps, now), "due");
});

test("empty list is no records", () => {
  assert.equal(worstCompetencyStatus([], now), "no records");
});

test("stored overdue is overdue", () => {
  const comps = [{ status: "overdue", expiresAt: null }];
  assert.equal(worstCompetencyStatus(comps, now), "overdue");
});
