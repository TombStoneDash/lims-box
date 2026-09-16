/**
 * Fail-closed, deterministic specimen hold-time evaluator for the synthetic
 * OHWorks pilot.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated
 * analyte hold-time profile (a bounded analyte code, a maximum hold time,
 * and a bounded storage condition) plus a caller-supplied collection
 * timestamp and receipt/analysis timestamp, it returns exactly one of three
 * bounded statuses — `within_window`, `near_expiry`, or `expired` — along
 * with the exact remaining or overdue duration and the rule code that
 * decided it.
 *
 * It never reads the clock itself: every timestamp used in the evaluation
 * is supplied by the caller, which keeps the result reproducible for a
 * given input. An unknown analyte, an unsupported storage condition, an
 * invalid hold-time configuration, a missing or unparsable timestamp, or a
 * receipt/analysis timestamp that precedes collection (non-monotonic) all
 * fail closed by throwing SpecimenHoldTimeError rather than guessing at a
 * status.
 */

/** The only external statuses this evaluator ever emits. */
export type SpecimenHoldTimeStatus = 'within_window' | 'near_expiry' | 'expired';

/** Bounded storage conditions this module knows how to evaluate hold time for. */
export type StorageCondition = 'room_temperature' | 'refrigerated' | 'frozen';

const KNOWN_STORAGE_CONDITIONS: ReadonlySet<string> = new Set<StorageCondition>([
  'room_temperature',
  'refrigerated',
  'frozen',
]);

/** Bounded registry of analyte codes this module knows how to evaluate hold time for. */
const KNOWN_ANALYTE_CODES: ReadonlySet<string> = new Set<string>([
  'GLUCOSE',
  'POTASSIUM',
  'CBC',
  'TSH',
  'LACTATE',
  'BLOOD_CULTURE',
]);

/**
 * Fraction of the maximum hold time elapsed at which a specimen still within
 * the window is instead reported as `near_expiry`. 0.9 was chosen so the
 * warning fires with 10% of the hold window left, giving a courier or bench
 * tech a fixed, non-negotiable buffer to act before the specimen expires.
 */
const DEFAULT_NEAR_EXPIRY_FRACTION = 0.9;

/** Fabricated analyte hold-time profile. Never derived from a real assay catalog. */
export type AnalyteHoldTimeProfile = {
  /** Raw analyte code; may be unrecognized. */
  analyteCode: string;
  /** Maximum time, in milliseconds, the specimen may be held before it expires. */
  maxHoldTimeMs: number;
  /** Raw storage condition string; may be unsupported. */
  storageCondition: string;
  /**
   * Fraction (0, 1) of maxHoldTimeMs elapsed at which the specimen is
   * reported as `near_expiry` instead of `within_window`. Defaults to
   * DEFAULT_NEAR_EXPIRY_FRACTION when omitted.
   */
  nearExpiryFraction?: number;
};

export type SpecimenHoldTimeRuleCode =
  | 'within-hold-window'
  | 'near-expiry-threshold-reached'
  | 'max-hold-time-exceeded';

export type SpecimenHoldTimeEvaluation =
  | {
      status: 'within_window';
      ruleCode: 'within-hold-window';
      elapsedMs: number;
      maxHoldTimeMs: number;
      remainingMs: number;
    }
  | {
      status: 'near_expiry';
      ruleCode: 'near-expiry-threshold-reached';
      elapsedMs: number;
      maxHoldTimeMs: number;
      remainingMs: number;
    }
  | {
      status: 'expired';
      ruleCode: 'max-hold-time-exceeded';
      elapsedMs: number;
      maxHoldTimeMs: number;
      overdueMs: number;
    };

export type SpecimenHoldTimeErrorCode =
  | 'analyte-unknown'
  | 'storage-condition-unsupported'
  | 'max-hold-time-invalid'
  | 'near-expiry-fraction-invalid'
  | 'collected-at-missing'
  | 'collected-at-invalid'
  | 'reference-at-missing'
  | 'reference-at-invalid'
  | 'timestamps-non-monotonic';

