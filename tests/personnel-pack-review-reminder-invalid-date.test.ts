import assert from "node:assert/strict";
import test from "node:test";
import { evaluateReviewReminder } from "../lib/personnel-pack-review-reminder";

const day = 24 * 60 * 60 * 1000;
const now = new Date("2026-09-21T12:00:00Z");
const at = (days: number) => new Date(now.getTime() + days * day);
const evaluate = (overrides: Partial<Parameters<typeof evaluateReviewReminder>[0]> = {}) =>
  evaluateReviewReminder({
    nextReviewDue: at(7),
    now,
    reminderWindowDays: 7,
    lastReminderSentAt: null,
    minReminderIntervalDays: 3,
    ...overrides,
  });

test("an invalid nextReviewDue is reported as an invalid review date, not a due reminder", () => {
  assert.deepEqual(evaluate({ nextReviewDue: new Date("not-a-date") }), {
    shouldRemind: false,
    daysUntilDue: null,
    reason: "invalid review date",
  });
});

test("an invalid now is reported as an invalid review date, not a due reminder", () => {
  assert.deepEqual(evaluate({ now: new Date(NaN) }), {
    shouldRemind: false,
    daysUntilDue: null,
    reason: "invalid review date",
  });
});

test("a valid due-soon review still produces a reminder", () => {
  assert.deepEqual(evaluate(), {
    shouldRemind: true,
    daysUntilDue: 7,
    reason: "review reminder due",
  });
});
