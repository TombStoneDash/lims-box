/**
 * Fail-closed, deterministic OHWorks critical-value notification log builder.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated
 * critical result (analyte, value, and the flagged critical range it
 * breached) and a fabricated, caller-ordered chain of notification attempts
 * (who was called, at what timestamp, whether read-back was confirmed, and
 * an escalation contact used if the first attempt failed), it produces a
 * single immutable audit entry documenting the notification chain and
 * decides whether the notification satisfies a caller-supplied compliance
 * window.
 *
 * It performs no I/O, reads no system clock (every timestamp is
 * caller-supplied), mutates no SENAITE or database state, and touches no
 * real subject, sample, or customer data. It never sends or triggers a
 * notification itself, and it never asserts approval, compliance,
 * accreditation, or releasability beyond the single windowSatisfied
 * decision it documents.
 *
 * Decision shape:
 *   - The chain is walked in the caller-supplied attempt order. The first
 *     attempt must be to the PRIMARY contact; any attempt after it must be
 *     to the ESCALATION contact, must immediately follow an attempt whose
 *     read-back was not confirmed, and must fall within the declared
 *     escalation timeout of that failed attempt. Any break in this shape —
 *     a sequence gap, a non-increasing timestamp, an escalation with no
 *     preceding failure, a repeated primary attempt, or an escalation
 *     outside its timeout — fails closed to status 'CHAIN_GAP', with no
 *     confirmation time and the compliance window left unsatisfied.
 *   - If the chain shape is sound but the final attempt's read-back was not
 *     confirmed, the outcome fails closed to status 'UNCONFIRMED', with no
 *     confirmation time and the compliance window left unsatisfied.
 *   - If the chain shape is sound and the final attempt's read-back was
 *     confirmed, the outcome is 'CONFIRMED' and the compliance window is
 *     satisfied only when the elapsed time from the result's identified
 *     timestamp to that confirming attempt does not exceed the declared
 *     compliance window.
 *   - The returned entry carries a deterministic tamper-evidence hash
 *     (hashCriticalValueLogEntry) computed over its own declared fields, so
 *     any later mutation of a stored entry's fields is detectable by
 *     recomputing the hash and comparing.
 *   - A structurally unusable request — a malformed result, a value that is
 *     not a finite number, a malformed or empty critical range, a value
 *     that does not actually breach the declared range, a malformed
 *     compliance policy, a non-array or empty attempt list, a malformed
 *     attempt, or an attempt with an unrecognized contact role — throws
 *     CriticalValueLogInputError instead of guessing at an entry.
 */

export type CriticalRange = {
  /** Lower critical bound, or null if this range is not bounded below. */
  low: number | null;
  /** Upper critical bound, or null if this range is not bounded above. */
  high: number | null;
};

export type CriticalResultRecord = {
  /** Synthetic subject identifier. Never a real patient or customer identifier. */
  subjectId: string;
  /** Fabricated analyte/parameter code. */
  analyteCode: string;
  /** Raw fabricated observed value, exactly as received; may be nonnumeric. */
  value: unknown;
  unit?: string;
  /** The flagged critical range this value was declared to breach. */
  criticalRange: CriticalRange;
  /** Caller-supplied ISO 8601 timestamp the critical value was identified/flagged. */
  identifiedAt: string;
};

export type NotificationContactRole = 'PRIMARY' | 'ESCALATION';

const KNOWN_CONTACT_ROLES: ReadonlySet<string> = new Set<NotificationContactRole>(['PRIMARY', 'ESCALATION']);

export type NotificationAttempt = {
  /** 1-based position of this attempt within the caller-supplied chain. */
  sequence: number;
  contactRole: NotificationContactRole;
  /** Synthetic contact identifier. Never a real clinician or customer identifier. */
  contactId: string;
  /** Caller-supplied ISO 8601 timestamp this attempt was made. */
  calledAt: string;
  readBackConfirmed: boolean;
};

