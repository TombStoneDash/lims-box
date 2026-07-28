import { normalizeEmail } from '@/lib/emailValidation';

export const EARLY_ACCESS_LAB_TYPES = [
  'Environmental / Water Testing',
  'Clinical / Medical',
  'Cannabis Testing',
  'Food & Beverage',
  'Forensic',
  'Pharmaceutical / QC',
  'Research / Academic',
  'Other',
] as const;

export const EARLY_ACCESS_VOLUME_OPTIONS = [
  { value: 'under-100', label: 'Under 100 samples/month' },
  { value: '100-500', label: '100–500 samples/month' },
  { value: '500-1000', label: '500–1,000 samples/month' },
  { value: '1000-5000', label: '1,000–5,000 samples/month' },
  { value: 'over-5000', label: 'Over 5,000 samples/month' },
] as const;

export const EARLY_ACCESS_LIMITS = {
  labName: 120,
  contactName: 120,
  email: 254,
  painPoint: 1_000,
} as const;

type EarlyAccessTrack = 'clinical' | 'environmental';

export interface EarlyAccessRecord {
  track: EarlyAccessTrack;
  name: string;
  email: string;
  labName: string;
  labSize: string;
  accreditations: string;
  painPoint: string;
  source: string;
  fieldBenchSplit: null;
}

export type EarlyAccessValidationResult =
  | { ok: true; record: EarlyAccessRecord; labType: string }
  | { ok: false; error: string };

function requiredBoundedString(
  value: unknown,
  field: string,
  maxLength: number,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string') {
    return { ok: false, error: `${field} must be a string` };
  }

  const normalized = value.trim();
  if (!normalized) {
    return { ok: false, error: `${field} is required` };
  }
  if (normalized.length > maxLength) {
    return { ok: false, error: `${field} must be ${maxLength} characters or fewer` };
  }

  return { ok: true, value: normalized };
}

export function validateEarlyAccessApplication(
  value: unknown,
  source: string,
): EarlyAccessValidationResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'request body must be an object' };
  }

  const body = value as Record<string, unknown>;
  const labName = requiredBoundedString(
    body.labName,
    'labName',
    EARLY_ACCESS_LIMITS.labName,
  );
  if (labName.ok === false) return { ok: false, error: labName.error };

  const contactName = requiredBoundedString(
    body.contactName,
    'contactName',
    EARLY_ACCESS_LIMITS.contactName,
  );
  if (contactName.ok === false) return { ok: false, error: contactName.error };

  const email = normalizeEmail(body.email);
  if (!email || email.length > EARLY_ACCESS_LIMITS.email) {
    return { ok: false, error: 'email must be a valid bounded email address' };
  }

  if (
    typeof body.labType !== 'string'
    || !EARLY_ACCESS_LAB_TYPES.includes(body.labType as (typeof EARLY_ACCESS_LAB_TYPES)[number])
  ) {
    return { ok: false, error: 'labType must be an allowed value' };
  }
  const labType = body.labType;

  const submittedVolume = body.monthlyVolume ?? body.testVolume;
  if (
    typeof submittedVolume !== 'string'
    || !EARLY_ACCESS_VOLUME_OPTIONS.some(({ value: allowed }) => allowed === submittedVolume)
  ) {
    return { ok: false, error: 'monthlyVolume must be an allowed value' };
  }
  if (
    body.monthlyVolume !== undefined
    && body.testVolume !== undefined
    && body.monthlyVolume !== body.testVolume
  ) {
    return { ok: false, error: 'monthlyVolume and testVolume disagree' };
  }

  const painPoint = requiredBoundedString(
    body.painPoint,
    'painPoint',
    EARLY_ACCESS_LIMITS.painPoint,
  );
  if (painPoint.ok === false) return { ok: false, error: painPoint.error };

  if (body.dataUseAccepted !== true) {
    return { ok: false, error: 'dataUseAccepted must be true' };
  }

  const isWaterLane = source.includes(';utm_campaign=water_lane');
  const track: EarlyAccessTrack =
    labType === 'Environmental / Water Testing' || isWaterLane
      ? 'environmental'
      : 'clinical';

  return {
    ok: true,
    labType,
    record: {
      track,
      name: contactName.value,
      email,
      labName: labName.value,
      labSize: submittedVolume,
      accreditations: JSON.stringify([labType]),
      painPoint: painPoint.value,
      source,
      fieldBenchSplit: null,
    },
  };
}
