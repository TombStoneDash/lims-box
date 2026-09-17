/**
 * Fail-closed, source-only OHWorks accession field validator.
 *
 * This module performs no I/O, no SENAITE write, no network call, and holds
 * no credential. It only inspects a single fabricated accession request
 * object already held in memory and reports whether its required specimen,
 * order, collection, and patient-reference fields are present, well-formed,
 * and chronologically possible. Identifier fields get safe whitespace
 * normalization (trim + internal-run collapse); date fields get parsed and
 * re-emitted in canonical UTC form. Every reported error is a bounded
 * {field, code} pair - the raw field value is never echoed back, so no
 * PHI can leak through a validation error even if the caller's input
 * contained it.
 */

export type AccessionSpecimenFields = {
  specimenId: string;
  specimenType: string;
};

export type AccessionOrderFields = {
  orderId: string;
  /** ISO 8601 timestamp the order was placed. */
  orderedAt: string;
};

export type AccessionCollectionFields = {
  /** ISO 8601 timestamp the specimen was collected. */
  collectedAt: string;
  /** ISO 8601 timestamp the specimen was received by the lab. */
  receivedAt: string;
};

export type AccessionPatientReferenceFields = {
  /** A bounded, de-identified reference code. Never a name, DOB, or SSN. */
  referenceId: string;
};

export type AccessionValidationRequest = {
  accessionRequestId: string;
  tenantId: string;
  specimen: AccessionSpecimenFields;
  order: AccessionOrderFields;
  collection: AccessionCollectionFields;
  patientReference: AccessionPatientReferenceFields;
};

export type AccessionFieldPath =
  | 'accessionRequestId'
  | 'tenantId'
  | 'specimen.specimenId'
  | 'specimen.specimenType'
  | 'order.orderId'
  | 'order.orderedAt'
  | 'collection.collectedAt'
  | 'collection.receivedAt'
  | 'patientReference.referenceId';

/** Bounded, privacy-safe codes explaining why a field failed validation. */
export type AccessionFieldErrorCode =
  | 'field-missing'
  | 'field-not-string'
  | 'field-empty'
  | 'identifier-ambiguous'
  | 'identifier-suspected-phi'
  | 'date-invalid'
  | 'date-chronology-impossible';

/** Never carries the offending raw value - only a field path and a bounded code. */
export type AccessionFieldError = Readonly<{
  field: AccessionFieldPath;
  code: AccessionFieldErrorCode;
}>;

export type NormalizedAccessionValidationRequest = Readonly<{
  accessionRequestId: string;
  tenantId: string;
  specimen: Readonly<AccessionSpecimenFields>;
  order: Readonly<AccessionOrderFields>;
  collection: Readonly<AccessionCollectionFields>;
  patientReference: Readonly<AccessionPatientReferenceFields>;
}>;

export type AccessionValidationResult =
  | { valid: true; errors: readonly []; normalized: NormalizedAccessionValidationRequest }
  | { valid: false; errors: readonly AccessionFieldError[] };

export type AccessionValidationInputErrorCode = 'request-not-object';

const INPUT_ERROR_MESSAGES: Record<AccessionValidationInputErrorCode, string> = {
  'request-not-object': 'The accession validation request is not a valid request object.',
};

/** Thrown only for structurally unusable input where no field path can even be attributed. */
export class AccessionValidationInputError extends Error {
  readonly code: AccessionValidationInputErrorCode;

  constructor(code: AccessionValidationInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'AccessionValidationInputError';
    this.code = code;
  }
}

/**
 * A single token: alphanumeric boundaries with only ".", "_", "-" allowed
 * inside, 1-128 characters. No whitespace, delimiters (",", "/", ";", "|"),
 * or wildcard characters - anything else is treated as an ambiguous
 * identifier rather than guessed at.
 */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/;

/**
 * Shapes that can appear inside the identifier charset above but still
 * suggest real patient identity data (an SSN, a phone number, or a
 * name/DOB-style keyword) was pasted into a reference field.
 */
const SUSPECTED_PHI_PATTERNS: readonly RegExp[] = [
  /^\d{3}-\d{2}-\d{4}$/,
  /^\d{3}[.-]\d{3}[.-]\d{4}$/,
  /(?:^|[._-])(?:ssn|dob|patientname|firstname|lastname|homeaddress)(?:$|[._-])/i,
];

function looksLikeSuspectedPHI(value: string): boolean {
  return SUSPECTED_PHI_PATTERNS.some((pattern) => pattern.test(value));
}

