import { NextRequest, NextResponse } from 'next/server';
import { askBot, MAX_QUESTION_LENGTH } from '@/lib/bot/engine';

export const runtime = 'nodejs';

// Best-effort in-memory rate limit (per serverless instance).
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) hits.clear(); // memory guard
  return recent.length > MAX_REQUESTS_PER_WINDOW;
}

export async function POST(request: NextRequest) {
  try {
    const ip = (request.headers.get('x-forwarded-for') ?? 'unknown')
      .split(',')[0]
      .trim();
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many requests — please slow down.' },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    const question = body?.question;
    if (typeof question !== 'string' || question.trim().length === 0) {
      return NextResponse.json(
        { error: `Send JSON: {"question":"..."} (max ${MAX_QUESTION_LENGTH} chars)` },
        { status: 400 },
      );
    }

    // Privacy: questions are answered statelessly. Nothing is persisted and
    // question content is never logged.
    const result = askBot(question);
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'POST a JSON body: {"question":"..."}' },
    { status: 405 },
  );
}
