/**
 * Fail-closed synthetic OHWorks monthly quality indicators.
 *
 * This module is a pure, dependency-free evaluator: given fabricated
 * monthly event lists (specimens received, specimens rejected with a
 * reason, results reported with turnaround durations and a priority,
 * corrected reports, and critical values with an acknowledgement delay)
 * plus a set of declared targets, it computes four laboratory quality
 * indicators:
 *
 *   - rejection rate, broken down by reason code
 *   - turnaround compliance percentage, broken down by priority
 *   - corrected report rate
 *   - critical value acknowledgement compliance
 *
 * Every computed indicator carries its numerator, its denominator, the
 * resulting rate, and the declared target it is measured against, so a
 * caller never has to re-derive the arithmetic or guess which target
 * applied.
 *
 * It performs no I/O, reads no system clock, mutates no SENAITE or
 * database state, and touches no real specimen, patient, or customer
 * data -- every fixture is synthetic. Fail closed: an indicator with an
 * empty (zero) denominator reports `ratePercent: null`, never `0`, since
 * zero would falsely claim perfect or failing performance for a period
 * where nothing was measurable. Anything structurally unusable -- a
 * malformed event, an event referencing a reason code or priority with no
 * declared target, or a rejected/corrected event that does not reference
 * a specimen or result that was actually reported that month -- throws
 * QualityIndicatorInputError instead of guessing.
 */

export type SpecimenReceivedEvent = {
  /** Synthetic specimen identifier. Never a real specimen or patient identifier. */
  specimenId: string;
};

export type SpecimenRejectedEvent = {
  /** Must reference a specimenId present in the same period's specimensReceived list. */
  specimenId: string;
  /** Declared rejection reason code; must have a declared target in rejectionRatePercentByReason. */
  reasonCode: string;
};

export type ResultReportedEvent = {
  /** Synthetic result/report identifier. */
  resultId: string;
  /** Declared priority code; must have declared targets in both turnaround target dictionaries. */
  priority: string;
  /** Non-negative elapsed minutes from order to report. */
  turnaroundMinutes: number;
};

export type CorrectedReportEvent = {
  /** Must reference a resultId present in the same period's resultsReported list. */
  resultId: string;
};

export type CriticalValueEvent = {
  /** Synthetic critical value notification identifier. */
  criticalValueId: string;
  /** Elapsed minutes until acknowledgement, or null if never acknowledged this period. */
  acknowledgedAfterMinutes: number | null;
};

export type QualityIndicatorTargets = {
  /** Max acceptable rejection rate, percent (0-100), declared per rejection reason code. */
  rejectionRatePercentByReason: Record<string, number>;
  /** Turnaround duration, in minutes, a result must be at or under to count as compliant, declared per priority. */
  turnaroundTargetMinutesByPriority: Record<string, number>;
  /** Min acceptable turnaround compliance rate, percent (0-100), declared per priority. Must share the same keys as turnaroundTargetMinutesByPriority. */
  turnaroundCompliancePercentByPriority: Record<string, number>;
  /** Max acceptable corrected report rate, percent (0-100). */
  correctedReportRatePercent: number;
  /** Acknowledgement delay, in minutes, a critical value must be at or under to count as compliant. */
  criticalValueAckTargetMinutes: number;
  /** Min acceptable critical value acknowledgement compliance rate, percent (0-100). */
  criticalValueAckCompliancePercent: number;
};

export type MonthlyQualityIndicatorInput = {
  /** Free-text label for the period being measured, e.g. "2026-08". Not parsed or validated as a date. */
  period: string;
  specimensReceived: ReadonlyArray<SpecimenReceivedEvent>;
  specimensRejected: ReadonlyArray<SpecimenRejectedEvent>;
  resultsReported: ReadonlyArray<ResultReportedEvent>;
  correctedReports: ReadonlyArray<CorrectedReportEvent>;
  criticalValues: ReadonlyArray<CriticalValueEvent>;
  targets: QualityIndicatorTargets;
};

export type QualityIndicatorResult = {
  /** Count of qualifying events. */
  numerator: number;
  /** Count of eligible events. Zero means this indicator could not be measured this period. */
  denominator: number;
  /** numerator / denominator as a percent (0-100). Null, never 0, when denominator is 0. */
  ratePercent: number | null;
  /** The declared target percent for this indicator, echoed back unmodified. */
  targetPercent: number;
};

export type QualityIndicatorReport = {
  period: string;
  rejectionRateByReason: Record<string, QualityIndicatorResult>;
  turnaroundComplianceByPriority: Record<string, QualityIndicatorResult>;
  correctedReportRate: QualityIndicatorResult;
  criticalValueAckCompliance: QualityIndicatorResult;
};

