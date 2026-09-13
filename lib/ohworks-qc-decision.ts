/**
 * Fail-closed synthetic QC decision projection for OHWorks/SENAITE-shaped result records.
 *
 * This module is a pure, dependency-free evaluator: given fabricated result
 * records (a numeric-ish value, a unit, a qualifier, an explicit verification
 * state, bounded reference limits, and QC metadata) it returns a conservative
 * decision projection for each record. It performs no I/O, touches no real
 * instrument or customer data, and never asserts approval, compliance,
 * accreditation, or releasability. It only ever produces one of three
 * dispositions:
 *
 *   - HOLD: the record cannot be trusted or interpreted (fail-closed).
 *   - REVIEW_REQUIRED: the record is well-formed but flags something a
 *     human reviewer must look at before anything else happens to it.
 *   - ELIGIBLE_FOR_REVIEW: the record is complete and unflagged, so it may
 *     be placed in front of a human reviewer through the ordinary queue.
 *     This is not an approval, compliance, or release determination.
 */

export type QCDecisionStatus = 'HOLD' | 'REVIEW_REQUIRED' | 'ELIGIBLE_FOR_REVIEW';

/** Known, explicit verification states. Anything else is treated as unknown and fails closed. */
export type QCVerificationState = 'unverified' | 'verified' | 'rejected';

/** Known result qualifiers. Anything else is treated as unknown and fails closed. */
export type QCResultQualifier = 'none' | 'less-than' | 'greater-than' | 'estimated';

const KNOWN_VERIFICATION_STATES: ReadonlySet<string> = new Set<string>([
  'unverified',
  'verified',
  'rejected',
]);

const KNOWN_QUALIFIERS: ReadonlySet<string> = new Set<string>([
  'none',
  'less-than',
  'greater-than',
  'estimated',
]);

export type QCReferenceLimit = {
  lowerBound: number;
  upperBound: number;
  unit: string;
};

export type QCMetadata = {
  controlsPassed: boolean;
  instrumentCalibrated: boolean;
};

export type QCSyntheticResultRecord = {
  /** Synthetic record identifier. Never a real sample or customer identifier. */
  recordId: string;
  /** Synthetic tenant/lab identifier the record claims to belong to. */
  tenantId: string;
  /** Fabricated analyte/parameter code. */
  analyteCode: string;
  /** Raw fabricated observed value, exactly as received; may be nonnumeric. */
  rawValue: unknown;
  unit?: string;
  /** Raw qualifier string; may be unrecognized. */
  qualifier: string;
  /** Raw verification state string; may be missing or unrecognized. */
  verificationState?: string;
  /** All submitted bounded reference limit sets for this record; more than one distinct set is a conflict. */
  referenceLimits: QCReferenceLimit[];
  qcMetadata?: Partial<QCMetadata>;
  /** ISO 8601 timestamp the result was captured. */
  capturedAt: string;
};

export type QCDecisionContext = {
  /** Synthetic tenant/lab identifier this evaluation is being performed for. */
  tenantId: string;
  /** ISO 8601 timestamp representing "now" for freshness evaluation. */
  referenceTime: string;
  /** Maximum age, in milliseconds, that a result's capture time may lag the reference time. */
  maxResultAgeMs: number;
};

export type QCDecisionReasonCode =
  | 'duplicate-record'
  | 'tenant-mismatch'
  | 'timestamp-invalid'
  | 'timestamp-stale'
  | 'value-non-numeric'
  | 'unit-missing'
  | 'unit-mismatched'
  | 'qualifier-unknown'
  | 'qualifier-flagged'
  | 'reference-limits-missing'
  | 'reference-limits-invalid'
  | 'reference-limits-conflicting'
  | 'value-out-of-reference-range'
  | 'verification-state-missing'
  | 'verification-state-unknown'
  | 'verification-unverified'
  | 'verification-rejected'
  | 'qc-metadata-missing'
  | 'qc-metadata-incomplete'
  | 'qc-controls-failed'
  | 'qc-instrument-uncalibrated';

export type QCDecisionReason = {
  code: QCDecisionReasonCode;
};

export type QCDecision = {
  recordId: string;
  status: QCDecisionStatus;
  /** Deterministically ordered, privacy-safe reasons. Empty when ELIGIBLE_FOR_REVIEW. */
  reasons: QCDecisionReason[];
};