function readSection(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function checkRequiredString(
  raw: unknown,
  field: AccessionFieldPath,
  errors: AccessionFieldError[],
): string | undefined {
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

function checkIdentifier(
  raw: unknown,
  field: AccessionFieldPath,
  errors: AccessionFieldError[],
): string | undefined {
  const trimmed = checkRequiredString(raw, field, errors);
  if (trimmed === undefined) {
    return undefined;
  }
  const normalized = trimmed.replace(/\s+/g, ' ');
  if (!IDENTIFIER_PATTERN.test(normalized)) {
    errors.push({ field, code: 'identifier-ambiguous' });
    return undefined;
  }
  return normalized;
}

function checkPatientReferenceIdentifier(
  raw: unknown,
  field: AccessionFieldPath,
  errors: AccessionFieldError[],
): string | undefined {
  const normalized = checkIdentifier(raw, field, errors);
  if (normalized === undefined) {
    return undefined;
  }
  if (looksLikeSuspectedPHI(normalized)) {
    errors.push({ field, code: 'identifier-suspected-phi' });
    return undefined;
  }
  return normalized;
}

type CheckedDate = { iso: string; epochMs: number };

// Date.parse() accepts ambiguous/non-ISO shapes (date-only, locale-style,
// space-separated). Require explicit date+time with Z or numeric offset.
const STRICT_ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const NUMERIC_OFFSET_PATTERN = /^([+-])(\d{2}):(\d{2})$/;

const DAYS_IN_MONTH: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  return DAYS_IN_MONTH[month - 1];
}

/**
 * Date.parse()/`new Date(...)` silently roll overflowing calendar fields
 * forward (e.g. 2026-02-30 becomes 2026-03-02), which would let an
 * impossible instant slip through as a plausible-looking normalized date.
 * Every component is range-checked by hand against the calendar of the
 * stated year before any UTC conversion happens.
 */
function checkDate(
  raw: unknown,
  field: AccessionFieldPath,
  errors: AccessionFieldError[],
): CheckedDate | undefined {
  const trimmed = checkRequiredString(raw, field, errors);
  if (trimmed === undefined) {
    return undefined;
  }
  const match = STRICT_ISO_TIMESTAMP_PATTERN.exec(trimmed);
  if (!match) {
    errors.push({ field, code: 'date-invalid' });
    return undefined;
  }
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr, fractionStr, offsetStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = Number(secondStr);

  if (month < 1 || month > 12) {
    errors.push({ field, code: 'date-invalid' });
    return undefined;
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    errors.push({ field, code: 'date-invalid' });
    return undefined;
  }
  if (hour > 23 || minute > 59 || second > 59) {
    errors.push({ field, code: 'date-invalid' });
    return undefined;
  }

  let offsetMinutesTotal = 0;
  if (offsetStr !== 'Z') {
    const offsetMatch = NUMERIC_OFFSET_PATTERN.exec(offsetStr);
    if (!offsetMatch) {
      errors.push({ field, code: 'date-invalid' });
      return undefined;
    }
    const [, sign, offsetHourStr, offsetMinuteStr] = offsetMatch;
    const offsetHour = Number(offsetHourStr);
    const offsetMinute = Number(offsetMinuteStr);
    if (offsetHour > 23 || offsetMinute > 59) {
      errors.push({ field, code: 'date-invalid' });
      return undefined;
    }
    offsetMinutesTotal = (sign === '-' ? -1 : 1) * (offsetHour * 60 + offsetMinute);
  }

  // ISO timestamps may carry more precision than JavaScript Dates. Preserve
  // Date.parse's millisecond semantics by taking, rather than rounding, the
  // first three decimal digits. Rounding .9999 to 1000 would otherwise roll a
  // validated timestamp into the next second, day, month, or year.
  const fractionMs = fractionStr ? Number(fractionStr.slice(1, 4).padEnd(3, '0')) : 0;

  // setUTCFullYear/setUTCHours (rather than Date.UTC or new Date(string))
  // avoid Date.UTC's two-digit-year-means-1900s quirk and never roll over,
  // since every component above is already confirmed to be in range.
  const instant = new Date(0);
  instant.setUTCFullYear(year, month - 1, day);
  instant.setUTCHours(hour, minute, second, fractionMs);
  const epochMs = instant.getTime() - offsetMinutesTotal * 60000;

  if (!Number.isFinite(epochMs)) {
    errors.push({ field, code: 'date-invalid' });
    return undefined;
  }
  return { iso: new Date(epochMs).toISOString(), epochMs };
}

function compareFieldErrors(a: AccessionFieldError, b: AccessionFieldError): number {
  if (a.field !== b.field) {
    return a.field < b.field ? -1 : 1;
  }
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

/**
 * Validate a single fabricated OHWorks accession request.
 *
 * Fail-closed: any missing, non-string, blank, or ambiguously-formatted
 * identifier; any patient reference that looks like it carries real
 * identity data; any date that cannot be parsed; or any chronology where
 * the order was placed after collection, or collection happened after
 * receipt, is reported as a field error rather than accepted. Only a
 * request that is not an object at all throws
 * AccessionValidationInputError, since no field path can be attributed to
 * it; every other shape is walked field-by-field so every problem is
 * reported at once instead of stopping at the first one.
 */
export function validateOHWorksAccessionRequest(raw: unknown): AccessionValidationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AccessionValidationInputError('request-not-object');
  }

  const request = raw as Record<string, unknown>;
  const errors: AccessionFieldError[] = [];

  const accessionRequestId = checkIdentifier(request.accessionRequestId, 'accessionRequestId', errors);
  const tenantId = checkIdentifier(request.tenantId, 'tenantId', errors);

  const specimenSection = readSection(request.specimen);
  const specimenId = checkIdentifier(specimenSection.specimenId, 'specimen.specimenId', errors);
  const specimenType = checkIdentifier(specimenSection.specimenType, 'specimen.specimenType', errors);

  const orderSection = readSection(request.order);
  const orderId = checkIdentifier(orderSection.orderId, 'order.orderId', errors);
  const orderedAt = checkDate(orderSection.orderedAt, 'order.orderedAt', errors);

  const collectionSection = readSection(request.collection);
  const collectedAt = checkDate(collectionSection.collectedAt, 'collection.collectedAt', errors);
  const receivedAt = checkDate(collectionSection.receivedAt, 'collection.receivedAt', errors);

  const patientReferenceSection = readSection(request.patientReference);
  const referenceId = checkPatientReferenceIdentifier(
    patientReferenceSection.referenceId,
    'patientReference.referenceId',
    errors,
  );

  if (orderedAt && collectedAt && orderedAt.epochMs > collectedAt.epochMs) {
    errors.push({ field: 'collection.collectedAt', code: 'date-chronology-impossible' });
  }
  if (collectedAt && receivedAt && collectedAt.epochMs > receivedAt.epochMs) {
    errors.push({ field: 'collection.receivedAt', code: 'date-chronology-impossible' });
  }

  if (errors.length > 0) {
    return { valid: false, errors: Object.freeze([...errors].sort(compareFieldErrors)) };
  }

  return {
    valid: true,
    errors: Object.freeze([]),
    normalized: Object.freeze({
      accessionRequestId: accessionRequestId as string,
      tenantId: tenantId as string,
      specimen: Object.freeze({ specimenId: specimenId as string, specimenType: specimenType as string }),
      order: Object.freeze({ orderId: orderId as string, orderedAt: (orderedAt as CheckedDate).iso }),
      collection: Object.freeze({
        collectedAt: (collectedAt as CheckedDate).iso,
        receivedAt: (receivedAt as CheckedDate).iso,
      }),
      patientReference: Object.freeze({ referenceId: referenceId as string }),
    }),
  };
}

