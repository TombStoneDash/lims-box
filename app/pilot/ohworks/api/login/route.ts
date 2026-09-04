import { NextRequest, NextResponse } from 'next/server';
import { authenticateAccount, issueSession, SESSION_COOKIE } from '@/lib/ohworks-tenant/auth';
import { configuredPublicOrigin } from '@/lib/ohworks-tenant/public-origin';

export async function POST(request: NextRequest) {
  const origin = configuredPublicOrigin();
  if (!origin) return NextResponse.json({ ok: false }, { status: 503 });
  const form = await request.formData();
  const principal = authenticateAccount(String(form.get('username') ?? ''), String(form.get('password') ?? ''));
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
