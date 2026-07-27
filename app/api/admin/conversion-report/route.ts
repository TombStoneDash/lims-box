import { NextResponse } from 'next/server';
import { buildConversionCounts } from '@/lib/admin/conversionReport';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const sourceGroups = await prisma.prospect.groupBy({
    by: ['source'],
    _count: { _all: true },
  });

  const counts = buildConversionCounts(
    sourceGroups.map(group => ({
      source: group.source,
      applications: group._count._all,
    })),
  );

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      privacy: 'aggregate_counts_only',
      totalApplications: counts.reduce(
        (total, group) => total + group.applications,
        0,
      ),
      attribution: counts,
      botTelemetry: {
        availability: 'runtime_logs_only',
        queryableHere: false,
        note: 'Bot telemetry is privacy-safe but not persisted in an application table, so this endpoint does not invent or join bot-usage counts.',
      },
    },
    {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    },
  );
}
