/**
 * Fail-closed, deterministic sample disposal/retention evaluator for the
 * synthetic OHWorks pilot.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated
 * specimen's report date, a caller-supplied analyte-class retention profile
 * (a bounded analyte class plus a retention period in milliseconds), a legal
 * hold flag, and a caller-supplied current timestamp, it returns exactly one
 * of three bounded statuses — `retain`, `eligible_for_disposal`, or `held` —
 * along with the retention end date and the rule code that governed the
 * decision.
 *
 * It never reads the clock itself: every timestamp used in the evaluation is
 * supplied by the caller, which keeps the result reproducible for a given
 * input. A legal hold always governs over an elapsed retention period: a
 * specimen under hold is reported `held` even past its retention end date.
 *
 * A separate disposal-record constructor turns an `eligible_for_disposal`
 * evaluation, plus a caller-supplied disposal method code and witness role,
 * into an immutable disposal record. It fails closed rather than emitting a
 * record when the specimen is under legal hold, when its retention period
 * has not yet elapsed, or when the method code or witness role is not on the
 * declared bounded list.
 *
 * An unknown analyte class, an invalid retention period, a missing or
 * unparsable report date or current timestamp, a current timestamp that
 * precedes the report date (non-monotonic), a missing specimen identifier, or
 * a disposal attempt that is under legal hold or premature all fail closed by
 * throwing SampleRetentionError rather than guessing at a decision.
 */

/** The only external statuses this evaluator ever emits. */
export type SampleRetentionStatus = 'retain' | 'eligible_for_disposal' | 'held';

/** Bounded analyte classes this module knows how to evaluate retention for. */
export type SampleAnalyteClass =
  | 'CLINICAL_CHEMISTRY'
  | 'HEMATOLOGY'
  | 'MICROBIOLOGY'
  | 'TOXICOLOGY'
  | 'MOLECULAR_DIAGNOSTICS'
  | 'ENVIRONMENTAL';

const KNOWN_ANALYTE_CLASSES: ReadonlySet<string> = new Set<SampleAnalyteClass>([
  'CLINICAL_CHEMISTRY',
  'HEMATOLOGY',
  'MICROBIOLOGY',
  'TOXICOLOGY',
  'MOLECULAR_DIAGNOSTICS',
  'ENVIRONMENTAL',
]);

/** Fabricated analyte-class retention profile. Never derived from a real retention schedule. */
export type SampleRetentionProfile = {
  /** Raw analyte class; may be unrecognized. */
  analyteClass: string;
  /** Retention period, in milliseconds, measured from the report date. */
  retentionPeriodMs: number;
  /** Whether a legal hold is currently in force for this specimen. Governs over an elapsed retention period. */
  legalHold: boolean;
};

export type SampleRetentionRuleCode =
  | 'legal-hold-active'
  | 'retention-period-not-elapsed'
  | 'retention-period-elapsed';

export type SampleRetentionEvaluation =
  | {
      status: 'held';
      ruleCode: 'legal-hold-active';
      retentionEndDate: string;
      elapsedMs: number;
    }
  | {
      status: 'retain';
      ruleCode: 'retention-period-not-elapsed';
      retentionEndDate: string;
      elapsedMs: number;
      remainingMs: number;
    }
  | {
      status: 'eligible_for_disposal';
      ruleCode: 'retention-period-elapsed';
      retentionEndDate: string;
      elapsedMs: number;
      overdueMs: number;
    };

/** Declared, bounded list of sample disposal method codes. No other value may be recorded. */
export const SAMPLE_DISPOSAL_METHOD_CODES = [
  'INCINERATION',
  'AUTOCLAVE',
  'CHEMICAL_NEUTRALIZATION',
  'RETURN_TO_SUBMITTER',
  'SANITARY_SEWER',
] as const;

export type SampleDisposalMethodCode = (typeof SAMPLE_DISPOSAL_METHOD_CODES)[number];

const KNOWN_DISPOSAL_METHOD_CODES: ReadonlySet<string> = new Set<string>(SAMPLE_DISPOSAL_METHOD_CODES);

