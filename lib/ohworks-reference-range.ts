/**
 * Fail-closed synthetic reference range evaluation for OHWorks/SENAITE-shaped
 * analyte results.
 *
 * This module is a pure, dependency-free, total function: given a fabricated
 * numeric (or censored) result, its declared unit, the analyte's limit of
 * detection, its upper limit of quantitation, and a declared reference range,
 * it classifies the result and returns the flag text a report would show.
 * It performs no I/O, touches no real instrument or customer data, and never
 * throws — any input it cannot safely interpret is classified 'invalid'
 * rather than guessed at.
 */

export type ReferenceRangeClassification =
  | 'below_detection'
  | 'within_range'
  | 'above_range'
  | 'above_quantitation'
  | 'invalid';

export type ReferenceRangeBounds = {
  lowerBound: number;
  upperBound: number;
  unit: string;
};

export type ReferenceRangeReasonCode =
  | 'censored-threshold-mismatch'
  | 'detection-quantitation-range-inverted'
  | 'limit-of-detection-non-finite'
  | 'reference-range-bound-non-finite'
  | 'reference-range-inverted'
  | 'result-non-finite'
  | 'unit-mismatch'
  | 'upper-limit-of-quantitation-non-finite';

export type ReferenceRangeReason = {
  code: ReferenceRangeReasonCode;
};

export type ReferenceRangeInput = {
  /** Fabricated observed result: a plain number, or a censored string such as "<0.5" or ">100". */
  result: number | string;
  /** Fabricated unit the result was reported in. */
  unit: string;
  limitOfDetection: number;
  upperLimitOfQuantitation: number;
  /** Declared reference range for the analyte, in the same unit as the result. */
  referenceRange: ReferenceRangeBounds;
};

export type ReferenceRangeEvaluation = {
  classification: ReferenceRangeClassification;
  /** Deterministic report flag text for this classification. */
  flag: string;
  /** Deterministically sorted; empty unless classification is 'invalid'. */
  reasons: ReferenceRangeReason[];
};

const REPORT_FLAGS: Record<ReferenceRangeClassification, string> = {
  below_detection: 'BELOW DETECTION LIMIT',
  within_range: 'WITHIN REFERENCE RANGE',
  above_range: 'ABOVE REFERENCE RANGE',
  above_quantitation: 'ABOVE QUANTITATION LIMIT',
  invalid: 'INVALID RESULT — REVIEW REQUIRED',
};

type Qualifier = 'none' | 'less-than' | 'greater-than';

type ParsedResult = {
  qualifier: Qualifier;
  /** The parsed numeric value, or undefined if it could not be derived as a finite number. */
  value: number | undefined;
};

/**
 * Canonicalize a unit for comparison only: trim outer whitespace and
 * case-fold. Never infers or performs a unit conversion, so "mg/L" and
 * "g/L" remain distinct. Returns undefined for anything that is not a
 * non-blank string.
 */
function canonicalizeUnit(unit: unknown): string | undefined {
  if (typeof unit !== 'string') {
    return undefined;
  }
  const trimmed = unit.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : undefined;
}

function toFiniteNumber(raw: unknown): number | undefined {
  if (typeof raw !== 'number') {
    return undefined;
  }
  return Number.isFinite(raw) ? raw : undefined;
}

function parseResult(result: number | string): ParsedResult {
  if (typeof result === 'number') {
    return { qualifier: 'none', value: toFiniteNumber(result) };
  }
  if (typeof result !== 'string') {
    return { qualifier: 'none', value: undefined };
  }

  const trimmed = result.trim();
  if (trimmed.startsWith('<')) {
    const parsed = Number(trimmed.slice(1).trim());
    return { qualifier: 'less-than', value: Number.isFinite(parsed) ? parsed : undefined };
  }
  if (trimmed.startsWith('>')) {
    const parsed = Number(trimmed.slice(1).trim());
    return { qualifier: 'greater-than', value: Number.isFinite(parsed) ? parsed : undefined };
  }
  if (trimmed.length === 0) {
    return { qualifier: 'none', value: undefined };
  }
  const parsed = Number(trimmed);
  return { qualifier: 'none', value: Number.isFinite(parsed) ? parsed : undefined };
}

