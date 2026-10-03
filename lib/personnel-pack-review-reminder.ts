const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Evaluate reminder eligibility using elapsed 24-hour days, rounded down. */
export function evaluateReviewReminder(input: {
  nextReviewDue: Date | null;
  now: Date;
  reminderWindowDays: number;
  lastReminderSentAt: Date | null;
  minReminderIntervalDays: number;
}): { shouldRemind: boolean; daysUntilDue: number | null; reason: string } {
  const { nextReviewDue, now, reminderWindowDays, lastReminderSentAt, minReminderIntervalDays } = input;

  if (nextReviewDue === null) {
    return { shouldRemind: false, daysUntilDue: null, reason: "no review scheduled" };
  }

  const daysUntilDue = Math.floor((nextReviewDue.getTime() - now.getTime()) / MS_PER_DAY);
  if (daysUntilDue > reminderWindowDays) {
    return { shouldRemind: false, daysUntilDue, reason: "too early" };
  }
  if (
    lastReminderSentAt !== null &&
    now.getTime() - lastReminderSentAt.getTime() < minReminderIntervalDays * MS_PER_DAY
  ) {
    return { shouldRemind: false, daysUntilDue, reason: "reminded too recently" };
  }

  return { shouldRemind: true, daysUntilDue, reason: "review reminder due" };
}
