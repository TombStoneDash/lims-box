import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeEmail } from '@/lib/emailValidation';

const REVIEWED_ISO_15189_SHA256 = '6f58d8e865ca801575d7c6659b015fad72e6db7a786587b14b58e6deb6d8d0f0';
const ISO_15189_PUBLIC_PATH =
  '/personnel-pack-assets/iso-15189-personnel-pack-v1-5-customer-20260827.pdf';
const ISO_15189_PUBLIC_FILE = path.join(
  process.cwd(),
  'public',
  ISO_15189_PUBLIC_PATH.replace(/^\//, ''),
);

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
  key: 'iso15189';
  label: string;
  publicPath: string;
}

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

function normalizeAccredType(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export async function resolveBundledAsset(
  accredType: string | null,
  origin: string,
  assetFile = ISO_15189_PUBLIC_FILE,
) {
  if (accredType !== 'iso15189') {
    return null;
  }

  const file = await readFile(assetFile);
  const hash = createHash('sha256').update(file).digest('hex');
  if (hash !== REVIEWED_ISO_15189_SHA256) {
    throw new Error('Reviewed ISO 15189 personnel-pack asset hash mismatch');
  }

  return {
    assetUrl: new URL(ISO_15189_PUBLIC_PATH, origin).toString(),
    emailed: false,
    label: 'ISO 15189 Personnel Pack v1.5',
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
      } catch (error) {
        logDiagnostic('asset_unavailable', {
          requestId,
          accredType,
          stage: 'asset-selection',
          error: error instanceof Error ? error.message : String(error),
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
          accredType,
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
      } catch (error) {
        logDiagnostic('lead_store_failed', {
          requestId,
          accredType,
          stage: 'lead-store',
          error: error instanceof Error ? error.message : String(error),
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
      } catch (error) {
        logDiagnostic('operator_notice_failed', {
          requestId,
          accredType,
          stage: 'operator-notice',
          error: error instanceof Error ? error.message : String(error),
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
      } catch (error) {
        logDiagnostic('applicant_delivery_failed', {
          requestId,
          accredType,
          stage: 'applicant-delivery',
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return NextResponse.json({
        success: true,
        saved: true,
        delivery,
      });
    } catch (error) {
      logDiagnostic('invalid_request', {
        requestId,
        stage: 'request-parse',
        error: error instanceof Error ? error.message : String(error),
      });
      return failure(400, 'Invalid request', 'invalid_request');
    }
  };
}

export const PERSONNEL_PACK_PUBLIC_ASSETS = {
  iso15189: {
    key: 'iso15189',
    label: 'ISO 15189 Personnel Pack v1.5',
    publicPath: ISO_15189_PUBLIC_PATH,
  } satisfies PersonnelPackAsset,
} as const;
