/**
 * Fail-closed synthetic proficiency test (PT) evaluation for OHWorks/SENAITE-
 * shaped analyte rounds.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated PT
 * round (a reported value, the PT provider's assigned/consensus value, and
 * an acceptance criterion expressed as either a fixed range or a percentage
 * of the assigned value) it computes the deviation and classifies the round
 * as 'acceptable', 'unacceptable', or 'not_evaluated'. It also tracks, per
 * analyte and in the order rounds are given, how many consecutive evaluated
 * rounds have been unacceptable, so a caller can flag when a method needs
 * suspension. It performs no I/O, touches no real instrument or customer
 * data, and never asserts accreditation, compliance, or regulatory outcomes.
 */

export type ProficiencyFixedRangeCriterion = {
  kind: 'fixed-range';
  lowerBound: number;
  upperBound: number;
  unit: string;
};

export type ProficiencyPercentageCriterion = {
  kind: 'percentage-of-assigned';
  /** Allowed deviation from the assigned value, as a percentage (e.g. 20 for an allowed range of assigned value ± 20%). */
  percentage: number;
  unit: string;
};

export type ProficiencyAcceptanceCriterion = ProficiencyFixedRangeCriterion | ProficiencyPercentageCriterion;

export type ProficiencyTestRound = {
  /** Synthetic round identifier; must be unique within a batch. */
  roundId: string;
  /** Fabricated analyte/parameter code. */
  analyteCode: string;
  reportedValue: number;
  reportedUnit: string;
  /** The PT provider's assigned/consensus value; undefined when not yet published. */
  assignedValue: number | undefined;
  assignedUnit: string;
  acceptanceCriterion: ProficiencyAcceptanceCriterion;
};

export type ProficiencyRoundClassification = 'acceptable' | 'unacceptable' | 'not_evaluated';

export type ProficiencyRoundReasonCode =
  | 'round-id-duplicate'
  | 'reported-value-non-finite'
  | 'assigned-value-missing'
  | 'assigned-value-non-finite'
  | 'unit-mismatch'
  | 'fixed-range-bound-non-finite'
  | 'fixed-range-inverted'
  | 'percentage-non-finite'
  | 'percentage-negative';

export type ProficiencyRoundReason = {
  code: ProficiencyRoundReasonCode;
};

export type ProficiencyRoundEvaluation = {
  roundId: string;
  analyteCode: string;
  classification: ProficiencyRoundClassification;
  /** Signed reportedValue - assignedValue, in the shared unit; undefined unless the round was evaluated. */
  deviation: number | undefined;
  /** deviation expressed as a percentage of the assigned value; undefined unless evaluated or the assigned value is zero. */
  percentDeviation: number | undefined;
  /** Deterministically sorted; empty unless classification is 'not_evaluated'. */
  reasons: ProficiencyRoundReason[];
};

export type ProficiencyAnalyteStatus = {
  analyteCode: string;
  /** Length of the current run of consecutive unacceptable evaluated rounds, in input order. */
  consecutiveUnacceptableRounds: number;
  needsSuspension: boolean;
};

export type ProficiencyTestBatchResult = {
  /** Same order as the input rounds. */
  roundEvaluations: ProficiencyRoundEvaluation[];
  /** Sorted by analyteCode. */
  analyteStatuses: ProficiencyAnalyteStatus[];
};

export type ProficiencyTestOptions = {
  /** Number of consecutive unacceptable evaluated rounds for an analyte that flags a needed suspension. Must be a positive integer. */
  consecutiveUnacceptableThresholdForSuspension: number;
};

export type ProficiencyTestInputErrorCode = 'rounds-not-array' | 'invalid-threshold' | 'round-missing-identity';