const ERROR_MESSAGES: Record<SpecimenHoldTimeErrorCode, string> = {
  'analyte-unknown': 'The analyte code is not a recognized bounded value.',
  'storage-condition-unsupported': 'The storage condition is not a recognized bounded value.',
  'max-hold-time-invalid': 'The maximum hold time must be a finite number of milliseconds greater than zero.',
  'near-expiry-fraction-invalid': 'The near-expiry fraction must be a finite number strictly between 0 and 1.',
  'collected-at-missing': 'The collection timestamp is missing.',
  'collected-at-invalid': 'The collection timestamp could not be parsed as a UTC timestamp.',
  'reference-at-missing': 'The receipt or analysis timestamp is missing.',
  'reference-at-invalid': 'The receipt or analysis timestamp could not be parsed as a UTC timestamp.',
  'timestamps-non-monotonic': 'The receipt or analysis timestamp precedes the collection timestamp.',
};

/** Deterministic, human-readable text for a fail-closed error code. */
export function explainSpecimenHoldTimeError(code: SpecimenHoldTimeErrorCode): string {
  return ERROR_MESSAGES[code];
}

/** Thrown for any input this evaluator cannot safely resolve to a hold-time status. */
export class SpecimenHoldTimeError extends Error {
  readonly code: SpecimenHoldTimeErrorCode;

  constructor(code: SpecimenHoldTimeErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'SpecimenHoldTimeError';
    this.code = code;
  }
}

function isUtcTimestamp(value: string): boolean {
  return value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

/**
 * Evaluate whether a fabricated specimen is within its analyte's hold-time
 * window, near expiry, or expired, as of a caller-supplied receipt or
 * analysis timestamp.
 *
 * Fail-closed: an unrecognized analyte code, an unsupported storage
 * condition, an invalid maximum hold time or near-expiry fraction, a
 * missing or unparsable collection or reference timestamp, or a reference
 * timestamp that precedes collection all throw SpecimenHoldTimeError
 * instead of guessing at a status.
 */
export function evaluateSpecimenHoldTime(
  profile: AnalyteHoldTimeProfile,
  collectedAt: string,
  referenceAt: string,
): SpecimenHoldTimeEvaluation {
  if (!KNOWN_ANALYTE_CODES.has(profile.analyteCode)) {
    throw new SpecimenHoldTimeError('analyte-unknown');
  }

  if (!KNOWN_STORAGE_CONDITIONS.has(profile.storageCondition)) {
    throw new SpecimenHoldTimeError('storage-condition-unsupported');
  }

  if (!Number.isFinite(profile.maxHoldTimeMs) || profile.maxHoldTimeMs <= 0) {
    throw new SpecimenHoldTimeError('max-hold-time-invalid');
  }

  const nearExpiryFraction = profile.nearExpiryFraction ?? DEFAULT_NEAR_EXPIRY_FRACTION;
  if (!Number.isFinite(nearExpiryFraction) || nearExpiryFraction <= 0 || nearExpiryFraction >= 1) {
    throw new SpecimenHoldTimeError('near-expiry-fraction-invalid');
  }

  if (collectedAt === undefined || collectedAt === null || collectedAt === '') {
    throw new SpecimenHoldTimeError('collected-at-missing');
  }
  if (!isUtcTimestamp(collectedAt)) {
    throw new SpecimenHoldTimeError('collected-at-invalid');
  }

  if (referenceAt === undefined || referenceAt === null || referenceAt === '') {
    throw new SpecimenHoldTimeError('reference-at-missing');
  }
  if (!isUtcTimestamp(referenceAt)) {
    throw new SpecimenHoldTimeError('reference-at-invalid');
  }

  const collectedTime = Date.parse(collectedAt);
  const referenceTime = Date.parse(referenceAt);

  if (referenceTime < collectedTime) {
    throw new SpecimenHoldTimeError('timestamps-non-monotonic');
  }

  const elapsedMs = referenceTime - collectedTime;
  const { maxHoldTimeMs } = profile;

  if (elapsedMs >= maxHoldTimeMs) {
    return {
      status: 'expired',
      ruleCode: 'max-hold-time-exceeded',
      elapsedMs,
      maxHoldTimeMs,
      overdueMs: elapsedMs - maxHoldTimeMs,
    };
  }

  const nearExpiryThresholdMs = maxHoldTimeMs * nearExpiryFraction;
  if (elapsedMs >= nearExpiryThresholdMs) {
    return {
      status: 'near_expiry',
      ruleCode: 'near-expiry-threshold-reached',
      elapsedMs,
      maxHoldTimeMs,
      remainingMs: maxHoldTimeMs - elapsedMs,
    };
  }

  return {
    status: 'within_window',
    ruleCode: 'within-hold-window',
    elapsedMs,
    maxHoldTimeMs,
    remainingMs: maxHoldTimeMs - elapsedMs,
  };
}