/** Reason codes that always fail a record closed to HOLD, regardless of anything else. */
const HOLD_CODES: ReadonlySet<QCDecisionReasonCode> = new Set<QCDecisionReasonCode>([
  'duplicate-record',
  'tenant-mismatch',
  'timestamp-invalid',
  'timestamp-stale',
  'value-non-numeric',
  'unit-missing',
  'unit-mismatched',
  'qualifier-unknown',
  'reference-limits-missing',
  'reference-limits-invalid',
  'reference-limits-conflicting',
  'verification-state-missing',
  'verification-state-unknown',
  'qc-metadata-missing',
  'qc-metadata-incomplete',
  'qc-controls-failed',
  'qc-instrument-uncalibrated',
]);

const REASON_MESSAGES: Record<QCDecisionReasonCode, string> = {
  'duplicate-record': 'More than one record was submitted with the same record identifier.',
  'tenant-mismatch': 'The record does not belong to the tenant this evaluation was run for.',
  'timestamp-invalid': 'The capture timestamp or reference time could not be parsed.',
  'timestamp-stale': 'The capture timestamp is outside the allowed freshness window.',
  'value-non-numeric': 'The observed value is not a finite number.',
  'unit-missing': 'The observed value has no unit.',
  'unit-mismatched': 'The observed value unit does not match the reference limit unit.',
  'qualifier-unknown': 'The result qualifier is not a recognized value.',
  'qualifier-flagged': 'The result qualifier indicates the value is a limit or estimate, not a direct measurement.',
  'reference-limits-missing': 'No bounded reference limits were submitted for this record.',
  'reference-limits-invalid': 'A submitted reference limit is not a valid bounded range.',
  'reference-limits-conflicting': 'More than one distinct reference limit set was submitted for this record.',
  'value-out-of-reference-range': 'The observed value falls outside its bounded reference limit.',
  'verification-state-missing': 'No explicit verification state was submitted for this record.',
  'verification-state-unknown': 'The submitted verification state is not a recognized value.',
  'verification-unverified': 'The record has not yet been verified.',
  'verification-rejected': 'The record was previously rejected during verification.',
  'qc-metadata-missing': 'No QC metadata was submitted for this record.',
  'qc-metadata-incomplete': 'The submitted QC metadata is missing required fields.',
  'qc-controls-failed': 'QC controls did not pass for this record.',
  'qc-instrument-uncalibrated': 'The instrument used for this record is not marked as calibrated.',
};

/** Deterministic, privacy-safe human-readable text for a decision reason, suitable for UI display. */
export function explainQCDecisionReason(reason: QCDecisionReason): string {
  return REASON_MESSAGES[reason.code];
}

export type QCDecisionInputErrorCode = 'records-not-array' | 'invalid-context' | 'record-missing-identity';

