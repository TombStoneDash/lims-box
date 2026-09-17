/**
 * Fail-closed, deterministic OHWorks method comparison.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated set
 * of paired results (the same synthetic specimen measured once on a
 * "reference" method and once on a "candidate" method) plus a
 * caller-declared set of comparison parameters, it computes:
 *
 *  - the signed mean difference (candidate minus reference),
 *  - the sample standard deviation of those differences,
 *  - Bland-Altman-style limits of agreement using a declared multiplier,
 *  - the percent bias of the mean difference relative to the mean
 *    reference-method value, and
 *  - a Passing-Bablok style slope and intercept: the slope is the median of
 *    all pairwise slopes between distinct-reference-value pairs, and the
 *    intercept is the median of (candidateValue - slope * referenceValue)
 *    across all pairs.
 *
 * It then returns exactly one of two decisions -- `acceptable` or
 * `not-acceptable` -- against a declared allowable bias, together with the
 * single governing criterion that produced that decision.
 *
 * It performs no I/O, reads no system clock, mutates no SENAITE or database
 * state, and touches no real specimen, instrument, or customer data. It
 * never asserts approval, compliance, accreditation, or releasability --
 * only whether the candidate method's paired results stayed within the
 * declared allowable bias.
 *
 * Fail-closed: fewer pairs than the declared minimum, a duplicate specimen
 * identifier, a pair missing its identity fields, a non-finite reference or
 * candidate value, a missing reference or candidate unit, a reference or
 * candidate unit that does not match the declared comparison unit, or a set
 * of reference values with no spread (so no pairwise slope can be computed)
 * all throw MethodComparisonError rather than guessing at a decision.
 * Structurally invalid declared parameters throw the same way.
 */

export type MethodComparisonDecision = 'acceptable' | 'not-acceptable';

/** Fabricated paired result for a single synthetic specimen. Never real patient or customer data. */
export type MethodComparisonPair = {
  /** Synthetic specimen identifier; must be unique within a single comparison. */
  specimenId: string;
  /** Raw fabricated result on the reference method, exactly as received; may be nonnumeric. */
  referenceValue: unknown;
  referenceUnit?: string;
  /** Raw fabricated result on the candidate method, exactly as received; may be nonnumeric. */
  candidateValue: unknown;
  candidateUnit?: string;
};

/** Declared allowable bias; the comparison is not acceptable if either declared axis is exceeded. */
export type MethodComparisonAllowableBias = {
  /** Non-negative maximum allowable magnitude of the mean signed difference, or null if not declared. */
  maxMeanDifference: number | null;
  /** Non-negative maximum allowable magnitude of percent bias, or null if not declared. */
  maxPercentBias: number | null;
};

export type MethodComparisonDeclaration = {
  /** Minimum number of pairs required for a trustworthy comparison. Must be at least 2. */
  minPairs: number;
  /** Canonical unit every pair's reference and candidate value must be declared in. */
  unit: string;
  /** Positive, finite multiplier applied to the standard deviation of differences to form the limits of agreement (e.g. 1.96). */
  loaMultiplier: number;
  /** Declared allowable bias used to decide acceptability. */
  allowableBias: MethodComparisonAllowableBias;
};

export type MethodComparisonGoverningCriterion =
  | 'within-allowable-bias'
  | 'mean-difference-exceeded'
  | 'percent-bias-exceeded';

const GOVERNING_CRITERION_MESSAGES: Record<MethodComparisonGoverningCriterion, string> = {
  'within-allowable-bias': 'The mean difference and percent bias both stayed within the declared allowable bias.',
  'mean-difference-exceeded': 'The magnitude of the mean signed difference exceeded the declared allowable bias.',
  'percent-bias-exceeded': 'The magnitude of the percent bias exceeded the declared allowable bias.',
};

/** Deterministic, privacy-safe human-readable text for a governing criterion. */
export function explainMethodComparisonCriterion(criterion: MethodComparisonGoverningCriterion): string {
  return GOVERNING_CRITERION_MESSAGES[criterion];
}