/** Declared, bounded list of witness roles eligible to witness a sample disposal. No other value may be recorded. */
export const SAMPLE_DISPOSAL_WITNESS_ROLES = [
  'LAB_SUPERVISOR',
  'QUALITY_ASSURANCE_OFFICER',
  'SAFETY_OFFICER',
  'SECOND_ANALYST',
] as const;

export type SampleDisposalWitnessRole = (typeof SAMPLE_DISPOSAL_WITNESS_ROLES)[number];

const KNOWN_WITNESS_ROLES: ReadonlySet<string> = new Set<string>(SAMPLE_DISPOSAL_WITNESS_ROLES);

/** Caller-supplied request to record a sample disposal. */
export type SampleDisposalRequest = {
  /** Fabricated specimen identifier. Never a real specimen or customer identifier. */
  specimenId: string;
  /** Raw disposal method code; must be one of SAMPLE_DISPOSAL_METHOD_CODES. */
  methodCode: string;
  /** Raw witness role; must be one of SAMPLE_DISPOSAL_WITNESS_ROLES. */
  witnessRole: string;
};

/** Immutable record of a completed sample disposal, produced only for a specimen eligible for disposal. */
export type SampleDisposalRecord = {
  readonly specimenId: string;
  readonly methodCode: SampleDisposalMethodCode;
  readonly witnessRole: SampleDisposalWitnessRole;
  readonly disposalTimestamp: string;
  readonly retentionEndDate: string;
  readonly governingRuleCode: SampleRetentionRuleCode;
};

export type SampleRetentionErrorCode =
  | 'analyte-class-unknown'
  | 'retention-period-invalid'
  | 'report-date-missing'
  | 'report-date-invalid'
  | 'current-timestamp-missing'
  | 'current-timestamp-invalid'
  | 'current-timestamp-precedes-report-date'
  | 'specimen-id-missing'
  | 'disposal-under-legal-hold'
  | 'disposal-before-retention-elapsed'
  | 'disposal-method-unknown'
  | 'witness-role-unknown';

const ERROR_MESSAGES: Record<SampleRetentionErrorCode, string> = {
  'analyte-class-unknown': 'The analyte class is not a recognized bounded value.',
  'retention-period-invalid': 'The retention period must be a finite number of milliseconds greater than zero.',
  'report-date-missing': 'The specimen report date is missing.',
  'report-date-invalid': 'The specimen report date could not be parsed as a UTC timestamp.',
  'current-timestamp-missing': 'The current timestamp is missing.',
  'current-timestamp-invalid': 'The current timestamp could not be parsed as a UTC timestamp.',
  'current-timestamp-precedes-report-date': 'The current timestamp precedes the specimen report date.',
  'specimen-id-missing': 'The specimen identifier is missing.',
  'disposal-under-legal-hold': 'The specimen is under legal hold and may not be disposed of.',
  'disposal-before-retention-elapsed': 'The specimen retention period has not yet elapsed; disposal is not permitted.',
  'disposal-method-unknown': 'The disposal method code is not on the declared bounded list.',
  'witness-role-unknown': 'The witness role is not on the declared bounded list.',
};

/** Deterministic, human-readable text for a fail-closed error code. */
export function explainSampleRetentionError(code: SampleRetentionErrorCode): string {
  return ERROR_MESSAGES[code];
}

/** Thrown for any input this evaluator cannot safely resolve to a retention decision or disposal record. */
export class SampleRetentionError extends Error {
  readonly code: SampleRetentionErrorCode;

