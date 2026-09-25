/**
 * Fail-closed, deterministic OHWorks reagent lot-to-lot comparison.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated set
 * of paired results (the same synthetic specimen measured once on the
 * incumbent "old" reagent lot and once on the candidate "new" lot) plus a
 * caller-declared set of comparison limits, it computes the signed mean
 * difference (new minus old), the percent bias of that mean difference
 * relative to the mean old-lot value, and the count of individual pairs
 * whose difference exceeds a declared per-pair allowable difference. It then
 * returns exactly one of two decisions -- `accept` or `reject` -- for the
 * new lot, together with the single governing criterion that produced that
 * decision.
 *
 * It performs no I/O, reads no system clock, mutates no SENAITE or database
 * state, and touches no real specimen, instrument, or customer data. It
 * never asserts approval, compliance, accreditation, or releasability --
 * only whether the candidate lot's paired results stayed within the
 * declared comparison limits.
 *
 * Fail-closed: fewer pairs than the declared minimum, a duplicate specimen
 * identifier, a pair missing its identity fields, a non-finite old or new
 * value, a missing old or new unit, or an old/new unit that does not match
 * the declared comparison unit all throw LotComparisonError rather than
 * guessing at a decision. Structurally invalid declared limits throw the
 * same way.
 */

export type LotComparisonDecision = 'accept' | 'reject';

/** Fabricated paired result for a single synthetic specimen. Never real patient or customer data. */
export type LotComparisonPair = {
  /** Synthetic specimen identifier; must be unique within a single comparison. */
  specimenId: string;
  /** Raw fabricated result on the incumbent lot, exactly as received; may be nonnumeric. */
  oldValue: unknown;
  oldUnit?: string;
  /** Raw fabricated result on the candidate lot, exactly as received; may be nonnumeric. */
  newValue: unknown;
  newUnit?: string;
};

/** Per-pair allowable difference; a pair outside either declared axis counts as an outlier. */
export type LotComparisonAllowableDifference = {
  /** Non-negative absolute allowable per-pair difference, or null if this axis is not declared. */
  absolute: number | null;
  /** Non-negative percent allowable per-pair difference, or null if this axis is not declared. */
  percent: number | null;
};

export type LotComparisonLimits = {
  /** Minimum number of pairs required for a trustworthy comparison. */
  minPairs: number;
  /** Canonical unit every pair's old and new value must be declared in. */
  unit: string;
  /** Per-pair allowable difference used to count outlier pairs. */
  allowableDifference: LotComparisonAllowableDifference;
  /** Maximum allowable magnitude of the mean signed difference (new - old), or null if not declared. */
  maxMeanDifference: number | null;
  /** Maximum allowable magnitude of percent bias, or null if not declared. */
  maxPercentBias: number | null;
  /** Maximum number of outlier pairs tolerated before the new lot is rejected. */
  maxOutlierPairs: number;
};

export type LotComparisonGoverningCriterion =
  | 'within-limits'
  | 'mean-difference-exceeded'
  | 'percent-bias-exceeded'
  | 'outlier-count-exceeded';

const GOVERNING_CRITERION_MESSAGES: Record<LotComparisonGoverningCriterion, string> = {
  'within-limits': 'The mean difference, percent bias, and outlier count all stayed within the declared limits.',
  'mean-difference-exceeded': 'The magnitude of the mean signed difference exceeded the declared limit.',
  'percent-bias-exceeded': 'The magnitude of the percent bias exceeded the declared limit.',
  'outlier-count-exceeded': 'The count of pairs outside the declared allowable difference exceeded the declared limit.',
};

/** Deterministic, privacy-safe human-readable text for a governing criterion. */
export function explainLotComparisonCriterion(criterion: LotComparisonGoverningCriterion): string {
  return GOVERNING_CRITERION_MESSAGES[criterion];
}

export type LotComparisonPairDifference = {
  specimenId: string;
  /** newValue - oldValue, signed. */
  difference: number;
  /** Signed percent difference relative to |oldValue|; null when oldValue is 0. */
  percentDifference: number | null;
  /** Whether this pair exceeds the declared allowable difference on either axis. */
  isOutlier: boolean;
};

