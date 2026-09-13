/**
 * Fail-closed, privacy-safe specimen status projection for the synthetic
 * OHWorks pilot.
 *
 * This module is a pure, dependency-free projector: given fabricated
 * internal specimen lifecycle records (a bounded internal lifecycle state,
 * an update timestamp, and — because real internal records carry them —
 * incidental fields such as a patient/submitter name, a real sample or
 * accession identifier, free-text notes, and result values) it returns a
 * minimal external status view containing only a caller-supplied opaque
 * correlation token and one of five bounded statuses:
 *
 *   received | in_progress | review | completed | exception
 *
 * It performs no I/O, touches no real sample, patient, or customer data,
 * and never reads or copies a name, a real identifier, a raw note, or a
 * result value into its output. An internal lifecycle state this module
 * does not recognize, a timestamp that cannot be parsed as UTC, or a
 * tenant mismatch all fail closed to `exception` rather than guessing.
 */

/** Bounded internal lifecycle states this module knows how to project. */
export type SpecimenLifecycleState =
  | 'INTAKE_LOGGED'
  | 'ACCESSIONED'
  | 'IN_PREPARATION'
  | 'IN_ANALYSIS'
  | 'PENDING_QC_REVIEW'
  | 'QC_REVIEW_IN_PROGRESS'
  | 'VERIFIED'
  | 'REPORTED'
  | 'ON_HOLD'
  | 'REJECTED'
  | 'CANCELLED'
  | 'LOST';

/** The only external statuses this contract ever emits. */
export type SpecimenStatus = 'received' | 'in_progress' | 'review' | 'completed' | 'exception';

const KNOWN_LIFECYCLE_STATES: ReadonlySet<string> = new Set<SpecimenLifecycleState>([
  'INTAKE_LOGGED',
  'ACCESSIONED',
  'IN_PREPARATION',
  'IN_ANALYSIS',
  'PENDING_QC_REVIEW',
  'QC_REVIEW_IN_PROGRESS',
  'VERIFIED',
  'REPORTED',
  'ON_HOLD',
  'REJECTED',
  'CANCELLED',
  'LOST',
]);

const STATUS_BY_LIFECYCLE_STATE: Record<SpecimenLifecycleState, SpecimenStatus> = {
  INTAKE_LOGGED: 'received',
  ACCESSIONED: 'received',
  IN_PREPARATION: 'in_progress',
  IN_ANALYSIS: 'in_progress',
  PENDING_QC_REVIEW: 'review',
  QC_REVIEW_IN_PROGRESS: 'review',
  VERIFIED: 'completed',
  REPORTED: 'completed',
  ON_HOLD: 'exception',
  REJECTED: 'exception',
  CANCELLED: 'exception',
  LOST: 'exception',
};

/** Bounded, privacy-safe codes explaining why a record failed closed to `exception`. */
export type SpecimenStatusReasonCode =
  | 'tenant-mismatch'
  | 'timestamp-invalid'
  | 'timestamp-not-utc'
  | 'lifecycle-state-unknown';

const REASON_MESSAGES: Record<SpecimenStatusReasonCode, string> = {
  'tenant-mismatch': 'The record does not belong to the tenant this projection is being computed for.',
  'timestamp-invalid': 'The last-updated timestamp could not be parsed.',
  'timestamp-not-utc': 'The last-updated timestamp is not an explicit UTC timestamp.',
  'lifecycle-state-unknown': 'The internal lifecycle state is not a recognized bounded value.',
};

/** Deterministic, privacy-safe human-readable text for a reason code, suitable for UI display. */
export function explainSpecimenStatusReason(reasonCode: SpecimenStatusReasonCode): string {
  return REASON_MESSAGES[reasonCode];
}

/**
 * Shape of a fabricated internal specimen record. `patientName`,
 * `submitterName`, `sampleIdentifier`, `accessionNumber`, `rawNotes`, and
 * `resultValues` model fields a real internal record would carry; this
 * module never reads them and they never reach the projected view.
 */
