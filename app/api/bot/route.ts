import { askFounderCareer } from '@/lib/bot/founder-corpus';
import { NextRequest, NextResponse } from 'next/server';
import { askBot, MAX_QUESTION_LENGTH } from '@/lib/bot/engine';
import {
  recordBotTelemetry,
  telemetryForBotResponse,
  telemetryForRequestOutcome,
} from '@/lib/bot/telemetry';

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

  // Memory guard: prune entries with no hits left in the window first, then,
  // if still over the cap, evict entries that are not currently over the
  // limit. Never touch the current key or an entry that is over its limit,
  // so a client that is being limited stays limited for its own window.
  if (hits.size > 10_000) {
    for (const [otherKey, timestamps] of hits) {
      if (otherKey === key) continue;
      const active = timestamps.filter((t) => now - t < WINDOW_MS);
      if (active.length === 0) {
        hits.delete(otherKey);
      } else if (active.length !== timestamps.length) {
        hits.set(otherKey, active);
      }
    }
  }
  if (hits.size > 10_000) {
    for (const [otherKey, timestamps] of hits) {
      if (hits.size <= 10_000) break;
      if (otherKey === key) continue;
      if (timestamps.length <= MAX_REQUESTS_PER_WINDOW) {
        hits.delete(otherKey);
      }
    }
  }

  return recent.length > MAX_REQUESTS_PER_WINDOW;
}

export async function POST(request: NextRequest) {
  try {
    const ip = (request.headers.get('x-forwarded-for') ?? 'unknown')
      .split(',')[0]
      .trim();
    if (isRateLimited(ip)) {
      recordBotTelemetry(telemetryForRequestOutcome('rate_limited'));
      return NextResponse.json(
        { error: 'Too many requests — please slow down.' },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    const question = body?.question;
    if (typeof question !== 'string' || question.trim().length === 0) {
      recordBotTelemetry(telemetryForRequestOutcome('invalid_request'));
      return NextResponse.json(
        { error: `Send JSON: {"question":"..."} (max ${MAX_QUESTION_LENGTH} chars)` },
        { status: 400 },
      );
    }

    // Privacy: questions are answered statelessly. Nothing is persisted and
    // neither question content nor client/network identifiers enter telemetry.
    const result = askFounderCareer(question) ?? askBot(question);
    recordBotTelemetry(telemetryForBotResponse(result));
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    recordBotTelemetry(telemetryForRequestOutcome('internal_error'));
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'POST a JSON body: {"question":"..."}' },
    { status: 405 },
  );
}
