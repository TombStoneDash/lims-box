import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeEmail } from '@/lib/emailValidation';

export interface PersonnelPackRecord {
  email: string;
  accred_type: string | null;
  source: 'personnel-pack-download';
}

interface SubmissionNotice {
  subject: string;
  lines: Array<[string, string | null | undefined]>;
}

export interface PersonnelPackAsset {
  key: string;
  label: string;
  publicPath: string;
  /** Filename shown to the applicant on download, stable across future asset revisions. */
  downloadFilename: string;
  sha256: string;
}

/**
 * Single source of truth for which accreditation types are fulfilled automatically.
 * Adding a type here (with its reviewed hash) is the only step required to support it —
 * resolution and download both key off this map so there is exactly one place that can
 * declare a pack "supported."
 */
export const PERSONNEL_PACK_PUBLIC_ASSETS: Record<string, PersonnelPackAsset> = {
  iso15189: {
    key: 'iso15189',
    label: 'ISO 15189 Personnel Pack v1.5',
    publicPath: '/personnel-pack-assets/iso-15189-personnel-pack-v1-5-customer-20260827.pdf',
    downloadFilename: 'lims-box-iso-15189-personnel-pack-v1-5.pdf',
    sha256: '6f58d8e865ca801575d7c6659b015fad72e6db7a786587b14b58e6deb6d8d0f0',
  },
};

export interface PersonnelPackDelivery {
  assetUrl: string;
  emailed: boolean;
  label: string;
}

export interface PersonnelPackDependencies {
  createLead: (record: PersonnelPackRecord) => Promise<void>;
  sendSubmissionNotice: (notice: SubmissionNotice) => Promise<void>;
  sendApplicantDelivery: (email: string, delivery: PersonnelPackDelivery) => Promise<void>;
  resolveAsset?: (accredType: string | null, origin: string) => Promise<PersonnelPackDelivery | null>;
  logDiagnostic?: (code: string, meta: Record<string, unknown>) => void;
  now?: () => string;
  requestId?: () => string;
}

function defaultLogDiagnostic(code: string, meta: Record<string, unknown>) {
  console.error('[personnel-pack-download]', code, JSON.stringify(meta));
}

/** Accreditation type selections are short fixed tokens (e.g. "iso15189"), never free text. */
const ACCRED_TYPE_MAX_LENGTH = 64;
const ACCRED_TYPE_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function normalizeAccredType(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > ACCRED_TYPE_MAX_LENGTH) return null;
  const normalized = trimmed.toLowerCase();
  if (!ACCRED_TYPE_PATTERN.test(normalized)) return null;
  return normalized;
}

/**
 * Fixed, privacy-safe classification for diagnostics: either a known supported asset key
 * or one of two fixed sentinels. Never echoes applicant-supplied text, so a request cannot
 * use the accreditation-type field to smuggle arbitrary content into logs.
 */
function classifyAccredTypeForDiagnostics(accredType: string | null): string {
  if (accredType === null) return 'not_provided';
  return Object.prototype.hasOwnProperty.call(PERSONNEL_PACK_PUBLIC_ASSETS, accredType)
    ? accredType
    : 'unsupported';
}

export function resolvePersonnelPackAsset(accredType: string | null): PersonnelPackAsset | null {
  if (!accredType) return null;
  if (!Object.prototype.hasOwnProperty.call(PERSONNEL_PACK_PUBLIC_ASSETS, accredType)) return null;
  return PERSONNEL_PACK_PUBLIC_ASSETS[accredType] ?? null;
}