export type SpecimenInternalRecord = {
  /** Synthetic tenant/lab identifier this record claims to belong to. */
  tenantId: string;
  /** Caller-supplied opaque correlation token. Never derived from or equal to a real identifier. */
  referenceToken: string;
  /** Raw internal lifecycle state string; may be unrecognized. */
  lifecycleState: string;
  /** UTC timestamp the lifecycle state was last updated, e.g. "2026-01-01T12:00:00.000Z". Must end in "Z". */
  updatedAt: string;
  patientName?: string;
  submitterName?: string;
  sampleIdentifier?: string;
  accessionNumber?: string;
  rawNotes?: string;
  resultValues?: unknown;
};

export type SpecimenStatusContext = {
  /** Synthetic tenant/lab identifier this projection is being computed for. */
  tenantId: string;
};

/** The privacy-safe external view. No other fields are ever present. */
export type SpecimenStatusView = {
  referenceToken: string;
  status: SpecimenStatus;
  reasonCode?: SpecimenStatusReasonCode;
};

export type SpecimenStatusInputErrorCode = 'records-not-array' | 'invalid-context' | 'record-malformed';

const INPUT_ERROR_MESSAGES: Record<SpecimenStatusInputErrorCode, string> = {
  'records-not-array': 'The specimen status input batch is not a list of records.',
  'invalid-context': 'The specimen status projection context has an invalid tenant identifier.',
  'record-malformed': 'A specimen status record is missing a required field or has the wrong shape.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a fail-closed view. */
export class SpecimenStatusInputError extends Error {
  readonly code: SpecimenStatusInputErrorCode;

  constructor(code: SpecimenStatusInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'SpecimenStatusInputError';
    this.code = code;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isStructurallyValidRecord(raw: unknown): raw is SpecimenInternalRecord {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.tenantId) &&
    isNonEmptyString(candidate.referenceToken) &&
    isNonEmptyString(candidate.lifecycleState) &&
    isNonEmptyString(candidate.updatedAt)
  );
}

function isValidContext(context: unknown): context is SpecimenStatusContext {
  if (typeof context !== 'object' || context === null) {
    return false;
  }
  const candidate = context as Record<string, unknown>;
  return isNonEmptyString(candidate.tenantId);
}

function isUtcTimestamp(value: string): boolean {
  return value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

function projectSingleRecord(record: SpecimenInternalRecord, context: SpecimenStatusContext): SpecimenStatusView {
  const exception = (reasonCode: SpecimenStatusReasonCode): SpecimenStatusView => ({
    referenceToken: record.referenceToken,
    status: 'exception',
    reasonCode,
  });

  if (record.tenantId !== context.tenantId) {
    return exception('tenant-mismatch');
  }

  if (!Number.isFinite(Date.parse(record.updatedAt))) {
    return exception('timestamp-invalid');
  }

  if (!isUtcTimestamp(record.updatedAt)) {
    return exception('timestamp-not-utc');
  }

  if (!KNOWN_LIFECYCLE_STATES.has(record.lifecycleState)) {
    return exception('lifecycle-state-unknown');
  }

  return {
    referenceToken: record.referenceToken,
    status: STATUS_BY_LIFECYCLE_STATE[record.lifecycleState as SpecimenLifecycleState],
  };
}

/**
 * Project a batch of fabricated internal specimen records into privacy-safe
 * external status views, in the same order the records were given.
 *
 * Fail-closed: a tenant mismatch, an unparsable or non-UTC timestamp, or an
 * unrecognized internal lifecycle state all project to `exception` with a
 * bounded reason code rather than a guessed status. Structurally unusable
 * input (not an array, an invalid context, or a record missing a required
 * identity field) throws SpecimenStatusInputError instead of guessing at a
 * per-record view.
 */
export function projectSpecimenStatuses(
  records: ReadonlyArray<unknown>,
  context: SpecimenStatusContext,
): SpecimenStatusView[] {
  if (!Array.isArray(records)) {
    throw new SpecimenStatusInputError('records-not-array');
  }
  if (!isValidContext(context)) {
    throw new SpecimenStatusInputError('invalid-context');
  }

  return records.map((raw) => {
    if (!isStructurallyValidRecord(raw)) {
      throw new SpecimenStatusInputError('record-malformed');
    }
    return projectSingleRecord(raw, context);
  });
}
