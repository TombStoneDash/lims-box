import { createHash } from 'crypto';
import { normalizeEmail } from './emailValidation';

export type UnsubscribeList = 'newsletter' | 'all';

export interface UnsubscribeInput {
  email: string;
  list: UnsubscribeList;
}

export interface UnsubscribeRecord {
  id: string;
  unsubscribed: boolean;
}

export interface UnsubscribeStore {
  findByEmail(email: string): Promise<UnsubscribeRecord | null>;
  markUnsubscribed(id: string, unsubscribedAt: string): Promise<void>;
}

function normalizeList(value: unknown): UnsubscribeList {
  return value === 'all' ? 'all' : 'newsletter';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read the canonical unsubscribe input from either an issued one-click URL
 * or the interactive JSON/form POST body. Query parameters take precedence so
 * RFC 8058 POSTs can keep the recipient data in the signed/issued URL.
 */
export async function readUnsubscribeInput(request: Request): Promise<UnsubscribeInput | null> {
  const url = new URL(request.url);
  let rawEmail: unknown = url.searchParams.get('email');
  let rawList: unknown = url.searchParams.get('list');

  if (request.method.toUpperCase() === 'POST' && !rawEmail) {
    const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';

    if (contentType.includes('application/json')) {
      try {
        const body: unknown = await request.json();
        if (!isRecord(body)) return null;
        rawEmail = body.email;
        rawList = body.list ?? rawList;
      } catch {
        return null;
      }
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      try {
        const form = new URLSearchParams(await request.text());
        rawEmail = form.get('email');
        rawList = form.get('list') ?? rawList;
      } catch {
        return null;
      }
    }
  }

  const email = normalizeEmail(rawEmail);
  if (!email) return null;

  return {
    email,
    list: normalizeList(rawList),
  };
}

/**
 * Persist an unsubscribe without revealing whether the address exists or was
 * already suppressed. The caller returns the same success response for every
 * successful outcome.
 */
export async function persistUnsubscribe(
  input: UnsubscribeInput,
  store: UnsubscribeStore,
  now: () => string = () => new Date().toISOString()
): Promise<{ changed: boolean }> {
  const record = await store.findByEmail(input.email);

  if (!record || record.unsubscribed) {
    return { changed: false };
  }

  await store.markUnsubscribed(record.id, now());
  return { changed: true };
}

/** Non-reversible audit identifier; never write the raw address to logs/proof. */
export function fingerprintEmail(email: string): string {
  return createHash('sha256').update(email).digest('hex').slice(0, 16);
}