function personnelPackAssetFile(asset: PersonnelPackAsset): string {
  return path.join(process.cwd(), 'public', asset.publicPath.replace(/^\//, ''));
}

/** Reads the reviewed bytes for a supported asset, failing closed if the file is missing or its content drifted from the reviewed hash. */
export async function readReviewedAsset(
  asset: PersonnelPackAsset,
  assetFileOverride?: string,
): Promise<Buffer> {
  const file = await readFile(assetFileOverride ?? personnelPackAssetFile(asset));
  const hash = createHash('sha256').update(file).digest('hex');
  if (hash !== asset.sha256) {
    throw new Error(`Reviewed ${asset.label} asset hash mismatch`);
  }
  return file;
}

/** Loads a supported asset's bytes for the download route. Returns null for an unsupported/unmapped key (fail closed, not a 500). */
export async function loadDownloadableAsset(
  key: string | null,
  assetFileOverride?: string,
): Promise<{ asset: PersonnelPackAsset; bytes: Buffer } | null> {
  const asset = resolvePersonnelPackAsset(key);
  if (!asset) return null;
  const bytes = await readReviewedAsset(asset, assetFileOverride);
  return { asset, bytes };
}

export async function resolveBundledAsset(
  accredType: string | null,
  origin: string,
  assetFileOverride?: string,
): Promise<PersonnelPackDelivery | null> {
  const asset = resolvePersonnelPackAsset(accredType);
  if (!asset) {
    return null;
  }

  await readReviewedAsset(asset, assetFileOverride);

  return {
    assetUrl: new URL(`/api/personnel-pack-download?asset=${asset.key}`, origin).toString(),
    emailed: false,
    label: asset.label,
  } satisfies PersonnelPackDelivery;
}

function failure(
  status: number,
  error: string,
  code: string,
) {
  return NextResponse.json({ error, code }, { status });
}

export function createPersonnelPackPostHandler(dependencies: PersonnelPackDependencies) {
  const logDiagnostic = dependencies.logDiagnostic ?? defaultLogDiagnostic;

  return async function handlePersonnelPackPost(request: NextRequest) {
    const requestId = (dependencies.requestId ?? randomUUID)();

    try {
      const body = (await request.json()) ?? {};
      const normalizedEmail = normalizeEmail((body as Record<string, unknown>).email);
      const accredType = normalizeAccredType((body as Record<string, unknown>).accredType);

      if (!normalizedEmail) {
        return failure(400, 'Valid email is required', 'invalid_email');
      }

      const resolveAsset = dependencies.resolveAsset ?? resolveBundledAsset;
      let delivery: PersonnelPackDelivery | null;
      try {
        delivery = await resolveAsset(accredType, request.nextUrl.origin);
      } catch {
        logDiagnostic('asset_unavailable', {
          requestId,
          accredType: classifyAccredTypeForDiagnostics(accredType),
          stage: 'asset-selection',
        });
        return failure(
          503,
          'Automatic fulfillment is temporarily unavailable. Email info@lims.bot directly.',
          'asset_unavailable',
        );
      }

      if (!delivery) {
        logDiagnostic('unsupported_pack_selection', {
          requestId,
          accredType: classifyAccredTypeForDiagnostics(accredType),
          stage: 'asset-selection',
        });
        return failure(
          409,
          'Automatic fulfillment is currently available only for the reviewed ISO 15189 pack.',
          'unsupported_pack_selection',
        );
      }

      try {
        await dependencies.createLead({
          email: normalizedEmail,
          accred_type: accredType,
          source: 'personnel-pack-download',
        });
      } catch {
        logDiagnostic('lead_store_failed', {
          requestId,
          accredType: classifyAccredTypeForDiagnostics(accredType),
          stage: 'lead-store',
        });
        return failure(
          503,
          'Automatic fulfillment is temporarily unavailable. Email info@lims.bot directly.',
          'lead_store_failed',
        );
      }

      try {
        await dependencies.sendSubmissionNotice({
          subject: `New Personnel Pack lead — ${delivery.label}`,
          lines: [
            ['Email', normalizedEmail],
            ['Accreditation type', accredType ?? 'not provided'],
            ['Pack delivered', delivery.label],
            ['Pack URL', delivery.assetUrl],
            ['Source', 'lims.bot/personnel-pack'],
            ['Received', (dependencies.now ?? (() => new Date().toISOString()))()],
          ],
        });
      } catch {
        logDiagnostic('operator_notice_failed', {
          requestId,
          accredType: classifyAccredTypeForDiagnostics(accredType),
          stage: 'operator-notice',
        });
        return failure(
          503,
          'Automatic fulfillment is temporarily unavailable. Email info@lims.bot directly.',
          'operator_notice_failed',
        );
      }

      try {
        await dependencies.sendApplicantDelivery(normalizedEmail, delivery);
        delivery = { ...delivery, emailed: true };
      } catch {
        logDiagnostic('applicant_delivery_failed', {
          requestId,
          accredType: classifyAccredTypeForDiagnostics(accredType),
          stage: 'applicant-delivery',
        });
      }

      return NextResponse.json({
        success: true,
        saved: true,
        delivery,
      });
    } catch {
      logDiagnostic('invalid_request', {
        requestId,
        stage: 'request-parse',
      });
      return failure(400, 'Invalid request', 'invalid_request');
    }
  };
}

/**
 * Explicit lifecycle for a single Personnel Pack fulfillment request, tracked independently
 * of the HTTP handler above. This store never sends email or calls a provider — it only
 * records which state a request is in, so callers can decide whether a duplicate request
 * should re-attempt side effects, retry, or be blocked outright.
 *
 * `pending` and `retryable-failure` both permit another attempt (retry-able, including the
 * first try); `fulfilled` and `terminal-failure` are absorbing — once reached, a duplicate
 * request is a no-op rather than a re-send or a second attempt.
 */
export type PersonnelPackFulfillmentState = 'pending' | 'fulfilled' | 'retryable-failure' | 'terminal-failure';

export interface PersonnelPackFulfillmentRecord {
  readonly state: PersonnelPackFulfillmentState;
  readonly attempts: number;
  readonly reason: string | null;
  readonly updatedAt: string;
}

export interface PersonnelPackFulfillmentAttempt {
  /** False when the key is already fulfilled, already in flight, or terminally failed. */
  readonly allowed: boolean;
  readonly record: PersonnelPackFulfillmentRecord;
}

export interface PersonnelPackFulfillmentStateStore {
  get(key: string): PersonnelPackFulfillmentRecord | undefined;
  beginAttempt(key: string): PersonnelPackFulfillmentAttempt;
  markFulfilled(key: string): PersonnelPackFulfillmentRecord;
  markRetryableFailure(key: string, reason: unknown): PersonnelPackFulfillmentRecord;
  markTerminalFailure(key: string, reason: unknown): PersonnelPackFulfillmentRecord;
}

/** Stable key for deduplicating repeated fulfillment requests for the same applicant + pack selection. */
export function buildPersonnelPackFulfillmentKey(email: string, accredType: string | null): string {
  return `${email.trim().toLowerCase()}::${accredType ?? 'unspecified'}`;
}

const FAILURE_REASON_MAX_LENGTH = 64;
const FAILURE_REASON_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * Failure reasons are reduced to a fixed, safe code, matching the diagnostic-redaction
 * contract elsewhere in this file. Raw caught-error text, stack traces, and control bytes
 * are never accepted as a reason; anything that is not already a clean fixed token becomes
 * the 'unknown' sentinel instead of being stored verbatim.
 */
function sanitizeFailureReason(reason: unknown): string {
  if (typeof reason !== 'string') return 'unknown';
  const trimmed = reason.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > FAILURE_REASON_MAX_LENGTH) return 'unknown';
  if (!FAILURE_REASON_PATTERN.test(trimmed)) return 'unknown';
  return trimmed;
}

function requirePersonnelPackFulfillmentRecord(
  records: Map<string, PersonnelPackFulfillmentRecord>,
  key: string,
): PersonnelPackFulfillmentRecord {
  const record = records.get(key);
  if (!record) {
    throw new Error('Cannot transition a Personnel Pack fulfillment key before beginAttempt() has started it');
  }
  return record;
}

/** In-memory, dependency-free state machine for idempotent Personnel Pack fulfillment attempts. */
export function createPersonnelPackFulfillmentStateStore(
  now: () => string = () => new Date().toISOString(),
): PersonnelPackFulfillmentStateStore {
  const records = new Map<string, PersonnelPackFulfillmentRecord>();

  function get(key: string) {
    return records.get(key);
  }

  function beginAttempt(key: string): PersonnelPackFulfillmentAttempt {
    const existing = records.get(key);
    if (existing && existing.state !== 'retryable-failure') {
      // Already fulfilled, already in flight, or terminally failed: a duplicate request
      // must not re-trigger fulfillment, so report the unchanged record as-is.
      return { allowed: false, record: existing };
    }
    const record: PersonnelPackFulfillmentRecord = {
      state: 'pending',
      attempts: (existing?.attempts ?? 0) + 1,
      reason: null,
      updatedAt: now(),
    };
    records.set(key, record);
    return { allowed: true, record };
  }

  function markFulfilled(key: string): PersonnelPackFulfillmentRecord {
    const existing = requirePersonnelPackFulfillmentRecord(records, key);
    if (existing.state === 'fulfilled') return existing;
    if (existing.state !== 'pending') {
      throw new Error(`Cannot mark Personnel Pack fulfillment key as fulfilled from state "${existing.state}"`);
    }
    const record: PersonnelPackFulfillmentRecord = {
      state: 'fulfilled',
      attempts: existing.attempts,
      reason: null,
      updatedAt: now(),
    };
    records.set(key, record);
    return record;
  }

  function markRetryableFailure(key: string, reason: unknown): PersonnelPackFulfillmentRecord {
    const existing = requirePersonnelPackFulfillmentRecord(records, key);
    if (existing.state !== 'pending') {
      throw new Error(`Cannot mark Personnel Pack fulfillment key as retryable-failure from state "${existing.state}"`);
    }
    const record: PersonnelPackFulfillmentRecord = {
      state: 'retryable-failure',
      attempts: existing.attempts,
      reason: sanitizeFailureReason(reason),
      updatedAt: now(),
    };
    records.set(key, record);
    return record;
  }

  function markTerminalFailure(key: string, reason: unknown): PersonnelPackFulfillmentRecord {
    const existing = requirePersonnelPackFulfillmentRecord(records, key);
    if (existing.state === 'terminal-failure') return existing;
    if (existing.state !== 'pending') {
      throw new Error(`Cannot mark Personnel Pack fulfillment key as terminal-failure from state "${existing.state}"`);
    }
    const record: PersonnelPackFulfillmentRecord = {
      state: 'terminal-failure',
      attempts: existing.attempts,
      reason: sanitizeFailureReason(reason),
      updatedAt: now(),
    };
    records.set(key, record);
    return record;
  }

  return { get, beginAttempt, markFulfilled, markRetryableFailure, markTerminalFailure };
}
