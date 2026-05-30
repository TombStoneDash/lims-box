import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * HTTP Basic-auth gate for /admin/* (Personnel Pack v1).
 *
 * Replaces the prior "404 in production" middleware now that PP15 admin
 * routes need to be reachable on Vercel. Marketing pages stay public; only
 * /admin/* (UI) and the admin-only API surfaces below require credentials.
 *
 * Closed-by-default: if ADMIN_USERNAME or ADMIN_PASSWORD are unset on Vercel,
 * every gated route returns 401. Local dev (`next dev`, no VERCEL env) skips
 * auth so SQLite + the Personnel Pack scaffold continue to work as before.
 *
 * Required Vercel env vars (Production + Preview):
 *   ADMIN_USERNAME
 *   ADMIN_PASSWORD
 */

// PP15 admin-only API surfaces. Public marketing endpoints
// (/api/demo, /api/waitlist, /api/contact, /api/prospects, /api/early-access)
// are intentionally NOT in this list.
const ADMIN_API_PREFIXES = [
  '/api/procedures',
  '/api/people',
  '/api/competencies',
  '/api/documents',
  '/api/authorizations',
  '/api/reviews',
];

function isAdminPath(pathname: string): boolean {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return true;
  return ADMIN_API_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

const WWW_AUTH = 'Basic realm="LIMS BOX Admin", charset="UTF-8"';

function unauthorized(message: string) {
  return new NextResponse(message, {
    status: 401,
    headers: {
      'WWW-Authenticate': WWW_AUTH,
      'Cache-Control': 'no-store',
    },
  });
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isAdminPath(pathname)) {
    return NextResponse.next();
  }

  // Local dev bypass: no VERCEL env => `next dev` / direct node => no gate.
  if (!process.env.VERCEL) {
    return NextResponse.next();
  }

  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPass = process.env.ADMIN_PASSWORD;
  if (!expectedUser || !expectedPass) {
    return unauthorized('Admin auth not configured');
  }

  const header = request.headers.get('authorization') || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) {
    return unauthorized('Authentication required');
  }

  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return unauthorized('Invalid credentials');
  }

  const sepIdx = decoded.indexOf(':');
  if (sepIdx < 0) {
    return unauthorized('Invalid credentials');
  }
  const user = decoded.slice(0, sepIdx);
  const pass = decoded.slice(sepIdx + 1);

  if (
    !timingSafeEqual(user, expectedUser) ||
    !timingSafeEqual(pass, expectedPass)
  ) {
    return unauthorized('Invalid credentials');
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/procedures/:path*',
    '/api/people/:path*',
    '/api/competencies/:path*',
    '/api/documents/:path*',
    '/api/authorizations/:path*',
    '/api/reviews/:path*',
  ],
};
