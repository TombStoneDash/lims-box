import { NextRequest, NextResponse } from 'next/server';
import { askDemoAssistant, DEMO_MAX_QUESTION_LENGTH } from '@/lib/bot/demo-engine';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const question = body?.question;

  if (typeof question !== 'string' || question.trim().length === 0) {
    return NextResponse.json(
      { error: `Send JSON: {"question":"..."} (max ${DEMO_MAX_QUESTION_LENGTH} chars)` },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(askDemoAssistant(question), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET() {
  return NextResponse.json(
    { error: 'POST a JSON body: {"question":"..."}' },
    { status: 405, headers: { 'Cache-Control': 'no-store' } },
  );
}
