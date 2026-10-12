/**
 * Fail-closed OHWorks inbound instrument result message contract.
 *
 * Pure and dependency-free: no I/O, no clock, no SENAITE or database write,
 * no real instrument traffic. It inspects one already-decoded inbound result
 * message (whatever the wire format - HL7, ASTM, or vendor CSV - the
 * interface layer must first map it onto this shape) and reports whether the
 * required fields are present and well-formed.
 *
 * Every error is a bounded {field, code} pair. The raw field value is never
 * echoed back, so nothing a caller passed in can leak through an error.
 */

export type InstrumentResultMessage = Readonly<{
  instrumentId: string;
  specimenId: string;
  analyteCode: string;
  /** Decimal text exactly as reported, so significant figures survive. */
  value: string;
  units: string;
  /** Canonical UTC ISO 8601 instant the instrument produced the result. */
  resultedAt: string;
}>;

export type InstrumentMessageField = keyof InstrumentResultMessage;

/** Bounded, privacy-safe codes explaining why a field failed validation. */
export type InstrumentMessageErrorCode =
  | 'message-not-object'
  | 'field-missing'
  | 'field-not-string'
  | 'field-empty'
  | 'identifier-ambiguous'
  | 'value-not-numeric'
  | 'units-invalid'
  | 'timestamp-invalid';

export type InstrumentMessageError = Readonly<{
  field: InstrumentMessageField | 'message';
  code: InstrumentMessageErrorCode;
}>;

export type InstrumentMessageValidationResult =
  | { ok: true; message: InstrumentResultMessage }
  | { ok: false; errors: readonly InstrumentMessageError[] };

const IDENTIFIER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/;
// Plain decimal only: no exponent, hex, radix prefix, Infinity, or NaN.
const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
// Printable units text such as "mg/dL", "10^3/uL", "%", "mmol/L".
const UNITS_PATTERN = /^[A-Za-z0-9%/^*.()µ-]{1,32}$/;
const STRICT_ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/;
// Accepted year range, for both the reported local year and the normalized UTC
// year. Date.UTC maps years 0-99 onto 1900-1999, and toISOString writes years
// past 9999 as "+010000", so only 0100-9999 is representable without ambiguity.
const MIN_YEAR = 100;
const MAX_YEAR = 9999;

type Errors = InstrumentMessageError[];
type FieldRule = (raw: unknown, errors: Errors) => string | undefined;

/**
 * Round-trip guard for every field: the normalized output must pass the same
 * field rule again and come back unchanged. If normalization would produce
 * text its own rule rejects (or would rewrite again), the input is rejected,
 * so an accepted message always re-validates to itself.
 */
function roundTripSafe(raw: unknown, errors: Errors, failure: InstrumentMessageError, rule: FieldRule): string | undefined {
  const normalized = rule(raw, errors);
  if (normalized === undefined) return undefined;
  if (rule(normalized, []) !== normalized) {
    errors.push(failure);
    return undefined;
  }
  return normalized;
}

function requiredString(raw: unknown, field: InstrumentMessageField, errors: Errors): string | undefined {
  if (raw === undefined || raw === null) {
    errors.push({ field, code: 'field-missing' });
    return undefined;
  }
  if (typeof raw !== 'string') {
    errors.push({ field, code: 'field-not-string' });
    return undefined;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    errors.push({ field, code: 'field-empty' });
    return undefined;
  }
  return trimmed;
}

function identifier(raw: unknown, field: InstrumentMessageField, errors: Errors): string | undefined {
  const text = requiredString(raw, field, errors);
  if (text === undefined) return undefined;
  if (!IDENTIFIER_PATTERN.test(text)) {
    errors.push({ field, code: 'identifier-ambiguous' });
    return undefined;
  }
  return text;
}

/**
 * A number is accepted only when its JavaScript string form is itself plain
 * decimal text, so the returned value always re-validates. Numbers that
 * stringify with an exponent (e.g. 0.0000001 -> "1e-7") are rejected exactly
 * like the equivalent exponent string.
 */
