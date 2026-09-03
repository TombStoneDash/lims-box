import 'server-only';

import { NextResponse } from 'next/server';
import { askOHWorksAssistant, resolveRoleView } from '@/lib/ohworks-pilot';

const SAFE_ERROR = {
  answer: 'The request could not be evaluated. Synthetic demonstration data only.',
  grounded: false,
  mode: 'expert' as const,
  citations: [],
  label: 'Synthetic demonstration data only' as const,
  disposition: 'evidence_missing' as const,
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(SAFE_ERROR, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json(SAFE_ERROR, { status: 400 });
  }

  const candidate = body as Record<string, unknown>;
  if (
    typeof candidate.question !== 'string' ||
    candidate.question.length === 0 ||
    candidate.question.length > 500 ||
    (candidate.mode !== 'expert' && candidate.mode !== 'discovery') ||
    typeof candidate.roleId !== 'string'
  ) {
    return NextResponse.json(SAFE_ERROR, { status: 400 });
  }

  const role = resolveRoleView(candidate.roleId);
  return NextResponse.json(askOHWorksAssistant(candidate.question, role.id, candidate.mode));
}
