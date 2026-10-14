import 'server-only';

import { NextResponse } from 'next/server';
import { getLabProfile } from '@/lib/demo-labs';
import { askOHWorksAssistant, getRoleViews, resolveRoleView } from '@/lib/ohworks-pilot';

const SAFE_ERROR = {
  answer: 'The request could not be evaluated. Synthetic demonstration data only.',
  grounded: false,
  mode: 'expert' as const,
  citations: [],
  label: 'Synthetic demonstration data only' as const,
  disposition: 'evidence_missing' as const,
};

const supportedRoleIds = new Set(getRoleViews().map((role) => role.id));

export type DemoLabRouteContext = { params: Promise<{ labType: string }> };

export async function POST(request: Request, context: DemoLabRouteContext) {
  const { labType } = await context.params;
  if (!getLabProfile(labType)) {
    return NextResponse.json(SAFE_ERROR, { status: 404 });
  }

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
  const trimmedQuestion = typeof candidate.question === 'string' ? candidate.question.trim() : '';
  if (
    typeof candidate.question !== 'string' ||
    trimmedQuestion.length === 0 ||
    trimmedQuestion.length > 500 ||
    (candidate.mode !== 'expert' && candidate.mode !== 'discovery') ||
    typeof candidate.roleId !== 'string' ||
    !supportedRoleIds.has(candidate.roleId as ReturnType<typeof getRoleViews>[number]['id'])
  ) {
    return NextResponse.json(SAFE_ERROR, { status: 400 });
  }

  const role = resolveRoleView(candidate.roleId);
  return NextResponse.json(askOHWorksAssistant(trimmedQuestion, role.id, candidate.mode));
}