function numericValue(raw: unknown, errors: Errors): string | undefined {
  const text = typeof raw === 'number' ? String(raw) : requiredString(raw, 'value', errors);
  if (text === undefined) return undefined;
  if (!DECIMAL_PATTERN.test(text)) {
    errors.push({ field: 'value', code: 'value-not-numeric' });
    return undefined;
  }
  return text;
}

function units(raw: unknown, errors: Errors): string | undefined {
  const text = requiredString(raw, 'units', errors);
  if (text === undefined) return undefined;
  if (!UNITS_PATTERN.test(text)) {
    errors.push({ field: 'units', code: 'units-invalid' });
    return undefined;
  }
  return text;
}

/** Strict ISO 8601 with explicit Z or numeric offset; impossible calendar dates are rejected, never rolled over. */
function timestamp(raw: unknown, errors: Errors): string | undefined {
  const text = requiredString(raw, 'resultedAt', errors);
  if (text === undefined) return undefined;
  const match = STRICT_ISO_TIMESTAMP_PATTERN.exec(text);
  if (!match) {
    errors.push({ field: 'resultedAt', code: 'timestamp-invalid' });
    return undefined;
  }
  const [, y, mo, d, h, mi, s, frac, , sign, oh, om] = match;
  const parts = [y, mo, d, h, mi, s].map(Number);
  const [year, month, day, hour, minute, second] = parts;
  const millis = frac ? Math.round(Number(frac) * 1000) : 0;
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millis));
  const calendarExact =
    local.getUTCFullYear() === year &&
    local.getUTCMonth() === month - 1 &&
    local.getUTCDate() === day &&
    local.getUTCHours() === hour &&
    local.getUTCMinutes() === minute &&
    local.getUTCSeconds() === second;
  const offsetOk = !sign || (Number(oh) <= 14 && Number(om) <= 59);
  const offsetMinutes = sign ? (sign === '-' ? -1 : 1) * (Number(oh) * 60 + Number(om)) : 0;
  const utc = new Date(local.getTime() - offsetMinutes * 60_000);
  // An offset can push the UTC instant across a year bound (e.g. 9999-12-31 at
  // -14:00 is year 10000 in UTC), so the normalized year is range-checked too.
  const yearsOk = inYearRange(year) && inYearRange(utc.getUTCFullYear());
  if (!calendarExact || !offsetOk || !yearsOk) {
    errors.push({ field: 'resultedAt', code: 'timestamp-invalid' });
    return undefined;
  }
  return utc.toISOString();
}

function inYearRange(year: number): boolean {
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

/**
 * Validates one inbound instrument result message. Returns the normalized
 * message, or every field error found (not just the first).
 */
export function validateInstrumentMessage(input: unknown): InstrumentMessageValidationResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: [{ field: 'message', code: 'message-not-object' }] };
  }
  const raw = input as Record<string, unknown>;
  const errors: Errors = [];
  const id = (field: 'instrumentId' | 'specimenId' | 'analyteCode') =>
    roundTripSafe(raw[field], errors, { field, code: 'identifier-ambiguous' }, (r, e) => identifier(r, field, e));
  const instrumentId = id('instrumentId');
  const specimenId = id('specimenId');
  const analyteCode = id('analyteCode');
  const value = roundTripSafe(raw.value, errors, { field: 'value', code: 'value-not-numeric' }, numericValue);
  const unitText = roundTripSafe(raw.units, errors, { field: 'units', code: 'units-invalid' }, units);
  const resultedAt = roundTripSafe(raw.resultedAt, errors, { field: 'resultedAt', code: 'timestamp-invalid' }, timestamp);

  if (
    errors.length > 0 ||
    instrumentId === undefined ||
    specimenId === undefined ||
    analyteCode === undefined ||
    value === undefined ||
    unitText === undefined ||
    resultedAt === undefined
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    message: Object.freeze({ instrumentId, specimenId, analyteCode, value, units: unitText, resultedAt }),
  };
}