const INPUT_ERROR_MESSAGES: Record<ProficiencyTestInputErrorCode, string> = {
  'rounds-not-array': 'The proficiency test input batch is not a list of rounds.',
  'invalid-threshold': 'The consecutive-unacceptable suspension threshold must be a positive integer.',
  'round-missing-identity': 'A proficiency test round is missing a required identity field.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a per-round evaluation. */
export class ProficiencyTestInputError extends Error {
  readonly code: ProficiencyTestInputErrorCode;

  constructor(code: ProficiencyTestInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'ProficiencyTestInputError';
    this.code = code;
  }
}

function hasRequiredIdentity(round: unknown): round is ProficiencyTestRound {
  if (typeof round !== 'object' || round === null) {
    return false;
  }
  const candidate = round as Record<string, unknown>;
  const criterion = candidate.acceptanceCriterion as Record<string, unknown> | undefined;
  return (
    typeof candidate.roundId === 'string' &&
    candidate.roundId.length > 0 &&
    typeof candidate.analyteCode === 'string' &&
    candidate.analyteCode.length > 0 &&
    typeof candidate.reportedValue === 'number' &&
    typeof candidate.reportedUnit === 'string' &&
    (candidate.assignedValue === undefined || typeof candidate.assignedValue === 'number') &&
    typeof candidate.assignedUnit === 'string' &&
    typeof criterion === 'object' &&
    criterion !== null &&
    (criterion.kind === 'fixed-range' || criterion.kind === 'percentage-of-assigned')
  );
}

function toFiniteNumber(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

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

function compareReasons(a: ProficiencyRoundReason, b: ProficiencyRoundReason): number {
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

function evaluateSingleRound(round: ProficiencyTestRound, isDuplicate: boolean): ProficiencyRoundEvaluation {
  const reasons: ProficiencyRoundReason[] = [];
  const flag = (code: ProficiencyRoundReasonCode) => reasons.push({ code });

  if (isDuplicate) {
    flag('round-id-duplicate');
  }

  const reportedValue = toFiniteNumber(round.reportedValue);
  if (reportedValue === undefined) {
    flag('reported-value-non-finite');
  }

  let assignedValue: number | undefined;
  if (round.assignedValue === undefined) {
    flag('assigned-value-missing');
  } else {
    assignedValue = toFiniteNumber(round.assignedValue);
    if (assignedValue === undefined) {
      flag('assigned-value-non-finite');
    }
  }

  const reportedUnit = canonicalizeUnit(round.reportedUnit);
  const assignedUnit = canonicalizeUnit(round.assignedUnit);
  const criterionUnit = canonicalizeUnit(round.acceptanceCriterion?.unit);
  if (
    reportedUnit === undefined ||
    assignedUnit === undefined ||
    criterionUnit === undefined ||
    reportedUnit !== assignedUnit ||
    reportedUnit !== criterionUnit
  ) {
    flag('unit-mismatch');
  }

  let lowerBound: number | undefined;
  let upperBound: number | undefined;
  let percentage: number | undefined;
  const criterion = round.acceptanceCriterion;
  if (criterion?.kind === 'fixed-range') {
    lowerBound = toFiniteNumber(criterion.lowerBound);
    upperBound = toFiniteNumber(criterion.upperBound);
    if (lowerBound === undefined || upperBound === undefined) {
      flag('fixed-range-bound-non-finite');
    } else if (lowerBound > upperBound) {
      flag('fixed-range-inverted');
    }
  } else if (criterion?.kind === 'percentage-of-assigned') {
    percentage = toFiniteNumber(criterion.percentage);
    if (percentage === undefined) {
      flag('percentage-non-finite');
    } else if (percentage < 0) {
      flag('percentage-negative');
    }
  }

  reasons.sort(compareReasons);

  if (reasons.length > 0) {
    return { roundId: round.roundId, analyteCode: round.analyteCode, classification: 'not_evaluated', deviation: undefined, percentDeviation: undefined, reasons };
  }

  // Past this point every value used below is a validated finite number.
  const safeReported = reportedValue as number;
  const safeAssigned = assignedValue as number;
  const deviation = safeReported - safeAssigned;
  const percentDeviation = safeAssigned !== 0 ? (deviation / safeAssigned) * 100 : undefined;

  let safeLower: number;
  let safeUpper: number;
  if (criterion.kind === 'fixed-range') {
    safeLower = lowerBound as number;
    safeUpper = upperBound as number;
  } else {
    const safePercentage = percentage as number;
    const a = safeAssigned * (1 - safePercentage / 100);
    const b = safeAssigned * (1 + safePercentage / 100);
    safeLower = Math.min(a, b);
    safeUpper = Math.max(a, b);
  }

  const classification: ProficiencyRoundClassification =
    safeReported >= safeLower && safeReported <= safeUpper ? 'acceptable' : 'unacceptable';

  return {
    roundId: round.roundId,
    analyteCode: round.analyteCode,
    classification,
    deviation,
    percentDeviation,
    reasons: [],
  };
}

/**
 * Evaluate a batch of fabricated PT rounds, given in chronological order,
 * and return one deviation/classification per round plus a per-analyte
 * suspension status.
 *
 * Fail-closed: a missing or non-finite assigned value, a non-finite reported
 * value, a unit mismatch among the reported/assigned/criterion units, an
 * invalid fixed-range criterion (non-finite or inverted bounds), an invalid
 * percentage criterion (non-finite or negative), or a duplicate round
 * identifier all classify the affected round(s) as 'not_evaluated' rather
 * than being guessed at. 'not_evaluated' rounds are excluded from the
 * per-analyte consecutive-unacceptable streak (they neither extend nor
 * reset it), so bad data cannot be used to mask or manufacture a streak.
 * A structurally unusable batch or threshold throws ProficiencyTestInputError
 * instead of guessing at a per-round evaluation.
 */
export function evaluateProficiencyTestRounds(
  rounds: ReadonlyArray<ProficiencyTestRound>,
  options: ProficiencyTestOptions,
): ProficiencyTestBatchResult {
  if (!Array.isArray(rounds)) {
    throw new ProficiencyTestInputError('rounds-not-array');
  }

  const threshold = options?.consecutiveUnacceptableThresholdForSuspension;
  if (!Number.isFinite(threshold) || !Number.isInteger(threshold) || threshold < 1) {
    throw new ProficiencyTestInputError('invalid-threshold');
  }

  for (const round of rounds) {
    if (!hasRequiredIdentity(round)) {
      throw new ProficiencyTestInputError('round-missing-identity');
    }
  }

  const idCounts = new Map<string, number>();
  for (const round of rounds) {
    idCounts.set(round.roundId, (idCounts.get(round.roundId) ?? 0) + 1);
  }

  const roundEvaluations = rounds.map((round) =>
    evaluateSingleRound(round, (idCounts.get(round.roundId) ?? 0) > 1),
  );

  const streaks = new Map<string, number>();
  for (const evaluation of roundEvaluations) {
    if (evaluation.classification === 'unacceptable') {
      streaks.set(evaluation.analyteCode, (streaks.get(evaluation.analyteCode) ?? 0) + 1);
    } else if (evaluation.classification === 'acceptable') {
      streaks.set(evaluation.analyteCode, 0);
    }
  }

  const analyteCodes = [...new Set(rounds.map((round) => round.analyteCode))].sort();
  const analyteStatuses: ProficiencyAnalyteStatus[] = analyteCodes.map((analyteCode) => {
    const consecutiveUnacceptableRounds = streaks.get(analyteCode) ?? 0;
    return {
      analyteCode,
      consecutiveUnacceptableRounds,
      needsSuspension: consecutiveUnacceptableRounds >= threshold,
    };
  });

  return { roundEvaluations, analyteStatuses };
}
