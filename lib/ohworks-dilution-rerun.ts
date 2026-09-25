/**
 * Deterministic, synthetic OHWorks dilution and rerun rules.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated raw
 * result (an instrument reading plus whatever dilution factor was already
 * applied to produce it), a declared set of known analyte measuring ranges,
 * a declared dilution ladder, a declared maximum dilution factor, and the
 * caller's current rerun count against a declared maximum, it decides
 * exactly one disposition:
 *
 *   report_as_is         - the raw reading is within, or below, the
 *                           analyte's measuring range at the currently
 *                           applied dilution. No further dilution can help
 *                           an already-low reading, so it is reported as-is.
 *                           The specimen-equivalent corrected result
 *                           (rawReading * appliedDilutionFactor) is included.
 *   rerun_with_dilution   - the raw reading exceeds the analyte's measuring
 *                           range, a declared ladder rung above the current
 *                           dilution and at or below the declared maximum
 *                           dilution is available, and the rerun budget has
 *                           not been exhausted. The next dilution factor to
 *                           apply is included.
 *   report_as_greater_than - the raw reading exceeds the analyte's measuring
 *                           range and no further ladder rung is available
 *                           (the ladder is exhausted, or every remaining
 *                           rung exceeds the declared maximum dilution).
 *                           The reportable lower-bound limit
 *                           (upperLimit * appliedDilutionFactor) is included.
 *   block                 - the request cannot be trusted or acted on: the
 *                           analyte has no declared measuring range (or the
 *                           declared range's unit does not match the
 *                           result's unit), the declared ladder is invalid
 *                           for this analyte, or a rerun would be required
 *                           but the declared maximum rerun count has already
 *                           been reached.
 *
 * It performs no I/O, reads no system clock, mutates no SENAITE or database
 * state, and touches no real specimen, instrument, or customer data. Every
 * value in every fixture and test is fabricated. Nothing here asserts
 * approval, compliance, accreditation, or releasability, and the module
 * never guesses in the result's favor: every ambiguous or untrustworthy
 * input resolves to `block`, or, for requests too malformed to evaluate at
 * all, throws DilutionRerunInputError.
 */

export type DilutionRerunDecision = 'report_as_is' | 'rerun_with_dilution' | 'report_as_greater_than' | 'block';

export type DilutionRerunReasonCode =
  | 'unknown-analyte'
  | 'measuring-range-unit-mismatch'
  | 'invalid-ladder'
  | 'within-range'
  | 'below-range'
  | 'max-reruns-exceeded'
  | 'rerun-required'
  | 'max-dilution-reached';

export type DilutionRerunRawResult = {
  /** Fabricated analyte/parameter code. */
  analyteCode: string;
  unit: string;
  /** Raw instrument reading at the currently applied dilution (not yet corrected for dilution). */
  rawReading: number;
  /** Dilution factor already applied to produce rawReading. 1 means undiluted (neat). */
  appliedDilutionFactor: number;
};

export type MeasuringRange = {
  analyteCode: string;
  unit: string;
  lowerLimit: number;
  upperLimit: number;
};

export type DilutionLadder = {
  analyteCode: string;
  /**
   * Strictly increasing dilution factors, each greater than 1 (e.g.
   * [2, 5, 10, 20]). The implicit neat factor of 1 must not be included.
   */
  factors: ReadonlyArray<number>;
};

export type RerunTracking = {
  /** Number of reruns already performed for this result, prior to this evaluation. */
  rerunCount: number;
  /** Declared maximum number of reruns permitted. */
  maxReruns: number;
};

export type DilutionRerunRequest = {
  result: DilutionRerunRawResult;
  /** Declared measuring ranges for every known analyte. */
  measuringRanges: ReadonlyArray<MeasuringRange>;
  ladder: DilutionLadder;
  /** Declared ceiling on dilution factor; no rerun may use a factor above this. */
  maxDilutionFactor: number;
  rerunTracking: RerunTracking;
};

export type DilutionRerunOutcome = {
  decision: DilutionRerunDecision;
  reasonCode: DilutionRerunReasonCode;
  /** Deterministic, privacy-safe human-readable explanation of reasonCode. */
  reason: string;
  /** Specimen-equivalent concentration after the already-applied dilution; populated only for report_as_is. */
  correctedResult: number | null;
  /** Next dilution factor to apply; populated only for rerun_with_dilution. */
  nextDilutionFactor: number | null;
  /** Reportable lower-bound limit ("> limit"); populated only for report_as_greater_than. */
  greaterThanLimit: number | null;
};

