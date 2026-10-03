import {
  currentCompetencies,
  isCompetencyOverdue,
  type CompetencyRecord,
} from "./personnel-competency-status";

export function competencyDisplayStatus<T extends CompetencyRecord>(
  row: T,
  rows: T[],
  now: Date,
): string {
  const isCurrent = currentCompetencies(rows).includes(row);
  if (isCurrent && isCompetencyOverdue(row, now)) return "overdue";
  return row.status;
}
