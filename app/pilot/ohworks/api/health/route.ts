import { NextResponse } from 'next/server';
import { authenticationConfigured } from '@/lib/ohworks-tenant/auth';
import { configuredPublicOrigin } from '@/lib/ohworks-tenant/public-origin';
import { readTenantStore } from '@/lib/ohworks-tenant/store';

export async function GET() {
  if (!authenticationConfigured() || !configuredPublicOrigin()) return NextResponse.json({ ok: false }, { status: 503 });
  try {
    const store = await readTenantStore();
    if (!store.laboratory.available) return NextResponse.json({ ok: false, laboratory: 'senaite-unavailable' }, { status: 503 });
    return NextResponse.json({ ok: true, laboratory: 'senaite' });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
