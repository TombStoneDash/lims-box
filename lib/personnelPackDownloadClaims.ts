import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';

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

export const prismaDownloadClaimStore: DownloadClaimStore = {
  async consume(payload, consumedAt): Promise<boolean> {
    const inserted = await prisma.$executeRaw`
      INSERT INTO "PersonnelPackDownloadClaim" ("jti", "asset", "expiresAt", "consumedAt")
      SELECT ${payload.jti}, ${payload.asset}, ${new Date(payload.exp)}, ${consumedAt}
      WHERE ${new Date(payload.exp)} > CURRENT_TIMESTAMP
      ON CONFLICT ("jti") DO NOTHING
    `;
    return inserted === 1;
  },
};

export function configuredDownloadClaimService(): DownloadClaimService | null {
  const secret = process.env.PERSONNEL_PACK_DOWNLOAD_CLAIM_SECRET;
  if (!secret?.trim()) return null;
  return createDownloadClaimService({ secret, store: prismaDownloadClaimStore });
}