export type MethodComparisonPairDifference = {
  specimenId: string;
  /** candidateValue - referenceValue, signed. */
  difference: number;
  /** Signed percent difference relative to |referenceValue|; null when referenceValue is 0. */
  percentDifference: number | null;
};

export type MethodComparisonLimitsOfAgreement = {
  multiplier: number;
  lower: number;
  upper: number;
};

export type MethodComparisonPassingBablok = {
  slope: number;
  intercept: number;
  /** Count of distinct-reference-value pairs used to compute the slope. */
  pairwiseSlopeCount: number;
};

export type MethodComparisonResult = {
  decision: MethodComparisonDecision;
  governingCriterion: MethodComparisonGoverningCriterion;
  pairCount: number;
  /** Mean of (candidateValue - referenceValue) across all pairs, signed. */
  meanDifference: number;
  /** Sample (n-1) standard deviation of the per-pair differences. */
  standardDeviationOfDifferences: number;
  limitsOfAgreement: MethodComparisonLimitsOfAgreement;
  /** Percent bias of meanDifference relative to the mean reference-method value; null when that mean is 0. */
  percentBias: number | null;
  passingBablok: MethodComparisonPassingBablok;
  /** Per-pair differences, in the same order the pairs were given. */
  pairDifferences: readonly MethodComparisonPairDifference[];
};

export type MethodComparisonErrorCode =
  | 'declaration-malformed'
  | 'pairs-not-array'
  | 'pairs-below-minimum'
  | 'duplicate-specimen-id'
  | 'pair-malformed'
  | 'reference-value-invalid'
  | 'candidate-value-invalid'
  | 'reference-unit-missing'
  | 'candidate-unit-missing'
  | 'reference-unit-mismatched'
  | 'candidate-unit-mismatched'
  | 'insufficient-reference-value-spread';

const ERROR_MESSAGES: Record<MethodComparisonErrorCode, string> = {
  'declaration-malformed': 'The declared comparison parameters are not structurally valid.',
  'pairs-not-array': 'The declared paired results are not a list.',
  'pairs-below-minimum': 'Fewer pairs were declared than the declared minimum required for a trustworthy comparison.',
  'duplicate-specimen-id': 'More than one pair was declared for the same specimen identifier.',
  'pair-malformed': 'A declared pair is missing a required identity field.',
  'reference-value-invalid': 'A declared reference-method value is not a finite number.',
  'candidate-value-invalid': 'A declared candidate-method value is not a finite number.',
  'reference-unit-missing': 'A declared pair has no reference-method unit.',
  'candidate-unit-missing': 'A declared pair has no candidate-method unit.',
  'reference-unit-mismatched': 'A declared pair reference-method unit does not match the declared comparison unit.',
  'candidate-unit-mismatched': 'A declared pair candidate-method unit does not match the declared comparison unit.',
  'insufficient-reference-value-spread':
    'Every declared reference-method value is identical, so no pairwise slope can be computed.',
};

/** Deterministic, human-readable text for a fail-closed error code. */
export function explainMethodComparisonError(code: MethodComparisonErrorCode): string {
  return ERROR_MESSAGES[code];
}

/** Thrown for any input this evaluator cannot safely resolve to an acceptable/not-acceptable decision. */
export class MethodComparisonError extends Error {
  readonly code: MethodComparisonErrorCode;

  constructor(code: MethodComparisonErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'MethodComparisonError';
    this.code = code;
  }
}

