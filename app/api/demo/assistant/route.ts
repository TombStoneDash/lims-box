import { NextRequest, NextResponse } from 'next/server';
import {
  askDemoAssistant,
  DEMO_MAX_QUESTION_BYTES,
  DEMO_MAX_QUESTION_LENGTH,
  DEMO_MAX_REQUEST_BYTES,
} from '@/lib/bot/demo-engine';

export const runtime = 'nodejs';

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

async function readBoundedBody(request: NextRequest): Promise<string | null> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const bytes = Number(declaredLength);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > DEMO_MAX_REQUEST_BYTES) {
      return null;
    }
  }

  if (!request.body) return '';

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let body = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > DEMO_MAX_REQUEST_BYTES) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(value, { stream: true });
  }

  return body + decoder.decode();
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    return jsonError('Content-Type must be application/json.', 415);
  }

  const rawBody = await readBoundedBody(request);
  if (rawBody === null) {
    return jsonError(`Request body exceeds ${DEMO_MAX_REQUEST_BYTES} bytes.`, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonError('Request body must be valid JSON.', 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonError('Request body must be a JSON object.', 400);
  }

  const question = (body as Record<string, unknown>).question;

  if (typeof question !== 'string' || question.trim().length === 0) {
    return jsonError(`Send JSON: {"question":"..."} (max ${DEMO_MAX_QUESTION_LENGTH} chars)`, 400);
  }

  const normalizedQuestion = question.trim();
  if (
    Array.from(normalizedQuestion).length > DEMO_MAX_QUESTION_LENGTH ||
    new TextEncoder().encode(normalizedQuestion).byteLength > DEMO_MAX_QUESTION_BYTES
  ) {
    return jsonError(
      `Question exceeds ${DEMO_MAX_QUESTION_LENGTH} characters or ${DEMO_MAX_QUESTION_BYTES} bytes.`,
      413,
    );
  }

  return NextResponse.json(askDemoAssistant(normalizedQuestion), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET() {
  return NextResponse.json(
    { error: 'POST a JSON body: {"question":"..."}' },
    { status: 405, headers: { 'Cache-Control': 'no-store' } },
  );
}
