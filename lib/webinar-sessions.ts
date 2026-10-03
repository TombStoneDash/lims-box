function parseSessionDate(dateIso: string): Date | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!parts) return null;

  const [, year, month, day] = parts.map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;

  return date;
}

/** Keep sessions through the end of the viewer's local calendar day. */
export function isUpcoming(dateIso: string, now: Date): boolean {
  const date = parseSessionDate(dateIso);
  if (!date || Number.isNaN(now.getTime())) return false;

  const today = new Date(0);
  today.setUTCFullYear(now.getFullYear(), now.getMonth(), now.getDate());
  return date.getTime() >= today.getTime();
}

export function upcomingOnly<T extends { date: string }>(sessions: readonly T[], now: Date): T[] {
  return sessions.filter((session) => isUpcoming(session.date, now));
}

export function formatSessionDate(dateIso: string): string {
  const date = parseSessionDate(dateIso);
  if (!date) return '';

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