const REASON_DECISIONS: Record<DilutionRerunReasonCode, DilutionRerunDecision> = {
  'unknown-analyte': 'block',
  'measuring-range-unit-mismatch': 'block',
  'invalid-ladder': 'block',
  'within-range': 'report_as_is',
  'below-range': 'report_as_is',
  'max-reruns-exceeded': 'block',
  'rerun-required': 'rerun_with_dilution',
  'max-dilution-reached': 'report_as_greater_than',
};

const REASON_MESSAGES: Record<DilutionRerunReasonCode, string> = {
  'unknown-analyte': 'No measuring range is declared for this analyte.',
  'measuring-range-unit-mismatch': 'The declared measuring range for this analyte uses a different unit than the result.',
  'invalid-ladder': 'The declared dilution ladder is not valid for this analyte.',
  'within-range': 'The raw reading is within the analyte\'s measuring range at the currently applied dilution.',
  'below-range': 'The raw reading is below the analyte\'s measuring range; further dilution cannot raise it into range.',
  'max-reruns-exceeded': 'A rerun at a higher dilution is required, but the declared maximum rerun count has already been reached.',
  'rerun-required': 'The raw reading exceeds the analyte\'s measuring range; a rerun at the next declared dilution factor is required.',
  'max-dilution-reached': 'The raw reading exceeds the analyte\'s measuring range and no further declared dilution factor is available.',
};

/** Deterministic, privacy-safe human-readable text for a dilution/rerun reason code, suitable for UI display. */
export function explainDilutionRerunReason(code: DilutionRerunReasonCode): string {
  return REASON_MESSAGES[code];
}

export type DilutionRerunInputErrorCode =
  | 'result-malformed'
  | 'measuring-ranges-malformed'
  | 'ladder-malformed'
  | 'max-dilution-malformed'
  | 'rerun-tracking-malformed';

const INPUT_ERROR_MESSAGES: Record<DilutionRerunInputErrorCode, string> = {
  'result-malformed': 'The raw result is missing a required field or has the wrong shape.',
  'measuring-ranges-malformed': 'The declared measuring ranges are not a valid list of range entries.',
  'ladder-malformed': 'The declared dilution ladder is missing a required field or has the wrong shape.',
  'max-dilution-malformed': 'The declared maximum dilution factor is not a finite number of at least 1.',
  'rerun-tracking-malformed': 'The declared rerun tracking is not a valid non-negative rerun count and maximum.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a reason code. */
export class DilutionRerunInputError extends Error {
  readonly code: DilutionRerunInputErrorCode;

  constructor(code: DilutionRerunInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'DilutionRerunInputError';
    this.code = code;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isStructurallyValidResult(raw: unknown): raw is DilutionRerunRawResult {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.analyteCode) &&
    isNonEmptyString(candidate.unit) &&
    isFiniteNumber(candidate.rawReading) &&
    isFiniteNumber(candidate.appliedDilutionFactor) &&
    candidate.appliedDilutionFactor >= 1
  );
}

function isStructurallyValidRange(raw: unknown): raw is MeasuringRange {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.analyteCode) &&
    isNonEmptyString(candidate.unit) &&
    isFiniteNumber(candidate.lowerLimit) &&
    isFiniteNumber(candidate.upperLimit) &&
    candidate.lowerLimit <= candidate.upperLimit
  );
}

function isStructurallyValidLadderShape(raw: unknown): raw is DilutionLadder {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.analyteCode) &&
    Array.isArray(candidate.factors) &&
    candidate.factors.every((factor) => isFiniteNumber(factor))
  );
}

function isStructurallyValidRerunTracking(raw: unknown): raw is RerunTracking {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return isNonNegativeInteger(candidate.rerunCount) && isNonNegativeInteger(candidate.maxReruns);
}