export type QualityIndicatorInputErrorCode =
  | 'period-invalid'
  | 'specimens-received-not-array'
  | 'specimens-received-invalid'
  | 'specimens-rejected-not-array'
  | 'specimens-rejected-invalid'
  | 'specimens-rejected-unknown-specimen'
  | 'specimens-rejected-unknown-reason'
  | 'results-reported-not-array'
  | 'results-reported-invalid'
  | 'results-reported-unknown-priority'
  | 'corrected-reports-not-array'
  | 'corrected-reports-invalid'
  | 'corrected-reports-unknown-result'
  | 'critical-values-not-array'
  | 'critical-values-invalid'
  | 'targets-invalid'
  | 'targets-rejection-rate-invalid'
  | 'targets-turnaround-target-invalid'
  | 'targets-turnaround-compliance-invalid'
  | 'targets-turnaround-priority-mismatch'
  | 'targets-corrected-report-rate-invalid'
  | 'targets-critical-ack-target-invalid'
  | 'targets-critical-ack-compliance-invalid';

const INPUT_ERROR_MESSAGES: Record<QualityIndicatorInputErrorCode, string> = {
  'period-invalid': 'The period label is missing or empty.',
  'specimens-received-not-array': 'The specimens received list is not a list.',
  'specimens-received-invalid': 'A specimen received event is missing a specimenId.',
  'specimens-rejected-not-array': 'The specimens rejected list is not a list.',
  'specimens-rejected-invalid': 'A specimen rejected event is missing a specimenId or reasonCode.',
  'specimens-rejected-unknown-specimen': 'A rejected specimen does not reference a specimen received this period.',
  'specimens-rejected-unknown-reason': 'A rejected specimen declares a reason code with no declared target.',
  'results-reported-not-array': 'The results reported list is not a list.',
  'results-reported-invalid': 'A result reported event is missing a resultId, priority, or a valid turnaround duration.',
  'results-reported-unknown-priority': 'A reported result declares a priority with no declared turnaround target.',
  'corrected-reports-not-array': 'The corrected reports list is not a list.',
  'corrected-reports-invalid': 'A corrected report event is missing a resultId.',
  'corrected-reports-unknown-result': 'A corrected report does not reference a result reported this period.',
  'critical-values-not-array': 'The critical values list is not a list.',
  'critical-values-invalid': 'A critical value event is missing a criticalValueId or a valid acknowledgement delay.',
  'targets-invalid': 'The declared targets are missing or not structurally valid.',
  'targets-rejection-rate-invalid': 'The declared rejection rate targets are not valid percentages.',
  'targets-turnaround-target-invalid': 'The declared turnaround duration targets are not valid non-negative durations.',
  'targets-turnaround-compliance-invalid': 'The declared turnaround compliance targets are not valid percentages.',
  'targets-turnaround-priority-mismatch':
    'The declared turnaround duration targets and compliance targets do not share the same priorities.',
  'targets-corrected-report-rate-invalid': 'The declared corrected report rate target is not a valid percentage.',
  'targets-critical-ack-target-invalid': 'The declared critical value acknowledgement duration target is not a valid non-negative duration.',
  'targets-critical-ack-compliance-invalid': 'The declared critical value acknowledgement compliance target is not a valid percentage.',
};

/** Thrown for structurally unusable input that cannot be safely assigned an indicator value. */
export class QualityIndicatorInputError extends Error {
  readonly code: QualityIndicatorInputErrorCode;

  constructor(code: QualityIndicatorInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'QualityIndicatorInputError';
    this.code = code;
  }
}

function isPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function computeResult(numerator: number, denominator: number, targetPercent: number): QualityIndicatorResult {
  return Object.freeze({
    numerator,
    denominator,
    ratePercent: denominator > 0 ? (numerator / denominator) * 100 : null,
    targetPercent,
  });
}

