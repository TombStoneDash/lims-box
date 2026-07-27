import { NextResponse } from 'next/server';
import { buildConversionCounts } from '@/lib/admin/conversionReport';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const sourceGroups = await prisma.prospect.groupBy({
      by: ['source'],
      _count: { _all: true },
    });

    const prospectRows = sourceGroups.map(group => ({
      source: group.source,
      applications: group._count._all,
    }));
    const counts = buildConversionCounts(prospectRows);

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        report: 'prospect_source_distribution',
        population: {
          model: 'Prospect',
          scope: 'all_records',
          note: 'Includes every Prospect record, including intake and waitlist records; this is not a conversion denominator.',
        },
        privacy: {
          classification: 'aggregate_counts_only',
          dimensions: 'server_allowlisted',
          minimumReportableCellSize: 3,
          smallCells: 'omitted',
        },
        totalProspectRecords: prospectRows.reduce(
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
  } catch {
    return NextResponse.json(
      { error: 'Report temporarily unavailable' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    );
  }
}