function compareReasons(a: ReferenceRangeReason, b: ReferenceRangeReason): number {
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

/**
 * Evaluate a single fabricated result against its declared detection,
 * quantitation, and reference range limits.
 *
 * Fail-closed: a result unit that does not match the declared reference
 * range unit, any non-finite limit or bound, an inverted detection/
 * quantitation range, an inverted reference range, an unparsable or
 * non-finite result, or a censored ("<"/">") result whose threshold does
 * not exactly match the corresponding limit all classify as 'invalid'
 * rather than being guessed at.
 */
export function evaluateReferenceRange(input: ReferenceRangeInput): ReferenceRangeEvaluation {
  const reasons: ReferenceRangeReason[] = [];
  const flagReason = (code: ReferenceRangeReasonCode) => reasons.push({ code });

  const resultUnit = canonicalizeUnit(input.unit);
  const rangeUnit = canonicalizeUnit(input.referenceRange?.unit);
  if (resultUnit === undefined || rangeUnit === undefined || resultUnit !== rangeUnit) {
    flagReason('unit-mismatch');
  }

  const { qualifier, value } = parseResult(input.result);
  if (value === undefined) {
    flagReason('result-non-finite');
  }

  const limitOfDetection = toFiniteNumber(input.limitOfDetection);
  if (limitOfDetection === undefined) {
    flagReason('limit-of-detection-non-finite');
  }

  const upperLimitOfQuantitation = toFiniteNumber(input.upperLimitOfQuantitation);
  if (upperLimitOfQuantitation === undefined) {
    flagReason('upper-limit-of-quantitation-non-finite');
  }

  if (
    limitOfDetection !== undefined &&
    upperLimitOfQuantitation !== undefined &&
    limitOfDetection > upperLimitOfQuantitation
  ) {
    flagReason('detection-quantitation-range-inverted');
  }

  const lowerBound = toFiniteNumber(input.referenceRange?.lowerBound);
  const upperBound = toFiniteNumber(input.referenceRange?.upperBound);
  if (lowerBound === undefined || upperBound === undefined) {
    flagReason('reference-range-bound-non-finite');
  } else if (lowerBound > upperBound) {
    flagReason('reference-range-inverted');
  }

  if (
    value !== undefined &&
    limitOfDetection !== undefined &&
    upperLimitOfQuantitation !== undefined
  ) {
    if (qualifier === 'less-than' && value !== limitOfDetection) {
      flagReason('censored-threshold-mismatch');
    }
    if (qualifier === 'greater-than' && value !== upperLimitOfQuantitation) {
      flagReason('censored-threshold-mismatch');
    }
  }

  if (reasons.length > 0) {
    reasons.sort(compareReasons);
    return { classification: 'invalid', flag: REPORT_FLAGS.invalid, reasons };
  }

  // Past this point every value used below is a validated finite number.
  const safeValue = value as number;
  const safeLod = limitOfDetection as number;
  const safeUloq = upperLimitOfQuantitation as number;
  const safeUpperBound = upperBound as number;

  let classification: ReferenceRangeClassification;
  if (qualifier === 'less-than') {
    classification = 'below_detection';
  } else if (qualifier === 'greater-than') {
    classification = 'above_quantitation';
  } else if (safeValue < safeLod) {
    classification = 'below_detection';
  } else if (safeValue > safeUloq) {
    classification = 'above_quantitation';
  } else if (safeValue > safeUpperBound) {
    classification = 'above_range';
  } else {
    classification = 'within_range';
  }

  return { classification, flag: REPORT_FLAGS[classification], reasons: [] };
}
