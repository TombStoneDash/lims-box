import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loadDownloadableAsset } from '@/lib/personnelPackFulfillment';

const DOWNLOAD_CLAIM_TTL_MS = 15 * 60 * 1000;

export interface DownloadClaimPayload {
  asset: string;
  exp: number;
  jti: string;
}

export type DownloadClaimFailureCode =
  | 'download_claim_malformed'
  | 'download_claim_expired'
  | 'download_claim_mismatched'
  | 'download_claim_replayed'
  | 'download_claim_unavailable';

export type DownloadClaimResult =
  | { ok: true; payload: DownloadClaimPayload }
  | { ok: false; code: DownloadClaimFailureCode };

export interface DownloadClaimStore {
  consume(payload: DownloadClaimPayload, consumedAt: Date): Promise<boolean>;
}

export interface DownloadClaimService {
  issue(asset: string, now?: number): string;
  /** Checks signature, expiry and asset binding without using the claim up. */
  verify(token: string, asset: string, now?: number): DownloadClaimResult;
  verifyAndConsume(token: string, asset: string, now?: number): Promise<DownloadClaimResult>;
}

export interface DownloadClaimSqlClient {
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

function isDownloadClaimPayload(value: unknown): value is DownloadClaimPayload {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.asset === 'string' &&
    record.asset.length > 0 &&
    typeof record.exp === 'number' &&
    Number.isSafeInteger(record.exp) &&
    typeof record.jti === 'string' &&
    record.jti.length > 0
  );
}

function parseAndVerifyClaim(token: string, asset: string, secret: string, now: number): DownloadClaimResult {
  const separatorIndex = token.indexOf('.');
  if (
    separatorIndex <= 0 ||
    separatorIndex === token.length - 1 ||
    token.indexOf('.', separatorIndex + 1) !== -1
  ) {
    return { ok: false, code: 'download_claim_malformed' };
  }

  const body = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  let providedSignature: Buffer;
  try {
    providedSignature = Buffer.from(signature, 'base64url');
  } catch {
    return { ok: false, code: 'download_claim_malformed' };
  }
  const expectedSignature = createHmac('sha256', secret).update(body).digest();
  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    return { ok: false, code: 'download_claim_malformed' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, code: 'download_claim_malformed' };
  }
  if (!isDownloadClaimPayload(parsed)) {
    return { ok: false, code: 'download_claim_malformed' };
  }
  if (parsed.exp <= now) {
    return { ok: false, code: 'download_claim_expired' };
  }
  if (parsed.asset !== asset) {
    return { ok: false, code: 'download_claim_mismatched' };
  }
  return { ok: true, payload: parsed };
}

export function createDownloadClaimService(input: {
  secret: string;
  store: DownloadClaimStore;
  createJti?: () => string;
  ttlMs?: number;
}): DownloadClaimService {
  if (!input.secret.trim()) {
    throw new Error('download claim signing is unavailable');
  }
  const createJti = input.createJti ?? randomUUID;
  const ttlMs = input.ttlMs ?? DOWNLOAD_CLAIM_TTL_MS;

  return {
    issue(asset: string, now = Date.now()): string {
      const payload: DownloadClaimPayload = { asset, exp: now + ttlMs, jti: createJti() };
      const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
      const signature = createHmac('sha256', input.secret).update(body).digest('base64url');
      return `${body}.${signature}`;
    },

    verify(token: string, asset: string, now = Date.now()): DownloadClaimResult {
      return parseAndVerifyClaim(token, asset, input.secret, now);
    },

    async verifyAndConsume(token: string, asset: string, now = Date.now()): Promise<DownloadClaimResult> {
      const verified = parseAndVerifyClaim(token, asset, input.secret, now);
      if (!verified.ok) return verified;

      try {
        const consumed = await input.store.consume(verified.payload, new Date(now));
        return consumed ? verified : { ok: false, code: 'download_claim_replayed' };
      } catch {
        return { ok: false, code: 'download_claim_unavailable' };
      }
    },
  };
}

export function createPrismaDownloadClaimStore(client: DownloadClaimSqlClient): DownloadClaimStore {
  return {
    async consume(payload, consumedAt): Promise<boolean> {
      const inserted = await client.$executeRaw`
      INSERT INTO "PersonnelPackDownloadClaim" ("jti", "asset", "expiresAt", "consumedAt")
      SELECT ${payload.jti}, ${payload.asset}, ${new Date(payload.exp)}, ${consumedAt}
      WHERE ${new Date(payload.exp)} > CURRENT_TIMESTAMP
      ON CONFLICT ("jti") DO NOTHING
    `;
      return inserted === 1;
    },
  };
}

export const prismaDownloadClaimStore = createPrismaDownloadClaimStore(prisma);

export function configuredDownloadClaimService(): DownloadClaimService | null {
  const secret = process.env.PERSONNEL_PACK_DOWNLOAD_CLAIM_SECRET;
  if (!secret?.trim()) return null;
  return createDownloadClaimService({ secret, store: prismaDownloadClaimStore });
}

type DownloadClaimServiceResolver = () => DownloadClaimService | null;

const UNAVAILABLE_MESSAGE = 'This download link is temporarily unavailable. Request a new one from the Personnel Pack form.';
const INVALID_MESSAGE = 'This download link is invalid or has expired. Request a new one from the Personnel Pack form.';
export const DOWNLOAD_CLAIM_REDEEM_PATH = '/api/personnel-pack-download/claim';

export const PERSONNEL_PACK_FORM_PATH = '/personnel-pack';