function toFiniteNumber(rawValue: unknown): number | undefined {
  if (typeof rawValue === 'number') {
    return Number.isFinite(rawValue) ? rawValue : undefined;
  }
  if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Canonicalize a unit for comparison only: trim outer whitespace and case-fold. Never infers or performs a unit conversion. */
function canonicalizeUnit(unit: unknown): string | undefined {
  if (typeof unit !== 'string') {
    return undefined;
  }
  const trimmed = unit.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : undefined;
}

function isNonNegativeFiniteOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isValidAllowableBias(value: unknown): value is MethodComparisonAllowableBias {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (!isNonNegativeFiniteOrNull(candidate.maxMeanDifference) || !isNonNegativeFiniteOrNull(candidate.maxPercentBias)) {
    return false;
  }
  return candidate.maxMeanDifference !== null || candidate.maxPercentBias !== null;
}

function isValidDeclaration(declaration: unknown): declaration is MethodComparisonDeclaration {
  if (typeof declaration !== 'object' || declaration === null) {
    return false;
  }
  const candidate = declaration as Record<string, unknown>;
  if (typeof candidate.minPairs !== 'number' || !Number.isInteger(candidate.minPairs) || candidate.minPairs < 2) {
    return false;
  }
  if (canonicalizeUnit(candidate.unit) === undefined) {
    return false;
  }
  if (typeof candidate.loaMultiplier !== 'number' || !Number.isFinite(candidate.loaMultiplier) || candidate.loaMultiplier <= 0) {
    return false;
  }
  if (!isValidAllowableBias(candidate.allowableBias)) {
    return false;
  }
  return true;
}

function hasRequiredPairShape(
  value: unknown,
): value is { specimenId: string; referenceValue: unknown; candidateValue: unknown } & Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.specimenId === 'string' &&
    candidate.specimenId.length > 0 &&
    'referenceValue' in candidate &&
    'candidateValue' in candidate
  );
}

/** Ascending-sorted median of a non-empty list of finite numbers. Does not mutate the input. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length / 2;
  if (Number.isInteger(middle)) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[Math.floor(middle)];
}

/**
 * Evaluate a fabricated set of paired reference-method/candidate-method
 * results against a caller-declared allowable bias, and return a single
 * conservative acceptable/not-acceptable decision for the candidate method.
 *
 * Fail-closed: fewer pairs than `declaration.minPairs`, a duplicate specimen
 * identifier, a pair missing its identity fields, a non-finite reference or
 * candidate value, a missing reference or candidate unit, a reference or
 * candidate unit that does not match `declaration.unit`, or a set of
 * reference values with no spread all throw MethodComparisonError instead of
 * guessing at a decision. Structurally invalid declared parameters throw the
 * same way.
 *
 * When both declared allowable-bias axes are exceeded at once, the
 * governing criterion is chosen by a fixed priority: mean difference, then
 * percent bias.
 */
