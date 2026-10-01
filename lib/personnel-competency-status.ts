export function worstCompetencyStatus(
  comps: { status: string; expiresAt: Date | null }[],
  now: Date,
): string {
  if (comps.some((c) => c.status === "overdue" || (c.expiresAt && c.expiresAt < now))) {
    return "overdue";
  }
  if (comps.some((c) => c.status === "due")) return "due";
  if (comps.length === 0) return "no records";
  return "completed";
}