// A person who opens a link or presses the confirm button gets a readable page.
// API callers (no text/html in Accept) keep the JSON error, same status code.
function wantsHtml(request: NextRequest): boolean {
  return (request.headers.get('accept') ?? '').toLowerCase().includes('text/html');
}

function claimErrorPage(status: number, code: DownloadClaimFailureCode) {
  const unavailable = code === 'download_claim_unavailable';
  const heading = unavailable ? 'Downloads are temporarily unavailable' : 'This download link has expired or was already used';
  const detail = unavailable
    ? 'Please try again in a few minutes, or request a new link from the Personnel Pack form.'
    : 'Each emailed link works once and only for a short time. Request a new link and we will email it right away.';
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${escapeHtml(heading)} | LIMS BOX</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#0f172a;">
<h1 style="font-size:1.5rem;">${escapeHtml(heading)}</h1>
<p>${escapeHtml(detail)}</p>
<p><a href="${PERSONNEL_PACK_FORM_PATH}" style="display:inline-block;font-size:1rem;padding:.75rem 1.25rem;background:#2E8B57;color:#fff;border-radius:.5rem;text-decoration:none;">Request a new link</a></p>
<p style="font-size:.875rem;color:#64748b;">Reference: ${escapeHtml(code)}</p>
</body></html>`;
  return new NextResponse(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function claimUnavailable(request: NextRequest) {
  if (wantsHtml(request)) return claimErrorPage(503, 'download_claim_unavailable');
  return NextResponse.json({ error: UNAVAILABLE_MESSAGE, code: 'download_claim_unavailable' }, { status: 503 });
}

function claimRejected(request: NextRequest, asset: string, code: DownloadClaimFailureCode) {
  console.error('[personnel-pack-download]', 'download_claim_rejected', JSON.stringify({ asset, stage: 'authorization', code }));
  const unavailable = code === 'download_claim_unavailable';
  const status = unavailable ? 503 : 401;
  if (wantsHtml(request)) return claimErrorPage(status, code);
  return NextResponse.json(
    { error: unavailable ? UNAVAILABLE_MESSAGE : INVALID_MESSAGE, code },
    { status },
  );
}

async function assetResponse(key: string) {
  let result;
  try {
    result = await loadDownloadableAsset(key);
  } catch (error) {
    console.error('[personnel-pack-download]', 'asset_unavailable', JSON.stringify({
      asset: key,
      stage: 'download',
      error: error instanceof Error ? error.message : String(error),
    }));
    return NextResponse.json(
      { error: 'Automatic fulfillment is temporarily unavailable. Email info@lims.bot directly.', code: 'asset_unavailable' },
      { status: 503 },
    );
  }

  if (!result) {
    return NextResponse.json(
      { error: 'Automatic fulfillment is currently available only for the reviewed ISO 15189 pack.', code: 'unsupported_pack_selection' },
      { status: 404 },
    );
  }

  return new NextResponse(result.bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.asset.downloadFilename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// Link scanners and previews fetch with GET. A claim link therefore only shows
// this page; the one-time claim is used up by the button's POST.
function confirmPage(asset: string, claim: string) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Download your Personnel Pack | LIMS BOX</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#0f172a;">
<h1 style="font-size:1.5rem;">Your Personnel Pack is ready</h1>
<p>This link works once. Press the button to download the PDF.</p>
<form method="post" action="${DOWNLOAD_CLAIM_REDEEM_PATH}">
<input type="hidden" name="asset" value="${escapeHtml(asset)}">
<input type="hidden" name="claim" value="${escapeHtml(claim)}">
<button type="submit" style="font-size:1rem;padding:.75rem 1.25rem;background:#2E8B57;color:#fff;border:0;border-radius:.5rem;">Download the PDF</button>
</form>
</body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

/**
 * Builds the GET implementation outside the App Router module so that tests can
 * inject independent claim-store instances without adding an unsupported route
 * export. A claim link is verified but never consumed on GET.
 */
export function createPersonnelPackGetHandler(
  resolveClaims: DownloadClaimServiceResolver = configuredDownloadClaimService,
) {
  return async function personnelPackGet(request: NextRequest) {
    const key = request.nextUrl.searchParams.get('asset') ?? 'iso15189';
    const claimToken = request.nextUrl.searchParams.get('claim');

    if (claimToken !== null) {
      const claims = resolveClaims();
      if (!claims) return claimUnavailable(request);
      const checked = claims.verify(claimToken, key, Date.now());
      if (checked.ok === false) return claimRejected(request, key, checked.code);
      return confirmPage(key, claimToken);
    }

    return assetResponse(key);
  };
}

/** POST from the confirm page: uses the one-time claim up, then returns the PDF. */
export function createPersonnelPackClaimPostHandler(
  resolveClaims: DownloadClaimServiceResolver = configuredDownloadClaimService,
) {
  return async function personnelPackClaimPost(request: NextRequest) {
    let key = 'iso15189';
    let claimToken = '';
    try {
      const form = await request.formData();
      const asset = form.get('asset');
      const claim = form.get('claim');
      if (typeof asset === 'string' && asset) key = asset;
      if (typeof claim === 'string') claimToken = claim;
    } catch {
      return claimRejected(request, key, 'download_claim_malformed');
    }

    const claims = resolveClaims();
    if (!claims) return claimUnavailable(request);
    const claimResult = await claims.verifyAndConsume(claimToken, key, Date.now());
    if (claimResult.ok === false) return claimRejected(request, key, claimResult.code);
    return assetResponse(key);
  };
}
