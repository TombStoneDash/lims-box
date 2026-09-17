/**
 * Fail-closed, deterministic laboratory *record* retention evaluator for the
 * synthetic OHWorks pilot.
 *
 * This is distinct from specimen/sample retention (see
 * ohworks-sample-retention.ts): it governs paper/electronic laboratory
 * records — QC logs, instrument maintenance logs, personnel competency
 * records, reports, and audit trails — not physical specimens.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated
 * record's declared class, a caller-supplied retention period, a litigation
 * hold flag, the record's creation date, and a caller-supplied current
 * timestamp, it returns exactly one of three bounded statuses — `retain`,
 * `eligible_for_purge`, or `held` — along with the retention end date and
 * the rule code that governed the decision.
 *
 * It never reads the clock itself: every timestamp used in the evaluation is
 * supplied by the caller, which keeps the result reproducible for a given
 * input. A litigation hold always governs over an elapsed retention period:
 * a record under hold is reported `held` even past its retention end date.
 *
 * A separate purge-manifest constructor turns a batch of caller-supplied
 * purge attempts (each a record identifier plus its retention profile and
 * creation date) into an immutable manifest that lists only record
 * identifiers — no record class, dates, or other content. It fails closed
 * for the entire batch rather than silently omitting a record when any
 * requested record is under litigation hold or has not yet reached its
 * retention end date.
 *
 * An unknown record class, an invalid retention period, a missing or
 * unparsable creation date or current/purge timestamp, a current timestamp
 * that precedes the creation date (non-monotonic), a missing record
 * identifier, or a purge attempt that is under litigation hold or premature
 * all fail closed by throwing RecordRetentionError rather than guessing at a
 * decision.
 */

/** The only external statuses this evaluator ever emits. */
export type RecordRetentionStatus = 'retain' | 'eligible_for_purge' | 'held';

/** Bounded laboratory record classes this module knows how to evaluate retention for. */
export type LabRecordClass =
  | 'QC_LOG'
  | 'INSTRUMENT_MAINTENANCE'
  | 'PERSONNEL_COMPETENCY'
  | 'REPORT'
  | 'AUDIT_TRAIL';

const KNOWN_RECORD_CLASSES: ReadonlySet<string> = new Set<LabRecordClass>([
  'QC_LOG',
  'INSTRUMENT_MAINTENANCE',
  'PERSONNEL_COMPETENCY',
  'REPORT',
  'AUDIT_TRAIL',
]);

/** Fabricated record-class retention profile. Never derived from a real retention schedule. */
export type RecordRetentionProfile = {
  /** Raw record class; may be unrecognized. */
  recordClass: string;
  /** Retention period, in milliseconds, measured from the record's creation date. */
  retentionPeriodMs: number;
  /** Whether a litigation hold is currently in force for this record. Governs over an elapsed retention period. */
  litigationHold: boolean;
};

export type RecordRetentionRuleCode =
  | 'litigation-hold-active'
  | 'retention-period-not-elapsed'
  | 'retention-period-elapsed';

export type RecordRetentionEvaluation =
  | {
      status: 'held';
      ruleCode: 'litigation-hold-active';
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
      status: 'eligible_for_purge';
      ruleCode: 'retention-period-elapsed';
      retentionEndDate: string;
      elapsedMs: number;
      overdueMs: number;
    };

/** Caller-supplied request to purge one fabricated record as part of a batch purge manifest. */
export type RecordPurgeEntry = {
  /** Fabricated record identifier. Never a real record, patient, or customer identifier. */
  recordId: string;
  /** Retention profile governing this record. */
  profile: RecordRetentionProfile;
  /** The record's creation date. */
  creationDate: string;
};

/**
 * Immutable purge manifest. Lists only record identifiers — never record
 * class, creation date, or any other record content — produced only once
 * every entry in the batch is confirmed eligible for purge.
 */
export type RecordPurgeManifest = {
  readonly purgeTimestamp: string;
  readonly recordIds: readonly string[];
};

export type RecordRetentionErrorCode =
  | 'record-class-unknown'
  | 'retention-period-invalid'
  | 'creation-date-missing'
  | 'creation-date-invalid'
  | 'current-timestamp-missing'
  | 'current-timestamp-invalid'
  | 'current-timestamp-precedes-creation-date'
  | 'record-id-missing'
  | 'purge-under-litigation-hold'
  | 'purge-before-retention-elapsed'
  | 'purge-timestamp-missing'
  | 'purge-timestamp-invalid';