const INPUT_ERROR_MESSAGES: Record<QCDecisionInputErrorCode, string> = {
  'records-not-array': 'The QC decision input batch is not a list of records.',
  'invalid-context': 'The QC decision evaluation context has an invalid reference time or freshness window.',
  'record-missing-identity': 'A QC decision record is missing a required identity field.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a per-record decision. */
export class QCDecisionInputError extends Error {
  readonly code: QCDecisionInputErrorCode;

  constructor(code: QCDecisionInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'QCDecisionInputError';
    this.code = code;
  }
}

function hasRequiredIdentity(
  record: unknown,
): record is { recordId: string; tenantId: string; capturedAt: string } & Record<string, unknown> {
  if (typeof record !== 'object' || record === null) {
    return false;
  }
  const candidate = record as Record<string, unknown>;
  return (
    typeof candidate.recordId === 'string' &&
    candidate.recordId.length > 0 &&
    typeof candidate.tenantId === 'string' &&
    candidate.tenantId.length > 0 &&
    typeof candidate.capturedAt === 'string'
  );
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

function isValidLimit(limit: QCReferenceLimit): boolean {
  return (
    Number.isFinite(limit.lowerBound) &&
    Number.isFinite(limit.upperBound) &&
    limit.lowerBound <= limit.upperBound &&
    typeof limit.unit === 'string' &&
    limit.unit.length > 0
  );
}

function dedupeLimits(limits: QCReferenceLimit[]): QCReferenceLimit[] {
  const seen = new Map<string, QCReferenceLimit>();
  for (const limit of limits) {
    const key = `${limit.lowerBound}|${limit.upperBound}|${limit.unit}`;
    if (!seen.has(key)) {
      seen.set(key, limit);
    }
  }
  return [...seen.values()];
}

function compareReasons(a: QCDecisionReason, b: QCDecisionReason): number {
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

function evaluateSingleRecord(
  record: QCSyntheticResultRecord,
  context: QCDecisionContext,
  parsedReferenceTime: number,
  isDuplicate: boolean,
): QCDecision {
  const reasons: QCDecisionReason[] = [];
  const flag = (code: QCDecisionReasonCode) => reasons.push({ code });

  if (isDuplicate) {
    flag('duplicate-record');
  }

  if (record.tenantId !== context.tenantId) {
    flag('tenant-mismatch');
  }

  const capturedTime = Date.parse(record.capturedAt);
  if (!Number.isFinite(capturedTime)) {
    flag('timestamp-invalid');
  } else {
    const age = parsedReferenceTime - capturedTime;
    if (age < 0 || age > context.maxResultAgeMs) {
      flag('timestamp-stale');
    }
  }

  const numericValue = toFiniteNumber(record.rawValue);
  if (numericValue === undefined) {
    flag('value-non-numeric');
  }

  const hasUnit = typeof record.unit === 'string' && record.unit.length > 0;
  if (!hasUnit) {
    flag('unit-missing');
  }

  if (!KNOWN_QUALIFIERS.has(record.qualifier)) {
    flag('qualifier-unknown');
  } else if (record.qualifier !== 'none') {
    flag('qualifier-flagged');
  }

  if (!Array.isArray(record.referenceLimits) || record.referenceLimits.length === 0) {
    flag('reference-limits-missing');
  } else if (record.referenceLimits.some((limit) => !isValidLimit(limit))) {
    flag('reference-limits-invalid');
  } else {
    const distinctLimits = dedupeLimits(record.referenceLimits);
    if (distinctLimits.length > 1) {
      flag('reference-limits-conflicting');
    } else {
      const [limit] = distinctLimits;
      if (hasUnit && record.unit !== limit.unit) {
        flag('unit-mismatched');
      } else if (numericValue !== undefined && (numericValue < limit.lowerBound || numericValue > limit.upperBound)) {
        flag('value-out-of-reference-range');
      }
    }
  }

  if (record.verificationState === undefined) {
    flag('verification-state-missing');
  } else if (!KNOWN_VERIFICATION_STATES.has(record.verificationState)) {
    flag('verification-state-unknown');
  } else if (record.verificationState === 'unverified') {
    flag('verification-unverified');
  } else if (record.verificationState === 'rejected') {
    flag('verification-rejected');
  }

  if (!record.qcMetadata) {
    flag('qc-metadata-missing');
  } else if (
    typeof record.qcMetadata.controlsPassed !== 'boolean' ||
    typeof record.qcMetadata.instrumentCalibrated !== 'boolean'
  ) {
    flag('qc-metadata-incomplete');
  } else if (record.qcMetadata.controlsPassed === false) {
    flag('qc-controls-failed');
  } else if (record.qcMetadata.instrumentCalibrated === false) {
    flag('qc-instrument-uncalibrated');
  }

  reasons.sort(compareReasons);

  const status: QCDecisionStatus = reasons.some((reason) => HOLD_CODES.has(reason.code))
    ? 'HOLD'
    : reasons.length > 0
      ? 'REVIEW_REQUIRED'
      : 'ELIGIBLE_FOR_REVIEW';

  return { recordId: record.recordId, status, reasons };
}

/**
 * Evaluate a batch of fabricated result records and return one conservative
 * decision projection per record, in the same order the records were given.
 *
 * Fail-closed: any tenant mismatch, duplicate record identifier, unparsable
 * or stale timestamp, nonnumeric value, missing or mismatched unit, unknown
 * qualifier, missing/invalid/conflicting reference limits, missing/unknown
 * verification state, or missing/incomplete/failed QC metadata blocks the
 * record with HOLD. A structurally unusable batch or context throws
 * QCDecisionInputError instead of guessing at a per-record decision.
 */
export function evaluateQCDecisions(
  records: ReadonlyArray<QCSyntheticResultRecord>,
  context: QCDecisionContext,
): QCDecision[] {
  if (!Array.isArray(records)) {
    throw new QCDecisionInputError('records-not-array');
  }

  const parsedReferenceTime = Date.parse(context.referenceTime);
  if (
    !Number.isFinite(parsedReferenceTime) ||
    !Number.isFinite(context.maxResultAgeMs) ||
    context.maxResultAgeMs < 0
  ) {
    throw new QCDecisionInputError('invalid-context');
  }

  for (const record of records) {
    if (!hasRequiredIdentity(record)) {
      throw new QCDecisionInputError('record-missing-identity');
    }
  }

  const idCounts = new Map<string, number>();
  for (const record of records) {
    idCounts.set(record.recordId, (idCounts.get(record.recordId) ?? 0) + 1);
  }

  return records.map((record) =>
    evaluateSingleRecord(record, context, parsedReferenceTime, (idCounts.get(record.recordId) ?? 0) > 1),
  );
}
