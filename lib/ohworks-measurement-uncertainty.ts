/**
 * Deterministic, synthetic OHWorks measurement uncertainty evaluation.
 *
 * This module is a pure, dependency-free function over a caller-supplied set
 * of QC results at a single level. It performs no I/O, reads no system
 * clock, and touches no real instrument, sample, or customer data.
 *
 * Given at least the declared minimum number of QC points at a level, it
 * computes the mean, sample standard deviation, coefficient of variation,
 * and an expanded uncertainty using a declared coverage factor. It then
 * expresses a fabricated patient result as an uncertainty interval around
 * that result and flags whether the interval crosses a declared decision
 * limit.
 *
 * Every evaluation resolves to one of two decisions:
 *
 *   evaluated - the QC series and patient/decision-limit values are all
 *               well-formed, finite, and unit-consistent, so statistics and
 *               an uncertainty interval were computed.
 *   blocked   - the input cannot be trusted: fewer QC points than the
 *               declared minimum, a non-finite QC/patient/decision-limit
 *               value (or a non-finite derived statistic), or a unit
 *               mismatch among the QC points, patient result, and decision
 *               limit.
 *
 * Structurally unusable input (wrong shapes, missing fields, an invalid
 * declared minimum point count, or an invalid declared coverage factor)
 * throws MeasurementUncertaintyInputError instead of guessing at a reason
 * code.
 */

export type QCUncertaintyPoint = {
  value: number;
  unit: string;
};

export type QCUncertaintyLevelInput = {
  levelId: string;
  /** Declared unit every QC point, the patient result, and the decision limit must match. */
  unit: string;
  /** Declared minimum number of QC points required to trust the series. */
  minimumPointCount: number;
  /** Declared coverage factor (k) applied to the standard uncertainty, e.g. 2 for ~95%. */
  coverageFactor: number;
  points: QCUncertaintyPoint[];
};

export type PatientResultInput = {
  value: number;
  unit: string;
};

export type DecisionLimitInput = {
  value: number;
  unit: string;
};

export type MeasurementUncertaintyDecision = 'evaluated' | 'blocked';

/** Bounded, privacy-safe codes naming the rule behind an uncertainty decision. */
export type MeasurementUncertaintyReasonCode =
  | 'insufficient-qc-points'
  | 'non-finite-value'
  | 'unit-mismatch'
  | 'uncertainty-evaluated';

export type QCUncertaintyStatistics = {
  pointCount: number;
  mean: number;
  standardDeviation: number;
  coefficientOfVariationPercent: number;
  coverageFactor: number;
  expandedUncertainty: number;
};

export type PatientUncertaintyInterval = {
  value: number;
  unit: string;
  lowerBound: number;
  upperBound: number;
};

export type DecisionLimitCrossing = {
  value: number;
  unit: string;
  crossesInterval: boolean;
};

export type MeasurementUncertaintyResult = {
  decision: MeasurementUncertaintyDecision;
  reasonCode: MeasurementUncertaintyReasonCode;
  /** Deterministic, privacy-safe human-readable explanation of reasonCode. */
  reason: string;
  statistics: QCUncertaintyStatistics | null;
  patientInterval: PatientUncertaintyInterval | null;
  decisionLimitCrossing: DecisionLimitCrossing | null;
};

const REASON_DECISIONS: Record<MeasurementUncertaintyReasonCode, MeasurementUncertaintyDecision> = {
  'insufficient-qc-points': 'blocked',
  'non-finite-value': 'blocked',
  'unit-mismatch': 'blocked',
  'uncertainty-evaluated': 'evaluated',
};

const REASON_MESSAGES: Record<MeasurementUncertaintyReasonCode, string> = {
  'insufficient-qc-points': 'Fewer QC points were supplied than the declared minimum for this level.',
  'non-finite-value': 'A supplied or derived value is not a finite number.',
  'unit-mismatch': 'The QC points, patient result, and decision limit do not all share the same unit.',
  'uncertainty-evaluated':
    'The QC series meets the declared minimum point count, every value is finite, and all units agree.',
};