export type LotComparisonResult = {
  decision: LotComparisonDecision;
  governingCriterion: LotComparisonGoverningCriterion;
  pairCount: number;
  /** Mean of (newValue - oldValue) across all pairs, signed. */
  meanDifference: number;
  /** Percent bias of meanDifference relative to the mean old-lot value; null when that mean is 0. */
  percentBias: number | null;
  /** Count of pairs whose difference exceeded the declared allowable difference. */
  outlierCount: number;
  /** Per-pair differences, in the same order the pairs were given. */
  pairDifferences: readonly LotComparisonPairDifference[];
};

export type LotComparisonErrorCode =
  | 'limits-malformed'
  | 'pairs-not-array'
  | 'pairs-below-minimum'
  | 'duplicate-specimen-id'
  | 'pair-malformed'
  | 'old-value-invalid'
  | 'new-value-invalid'
  | 'old-unit-missing'
  | 'new-unit-missing'
  | 'old-unit-mismatched'
  | 'new-unit-mismatched';

const ERROR_MESSAGES: Record<LotComparisonErrorCode, string> = {
  'limits-malformed': 'The declared comparison limits are not structurally valid.',
  'pairs-not-array': 'The declared paired results are not a list.',
  'pairs-below-minimum': 'Fewer pairs were declared than the declared minimum required for a trustworthy comparison.',
  'duplicate-specimen-id': 'More than one pair was declared for the same specimen identifier.',
  'pair-malformed': 'A declared pair is missing a required identity field.',
  'old-value-invalid': 'A declared old-lot value is not a finite number.',
  'new-value-invalid': 'A declared new-lot value is not a finite number.',
  'old-unit-missing': 'A declared pair has no old-lot unit.',
  'new-unit-missing': 'A declared pair has no new-lot unit.',
  'old-unit-mismatched': 'A declared pair old-lot unit does not match the declared comparison unit.',
  'new-unit-mismatched': 'A declared pair new-lot unit does not match the declared comparison unit.',
};

/** Deterministic, human-readable text for a fail-closed error code. */
export function explainLotComparisonError(code: LotComparisonErrorCode): string {
  return ERROR_MESSAGES[code];
}

/** Thrown for any input this evaluator cannot safely resolve to an accept/reject decision. */
export class LotComparisonError extends Error {
  readonly code: LotComparisonErrorCode;

  constructor(code: LotComparisonErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'LotComparisonError';
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

function isValidAllowableDifference(value: unknown): value is LotComparisonAllowableDifference {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (!isNonNegativeFiniteOrNull(candidate.absolute) || !isNonNegativeFiniteOrNull(candidate.percent)) {
    return false;
  }
  return candidate.absolute !== null || candidate.percent !== null;
}

function isValidLimits(limits: unknown): limits is LotComparisonLimits {
  if (typeof limits !== 'object' || limits === null) {
    return false;
  }
  const candidate = limits as Record<string, unknown>;
  if (typeof candidate.minPairs !== 'number' || !Number.isInteger(candidate.minPairs) || candidate.minPairs < 1) {
    return false;
  }
  if (canonicalizeUnit(candidate.unit) === undefined) {
    return false;
  }
  if (!isValidAllowableDifference(candidate.allowableDifference)) {
    return false;
  }
  if (!isNonNegativeFiniteOrNull(candidate.maxMeanDifference) || !isNonNegativeFiniteOrNull(candidate.maxPercentBias)) {
    return false;
  }
  if (
    typeof candidate.maxOutlierPairs !== 'number' ||
    !Number.isInteger(candidate.maxOutlierPairs) ||
    candidate.maxOutlierPairs < 0
  ) {
    return false;
  }
  return true;
}

function hasRequiredPairShape(
  value: unknown,
): value is { specimenId: string; oldValue: unknown; newValue: unknown } & Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.specimenId === 'string' &&
    candidate.specimenId.length > 0 &&
    'oldValue' in candidate &&
    'newValue' in candidate
  );
}

/**
 * Evaluate a fabricated set of paired old-lot/new-lot results against
 * caller-declared comparison limits, and return a single conservative
 * accept/reject decision for the candidate lot.
 *
 * Fail-closed: fewer pairs than `limits.minPairs`, a duplicate specimen
 * identifier, a pair missing its identity fields, a non-finite old or new
 * value, a missing old or new unit, or an old/new unit that does not match
 * `limits.unit` all throw LotComparisonError instead of guessing at a
 * decision. Structurally invalid declared limits throw the same way.
 *
 * When multiple declared limits are exceeded at once, the governing
 * criterion is chosen by a fixed priority: mean difference, then percent
 * bias, then outlier count.
 */
