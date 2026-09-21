import assert from 'node:assert/strict';
import test from 'node:test';
import { require as tsxRequire } from 'tsx/cjs/api';

const { evaluateReviewReminder } = tsxRequire('../../lib/personnel-pack-review-reminder.ts', import.meta.url);

const day = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-21T12:00:00Z');
const at = (days) => new Date(now.getTime() + days * day);
const evaluate = (overrides = {}) => evaluateReviewReminder({
  nextReviewDue: at(7),
  now,
  reminderWindowDays: 7,
  lastReminderSentAt: null,
  minReminderIntervalDays: 3,
  ...overrides,
});

test('no due date means no review is scheduled', () => {
  assert.deepEqual(evaluate({ nextReviewDue: null }), {
    shouldRemind: false, daysUntilDue: null, reason: 'no review scheduled',
  });
});

test('reminder window includes its boundary and suppresses earlier reminders', () => {
  assert.deepEqual(evaluate({ nextReviewDue: at(8) }), {
    shouldRemind: false, daysUntilDue: 8, reason: 'too early',
  });
  assert.deepEqual(evaluate(), {
    shouldRemind: true, daysUntilDue: 7, reason: 'review reminder due',
  });
  assert.equal(evaluate({ nextReviewDue: at(6) }).shouldRemind, true);
});

test('reviews due now and overdue reviews are eligible', () => {
  for (const days of [0, -1, -30]) {
    const result = evaluate({ nextReviewDue: at(days) });
    assert.equal(result.shouldRemind, true);
    assert.equal(result.daysUntilDue, days);
  }
});

test('partial days round down, including dates less than one day overdue', () => {
  assert.equal(evaluate({ nextReviewDue: at(7.5) }).daysUntilDue, 7);
  assert.equal(evaluate({ nextReviewDue: at(-0.5) }).daysUntilDue, -1);
});

test('recent reminders suppress both upcoming and overdue reviews', () => {
  for (const due of [7, -7]) {
    assert.deepEqual(evaluate({ nextReviewDue: at(due), lastReminderSentAt: at(-2) }), {
      shouldRemind: false, daysUntilDue: due, reason: 'reminded too recently',
    });
  }
});

test('minimum interval allows its exact boundary but suppresses one millisecond before', () => {
  assert.equal(evaluate({ lastReminderSentAt: new Date(at(-3).getTime() + 1) }).shouldRemind, false);
  assert.equal(evaluate({ lastReminderSentAt: at(-3) }).shouldRemind, true);
  assert.equal(evaluate({ lastReminderSentAt: at(-4) }).shouldRemind, true);
});

test('null last reminder always passes the interval condition within the window', () => {
  for (const due of [7, 0, -100]) {
    assert.equal(evaluate({ nextReviewDue: at(due), minReminderIntervalDays: 100000 }).shouldRemind, true);
  }
  assert.equal(evaluate({ nextReviewDue: at(8), minReminderIntervalDays: 100000 }).reason, 'too early');
});
