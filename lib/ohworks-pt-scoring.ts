/**
 * Fail-closed, deterministic OHWorks proficiency-testing (PT) event scoring.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated set
 * of participant results for a single synthetic PT event, plus either a
 * provider-declared assigned value and acceptable range or a caller
 * instruction to fall back to robust statistics computed from the
 * participant pool itself, it computes each participant's z-score (also
 * called the standard deviation index, or SDI) and classifies each result
 * as `satisfactory`, `questionable`, or `unsatisfactory` using the standard
 * PT acceptance limits (|z| <= 2 satisfactory, 2 < |z| <= 3 questionable,
 * |z| > 3 unsatisfactory). It then rolls the individual classifications up
 * into a single event-level `pass` or `fail` outcome against
 * caller-declared thresholds, together with the specific reasons for any
 * failure.
 *
 * It performs no I/O, reads no system clock, mutates no SENAITE or database
 * state, and touches no real specimen, instrument, or customer data. It
 * never asserts approval, compliance, accreditation, or releasability --
 * only whether the fabricated participant results stayed within the
 * standard statistical acceptance limits for this event.
 *
 * Fail-closed: a missing consensus value combined with too few participant
 * results to compute robust statistics, a non-numeric reported result, a
 * declared acceptable range of zero width, or degenerate robust statistics
 * (zero spread) all throw PtScoringError rather than guessing at a score.
 * Structurally invalid declared consensus, results, or limits throw the
 * same way.
 */

/** Standard PT acceptance limit: |z| at or below this value is satisfactory. */
export const PT_SATISFACTORY_Z_LIMIT = 2;

/** Standard PT acceptance limit: |z| above PT_SATISFACTORY_Z_LIMIT and at or below this value is questionable; above it is unsatisfactory. */
export const PT_QUESTIONABLE_Z_LIMIT = 3;

/** Consistency constant converting a median absolute deviation into a robust standard deviation estimate for normally distributed data. */
export const ROBUST_SD_SCALE_FACTOR = 1.4826;

export type PtClassification = 'satisfactory' | 'questionable' | 'unsatisfactory';

export const PT_CLASSIFICATIONS: readonly PtClassification[] = Object.freeze([
  'satisfactory',
  'questionable',
  'unsatisfactory',
]);

const CLASSIFICATION_MESSAGES: Record<PtClassification, string> = {
  satisfactory: 'The magnitude of the z-score is at or below the standard satisfactory limit.',
  questionable: 'The magnitude of the z-score is above the satisfactory limit but at or below the questionable limit.',
  unsatisfactory: 'The magnitude of the z-score is above the standard questionable limit.',
};

/** Deterministic, privacy-safe human-readable text for a result classification. */
export function explainPtClassification(classification: PtClassification): string {
  return CLASSIFICATION_MESSAGES[classification];
}

/** Classify a single already-computed z-score (or SDI) using the standard PT acceptance limits. */
export function classifyPtZScore(zScore: number): PtClassification {
  const magnitude = Math.abs(zScore);
  if (magnitude <= PT_SATISFACTORY_Z_LIMIT) {
    return 'satisfactory';
  }
  if (magnitude <= PT_QUESTIONABLE_Z_LIMIT) {
    return 'questionable';
  }
  return 'unsatisfactory';
}

/** Fabricated reported result for a single synthetic PT participant. Never real patient or customer data. */
export type PtParticipantResult = {
  /** Synthetic participant (lab) identifier; must be unique within a single event. */
  participantId: string;
  /** Raw fabricated reported value, exactly as received; may be nonnumeric. */
  reportedValue: unknown;
};

/** A declared acceptable range around the assigned value, interpreted as the boundary between questionable and unsatisfactory (assignedValue +/- PT_QUESTIONABLE_Z_LIMIT standard deviations). */
export type PtAcceptableRange = {
  low: number;
  high: number;
};

/** Provider-declared consensus for this event. Pass `null` to instead fall back to robust statistics computed from the declared results. */
export type PtConsensus = {
  assignedValue: number;
  acceptableRange: PtAcceptableRange;
} | null;

export type PtEventLimits = {
  /** Minimum number of numeric results required to compute robust statistics when no consensus is declared. */
  minParticipantsForRobustStatistics: number;
  /** Minimum fraction (0-1 inclusive) of results that must be satisfactory for the event to pass. */
  minSatisfactoryRate: number;
  /** Maximum count of unsatisfactory results tolerated before the event fails regardless of the satisfactory rate. */
  maxUnsatisfactoryCount: number;
};

export type PtParticipantScore = {
  participantId: string;
  reportedValue: number;
  /** (reportedValue - assignedValue) / standardDeviation. Also known as the standard deviation index (SDI). */
  zScore: number;
  classification: PtClassification;
};

export type PtConsensusSource = 'declared' | 'robust-statistics';

