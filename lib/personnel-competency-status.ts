export type CompetencyRecord = {
  type: string;
  status: string;
  expiresAt: Date | null;
  createdAt: Date;
};

export function currentCompetencies<T extends CompetencyRecord>(comps: T[]): T[] {
  const latestByType = new Map<string, T>();
  for (const c of comps) {
    const current = latestByType.get(c.type);
    if (
      !current ||
      c.createdAt > current.createdAt ||
      (c.createdAt.getTime() === current.createdAt.getTime() &&
        (c.expiresAt?.getTime() ?? -Infinity) > (current.expiresAt?.getTime() ?? -Infinity))
    ) {
      latestByType.set(c.type, c);
    }
  }
  return Array.from(latestByType.values());
}

export function isCompetencyOverdue(c: CompetencyRecord, now: Date): boolean {
  return c.status === "overdue" || (c.expiresAt !== null && c.expiresAt < now);
}

export function worstCompetencyStatus(comps: CompetencyRecord[], now: Date): string {
  const current = currentCompetencies(comps);
  if (current.some((c) => isCompetencyOverdue(c, now))) return "overdue";
  if (current.some((c) => c.status === "due")) return "due";
  if (current.length === 0) return "no records";
  return "completed";
}
