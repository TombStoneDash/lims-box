import { NextResponse } from 'next/server';
import { authenticationConfigured } from '@/lib/ohworks-tenant/auth';
import { readTenantStore } from '@/lib/ohworks-tenant/store';

export async function GET() {
  if (!authenticationConfigured()) return NextResponse.json({ ok: false }, { status: 503 });
  try {
    await readTenantStore();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