export type PtEventFailReason = 'satisfactory-rate-below-minimum' | 'unsatisfactory-count-exceeded';

const FAIL_REASON_MESSAGES: Record<PtEventFailReason, string> = {
  'satisfactory-rate-below-minimum': 'The fraction of satisfactory results fell below the declared minimum satisfactory rate.',
  'unsatisfactory-count-exceeded': 'The count of unsatisfactory results exceeded the declared maximum.',
};

/** Deterministic, privacy-safe human-readable text for an event-level fail reason. */
export function explainPtEventFailReason(reason: PtEventFailReason): string {
  return FAIL_REASON_MESSAGES[reason];
}

export type PtEventOutcome = 'pass' | 'fail';

export type PtEventScoringResult = {
  assignedValue: number;
  standardDeviation: number;
  consensusSource: PtConsensusSource;
  participantScores: readonly PtParticipantScore[];
  satisfactoryCount: number;
  questionableCount: number;
  unsatisfactoryCount: number;
  satisfactoryRate: number;
  outcome: PtEventOutcome;
  failReasons: readonly PtEventFailReason[];
};

export type PtScoringErrorCode =
  | 'limits-malformed'
  | 'results-not-array'
  | 'results-empty'
  | 'result-malformed'
  | 'duplicate-participant-id'
  | 'reported-value-invalid'
  | 'consensus-malformed'
  | 'consensus-range-invalid'
  | 'consensus-range-zero-width'
  | 'consensus-missing-insufficient-participants'
  | 'robust-statistics-zero-spread';

const ERROR_MESSAGES: Record<PtScoringErrorCode, string> = {
  'limits-malformed': 'The declared event limits are not structurally valid.',
  'results-not-array': 'The declared participant results are not a list.',
  'results-empty': 'No participant results were declared for this event.',
  'result-malformed': 'A declared result is missing a required identity field.',
  'duplicate-participant-id': 'More than one result was declared for the same participant identifier.',
  'reported-value-invalid': 'A declared reported value is not a finite number.',
  'consensus-malformed': 'The declared consensus is not structurally valid.',
  'consensus-range-invalid': 'The declared acceptable range has a low bound above its high bound.',
  'consensus-range-zero-width': 'The declared acceptable range has zero width.',
  'consensus-missing-insufficient-participants':
    'No consensus was declared and there are too few numeric results to compute robust statistics.',
  'robust-statistics-zero-spread': 'No consensus was declared and the robust statistics computed from the results have zero spread.',
};

/** Deterministic, human-readable text for a fail-closed error code. */
export function explainPtScoringError(code: PtScoringErrorCode): string {
  return ERROR_MESSAGES[code];
}

/** Thrown for any input this evaluator cannot safely resolve to an event scoring result. */
export class PtScoringError extends Error {
  readonly code: PtScoringErrorCode;