/** True only for a ladder that is declared for this analyte and whose factors are strictly increasing values greater than 1. */
function isDomainValidLadder(ladder: DilutionLadder, analyteCode: string): boolean {
  if (ladder.analyteCode !== analyteCode) {
    return false;
  }
  if (ladder.factors.length === 0) {
    return false;
  }
  for (let i = 0; i < ladder.factors.length; i += 1) {
    const factor = ladder.factors[i];
    if (!(factor > 1)) {
      return false;
    }
    if (i > 0 && !(factor > ladder.factors[i - 1])) {
      return false;
    }
  }
  return true;
}

function outcome(
  reasonCode: DilutionRerunReasonCode,
  correctedResult: number | null,
  nextDilutionFactor: number | null,
  greaterThanLimit: number | null,
): DilutionRerunOutcome {
  return Object.freeze({
    decision: REASON_DECISIONS[reasonCode],
    reasonCode,
    reason: REASON_MESSAGES[reasonCode],
    correctedResult,
    nextDilutionFactor,
    greaterThanLimit,
  });
}

/**
 * Evaluate a fabricated raw result against a declared measuring range,
 * dilution ladder, maximum dilution factor, and rerun budget, and return a
 * single conservative dilution/rerun outcome.
 *
 * Fail-closed: an analyte with no declared measuring range, a declared range
 * whose unit does not match the result's unit, a dilution ladder that is not
 * declared for this analyte or is not a strictly increasing sequence of
 * factors greater than 1, or a required rerun that would exceed the declared
 * maximum rerun count all resolve to `block`. A reading within or below the
 * measuring range resolves to `report_as_is` with the corrected
 * (dilution-adjusted) result. A reading above the range resolves to
 * `rerun_with_dilution` with the next ladder factor when one is available
 * at or below the declared maximum dilution and the rerun budget allows it,
 * or to `report_as_greater_than` with the reportable limit when no further
 * dilution is available. Structurally unusable input (a malformed result,
 * measuring-range list, ladder shape, maximum dilution factor, or rerun
 * tracking) throws DilutionRerunInputError instead of guessing at a reason
 * code.
 */
export function evaluateDilutionRerun(request: DilutionRerunRequest): DilutionRerunOutcome {
  if (!isStructurallyValidResult(request.result)) {
    throw new DilutionRerunInputError('result-malformed');
  }
  const result = request.result;

  if (!Array.isArray(request.measuringRanges) || !request.measuringRanges.every(isStructurallyValidRange)) {
    throw new DilutionRerunInputError('measuring-ranges-malformed');
  }
  if (!isStructurallyValidLadderShape(request.ladder)) {
    throw new DilutionRerunInputError('ladder-malformed');
  }
  if (!isFiniteNumber(request.maxDilutionFactor) || request.maxDilutionFactor < 1) {
    throw new DilutionRerunInputError('max-dilution-malformed');
  }
  if (!isStructurallyValidRerunTracking(request.rerunTracking)) {
    throw new DilutionRerunInputError('rerun-tracking-malformed');
  }

  const range = request.measuringRanges.find((candidate) => candidate.analyteCode === result.analyteCode);
  if (!range) {
    return outcome('unknown-analyte', null, null, null);
  }
  if (range.unit !== result.unit) {
    return outcome('measuring-range-unit-mismatch', null, null, null);
  }

  if (!isDomainValidLadder(request.ladder, result.analyteCode)) {
    return outcome('invalid-ladder', null, null, null);
  }

  if (result.rawReading < range.lowerLimit) {
    return outcome('below-range', result.rawReading * result.appliedDilutionFactor, null, null);
  }
  if (result.rawReading <= range.upperLimit) {
    return outcome('within-range', result.rawReading * result.appliedDilutionFactor, null, null);
  }

  const maxDilutionFactor = request.maxDilutionFactor;
  const candidateFactors = request.ladder.factors.filter(
    (factor) => factor > result.appliedDilutionFactor && factor <= maxDilutionFactor,
  );

  if (candidateFactors.length === 0) {
    return outcome('max-dilution-reached', null, null, range.upperLimit * result.appliedDilutionFactor);
  }

  const nextDilutionFactor = candidateFactors.reduce((smallest, factor) => (factor < smallest ? factor : smallest));

  if (request.rerunTracking.rerunCount >= request.rerunTracking.maxReruns) {
    return outcome('max-reruns-exceeded', null, null, null);
  }

  return outcome('rerun-required', null, nextDilutionFactor, null);
}