  constructor(code: SampleRetentionErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'SampleRetentionError';
    this.code = code;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isUtcTimestamp(value: string): boolean {
  return value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

/**
 * Evaluate whether a fabricated specimen must be retained, is eligible for
 * disposal, or is held under legal hold, as of a caller-supplied current
 * timestamp.
 *
 * A legal hold always governs, even past the retention end date: it is the
 * only condition that can move a specimen to `held`.
 *
 * Fail-closed: an unrecognized analyte class, an invalid retention period, a
 * missing or unparsable report date or current timestamp, or a current
 * timestamp that precedes the report date all throw SampleRetentionError
 * instead of guessing at a status.
 */
export function evaluateSampleRetention(
  profile: SampleRetentionProfile,
  reportDate: string,
  currentTimestamp: string,
): SampleRetentionEvaluation {
  if (!KNOWN_ANALYTE_CLASSES.has(profile.analyteClass)) {
    throw new SampleRetentionError('analyte-class-unknown');
  }

  if (!Number.isFinite(profile.retentionPeriodMs) || profile.retentionPeriodMs <= 0) {
    throw new SampleRetentionError('retention-period-invalid');
  }

  if (reportDate === undefined || reportDate === null || reportDate === '') {
    throw new SampleRetentionError('report-date-missing');
  }
  if (!isUtcTimestamp(reportDate)) {
    throw new SampleRetentionError('report-date-invalid');
  }

  if (currentTimestamp === undefined || currentTimestamp === null || currentTimestamp === '') {
    throw new SampleRetentionError('current-timestamp-missing');
  }
  if (!isUtcTimestamp(currentTimestamp)) {
    throw new SampleRetentionError('current-timestamp-invalid');
  }

  const reportTime = Date.parse(reportDate);
  const currentTime = Date.parse(currentTimestamp);

  if (currentTime < reportTime) {
    throw new SampleRetentionError('current-timestamp-precedes-report-date');
  }

  const { retentionPeriodMs } = profile;
  const retentionEndTime = reportTime + retentionPeriodMs;
  const retentionEndDate = new Date(retentionEndTime).toISOString();
  const elapsedMs = currentTime - reportTime;

  if (profile.legalHold) {
    return {
      status: 'held',
      ruleCode: 'legal-hold-active',
      retentionEndDate,
      elapsedMs,
    };
  }

  if (currentTime >= retentionEndTime) {
    return {
      status: 'eligible_for_disposal',
      ruleCode: 'retention-period-elapsed',
      retentionEndDate,
      elapsedMs,
      overdueMs: currentTime - retentionEndTime,
    };
  }

  return {
    status: 'retain',
    ruleCode: 'retention-period-not-elapsed',
    retentionEndDate,
    elapsedMs,
    remainingMs: retentionEndTime - currentTime,
  };
}

/**
 * Construct an immutable disposal record for a fabricated specimen, as of a
 * caller-supplied disposal timestamp.
 *
 * Fail-closed: this throws SampleRetentionError instead of producing a
 * record when the underlying retention evaluation would throw, when the
 * specimen is under legal hold, when its retention period has not yet
 * elapsed, when the specimen identifier is missing, or when the disposal
 * method code or witness role is not on its declared bounded list.
 */
export function createSampleDisposalRecord(
  profile: SampleRetentionProfile,
  reportDate: string,
  disposalTimestamp: string,
  request: SampleDisposalRequest,
): SampleDisposalRecord {
  const evaluation = evaluateSampleRetention(profile, reportDate, disposalTimestamp);

  if (evaluation.status === 'held') {
    throw new SampleRetentionError('disposal-under-legal-hold');
  }

  if (evaluation.status !== 'eligible_for_disposal') {
    throw new SampleRetentionError('disposal-before-retention-elapsed');
  }

  if (!isNonEmptyString(request.specimenId)) {
    throw new SampleRetentionError('specimen-id-missing');
  }

  if (!KNOWN_DISPOSAL_METHOD_CODES.has(request.methodCode)) {
    throw new SampleRetentionError('disposal-method-unknown');
  }

  if (!KNOWN_WITNESS_ROLES.has(request.witnessRole)) {
    throw new SampleRetentionError('witness-role-unknown');
  }

  return {
    specimenId: request.specimenId,
    methodCode: request.methodCode as SampleDisposalMethodCode,
    witnessRole: request.witnessRole as SampleDisposalWitnessRole,
    disposalTimestamp,
    retentionEndDate: evaluation.retentionEndDate,
    governingRuleCode: evaluation.ruleCode,
  };
}