export type NotificationCompliancePolicy = {
  /** Minutes allowed between a failed PRIMARY attempt and a following ESCALATION attempt before the chain is considered gapped. Must be a positive finite number. */
  escalationTimeoutMinutes: number;
  /** Minutes allowed, from the result's identifiedAt to the confirming attempt's calledAt, for the compliance window to be satisfied. Must be a positive finite number. */
  complianceWindowMinutes: number;
};

export type CriticalValueLogInput = {
  result: CriticalResultRecord;
  /** Caller-ordered notification attempts; index i must declare sequence i + 1. */
  attempts: ReadonlyArray<NotificationAttempt>;
  policy: NotificationCompliancePolicy;
};

export type NotificationLogStatus = 'CONFIRMED' | 'UNCONFIRMED' | 'CHAIN_GAP';

export type NotificationLogReasonCode =
  | 'result-identified-timestamp-invalid'
  | 'sequence-invalid'
  | 'attempt-timestamp-invalid'
  | 'attempt-before-identified'
  | 'attempt-not-after-previous'
  | 'first-attempt-not-primary'
  | 'repeated-primary-attempt'
  | 'escalation-without-preceding-failure'
  | 'escalation-timeout-exceeded'
  | 'read-back-not-confirmed'
  | 'confirmed-within-window'
  | 'confirmed-outside-window';

const REASON_MESSAGES: Record<NotificationLogReasonCode, string> = {
  'result-identified-timestamp-invalid': 'The critical result’s identified timestamp could not be parsed.',
  'sequence-invalid': 'An attempt’s declared sequence number does not match its position in the supplied chain.',
  'attempt-timestamp-invalid': 'An attempt’s called timestamp could not be parsed.',
  'attempt-before-identified': 'The first attempt’s called timestamp is not after the result’s identified timestamp.',
  'attempt-not-after-previous': 'An attempt’s called timestamp is not strictly after the previous attempt’s called timestamp.',
  'first-attempt-not-primary': 'The first attempt in the chain is not to the PRIMARY contact.',
  'repeated-primary-attempt': 'A PRIMARY attempt follows another attempt; only the first attempt may be PRIMARY.',
  'escalation-without-preceding-failure': 'An ESCALATION attempt follows an attempt whose read-back was already confirmed.',
  'escalation-timeout-exceeded': 'The ESCALATION attempt fell outside the declared escalation timeout of the failed attempt it follows.',
  'read-back-not-confirmed': 'The final attempt in the chain did not have its read-back confirmed.',
  'confirmed-within-window': 'The final attempt’s read-back was confirmed within the declared compliance window.',
  'confirmed-outside-window': 'The final attempt’s read-back was confirmed, but after the declared compliance window elapsed.',
};

/** Deterministic, privacy-safe human-readable text for a notification log reason code, suitable for UI display. */
export function explainCriticalValueLogReason(code: NotificationLogReasonCode): string {
  return REASON_MESSAGES[code];
}

export type CriticalValueLogInputErrorCode =
  | 'result-malformed'
  | 'result-value-invalid'
  | 'result-range-malformed'
  | 'result-range-empty'
  | 'result-range-inverted'
  | 'result-value-not-critical'
  | 'policy-malformed'
  | 'escalation-timeout-invalid'
  | 'compliance-window-invalid'
  | 'attempts-not-array'
  | 'attempts-empty'
  | 'attempt-malformed'
  | 'unknown-contact-role';

