/**
 * Deterministic, synthetic OHWorks linearity verification.
 *
 * This module is a pure, dependency-free function over a caller-supplied set
 * of calibrator levels. It performs no I/O, reads no system clock, and
 * touches no real instrument, sample, or customer data.
 *
 * Given at least five calibrator levels, each with an expected (nominal) and
 * an observed value, it computes the ordinary-least-squares slope,
 * intercept, and Pearson correlation of observed against expected, the
 * percent recovery at every level, and decides:
 *
 *   pass    - slope, intercept, and correlation are within their declared
 *             acceptance limits and every level's percent recovery is
 *             within its declared acceptance limits
 *   fail    - one of the above acceptance criteria is violated; the first
 *             violated criterion (checked in a fixed order: slope,
 *             intercept, correlation, then per-level recovery in the given
 *             level order) is named
 *   blocked - the input itself cannot be trusted: fewer than five levels,
 *             a non-finite expected/observed/derived value, or a duplicate
 *             level (repeated level id or repeated expected value)
 *
 * Every failure mode defaults to `blocked` or `fail` rather than guessing
 * in the assay's favor.
 */

export type LinearityLevelInput = {
  levelId: string;
  expected: number;
  observed: number;
};

export type LinearityAcceptanceLimits = {
  slopeMin: number;
  slopeMax: number;
  interceptMin: number;
  interceptMax: number;
  correlationMin: number;
  recoveryMinPercent: number;
  recoveryMaxPercent: number;
};

export type LinearityDecision = 'pass' | 'fail' | 'blocked';

/** Bounded, privacy-safe codes naming the rule behind a linearity decision. */
export type LinearityReasonCode =
  | 'insufficient-levels'
  | 'non-finite-value'
  | 'duplicate-level'
  | 'slope-out-of-range'
  | 'intercept-out-of-range'
  | 'correlation-below-minimum'
  | 'recovery-out-of-range'
  | 'linearity-verified';

export type LinearityLevelRecovery = {
  levelId: string;
  expected: number;
  observed: number;
  recoveryPercent: number;
  withinLimits: boolean;
};

export type LinearityVerificationResult = {
  decision: LinearityDecision;
  reasonCode: LinearityReasonCode;
  /** Deterministic, privacy-safe human-readable explanation of reasonCode. */
  reason: string;
  slope: number | null;
  intercept: number | null;
  correlation: number | null;
  levelRecoveries: readonly LinearityLevelRecovery[];
};

export const MINIMUM_LEVEL_COUNT = 5;

export type LinearityInputErrorCode =
  | 'levels-malformed'
  | 'level-entry-malformed'
  | 'limits-malformed';

