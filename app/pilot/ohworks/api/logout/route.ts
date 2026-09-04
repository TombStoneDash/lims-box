import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/ohworks-tenant/auth';
import { configuredPublicOrigin } from '@/lib/ohworks-tenant/public-origin';

export async function POST() {
  const origin = configuredPublicOrigin();
  if (!origin) return NextResponse.json({ ok: false }, { status: 503 });
  const response = NextResponse.redirect(new URL('/pilot/ohworks/login', origin), 303);
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 });
  return response;
}
