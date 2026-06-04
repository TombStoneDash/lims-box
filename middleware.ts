import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Admin / demo route protection via HTTP Basic Auth.
 *
 * Protected paths : /admin/* and /senaite-demo/*
 * Public paths    : /, /demo, /pricing, /blog/*, /api/health
 *
 * Required env vars (set in Vercel dashboard or .env.local):
 *   ADMIN_BASIC_USER  — username for Basic auth
 *   ADMIN_BASIC_PASS  — password for Basic auth
 *
 * When either env var is absent (e.g. local `next dev` without .env.local),
 * the auth check is skipped so local iteration stays frictionless.
 *
 * To re-enable the old 404 behaviour for /admin in production, replace
 * this file with the previous single-line 404 guard.
 */

const PUBLIC_EXACT: ReadonlySet<string> = new Set(['/', '/demo', '/pricing', '/api/health']);
const PUBLIC_PREFIXES: readonly string[] = ['/blog/'];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isProtectedPath(pathname: string): boolean {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/senaite-demo') ||
    pathname.startsWith('/api/admin')
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths bypass auth entirely
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Only gate protected paths; everything else passes through
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const adminUser = process.env.ADMIN_BASIC_USER;
  const adminPass = process.env.ADMIN_BASIC_PASS;

  // No creds configured → skip auth (local dev / preview without env vars)
  if (!adminUser || !adminPass) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const expected = `Basic ${Buffer.from(`${adminUser}:${adminPass}`).toString('base64')}`;

  if (authHeader !== expected) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="LIMS BOX Admin"',
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/senaite-demo/:path*', '/api/admin/:path*'],
};