const INPUT_ERROR_MESSAGES: Record<LinearityInputErrorCode, string> = {
  'levels-malformed': 'The supplied calibrator levels are not a valid array.',
  'level-entry-malformed': 'A calibrator level entry is missing a required field or has the wrong shape.',
  'limits-malformed': 'The supplied acceptance limits are missing a required field, have the wrong shape, or an inverted range.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a reason code. */
export class LinearityVerificationInputError extends Error {
  readonly code: LinearityInputErrorCode;

  constructor(code: LinearityInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'LinearityVerificationInputError';
    this.code = code;
  }
}

const REASON_DECISIONS: Record<LinearityReasonCode, LinearityDecision> = {
  'insufficient-levels': 'blocked',
  'non-finite-value': 'blocked',
  'duplicate-level': 'blocked',
  'slope-out-of-range': 'fail',
  'intercept-out-of-range': 'fail',
  'correlation-below-minimum': 'fail',
  'recovery-out-of-range': 'fail',
  'linearity-verified': 'pass',
};

const REASON_MESSAGES: Record<LinearityReasonCode, string> = {
  'insufficient-levels': `Fewer than ${MINIMUM_LEVEL_COUNT} calibrator levels were supplied.`,
  'non-finite-value': 'A supplied or derived value is not a finite number.',
  'duplicate-level': 'Two or more calibrator levels share the same level id or expected value.',
  'slope-out-of-range': 'The computed slope falls outside its declared acceptance limits.',
  'intercept-out-of-range': 'The computed intercept falls outside its declared acceptance limits.',
  'correlation-below-minimum': 'The computed correlation falls below its declared acceptance minimum.',
  'recovery-out-of-range': 'The percent recovery at one or more levels falls outside its declared acceptance limits.',
  'linearity-verified': 'Slope, intercept, correlation, and every level\'s percent recovery are within their declared acceptance limits.',
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Absolute tolerance applied only at acceptance-limit boundaries, to absorb
 * IEEE-754 double-precision rounding noise (e.g. 1.1 * 100 evaluating to
 * 110.00000000000001) rather than any scientific or measurement tolerance.
 */
const BOUNDARY_EPSILON = 1e-9;

function isAtLeastLimit(value: number, min: number): boolean {
  return value >= min - BOUNDARY_EPSILON;
}

function isAtMostLimit(value: number, max: number): boolean {
  return value <= max + BOUNDARY_EPSILON;
}

function isWithinLimitRange(value: number, min: number, max: number): boolean {
  return isAtLeastLimit(value, min) && isAtMostLimit(value, max);
}

function isStructurallyValidLevel(raw: unknown): raw is LinearityLevelInput {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return isNonEmptyString(candidate.levelId) && typeof candidate.expected === 'number' && typeof candidate.observed === 'number';
}

function isStructurallyValidLevelsArray(raw: unknown): raw is LinearityLevelInput[] {
  return Array.isArray(raw) && raw.every(isStructurallyValidLevel);
}

function isStructurallyValidLimits(raw: unknown): raw is LinearityAcceptanceLimits {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    isFiniteNumber(candidate.slopeMin) &&
    isFiniteNumber(candidate.slopeMax) &&
    candidate.slopeMin <= candidate.slopeMax &&
    isFiniteNumber(candidate.interceptMin) &&
    isFiniteNumber(candidate.interceptMax) &&
    candidate.interceptMin <= candidate.interceptMax &&
    isFiniteNumber(candidate.correlationMin) &&
    isFiniteNumber(candidate.recoveryMinPercent) &&
    isFiniteNumber(candidate.recoveryMaxPercent) &&
    candidate.recoveryMinPercent <= candidate.recoveryMaxPercent
  );
}

function toResult(
  reasonCode: LinearityReasonCode,
  slope: number | null,
  intercept: number | null,
  correlation: number | null,
  levelRecoveries: LinearityLevelRecovery[],
): LinearityVerificationResult {
  return Object.freeze({
    decision: REASON_DECISIONS[reasonCode],
    reasonCode,
    reason: REASON_MESSAGES[reasonCode],
    slope,
    intercept,
    correlation,
    levelRecoveries: Object.freeze(levelRecoveries.map((entry) => Object.freeze({ ...entry }))),
  });
}

function blocked(reasonCode: LinearityReasonCode): LinearityVerificationResult {
  return toResult(reasonCode, null, null, null, []);
}

/**
 * Evaluate a set of calibrator levels for linearity against declared
 * acceptance limits.
 *
 * Fail-closed: fewer than five levels, any non-finite expected/observed/
 * derived value, or a duplicate level (repeated level id or repeated
 * expected value) all resolve to `blocked`. A violation of the slope,
 * intercept, correlation, or per-level recovery acceptance limits resolves
 * to `fail`, naming the first violated criterion in that fixed order. Only
 * a fully compliant fit resolves to `pass`.
 *
 * Structurally unusable input (a malformed levels array, level entry, or
 * acceptance-limits object) throws LinearityVerificationInputError instead
 * of guessing at a reason code.
 */
export function evaluateLinearityVerification(
  levels: LinearityLevelInput[],
  limits: LinearityAcceptanceLimits,
): LinearityVerificationResult {
  if (!isStructurallyValidLevelsArray(levels)) {
    if (!Array.isArray(levels)) {
      throw new LinearityVerificationInputError('levels-malformed');
    }
    throw new LinearityVerificationInputError('level-entry-malformed');
  }
  if (!isStructurallyValidLimits(limits)) {
    throw new LinearityVerificationInputError('limits-malformed');
  }

  if (levels.length < MINIMUM_LEVEL_COUNT) {
    return blocked('insufficient-levels');
  }

  for (const level of levels) {
    if (!isFiniteNumber(level.expected) || !isFiniteNumber(level.observed)) {
      return blocked('non-finite-value');
    }
  }

  const seenLevelIds = new Set<string>();
  const seenExpected = new Set<number>();
  for (const level of levels) {
    if (seenLevelIds.has(level.levelId) || seenExpected.has(level.expected)) {
      return blocked('duplicate-level');
    }
    seenLevelIds.add(level.levelId);
    seenExpected.add(level.expected);
  }

  const n = levels.length;
  const meanX = levels.reduce((sum, level) => sum + level.expected, 0) / n;
  const meanY = levels.reduce((sum, level) => sum + level.observed, 0) / n;

  let sumXY = 0;
  let sumXX = 0;
  let sumYY = 0;
  for (const level of levels) {
    const dx = level.expected - meanX;
    const dy = level.observed - meanY;
    sumXY += dx * dy;
    sumXX += dx * dx;
    sumYY += dy * dy;
  }

  const slope = sumXY / sumXX;
  const intercept = meanY - slope * meanX;
  const correlation = sumXY / Math.sqrt(sumXX * sumYY);

  if (!isFiniteNumber(slope) || !isFiniteNumber(intercept) || !isFiniteNumber(correlation)) {
    return blocked('non-finite-value');
  }

  const levelRecoveries: LinearityLevelRecovery[] = [];
  for (const level of levels) {
    const recoveryPercent = (level.observed / level.expected) * 100;
    if (!isFiniteNumber(recoveryPercent)) {
      return blocked('non-finite-value');
    }
    levelRecoveries.push({
      levelId: level.levelId,
      expected: level.expected,
      observed: level.observed,
      recoveryPercent,
      withinLimits: isWithinLimitRange(recoveryPercent, limits.recoveryMinPercent, limits.recoveryMaxPercent),
    });
  }

  if (!isWithinLimitRange(slope, limits.slopeMin, limits.slopeMax)) {
    return toResult('slope-out-of-range', slope, intercept, correlation, levelRecoveries);
  }
  if (!isWithinLimitRange(intercept, limits.interceptMin, limits.interceptMax)) {
    return toResult('intercept-out-of-range', slope, intercept, correlation, levelRecoveries);
  }
  if (!isAtLeastLimit(correlation, limits.correlationMin)) {
    return toResult('correlation-below-minimum', slope, intercept, correlation, levelRecoveries);
  }
  if (levelRecoveries.some((entry) => !entry.withinLimits)) {
    return toResult('recovery-out-of-range', slope, intercept, correlation, levelRecoveries);
  }

  return toResult('linearity-verified', slope, intercept, correlation, levelRecoveries);
}

/** Deterministic, privacy-safe human-readable text for a reason code, suitable for UI display. */
export function explainLinearityReason(reasonCode: LinearityReasonCode): string {
  return REASON_MESSAGES[reasonCode];
}
