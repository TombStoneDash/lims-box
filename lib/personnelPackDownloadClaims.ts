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

/**
 * Builds the GET implementation outside the App Router module so that tests can
 * inject independent claim-store instances without adding an unsupported route
 * export. Claim authorization always completes before asset bytes are loaded.
 */
export function createPersonnelPackGetHandler(
  resolveClaims: DownloadClaimServiceResolver = configuredDownloadClaimService,
) {
  return async function personnelPackGet(request: NextRequest) {
    const key = request.nextUrl.searchParams.get('asset') ?? 'iso15189';
    const claimToken = request.nextUrl.searchParams.get('claim');

    if (claimToken !== null) {
      const claims = resolveClaims();
      if (!claims) {
        return NextResponse.json(
          { error: 'This download link is temporarily unavailable. Request a new one from the Personnel Pack form.', code: 'download_claim_unavailable' },
          { status: 503 },
        );
      }
      const claimResult = await claims.verifyAndConsume(claimToken, key, Date.now());
      if (claimResult.ok === false) {
        console.error('[personnel-pack-download]', 'download_claim_rejected', JSON.stringify({
          asset: key,
          stage: 'authorization',
          code: claimResult.code,
        }));
        const unavailable = claimResult.code === 'download_claim_unavailable';
        return NextResponse.json(
          {
            error: unavailable
              ? 'This download link is temporarily unavailable. Request a new one from the Personnel Pack form.'
              : 'This download link is invalid or has expired. Request a new one from the Personnel Pack form.',
            code: claimResult.code,
          },
          { status: unavailable ? 503 : 401 },
        );
      }
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
  };
}
