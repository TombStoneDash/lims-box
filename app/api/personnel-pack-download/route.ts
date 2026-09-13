import { NextRequest, NextResponse } from 'next/server';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  createPersonnelPackPostHandler,
  loadDownloadableAsset,
  resolveBundledAsset,
  type PersonnelPackDelivery,
} from '@/lib/personnelPackFulfillment';
import { sendSubmissionNotice } from '@/lib/notify';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * The bare `?asset=<key>` URL stays intentionally public (see
 * docs/personnel-pack-fulfillment-security.md) — a `claim` query param is an
 * additive, optional freshness/anti-replay check for links this route itself
 * mints via POST. Its absence never blocks a request; once present it must
 * be well-formed, unexpired, unused, and bound to the requested asset, or the
 * request fails closed. Set PERSONNEL_PACK_DOWNLOAD_CLAIM_SECRET for a stable
 * signing key across process restarts/instances; otherwise a per-process key
 * is generated (fine for a single-instance deployment).
 */
const DOWNLOAD_CLAIM_SECRET = process.env.PERSONNEL_PACK_DOWNLOAD_CLAIM_SECRET ?? randomBytes(32).toString('hex');
const DOWNLOAD_CLAIM_TTL_MS = 15 * 60 * 1000;

interface DownloadClaimPayload {
  asset: string;
  exp: number;
  jti: string;
}

function isDownloadClaimPayload(value: unknown): value is DownloadClaimPayload {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.asset === 'string' &&
    typeof record.exp === 'number' &&
    Number.isFinite(record.exp) &&
    typeof record.jti === 'string' &&
    record.jti.length > 0
  );
}

function signDownloadClaim(payload: DownloadClaimPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', DOWNLOAD_CLAIM_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

type DownloadClaimFailureCode =
  | 'download_claim_malformed'
  | 'download_claim_expired'
  | 'download_claim_mismatched'
  | 'download_claim_replayed';

type DownloadClaimResult =
  | { ok: true; payload: DownloadClaimPayload }
  | { ok: false; code: DownloadClaimFailureCode };

/** Claims already redeemed, so a captured/replayed link cannot be reused. Pruned lazily on each check. */
const redeemedDownloadClaims = new Map<string, number>();

function pruneRedeemedDownloadClaims(now: number): void {
  for (const [jti, expiresAt] of redeemedDownloadClaims) {
    if (expiresAt <= now) redeemedDownloadClaims.delete(jti);
  }
}

function verifyDownloadClaim(token: string, asset: string, now: number): DownloadClaimResult {
  const separatorIndex = token.indexOf('.');
  if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
    return { ok: false, code: 'download_claim_malformed' };
  }

  const body = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  const expectedSignature = createHmac('sha256', DOWNLOAD_CLAIM_SECRET).update(body).digest('base64url');
  const providedSignatureBytes = Buffer.from(signature, 'utf8');
  const expectedSignatureBytes = Buffer.from(expectedSignature, 'utf8');
  if (
    providedSignatureBytes.length !== expectedSignatureBytes.length ||
    !timingSafeEqual(providedSignatureBytes, expectedSignatureBytes)
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

  pruneRedeemedDownloadClaims(now);
  if (redeemedDownloadClaims.has(parsed.jti)) {
    return { ok: false, code: 'download_claim_replayed' };
  }

  return { ok: true, payload: parsed };
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('asset') ?? 'iso15189';
  const claimToken = request.nextUrl.searchParams.get('claim');

  if (claimToken !== null) {
    const claimResult = verifyDownloadClaim(claimToken, key, Date.now());
    if (claimResult.ok === false) {
      console.error('[personnel-pack-download]', 'download_claim_rejected', JSON.stringify({
        asset: key,
        stage: 'authorization',
        code: claimResult.code,
      }));
      return NextResponse.json(
        {
          error: 'This download link is invalid or has expired. Request a new one from the Personnel Pack form.',
          code: claimResult.code,
        },
        { status: 401 },
      );
    }
    redeemedDownloadClaims.set(claimResult.payload.jti, claimResult.payload.exp);
  }

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

async function createLead(record: { email: string; accred_type: string | null; source: 'personnel-pack-download' }) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  const { error } = await supabase.from('personnel_pack_leads').insert(record);
  if (error) {
    throw new Error(error.message);
  }
}

async function sendPersonnelPackDelivery(
  email: string,
  delivery: PersonnelPackDelivery,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Applicant delivery is not configured');
  }

  const html = `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#0f172a;">
  <p style="font-size:15px;">Thanks for requesting the LIMS BOX Personnel Pack.</p>
  <p style="font-size:14px;color:#334155;line-height:1.6;">
    Your reviewed download is ready now:
  </p>
  <p style="margin:20px 0;">
    <a href="${delivery.assetUrl}"
       style="display:inline-block;background:#2E8B57;color:#fff;font-weight:600;
              padding:10px 22px;border-radius:6px;text-decoration:none;font-size:14px;">
      Download ${delivery.label} ->
    </a>
  </p>
  <p style="font-size:13px;color:#64748b;line-height:1.6;">
    This is a documentation aid. Your laboratory remains responsible for qualifications,
    competence decisions, and licensed-standard review.
  </p>
  <p style="font-size:13px;color:#64748b;">
    Questions? Reach us at <a href="mailto:info@lims.bot" style="color:#2E8B57;">info@lims.bot</a>.
  </p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 16px;">
  <p style="font-size:11px;color:#94a3b8;">
    You're receiving this because you requested the Personnel Pack at
    <a href="https://lims.bot/personnel-pack" style="color:#94a3b8;">lims.bot</a>.
    <a href="https://lims.bot/unsubscribe" style="color:#94a3b8;">Unsubscribe</a>.
  </p>
</div>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'LIMS BOX <info@lims.bot>',
      to: [email],
      subject: `Your ${delivery.label}`,
      html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Applicant delivery failed (${response.status})`);
  }
}

/** Mints a fresh, single-use download claim for each newly issued delivery link. */
async function resolveAssetWithDownloadClaim(
  accredType: string | null,
  origin: string,
): Promise<PersonnelPackDelivery | null> {
  const delivery = await resolveBundledAsset(accredType, origin);
  if (!delivery) return null;

  const url = new URL(delivery.assetUrl);
  const asset = url.searchParams.get('asset');
  if (!asset) return delivery;

  const claim = signDownloadClaim({
    asset,
    exp: Date.now() + DOWNLOAD_CLAIM_TTL_MS,
    jti: randomUUID(),
  });
  url.searchParams.set('claim', claim);

  return { ...delivery, assetUrl: url.toString() };
}

export const POST = createPersonnelPackPostHandler({
  createLead,
  sendSubmissionNotice,
  sendApplicantDelivery: sendPersonnelPackDelivery,
  resolveAsset: resolveAssetWithDownloadClaim,
});