  constructor(code: PtScoringErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'PtScoringError';
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

function isValidLimits(limits: unknown): limits is PtEventLimits {
  if (typeof limits !== 'object' || limits === null) {
    return false;
  }
  const candidate = limits as Record<string, unknown>;
  if (
    typeof candidate.minParticipantsForRobustStatistics !== 'number' ||
    !Number.isInteger(candidate.minParticipantsForRobustStatistics) ||
    candidate.minParticipantsForRobustStatistics < 1
  ) {
    return false;
  }
  if (
    typeof candidate.minSatisfactoryRate !== 'number' ||
    !Number.isFinite(candidate.minSatisfactoryRate) ||
    candidate.minSatisfactoryRate < 0 ||
    candidate.minSatisfactoryRate > 1
  ) {
    return false;
  }
  if (
    typeof candidate.maxUnsatisfactoryCount !== 'number' ||
    !Number.isInteger(candidate.maxUnsatisfactoryCount) ||
    candidate.maxUnsatisfactoryCount < 0
  ) {
    return false;
  }
  return true;
}

function hasRequiredResultShape(
  value: unknown,
): value is { participantId: string; reportedValue: unknown } & Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.participantId === 'string' && candidate.participantId.length > 0 && 'reportedValue' in candidate;
}

function isValidDeclaredConsensus(consensus: unknown): consensus is { assignedValue: number; acceptableRange: PtAcceptableRange } {
  if (typeof consensus !== 'object' || consensus === null) {
    return false;
  }
  const candidate = consensus as Record<string, unknown>;
  if (typeof candidate.assignedValue !== 'number' || !Number.isFinite(candidate.assignedValue)) {
    return false;
  }
  if (typeof candidate.acceptableRange !== 'object' || candidate.acceptableRange === null) {
    return false;
  }
  const range = candidate.acceptableRange as Record<string, unknown>;
  return (
    typeof range.low === 'number' && Number.isFinite(range.low) && typeof range.high === 'number' && Number.isFinite(range.high)
  );
}

/** Median of a non-empty array of finite numbers. Does not mutate the input. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }
  return sorted[midpoint];
}

/**
 * Score a fabricated set of PT participant results for a single event
 * against either a declared consensus or, when `consensus` is `null`, a
 * robust-statistics fallback (median assigned value, median-absolute-
 * -deviation-based standard deviation) computed from the declared results
 * themselves. Returns each participant's z-score (SDI) and classification,
 * plus an event-level pass/fail rollup against `limits`.
 *
 * Fail-closed: a declared result missing its identity field, a duplicate
 * participant identifier, a non-finite reported value, a structurally
 * invalid declared consensus, an acceptable range whose low bound exceeds
 * its high bound or has zero width, a `null` consensus with fewer numeric
 * results than `limits.minParticipantsForRobustStatistics`, or robust
 * statistics with zero spread all throw PtScoringError instead of
 * guessing at a score. Structurally invalid declared limits throw the
 * same way.
 */
export function evaluatePtEvent(
  results: ReadonlyArray<PtParticipantResult>,
  consensus: PtConsensus,
  limits: PtEventLimits,
): PtEventScoringResult {
  if (!isValidLimits(limits)) {
    throw new PtScoringError('limits-malformed');
  }
  if (!Array.isArray(results)) {
    throw new PtScoringError('results-not-array');
  }
  if (results.length === 0) {
    throw new PtScoringError('results-empty');
  }

  const seenParticipantIds = new Set<string>();
  const numericResults: Array<{ participantId: string; reportedValue: number }> = [];

  for (const result of results) {
    if (!hasRequiredResultShape(result)) {
      throw new PtScoringError('result-malformed');
    }
    if (seenParticipantIds.has(result.participantId)) {
      throw new PtScoringError('duplicate-participant-id');
    }
    seenParticipantIds.add(result.participantId);

    const reportedValue = toFiniteNumber(result.reportedValue);
    if (reportedValue === undefined) {
      throw new PtScoringError('reported-value-invalid');
    }
    numericResults.push({ participantId: result.participantId, reportedValue });
  }

  let assignedValue: number;
  let standardDeviation: number;
  let consensusSource: PtConsensusSource;

  if (consensus === null || consensus === undefined) {
    if (numericResults.length < limits.minParticipantsForRobustStatistics) {
      throw new PtScoringError('consensus-missing-insufficient-participants');
    }
    const values = numericResults.map((entry) => entry.reportedValue);
    assignedValue = median(values);
    const absoluteDeviations = values.map((value) => Math.abs(value - assignedValue));
    const medianAbsoluteDeviation = median(absoluteDeviations);
    standardDeviation = ROBUST_SD_SCALE_FACTOR * medianAbsoluteDeviation;
    if (standardDeviation === 0) {
      throw new PtScoringError('robust-statistics-zero-spread');
    }
    consensusSource = 'robust-statistics';
  } else {
    if (!isValidDeclaredConsensus(consensus)) {
      throw new PtScoringError('consensus-malformed');
    }
    const { low, high } = consensus.acceptableRange;
    if (low === high) {
      throw new PtScoringError('consensus-range-zero-width');
    }
    if (low > high) {
      throw new PtScoringError('consensus-range-invalid');
    }
    assignedValue = consensus.assignedValue;
    standardDeviation = (high - low) / (2 * PT_QUESTIONABLE_Z_LIMIT);
    consensusSource = 'declared';
  }

  const participantScores: PtParticipantScore[] = numericResults.map((entry) => {
    const zScore = (entry.reportedValue - assignedValue) / standardDeviation;
    const classification = classifyPtZScore(zScore);
    return Object.freeze({
      participantId: entry.participantId,
      reportedValue: entry.reportedValue,
      zScore,
      classification,
    });
  });

  let satisfactoryCount = 0;
  let questionableCount = 0;
  let unsatisfactoryCount = 0;
  for (const score of participantScores) {
    if (score.classification === 'satisfactory') {
      satisfactoryCount += 1;
    } else if (score.classification === 'questionable') {
      questionableCount += 1;
    } else {
      unsatisfactoryCount += 1;
    }
  }

  const satisfactoryRate = satisfactoryCount / participantScores.length;

  const failReasons: PtEventFailReason[] = [];
  if (satisfactoryRate < limits.minSatisfactoryRate) {
    failReasons.push('satisfactory-rate-below-minimum');
  }
  if (unsatisfactoryCount > limits.maxUnsatisfactoryCount) {
    failReasons.push('unsatisfactory-count-exceeded');
  }

  const outcome: PtEventOutcome = failReasons.length === 0 ? 'pass' : 'fail';

  return Object.freeze({
    assignedValue,
    standardDeviation,
    consensusSource,
    participantScores: Object.freeze(participantScores),
    satisfactoryCount,
    questionableCount,
    unsatisfactoryCount,
    satisfactoryRate,
    outcome,
    failReasons: Object.freeze(failReasons),
  });
}
