import { NextRequest, NextResponse } from 'next/server';
import { authenticateAccount, issueSession, SESSION_COOKIE } from '@/lib/ohworks-tenant/auth';

function externalOrigin(request: NextRequest): string {
  const configured = process.env.OHWORKS_PUBLIC_ORIGIN?.trim();
  if (!configured) return request.nextUrl.origin;
  try {
    const parsed = new URL(configured);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return request.nextUrl.origin;
    return parsed.origin;
  } catch {
    return request.nextUrl.origin;
  }
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
