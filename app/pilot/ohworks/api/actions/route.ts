import { NextRequest, NextResponse } from 'next/server';
import { getPrincipal } from '@/lib/ohworks-tenant/auth';
import type { SampleAction } from '@/lib/ohworks-tenant/model';
import { applySampleAction } from '@/lib/ohworks-tenant/store';

const ACTIONS = new Set<SampleAction>(['queue', 'request_retest', 'quarantine', 'reject', 'technical_review', 'release']);

export async function POST(request: NextRequest) {
  const principal = await getPrincipal();
  if (!principal) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const origin = request.headers.get('origin');
  const requestHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host');
  if (!origin || !requestHost || new URL(origin).host !== requestHost) return NextResponse.json({ error: 'Request origin rejected' }, { status: 403 });
  let body: { action?: string; sampleId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (!body.action || !ACTIONS.has(body.action as SampleAction) || !body.sampleId || !/^[A-Za-z0-9._-]{1,80}$/.test(body.sampleId)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
  try {
    const sample = await applySampleAction(principal, body.action as SampleAction, body.sampleId);
    return NextResponse.json({ ok: true, sampleId: sample.id, state: sample.state });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Action failed';
    const status = /not permitted/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