export function evaluateLotComparison(
  pairs: ReadonlyArray<LotComparisonPair>,
  limits: LotComparisonLimits,
): LotComparisonResult {
  if (!isValidLimits(limits)) {
    throw new LotComparisonError('limits-malformed');
  }
  if (!Array.isArray(pairs)) {
    throw new LotComparisonError('pairs-not-array');
  }
  if (pairs.length < limits.minPairs) {
    throw new LotComparisonError('pairs-below-minimum');
  }

  const canonicalUnit = canonicalizeUnit(limits.unit) as string;
  const seenSpecimenIds = new Set<string>();
  const pairDifferences: LotComparisonPairDifference[] = [];

  let sumDifference = 0;
  let sumOldValue = 0;
  let outlierCount = 0;

  for (const pair of pairs) {
    if (!hasRequiredPairShape(pair)) {
      throw new LotComparisonError('pair-malformed');
    }
    if (seenSpecimenIds.has(pair.specimenId)) {
      throw new LotComparisonError('duplicate-specimen-id');
    }
    seenSpecimenIds.add(pair.specimenId);

    const oldValue = toFiniteNumber(pair.oldValue);
    if (oldValue === undefined) {
      throw new LotComparisonError('old-value-invalid');
    }
    const newValue = toFiniteNumber(pair.newValue);
    if (newValue === undefined) {
      throw new LotComparisonError('new-value-invalid');
    }

    const oldUnit = canonicalizeUnit(pair.oldUnit);
    if (oldUnit === undefined) {
      throw new LotComparisonError('old-unit-missing');
    }
    const newUnit = canonicalizeUnit(pair.newUnit);
    if (newUnit === undefined) {
      throw new LotComparisonError('new-unit-missing');
    }
    if (oldUnit !== canonicalUnit) {
      throw new LotComparisonError('old-unit-mismatched');
    }
    if (newUnit !== canonicalUnit) {
      throw new LotComparisonError('new-unit-mismatched');
    }

    const difference = newValue - oldValue;
    const percentDifference = oldValue !== 0 ? (difference / Math.abs(oldValue)) * 100 : null;

    const exceedsAbsolute =
      limits.allowableDifference.absolute !== null && Math.abs(difference) > limits.allowableDifference.absolute;
    const exceedsPercent =
      limits.allowableDifference.percent !== null &&
      percentDifference !== null &&
      Math.abs(percentDifference) > limits.allowableDifference.percent;
    const isOutlier = exceedsAbsolute || exceedsPercent;
    if (isOutlier) {
      outlierCount += 1;
    }

    pairDifferences.push(
      Object.freeze({ specimenId: pair.specimenId, difference, percentDifference, isOutlier }),
    );

    sumDifference += difference;
    sumOldValue += oldValue;
  }

  const pairCount = pairs.length;
  const meanDifference = sumDifference / pairCount;
  const meanOldValue = sumOldValue / pairCount;
  const percentBias = meanOldValue !== 0 ? (meanDifference / Math.abs(meanOldValue)) * 100 : null;

  const meanDifferenceExceeded =
    limits.maxMeanDifference !== null && Math.abs(meanDifference) > limits.maxMeanDifference;
  const percentBiasExceeded =
    limits.maxPercentBias !== null && percentBias !== null && Math.abs(percentBias) > limits.maxPercentBias;
  const outlierCountExceeded = outlierCount > limits.maxOutlierPairs;

  let decision: LotComparisonDecision = 'accept';
  let governingCriterion: LotComparisonGoverningCriterion = 'within-limits';

  if (meanDifferenceExceeded) {
    decision = 'reject';
    governingCriterion = 'mean-difference-exceeded';
  } else if (percentBiasExceeded) {
    decision = 'reject';
    governingCriterion = 'percent-bias-exceeded';
  } else if (outlierCountExceeded) {
    decision = 'reject';
    governingCriterion = 'outlier-count-exceeded';
  }

  return Object.freeze({
    decision,
    governingCriterion,
    pairCount,
    meanDifference,
    percentBias,
    outlierCount,
    pairDifferences: Object.freeze(pairDifferences),
  });
}