function validateTargets(targets: unknown): QualityIndicatorTargets {
  if (typeof targets !== 'object' || targets === null) {
    throw new QualityIndicatorInputError('targets-invalid');
  }
  const candidate = targets as Record<string, unknown>;

  const rejectionRatePercentByReason = candidate.rejectionRatePercentByReason;
  if (typeof rejectionRatePercentByReason !== 'object' || rejectionRatePercentByReason === null) {
    throw new QualityIndicatorInputError('targets-rejection-rate-invalid');
  }
  for (const value of Object.values(rejectionRatePercentByReason as Record<string, unknown>)) {
    if (!isPercent(value)) {
      throw new QualityIndicatorInputError('targets-rejection-rate-invalid');
    }
  }

  const turnaroundTargetMinutesByPriority = candidate.turnaroundTargetMinutesByPriority;
  if (typeof turnaroundTargetMinutesByPriority !== 'object' || turnaroundTargetMinutesByPriority === null) {
    throw new QualityIndicatorInputError('targets-turnaround-target-invalid');
  }
  for (const value of Object.values(turnaroundTargetMinutesByPriority as Record<string, unknown>)) {
    if (!isNonNegativeFinite(value)) {
      throw new QualityIndicatorInputError('targets-turnaround-target-invalid');
    }
  }

  const turnaroundCompliancePercentByPriority = candidate.turnaroundCompliancePercentByPriority;
  if (typeof turnaroundCompliancePercentByPriority !== 'object' || turnaroundCompliancePercentByPriority === null) {
    throw new QualityIndicatorInputError('targets-turnaround-compliance-invalid');
  }
  for (const value of Object.values(turnaroundCompliancePercentByPriority as Record<string, unknown>)) {
    if (!isPercent(value)) {
      throw new QualityIndicatorInputError('targets-turnaround-compliance-invalid');
    }
  }

  const durationPriorities = new Set(Object.keys(turnaroundTargetMinutesByPriority as Record<string, unknown>));
  const compliancePriorities = new Set(Object.keys(turnaroundCompliancePercentByPriority as Record<string, unknown>));
  if (
    durationPriorities.size !== compliancePriorities.size ||
    [...durationPriorities].some((priority) => !compliancePriorities.has(priority))
  ) {
    throw new QualityIndicatorInputError('targets-turnaround-priority-mismatch');
  }

  if (!isPercent(candidate.correctedReportRatePercent)) {
    throw new QualityIndicatorInputError('targets-corrected-report-rate-invalid');
  }

  if (!isNonNegativeFinite(candidate.criticalValueAckTargetMinutes)) {
    throw new QualityIndicatorInputError('targets-critical-ack-target-invalid');
  }

  if (!isPercent(candidate.criticalValueAckCompliancePercent)) {
    throw new QualityIndicatorInputError('targets-critical-ack-compliance-invalid');
  }

  return targets as QualityIndicatorTargets;
}

function validateSpecimensReceived(events: unknown): ReadonlyArray<SpecimenReceivedEvent> {
  if (!Array.isArray(events)) {
    throw new QualityIndicatorInputError('specimens-received-not-array');
  }
  for (const event of events) {
    if (typeof event !== 'object' || event === null || !isNonEmptyString((event as Record<string, unknown>).specimenId)) {
      throw new QualityIndicatorInputError('specimens-received-invalid');
    }
  }
  return events as ReadonlyArray<SpecimenReceivedEvent>;
}

function validateSpecimensRejected(
  events: unknown,
  receivedIds: ReadonlySet<string>,
  declaredReasons: ReadonlySet<string>,
): ReadonlyArray<SpecimenRejectedEvent> {
  if (!Array.isArray(events)) {
    throw new QualityIndicatorInputError('specimens-rejected-not-array');
  }
  for (const event of events) {
    if (typeof event !== 'object' || event === null) {
      throw new QualityIndicatorInputError('specimens-rejected-invalid');
    }
    const candidate = event as Record<string, unknown>;
    if (!isNonEmptyString(candidate.specimenId) || !isNonEmptyString(candidate.reasonCode)) {
      throw new QualityIndicatorInputError('specimens-rejected-invalid');
    }
    if (!receivedIds.has(candidate.specimenId)) {
      throw new QualityIndicatorInputError('specimens-rejected-unknown-specimen');
    }
    if (!declaredReasons.has(candidate.reasonCode)) {
      throw new QualityIndicatorInputError('specimens-rejected-unknown-reason');
    }
  }
  return events as ReadonlyArray<SpecimenRejectedEvent>;
}

function validateResultsReported(
  events: unknown,
  declaredPriorities: ReadonlySet<string>,
): ReadonlyArray<ResultReportedEvent> {
  if (!Array.isArray(events)) {
    throw new QualityIndicatorInputError('results-reported-not-array');
  }
  for (const event of events) {
    if (typeof event !== 'object' || event === null) {
      throw new QualityIndicatorInputError('results-reported-invalid');
    }
    const candidate = event as Record<string, unknown>;
    if (
      !isNonEmptyString(candidate.resultId) ||
      !isNonEmptyString(candidate.priority) ||
      !isNonNegativeFinite(candidate.turnaroundMinutes)
    ) {
      throw new QualityIndicatorInputError('results-reported-invalid');
    }
    if (!declaredPriorities.has(candidate.priority)) {
      throw new QualityIndicatorInputError('results-reported-unknown-priority');
    }
  }
  return events as ReadonlyArray<ResultReportedEvent>;
}

