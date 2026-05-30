import { NextResponse } from 'next/server';

/**
 * Lightweight health probe.
 *
 * Public route (whitelisted in middleware.ts as part of PUBLIC_EXACT).
 * Returns 200 OK with a small JSON body so uptime monitors, Vercel
 * automated checks, and external probes have a clean target that does
 * NOT depend on Prisma, Neon, or any auth state.
 *
 * Intentionally stateless: no DB read, no env var dependency. If this
 * route is unreachable, something is wrong at the edge / runtime layer.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'lims-box',
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
