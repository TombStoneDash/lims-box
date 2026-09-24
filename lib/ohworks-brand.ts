/** Pure validation of an already-parsed brand.yml; no YAML or filesystem access. */
export type OHWorksBrand = Readonly<{
  labName: string;
  legalName: string;
  primaryColor: string;
  accentColor: string;
  logoPath: string;
  reportFooter: string;
  supportEmail: string;
}>;

/** Limits count UTF-16 code units after trimming. All fields are required. */
export const OHWORKS_BRAND_LIMITS = Object.freeze({
  labName: 120,
  legalName: 200,
  primaryColor: 7,
  accentColor: 7,
  logoPath: 240,
  reportFooter: 500,
  supportEmail: 254,
});

export type OHWorksBrandIssue = Readonly<{
  field: string;
  code: 'object' | 'unknown-field' | 'string' | 'empty' | 'length' | 'unsafe-text'
    | 'color' | 'contrast' | 'path' | 'email';
}>;

/** Returned, never thrown for ordinary invalid configuration. Values are not echoed. */
export class OHWorksBrandError extends Error {
  readonly issues: readonly OHWorksBrandIssue[];

  constructor(issues: readonly OHWorksBrandIssue[]) {
    super('Invalid OHWorks brand configuration');
    this.name = 'OHWorksBrandError';
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
  }
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const UNSAFE_TEXT = /[<>]|\p{Cc}|\p{Cf}/u;

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

/** WCAG sRGB contrast ratio; throws RangeError only for malformed color arguments. */
export function contrastRatio(first: string, second: string): number {
  if (!HEX_COLOR.test(first) || !HEX_COLOR.test(second)) {
    throw new RangeError('Contrast requires two #RRGGBB colors');
  }
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Accepts plain objects (including null-prototype dictionaries), with exactly
 * the seven own data fields. Rejects accessors without invoking them.
 * Text is trimmed, but controls are rejected before trimming. Colors stay exact.
 * Logo paths use slash-separated ASCII filename segments, with no '..', URLs,
 * encoding, backslashes, query strings or absolute paths; extensions are lowercase.
 * Email uses a conservative ASCII mailbox@domain.tld syntax, without DNS lookup.
 */
export function parseOHWorksBrand(input: unknown): OHWorksBrand | OHWorksBrandError {
  if (typeof input !== 'object' || input === null ||
      (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)) {
    return new OHWorksBrandError([{ field: '$', code: 'object' }]);
  }
  const issues: OHWorksBrandIssue[] = [];
  const brand = {} as Record<keyof OHWorksBrand, string>;
  const fields = Object.keys(OHWORKS_BRAND_LIMITS) as (keyof OHWorksBrand)[];
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !fields.includes(key as keyof OHWorksBrand)) {
      issues.push({ field: typeof key === 'string' ? key : '$symbol', code: 'unknown-field' });
    }
  }
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    const raw: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    if (typeof raw !== 'string') {
      issues.push({ field, code: 'string' });
      continue;
    }
    const value = field === 'primaryColor' || field === 'accentColor' ? raw : raw.trim();
    brand[field] = value;
    if (!value) issues.push({ field, code: 'empty' });
    if (value.length > OHWORKS_BRAND_LIMITS[field]) issues.push({ field, code: 'length' });
    if (UNSAFE_TEXT.test(raw)) issues.push({ field, code: 'unsafe-text' });
    if (field === 'primaryColor' || field === 'accentColor') {
      if (!HEX_COLOR.test(value)) issues.push({ field, code: 'color' });
      else if (field === 'primaryColor' && contrastRatio(value, '#FFFFFF') < 4.5) {
        issues.push({ field, code: 'contrast' });
      }
    }
    if (field === 'logoPath' && (value.includes('..') ||
        !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*(?:\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*)*\.(svg|png)$/.test(value))) {
      issues.push({ field, code: 'path' });
    }
    if (field === 'supportEmail') {
      const parts = value.split('@');
      const local = parts[0];
      const domain = parts[1];
      if (parts.length !== 2 || !local || local.length > 64 || local.startsWith('.') ||
          local.endsWith('.') || local.includes('..') || !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) ||
          !domain || domain.length > 253 || !domain.includes('.') ||
          domain.split('.').some((label) => !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label))) {
        issues.push({ field, code: 'email' });
      }
    }
  }
  return issues.length ? new OHWorksBrandError(issues) : Object.freeze(brand);
}

export const DEFAULT_SYNTHETIC_BRAND: OHWorksBrand = Object.freeze({
  labName: 'SYNTHETIC-Laboratory',
  legalName: 'SYNTHETIC-Laboratory Example',
  primaryColor: '#123456',
  accentColor: '#55AACC',
  logoPath: 'SYNTHETIC-assets/SYNTHETIC-logo.svg',
  reportFooter: 'SYNTHETIC-Report for demonstration only',
  supportEmail: 'SYNTHETIC-support@SYNTHETIC-example.invalid',
});