export function evaluateMethodComparison(
  pairs: ReadonlyArray<MethodComparisonPair>,
  declaration: MethodComparisonDeclaration,
): MethodComparisonResult {
  if (!isValidDeclaration(declaration)) {
    throw new MethodComparisonError('declaration-malformed');
  }
  if (!Array.isArray(pairs)) {
    throw new MethodComparisonError('pairs-not-array');
  }
  if (pairs.length < declaration.minPairs) {
    throw new MethodComparisonError('pairs-below-minimum');
  }

  const canonicalUnit = canonicalizeUnit(declaration.unit) as string;
  const seenSpecimenIds = new Set<string>();
  const referenceValues: number[] = [];
  const candidateValues: number[] = [];
  const differences: number[] = [];
  const pairDifferences: MethodComparisonPairDifference[] = [];

  for (const pair of pairs) {
    if (!hasRequiredPairShape(pair)) {
      throw new MethodComparisonError('pair-malformed');
    }
    if (seenSpecimenIds.has(pair.specimenId)) {
      throw new MethodComparisonError('duplicate-specimen-id');
    }
    seenSpecimenIds.add(pair.specimenId);

    const referenceValue = toFiniteNumber(pair.referenceValue);
    if (referenceValue === undefined) {
      throw new MethodComparisonError('reference-value-invalid');
    }
    const candidateValue = toFiniteNumber(pair.candidateValue);
    if (candidateValue === undefined) {
      throw new MethodComparisonError('candidate-value-invalid');
    }

    const referenceUnit = canonicalizeUnit(pair.referenceUnit);
    if (referenceUnit === undefined) {
      throw new MethodComparisonError('reference-unit-missing');
    }
    const candidateUnit = canonicalizeUnit(pair.candidateUnit);
    if (candidateUnit === undefined) {
      throw new MethodComparisonError('candidate-unit-missing');
    }
    if (referenceUnit !== canonicalUnit) {
      throw new MethodComparisonError('reference-unit-mismatched');
    }
    if (candidateUnit !== canonicalUnit) {
      throw new MethodComparisonError('candidate-unit-mismatched');
    }

    const difference = candidateValue - referenceValue;
    const percentDifference = referenceValue !== 0 ? (difference / Math.abs(referenceValue)) * 100 : null;

    referenceValues.push(referenceValue);
    candidateValues.push(candidateValue);
    differences.push(difference);
    pairDifferences.push(Object.freeze({ specimenId: pair.specimenId, difference, percentDifference }));
  }

  const pairCount = pairs.length;
  const meanDifference = differences.reduce((sum, value) => sum + value, 0) / pairCount;
  const sumOfSquaredDeviations = differences.reduce((sum, value) => sum + (value - meanDifference) ** 2, 0);
  const standardDeviationOfDifferences = Math.sqrt(sumOfSquaredDeviations / (pairCount - 1));

  const limitsOfAgreement: MethodComparisonLimitsOfAgreement = Object.freeze({
    multiplier: declaration.loaMultiplier,
    lower: meanDifference - declaration.loaMultiplier * standardDeviationOfDifferences,
    upper: meanDifference + declaration.loaMultiplier * standardDeviationOfDifferences,
  });

  const meanReferenceValue = referenceValues.reduce((sum, value) => sum + value, 0) / pairCount;
  const percentBias = meanReferenceValue !== 0 ? (meanDifference / Math.abs(meanReferenceValue)) * 100 : null;

  const pairwiseSlopes: number[] = [];
  for (let i = 0; i < pairCount; i += 1) {
    for (let j = i + 1; j < pairCount; j += 1) {
      const referenceSpread = referenceValues[j] - referenceValues[i];
      if (referenceSpread === 0) {
        continue;
      }
      pairwiseSlopes.push((candidateValues[j] - candidateValues[i]) / referenceSpread);
    }
  }
  if (pairwiseSlopes.length === 0) {
    throw new MethodComparisonError('insufficient-reference-value-spread');
  }
  const slope = median(pairwiseSlopes);
  const intercept = median(candidateValues.map((candidateValue, index) => candidateValue - slope * referenceValues[index]));
  const passingBablok: MethodComparisonPassingBablok = Object.freeze({
    slope,
    intercept,
    pairwiseSlopeCount: pairwiseSlopes.length,
  });

  const meanDifferenceExceeded =
    declaration.allowableBias.maxMeanDifference !== null &&
    Math.abs(meanDifference) > declaration.allowableBias.maxMeanDifference;
  const percentBiasExceeded =
    declaration.allowableBias.maxPercentBias !== null &&
    percentBias !== null &&
    Math.abs(percentBias) > declaration.allowableBias.maxPercentBias;

  let decision: MethodComparisonDecision = 'acceptable';
  let governingCriterion: MethodComparisonGoverningCriterion = 'within-allowable-bias';

  if (meanDifferenceExceeded) {
    decision = 'not-acceptable';
    governingCriterion = 'mean-difference-exceeded';
  } else if (percentBiasExceeded) {
    decision = 'not-acceptable';
    governingCriterion = 'percent-bias-exceeded';
  }

  return Object.freeze({
    decision,
    governingCriterion,
    pairCount,
    meanDifference,
    standardDeviationOfDifferences,
    limitsOfAgreement,
    percentBias,
    passingBablok,
    pairDifferences: Object.freeze(pairDifferences),
  });
}
