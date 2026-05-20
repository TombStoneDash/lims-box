import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Hide /admin in production.
 *
 * Personnel Pack v1 is scoped local-first (SQLite via Prisma). The /admin
 * routes cannot connect to a real database in Vercel's serverless runtime,
 * so they were throwing HTTP 500 on lims.bot, limsbox.com, and thelimsbox.com.
 *
 * This middleware returns 404 for /admin/* on production deployments only,
 * keeping the routes available in `vercel dev` and local `next dev` where
 * SQLite + the .sqlite file work as intended.
 *
 * To re-enable /admin in production: either provision a Postgres/Neon
 * DATABASE_URL and switch prisma/schema.prisma's provider, or remove this
 * middleware.
 */
export function middleware(request: NextRequest) {
  const isProduction = process.env.VERCEL_ENV === 'production';
  if (isProduction && request.nextUrl.pathname.startsWith('/admin')) {
    return new NextResponse('Not Found', { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
