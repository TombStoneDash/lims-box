import { NextRequest, NextResponse } from 'next/server';
import { authenticateAccount, issueSession, SESSION_COOKIE } from '@/lib/ohworks-tenant/auth';

function externalOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const requestHost = request.headers.get('host')?.trim();
  const host = forwardedHost || requestHost;
  if (!host || !/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)) return request.nextUrl.origin;
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const protocol = forwardedProtocol === 'https' ? 'https' : 'http';
  return `${protocol}://${host}`;
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const principal = authenticateAccount(String(form.get('username') ?? ''), String(form.get('password') ?? ''));
  const origin = externalOrigin(request);
  if (!principal) return NextResponse.redirect(new URL('/pilot/ohworks/login?error=1', origin), 303);
  const response = NextResponse.redirect(new URL('/pilot/ohworks', origin), 303);
  response.cookies.set(SESSION_COOKIE, issueSession(principal), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 8 * 60 * 60,
  });
  return response;
}