/** Deterministic, privacy-safe human-readable text for a reason code, suitable for UI display. */
export function explainMeasurementUncertaintyReason(reasonCode: MeasurementUncertaintyReasonCode): string {
  return REASON_MESSAGES[reasonCode];
}

export type MeasurementUncertaintyInputErrorCode =
  | 'level-malformed'
  | 'qc-point-malformed'
  | 'patient-result-malformed'
  | 'decision-limit-malformed';

const INPUT_ERROR_MESSAGES: Record<MeasurementUncertaintyInputErrorCode, string> = {
  'level-malformed':
    'The supplied QC level is missing a required field, has the wrong shape, or an invalid declared minimum point count or coverage factor.',
  'qc-point-malformed': 'A QC point entry is missing a required field or has the wrong shape.',
  'patient-result-malformed': 'The supplied patient result is missing a required field or has the wrong shape.',
  'decision-limit-malformed': 'The supplied decision limit is missing a required field or has the wrong shape.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a reason code. */
export class MeasurementUncertaintyInputError extends Error {
  readonly code: MeasurementUncertaintyInputErrorCode;

  constructor(code: MeasurementUncertaintyInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'MeasurementUncertaintyInputError';
    this.code = code;
  }
}

/**
 * Absolute tolerance applied only at the decision-limit boundary, to absorb
 * IEEE-754 double-precision rounding noise in derived interval bounds
 * rather than any scientific or measurement tolerance.
 */
const BOUNDARY_EPSILON = 1e-9;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Canonicalize a unit for comparison purposes only: trim outer whitespace
 * and case-fold. Never infers or performs a unit conversion, so "mg/L" and
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

function isStructurallyValidPoint(raw: unknown): raw is QCUncertaintyPoint {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return typeof candidate.value === 'number' && typeof candidate.unit === 'string';
}

function isStructurallyValidLevel(raw: unknown): raw is QCUncertaintyLevelInput {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.levelId) &&
    typeof candidate.unit === 'string' &&
    isFiniteNumber(candidate.minimumPointCount) &&
    Number.isInteger(candidate.minimumPointCount) &&
    candidate.minimumPointCount >= 2 &&
    isFiniteNumber(candidate.coverageFactor) &&
    candidate.coverageFactor > 0 &&
    Array.isArray(candidate.points)
  );
}

function isStructurallyValidResultLike(raw: unknown): raw is { value: number; unit: string } {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return typeof candidate.value === 'number' && typeof candidate.unit === 'string';
}

function toResult(
  reasonCode: MeasurementUncertaintyReasonCode,
  statistics: QCUncertaintyStatistics | null,
  patientInterval: PatientUncertaintyInterval | null,
  decisionLimitCrossing: DecisionLimitCrossing | null,
): MeasurementUncertaintyResult {
  return Object.freeze({
    decision: REASON_DECISIONS[reasonCode],
    reasonCode,
    reason: REASON_MESSAGES[reasonCode],
    statistics: statistics ? Object.freeze({ ...statistics }) : null,
    patientInterval: patientInterval ? Object.freeze({ ...patientInterval }) : null,
    decisionLimitCrossing: decisionLimitCrossing ? Object.freeze({ ...decisionLimitCrossing }) : null,
  });
}

function blocked(reasonCode: MeasurementUncertaintyReasonCode): MeasurementUncertaintyResult {
  return toResult(reasonCode, null, null, null);
}

/**
 * Evaluate a fabricated QC series at a level, expressing a fabricated
 * patient result as an uncertainty interval and flagging whether that
 * interval crosses a declared decision limit.
 *
 * Fail-closed: fewer QC points than the declared minimum, any non-finite
 * QC/patient/decision-limit value (or non-finite derived statistic), or a
 * unit mismatch among the QC points, patient result, and decision limit all
 * resolve to `blocked`. Only a fully well-formed, unit-consistent, finite
 * series resolves to `evaluated`.
 *
 * Structurally unusable input (a malformed level, QC point, patient result,
 * or decision limit) throws MeasurementUncertaintyInputError instead of
 * guessing at a reason code.
 */