const INPUT_ERROR_MESSAGES: Record<CriticalValueLogInputErrorCode, string> = {
  'result-malformed': 'The critical result is missing a required identity field.',
  'result-value-invalid': 'The critical result’s value is not a finite number.',
  'result-range-malformed': 'The declared critical range bounds are not numbers or null.',
  'result-range-empty': 'The declared critical range has no lower or upper bound.',
  'result-range-inverted': 'The declared critical range’s lower bound is not strictly below its upper bound.',
  'result-value-not-critical': 'The declared value does not breach either bound of the declared critical range.',
  'policy-malformed': 'The declared compliance policy is not structurally valid.',
  'escalation-timeout-invalid': 'The declared escalation timeout must be a positive finite number of minutes.',
  'compliance-window-invalid': 'The declared compliance window must be a positive finite number of minutes.',
  'attempts-not-array': 'The supplied notification attempts are not a list.',
  'attempts-empty': 'At least one notification attempt is required to build a log entry.',
  'attempt-malformed': 'A notification attempt is missing a required field or has the wrong shape.',
  'unknown-contact-role': 'A notification attempt declares a contact role that is not one of the recognized values.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a critical-value log entry. */
export class CriticalValueLogInputError extends Error {
  readonly code: CriticalValueLogInputErrorCode;

  constructor(code: CriticalValueLogInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'CriticalValueLogInputError';
    this.code = code;
  }
}

function fail(code: CriticalValueLogInputErrorCode): never {
  throw new CriticalValueLogInputError(code);
}

export type CriticalValueLogEntry = {
  subjectId: string;
  analyteCode: string;
  value: number;
  unit: string | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  attemptCount: number;
  finalContactRole: NotificationContactRole;
  status: NotificationLogStatus;
  reasonCode: NotificationLogReasonCode;
  /** Minutes from the result’s identifiedAt to the confirming attempt’s calledAt, or null unless status is 'CONFIRMED'. */
  minutesToConfirmation: number | null;
  /** True only when status is 'CONFIRMED' and minutesToConfirmation does not exceed the declared compliance window. */
  windowSatisfied: boolean;
  /** Tamper-evidence hash of the fields above; recompute with hashCriticalValueLogEntry() to verify. */
  entryHash: string;
};

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a, 32-bit, rendered as 8 lowercase hex digits. A small, pure,
 * dependency-free string hash — not cryptographically secure, and not
 * meant to be; it exists only to make accidental or deliberate mutation of
 * a stored entry’s fields detectable, which is all a synthetic fixture
 * receipt needs.
 */
function fnv1a32Hex(input: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * The canonical JSON encoding of a log entry’s declared fields (excluding
 * entryHash itself), in a fixed field order chosen by this module rather
 * than left to incidental object key order. This is the exact string
 * hashCriticalValueLogEntry() hashes.
 */
export function canonicalCriticalValueLogJson(fields: Omit<CriticalValueLogEntry, 'entryHash'>): string {
  return JSON.stringify({
    subjectId: fields.subjectId,
    analyteCode: fields.analyteCode,
    value: fields.value,
    unit: fields.unit,
    rangeLow: fields.rangeLow,
    rangeHigh: fields.rangeHigh,
    attemptCount: fields.attemptCount,
    finalContactRole: fields.finalContactRole,
    status: fields.status,
    reasonCode: fields.reasonCode,
    minutesToConfirmation: fields.minutesToConfirmation,
    windowSatisfied: fields.windowSatisfied,
  });
}

/**
 * The declared pure hash function this module uses for tamper evidence:
 * FNV-1a over an entry’s canonical JSON. Pure and deterministic — the same
 * entry fields always hash to the same value, in any process, on any
 * machine.
 */
export function hashCriticalValueLogEntry(fields: Omit<CriticalValueLogEntry, 'entryHash'>): string {
  return fnv1a32Hex(canonicalCriticalValueLogJson(fields));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function validateResultShape(result: CriticalResultRecord): void {
  if (!isPlainObject(result)) {
    fail('result-malformed');
  }
  const candidate = result as unknown as Record<string, unknown>;
  if (
    !isNonEmptyString(candidate.subjectId) ||
    !isNonEmptyString(candidate.analyteCode) ||
    !isNonEmptyString(candidate.identifiedAt) ||
    (candidate.unit !== undefined && typeof candidate.unit !== 'string')
  ) {
    fail('result-malformed');
  }
}

function validateRange(range: CriticalRange): { low: number | null; high: number | null } {
  if (!isPlainObject(range)) {
    fail('result-range-malformed');
  }
  const candidate = range as unknown as Record<string, unknown>;
  const low = candidate.low;
  const high = candidate.high;
  if (
    (low !== null && typeof low !== 'number') ||
    (high !== null && typeof high !== 'number') ||
    (typeof low === 'number' && !Number.isFinite(low)) ||
    (typeof high === 'number' && !Number.isFinite(high))
  ) {
    fail('result-range-malformed');
  }
  const resolvedLow = low as number | null;
  const resolvedHigh = high as number | null;
  if (resolvedLow === null && resolvedHigh === null) {
    fail('result-range-empty');
  }
  if (resolvedLow !== null && resolvedHigh !== null && resolvedLow >= resolvedHigh) {
    fail('result-range-inverted');
  }
  return { low: resolvedLow, high: resolvedHigh };
}

function validatePolicy(policy: NotificationCompliancePolicy): void {
  if (!isPlainObject(policy)) {
    fail('policy-malformed');
  }
  const candidate = policy as unknown as Record<string, unknown>;
  const escalationTimeout = toFiniteNumber(candidate.escalationTimeoutMinutes);
  const complianceWindow = toFiniteNumber(candidate.complianceWindowMinutes);
  if (escalationTimeout === undefined) {
    fail('escalation-timeout-invalid');
  }
  if (escalationTimeout <= 0) {
    fail('escalation-timeout-invalid');
  }
  if (complianceWindow === undefined) {
    fail('compliance-window-invalid');
  }
  if (complianceWindow <= 0) {
    fail('compliance-window-invalid');
  }
}

function hasRequiredAttemptShape(
  value: unknown,
): value is { sequence: number; contactRole: unknown; contactId: string; calledAt: string; readBackConfirmed: boolean } {
  if (!isPlainObject(value)) {
    return false;
  }
  return (
    typeof value.sequence === 'number' &&
    Number.isInteger(value.sequence) &&
    value.sequence > 0 &&
    isNonEmptyString(value.contactId) &&
    isNonEmptyString(value.calledAt) &&
    typeof value.readBackConfirmed === 'boolean'
  );
}

function validateAttempts(attempts: ReadonlyArray<NotificationAttempt>): void {
  if (!Array.isArray(attempts)) {
    fail('attempts-not-array');
  }
  if (attempts.length === 0) {
    fail('attempts-empty');
  }
  for (const raw of attempts) {
    if (!hasRequiredAttemptShape(raw)) {
      fail('attempt-malformed');
    }
    if (!KNOWN_CONTACT_ROLES.has(raw.contactRole as string)) {
      fail('unknown-contact-role');
    }
  }
}

function entry(
  result: CriticalResultRecord,
  value: number,
  range: { low: number | null; high: number | null },
  attemptCount: number,
  finalContactRole: NotificationContactRole,
  status: NotificationLogStatus,
  reasonCode: NotificationLogReasonCode,
  minutesToConfirmation: number | null,
  windowSatisfied: boolean,
): CriticalValueLogEntry {
  const fields: Omit<CriticalValueLogEntry, 'entryHash'> = {
    subjectId: result.subjectId,
    analyteCode: result.analyteCode,
    value,
    unit: result.unit ?? null,
    rangeLow: range.low,
    rangeHigh: range.high,
    attemptCount,
    finalContactRole,
    status,
    reasonCode,
    minutesToConfirmation,
    windowSatisfied,
  };
  return Object.freeze({ ...fields, entryHash: hashCriticalValueLogEntry(fields) });
}

/**
 * Build a single immutable, tamper-evident audit entry documenting a
 * fabricated critical-value notification chain, and decide whether it
 * satisfies a caller-supplied compliance window.
 *
 * Fail-closed: any break in the notification chain’s shape (see module
 * doc) resolves to status 'CHAIN_GAP', and a final attempt whose read-back
 * was not confirmed resolves to status 'UNCONFIRMED' — both leave
 * windowSatisfied false and minutesToConfirmation null rather than
 * guessing at compliance. A structurally unusable request throws
 * CriticalValueLogInputError instead of producing an entry.
 */
export function buildCriticalValueNotificationLog(input: CriticalValueLogInput): CriticalValueLogEntry {
  validateResultShape(input.result);
  const result = input.result;

  const value = toFiniteNumber(result.value);
  if (value === undefined) {
    fail('result-value-invalid');
  }

  const range = validateRange(result.criticalRange);
  const breachesLow = range.low !== null && value <= range.low;
  const breachesHigh = range.high !== null && value >= range.high;
  if (!breachesLow && !breachesHigh) {
    fail('result-value-not-critical');
  }

  validatePolicy(input.policy);
  validateAttempts(input.attempts);

  const attempts = input.attempts;
  const finalContactRole = attempts[attempts.length - 1].contactRole;
  const attemptCount = attempts.length;

  const makeEntry = (
    status: NotificationLogStatus,
    reasonCode: NotificationLogReasonCode,
    minutesToConfirmation: number | null,
    windowSatisfied: boolean,
  ): CriticalValueLogEntry =>
    entry(result, value, range, attemptCount, finalContactRole, status, reasonCode, minutesToConfirmation, windowSatisfied);

  const identifiedTime = Date.parse(result.identifiedAt);
  if (!Number.isFinite(identifiedTime)) {
    return makeEntry('CHAIN_GAP', 'result-identified-timestamp-invalid', null, false);
  }

  let previousCalledTime = identifiedTime;
  let previousConfirmed = true;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];

    if (attempt.sequence !== index + 1) {
      return makeEntry('CHAIN_GAP', 'sequence-invalid', null, false);
    }

    const calledTime = Date.parse(attempt.calledAt);
    if (!Number.isFinite(calledTime)) {
      return makeEntry('CHAIN_GAP', 'attempt-timestamp-invalid', null, false);
    }

    if (index === 0) {
      if (attempt.contactRole !== 'PRIMARY') {
        return makeEntry('CHAIN_GAP', 'first-attempt-not-primary', null, false);
      }
      if (calledTime <= previousCalledTime) {
        return makeEntry('CHAIN_GAP', 'attempt-before-identified', null, false);
      }
    } else {
      if (calledTime <= previousCalledTime) {
        return makeEntry('CHAIN_GAP', 'attempt-not-after-previous', null, false);
      }
      if (attempt.contactRole === 'PRIMARY') {
        return makeEntry('CHAIN_GAP', 'repeated-primary-attempt', null, false);
      }
      if (previousConfirmed) {
        return makeEntry('CHAIN_GAP', 'escalation-without-preceding-failure', null, false);
      }
      const minutesSincePrevious = (calledTime - previousCalledTime) / 60000;
      if (minutesSincePrevious > input.policy.escalationTimeoutMinutes) {
        return makeEntry('CHAIN_GAP', 'escalation-timeout-exceeded', null, false);
      }
    }

    previousCalledTime = calledTime;
    previousConfirmed = attempt.readBackConfirmed;
  }

  const finalAttempt = attempts[attempts.length - 1];
  if (!finalAttempt.readBackConfirmed) {
    return makeEntry('UNCONFIRMED', 'read-back-not-confirmed', null, false);
  }

  const minutesToConfirmation = (previousCalledTime - identifiedTime) / 60000;
  const windowSatisfied = minutesToConfirmation <= input.policy.complianceWindowMinutes;
  return makeEntry(
    'CONFIRMED',
    windowSatisfied ? 'confirmed-within-window' : 'confirmed-outside-window',
    minutesToConfirmation,
    windowSatisfied,
  );
}