const FIELD_ERROR_MESSAGES: Record<AccessionFieldErrorCode, string> = {
  'field-missing': 'This field is required and was not provided.',
  'field-not-string': 'This field must be a text value.',
  'field-empty': 'This field cannot be blank.',
  'identifier-ambiguous': 'This identifier is not in a recognized, unambiguous format.',
  'identifier-suspected-phi':
    'This field appears to contain personal information and cannot be accepted as a reference identifier.',
  'date-invalid': 'This date could not be parsed.',
  'date-chronology-impossible': 'This date is not consistent with the other dates in this accession request.',
};

/** Deterministic, privacy-safe human-readable text for a field error, suitable for UI display. */
export function explainAccessionFieldError(error: AccessionFieldError): string {
  return FIELD_ERROR_MESSAGES[error.code];
}

/** The concrete corrective step a submitter can take to fix a rejected field, keyed by error code. */
const FIELD_ERROR_NEXT_ACTIONS: Record<AccessionFieldErrorCode, string> = {
  'field-missing': 'Provide a value for this field and resubmit.',
  'field-not-string': 'Provide this field as text and resubmit.',
  'field-empty': 'Provide a non-blank value for this field and resubmit.',
  'identifier-ambiguous': 'Reformat this identifier as a single unambiguous token, with no whitespace or delimiters, and resubmit.',
  'identifier-suspected-phi': 'Replace this value with a de-identified reference code and resubmit.',
  'date-invalid': 'Provide a parsable date and resubmit.',
  'date-chronology-impossible': 'Correct this date so it is consistent with the other dates on this request and resubmit.',
};

/** Deterministic, privacy-safe next corrective action for a field error, suitable for UI display alongside the explanation. */
export function explainAccessionFieldNextAction(error: AccessionFieldError): string {
  return FIELD_ERROR_NEXT_ACTIONS[error.code];
}