export function evaluateMeasurementUncertainty(
  level: QCUncertaintyLevelInput,
  patientResult: PatientResultInput,
  decisionLimit: DecisionLimitInput,
): MeasurementUncertaintyResult {
  if (!isStructurallyValidLevel(level)) {
    throw new MeasurementUncertaintyInputError('level-malformed');
  }
  for (const point of level.points) {
    if (!isStructurallyValidPoint(point)) {
      throw new MeasurementUncertaintyInputError('qc-point-malformed');
    }
  }
  if (!isStructurallyValidResultLike(patientResult)) {
    throw new MeasurementUncertaintyInputError('patient-result-malformed');
  }
  if (!isStructurallyValidResultLike(decisionLimit)) {
    throw new MeasurementUncertaintyInputError('decision-limit-malformed');
  }

  if (level.points.length < level.minimumPointCount) {
    return blocked('insufficient-qc-points');
  }

  const levelUnit = canonicalizeUnit(level.unit);
  const patientUnit = canonicalizeUnit(patientResult.unit);
  const decisionLimitUnit = canonicalizeUnit(decisionLimit.unit);
  const pointUnits = level.points.map((point) => canonicalizeUnit(point.unit));

  if (
    levelUnit === undefined ||
    patientUnit === undefined ||
    decisionLimitUnit === undefined ||
    pointUnits.some((unit) => unit === undefined) ||
    patientUnit !== levelUnit ||
    decisionLimitUnit !== levelUnit ||
    pointUnits.some((unit) => unit !== levelUnit)
  ) {
    return blocked('unit-mismatch');
  }

  if (
    level.points.some((point) => !isFiniteNumber(point.value)) ||
    !isFiniteNumber(patientResult.value) ||
    !isFiniteNumber(decisionLimit.value)
  ) {
    return blocked('non-finite-value');
  }

  const n = level.points.length;
  const mean = level.points.reduce((sum, point) => sum + point.value, 0) / n;
  const sumSquaredDeviations = level.points.reduce((sum, point) => sum + (point.value - mean) ** 2, 0);
  const standardDeviation = Math.sqrt(sumSquaredDeviations / (n - 1));
  const coefficientOfVariationPercent = (standardDeviation / mean) * 100;
  const expandedUncertainty = level.coverageFactor * standardDeviation;

  if (
    !isFiniteNumber(mean) ||
    !isFiniteNumber(standardDeviation) ||
    !isFiniteNumber(coefficientOfVariationPercent) ||
    !isFiniteNumber(expandedUncertainty)
  ) {
    return blocked('non-finite-value');
  }

  const lowerBound = patientResult.value - expandedUncertainty;
  const upperBound = patientResult.value + expandedUncertainty;

  if (!isFiniteNumber(lowerBound) || !isFiniteNumber(upperBound)) {
    return blocked('non-finite-value');
  }

  const statistics: QCUncertaintyStatistics = {
    pointCount: n,
    mean,
    standardDeviation,
    coefficientOfVariationPercent,
    coverageFactor: level.coverageFactor,
    expandedUncertainty,
  };

  const patientInterval: PatientUncertaintyInterval = {
    value: patientResult.value,
    unit: patientResult.unit,
    lowerBound,
    upperBound,
  };

  const decisionLimitCrossing: DecisionLimitCrossing = {
    value: decisionLimit.value,
    unit: decisionLimit.unit,
    crossesInterval:
      decisionLimit.value >= lowerBound - BOUNDARY_EPSILON && decisionLimit.value <= upperBound + BOUNDARY_EPSILON,
  };

  return toResult('uncertainty-evaluated', statistics, patientInterval, decisionLimitCrossing);
}
