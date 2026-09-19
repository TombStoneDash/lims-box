import type { PrismaClient } from '@prisma/client';

export const CONVERSION_STAGES = ['waitlist', 'early_adopter', 'prospect'] as const;
type Stage = (typeof CONVERSION_STAGES)[number];
type Counts = Record<Stage, number>;

const emptyCounts = (): Counts => ({ waitlist: 0, early_adopter: 0, prospect: 0 });

/**
 * Counts persisted submissions, not unique people or inferred sales. Main has
 * no lifecycle-stage field: exact known source markers define disjoint buckets;
 * all other sources are prospects. Weeks start Monday at 00:00 UTC.
 * Aggregate in PostgreSQL so even this server never retrieves contact records.
 */
export async function getConversionReport(db: Pick<PrismaClient, '$queryRaw'>) {
  const rows = await db.$queryRaw<Array<{ stage: unknown; week: unknown; count: unknown }>>`
    SELECT CASE
      WHEN "source" = 'lims.bot' THEN 'waitlist'
      WHEN "source" = 'lims.bot/early-adopter'
        OR "source" LIKE 'lims.bot/early-adopter;%' THEN 'early_adopter'
      ELSE 'prospect'
    END AS stage,
    to_char(date_trunc('week', "createdAt"), 'YYYY-MM-DD') AS week,
    COUNT(*) AS count
    FROM "Prospect"
    GROUP BY 1, 2
    ORDER BY 2, 1
  `;

  const byStage = emptyCounts();
  const weeks = new Map<string, Counts>();
  for (const row of rows) {
    // Allowlist every output value as well as every key. Never spread DB rows,
    // including on errors: even malformed grouping values may contain PII.
    if (!CONVERSION_STAGES.includes(row.stage as Stage)
      || typeof row.week !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(row.week)) {
      throw new Error('Invalid conversion aggregate');
    }
    const date = new Date(`${row.week}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== row.week
      || date.getUTCDay() !== 1) throw new Error('Invalid conversion aggregate');
    const count = typeof row.count === 'bigint' ? Number(row.count) : row.count;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
      throw new Error('Invalid conversion aggregate');
    }
    const stage = row.stage as Stage;
    const counts = weeks.get(row.week) ?? emptyCounts();
    counts[stage] += count;
    byStage[stage] += count;
    if (!Number.isSafeInteger(byStage[stage])) throw new Error('Invalid conversion aggregate');
    weeks.set(row.week, counts);
  }
  return {
    byStage,
    byWeek: [...weeks].sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, counts]) => ({ weekStart, counts })),
  };
}