const ERROR_MESSAGES: Record<RecordRetentionErrorCode, string> = {
  'record-class-unknown': 'The record class is not a recognized bounded value.',
  'retention-period-invalid': 'The retention period must be a finite number of milliseconds greater than zero.',
  'creation-date-missing': 'The record creation date is missing.',
  'creation-date-invalid': 'The record creation date could not be parsed as a UTC timestamp.',
  'current-timestamp-missing': 'The current timestamp is missing.',
  'current-timestamp-invalid': 'The current timestamp could not be parsed as a UTC timestamp.',
  'current-timestamp-precedes-creation-date': 'The current timestamp precedes the record creation date.',
  'record-id-missing': 'The record identifier is missing.',
  'purge-under-litigation-hold': 'The record is under litigation hold and may not be purged.',
  'purge-before-retention-elapsed': 'The record retention period has not yet elapsed; purge is not permitted.',
  'purge-timestamp-missing': 'The purge timestamp is missing.',
  'purge-timestamp-invalid': 'The purge timestamp could not be parsed as a UTC timestamp.',
};

/** Deterministic, human-readable text for a fail-closed error code. */
export function explainRecordRetentionError(code: RecordRetentionErrorCode): string {
  return ERROR_MESSAGES[code];
}

/** Thrown for any input this evaluator cannot safely resolve to a retention decision or purge manifest. */
export class RecordRetentionError extends Error {
  readonly code: RecordRetentionErrorCode;

  constructor(code: RecordRetentionErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'RecordRetentionError';
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
 * Evaluate whether a fabricated laboratory record must be retained, is
 * eligible for purge, or is held under litigation hold, as of a
 * caller-supplied current timestamp.
 *
 * A litigation hold always governs, even past the retention end date: it is
 * the only condition that can move a record to `held`.
 *
 * Fail-closed: an unrecognized record class, an invalid retention period, a
 * missing or unparsable creation date or current timestamp, or a current
 * timestamp that precedes the creation date all throw RecordRetentionError
 * instead of guessing at a status.
 */
export function evaluateRecordRetention(
  profile: RecordRetentionProfile,
  creationDate: string,
  currentTimestamp: string,
): RecordRetentionEvaluation {
  if (!KNOWN_RECORD_CLASSES.has(profile.recordClass)) {
    throw new RecordRetentionError('record-class-unknown');
  }

  if (!Number.isFinite(profile.retentionPeriodMs) || profile.retentionPeriodMs <= 0) {
    throw new RecordRetentionError('retention-period-invalid');
  }

  if (creationDate === undefined || creationDate === null || creationDate === '') {
    throw new RecordRetentionError('creation-date-missing');
  }
  if (!isUtcTimestamp(creationDate)) {
    throw new RecordRetentionError('creation-date-invalid');
  }

  if (currentTimestamp === undefined || currentTimestamp === null || currentTimestamp === '') {
    throw new RecordRetentionError('current-timestamp-missing');
  }
  if (!isUtcTimestamp(currentTimestamp)) {
    throw new RecordRetentionError('current-timestamp-invalid');
  }

  const creationTime = Date.parse(creationDate);
  const currentTime = Date.parse(currentTimestamp);

  if (currentTime < creationTime) {
    throw new RecordRetentionError('current-timestamp-precedes-creation-date');
  }

  const { retentionPeriodMs } = profile;
  const retentionEndTime = creationTime + retentionPeriodMs;
  const retentionEndDate = new Date(retentionEndTime).toISOString();
  const elapsedMs = currentTime - creationTime;

  if (profile.litigationHold) {
    return {
      status: 'held',
      ruleCode: 'litigation-hold-active',
      retentionEndDate,
      elapsedMs,
    };
  }

  if (currentTime >= retentionEndTime) {
    return {
      status: 'eligible_for_purge',
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
 * Construct an immutable purge manifest for a batch of fabricated records,
 * as of a caller-supplied purge timestamp. The manifest lists only record
 * identifiers.
 *
 * Fail-closed and all-or-nothing: this throws RecordRetentionError instead
 * of producing a manifest when the purge timestamp is missing or
 * unparsable, when any entry's underlying retention evaluation would throw,
 * when any entry's record identifier is missing, or when any entry is under
 * litigation hold or has not yet reached its retention end date. No partial
 * manifest is ever returned.
 */
export function createRecordPurgeManifest(
  entries: readonly RecordPurgeEntry[],
  purgeTimestamp: string,
): RecordPurgeManifest {
  if (purgeTimestamp === undefined || purgeTimestamp === null || purgeTimestamp === '') {
    throw new RecordRetentionError('purge-timestamp-missing');
  }
  if (!isUtcTimestamp(purgeTimestamp)) {
    throw new RecordRetentionError('purge-timestamp-invalid');
  }

  const recordIds: string[] = [];

  for (const entry of entries) {
    const evaluation = evaluateRecordRetention(entry.profile, entry.creationDate, purgeTimestamp);

    if (evaluation.status === 'held') {
      throw new RecordRetentionError('purge-under-litigation-hold');
    }

    if (evaluation.status !== 'eligible_for_purge') {
      throw new RecordRetentionError('purge-before-retention-elapsed');
    }

    if (!isNonEmptyString(entry.recordId)) {
      throw new RecordRetentionError('record-id-missing');
    }

    recordIds.push(entry.recordId);
  }

  return {
    purgeTimestamp,
    recordIds,
  };
}
