export type SignOffWindow = {
  gte: Date;
  lte: Date;
};

/**
 * Window for the dashboard's sign-off metric: the previous 30 days through
 * now. Director sign-offs are recorded at the time they happen, so a
 * forward-looking window never has anything to count.
 */
export function recentSignOffWindow(now: Date): SignOffWindow {
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - 30);
  return { gte: windowStart, lte: now };
}