function validateCorrectedReports(
  events: unknown,
  reportedResultIds: ReadonlySet<string>,
): ReadonlyArray<CorrectedReportEvent> {
  if (!Array.isArray(events)) {
    throw new QualityIndicatorInputError('corrected-reports-not-array');
  }
  for (const event of events) {
    if (typeof event !== 'object' || event === null || !isNonEmptyString((event as Record<string, unknown>).resultId)) {
      throw new QualityIndicatorInputError('corrected-reports-invalid');
    }
    const resultId = (event as Record<string, unknown>).resultId as string;
    if (!reportedResultIds.has(resultId)) {
      throw new QualityIndicatorInputError('corrected-reports-unknown-result');
    }
  }
  return events as ReadonlyArray<CorrectedReportEvent>;
}

function validateCriticalValues(events: unknown): ReadonlyArray<CriticalValueEvent> {
  if (!Array.isArray(events)) {
    throw new QualityIndicatorInputError('critical-values-not-array');
  }
  for (const event of events) {
    if (typeof event !== 'object' || event === null) {
      throw new QualityIndicatorInputError('critical-values-invalid');
    }
    const candidate = event as Record<string, unknown>;
    if (!isNonEmptyString(candidate.criticalValueId)) {
      throw new QualityIndicatorInputError('critical-values-invalid');
    }
    if (candidate.acknowledgedAfterMinutes !== null && !isNonNegativeFinite(candidate.acknowledgedAfterMinutes)) {
      throw new QualityIndicatorInputError('critical-values-invalid');
    }
  }
  return events as ReadonlyArray<CriticalValueEvent>;
}

/**
 * Compute the declared monthly OHWorks quality indicators from fabricated
 * event lists and declared targets, and return a complete report.
 *
 * Fail-closed: any indicator whose denominator is 0 reports
 * `ratePercent: null` rather than `0`. Any event that references a reason
 * code, priority, specimen, or result with no declared target or no
 * corresponding period event throws QualityIndicatorInputError rather than
 * silently dropping or misclassifying it.
 */
export function computeQualityIndicators(input: MonthlyQualityIndicatorInput): QualityIndicatorReport {
  if (typeof input !== 'object' || input === null) {
    throw new QualityIndicatorInputError('targets-invalid');
  }
  if (!isNonEmptyString(input.period)) {
    throw new QualityIndicatorInputError('period-invalid');
  }

  const targets = validateTargets(input.targets);

  const specimensReceived = validateSpecimensReceived(input.specimensReceived);
  const receivedIds = new Set(specimensReceived.map((event) => event.specimenId));

  const declaredReasons = new Set(Object.keys(targets.rejectionRatePercentByReason));
  const specimensRejected = validateSpecimensRejected(input.specimensRejected, receivedIds, declaredReasons);

  const declaredPriorities = new Set(Object.keys(targets.turnaroundTargetMinutesByPriority));
  const resultsReported = validateResultsReported(input.resultsReported, declaredPriorities);
  const reportedResultIds = new Set(resultsReported.map((event) => event.resultId));

  const correctedReports = validateCorrectedReports(input.correctedReports, reportedResultIds);
  const criticalValues = validateCriticalValues(input.criticalValues);

  const rejectionRateByReason: Record<string, QualityIndicatorResult> = {};
  for (const reasonCode of declaredReasons) {
    const numerator = specimensRejected.filter((event) => event.reasonCode === reasonCode).length;
    rejectionRateByReason[reasonCode] = computeResult(
      numerator,
      specimensReceived.length,
      targets.rejectionRatePercentByReason[reasonCode],
    );
  }

  const turnaroundComplianceByPriority: Record<string, QualityIndicatorResult> = {};
  for (const priority of declaredPriorities) {
    const resultsForPriority = resultsReported.filter((event) => event.priority === priority);
    const targetMinutes = targets.turnaroundTargetMinutesByPriority[priority];
    const numerator = resultsForPriority.filter((event) => event.turnaroundMinutes <= targetMinutes).length;
    turnaroundComplianceByPriority[priority] = computeResult(
      numerator,
      resultsForPriority.length,
      targets.turnaroundCompliancePercentByPriority[priority],
    );
  }

  const correctedResultIds = new Set(correctedReports.map((event) => event.resultId));
  const correctedReportRate = computeResult(
    correctedResultIds.size,
    resultsReported.length,
    targets.correctedReportRatePercent,
  );

  const acknowledgedWithinTarget = criticalValues.filter(
    (event) => event.acknowledgedAfterMinutes !== null && event.acknowledgedAfterMinutes <= targets.criticalValueAckTargetMinutes,
  ).length;
  const criticalValueAckCompliance = computeResult(
    acknowledgedWithinTarget,
    criticalValues.length,
    targets.criticalValueAckCompliancePercent,
  );

  return Object.freeze({
    period: input.period,
    rejectionRateByReason: Object.freeze(rejectionRateByReason),
    turnaroundComplianceByPriority: Object.freeze(turnaroundComplianceByPriority),
    correctedReportRate,
    criticalValueAckCompliance,
  });
}
