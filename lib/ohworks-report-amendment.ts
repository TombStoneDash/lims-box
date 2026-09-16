/**
 * Fail-closed, privacy-safe report amendment chain validation for the
 * synthetic OHWorks pilot.
 *
 * This module is a pure, dependency-free validator: given a caller-supplied
 * opaque report reference token and an ordered list of fabricated amendment
 * records (a version number, the version it supersedes, a reason code, an
 * author role, and a caller-supplied timestamp), it walks the list in order
 * and returns the first rule the chain breaks, if any. It performs no I/O,
 * touches no real report, patient, or customer data, and never mutates
 * anything outside its own return value.
 *
 * A report begins at baseline version 1 (never itself an amendment). Each
 * subsequent amendment is rejected, in this order, for the first amendment
 * at which:
 *
 *   1. a reused version number   — the declared version number already
 *                                   appears earlier in the chain (including
 *                                   the baseline)
 *   2. a skipped version number  — the declared version number is not
 *                                   exactly one more than the current
 *                                   effective version
 *   3. a retracted supersede     — the declared "supersedes" version is not
 *                                   the current effective version (it names
 *                                   a version already superseded, or one
 *                                   that does not exist yet)
 *   4. an unknown reason code    — the reason code is not on the declared,
 *                                   bounded reason code list
 *   5. an unauthorized author    — the author role is not on the bounded
 *                                   list of roles with amend authority
 *
 * Structurally unusable input (not an array, an amendment missing a
 * required field, or an invalid reference token) throws a typed error
 * instead of guessing at a summary.
 */

/** Bounded reason codes this module knows how to validate. */
export type AmendmentReasonCode =
  | 'TRANSCRIPTION_ERROR'
  | 'CALCULATION_ERROR'
  | 'QC_REPROCESS_RESULT'
  | 'INSTRUMENT_RECALIBRATION_REDO'
  | 'CLIENT_REQUESTED_CORRECTION'
  | 'REGULATORY_CORRECTION'
  | 'SPECIMEN_MISIDENTIFICATION_CORRECTION'
  | 'UNIT_OF_MEASURE_CORRECTION';

const KNOWN_REASON_CODES: ReadonlySet<string> = new Set<AmendmentReasonCode>([
  'TRANSCRIPTION_ERROR',
  'CALCULATION_ERROR',
  'QC_REPROCESS_RESULT',
  'INSTRUMENT_RECALIBRATION_REDO',
  'CLIENT_REQUESTED_CORRECTION',
  'REGULATORY_CORRECTION',
  'SPECIMEN_MISIDENTIFICATION_CORRECTION',
  'UNIT_OF_MEASURE_CORRECTION',
]);

/** Bounded author roles this module recognizes. Only a subset carries amend authority. */
export type AmendmentAuthorRole =
  | 'LAB_DIRECTOR'
  | 'CERTIFYING_SCIENTIST'
  | 'QC_REVIEWER'
  | 'ANALYST'
  | 'FRONT_DESK'
  | 'CLIENT_SERVICES'
  | 'COURIER';

/** Roles with authority to amend a report. All other roles, known or not, are rejected. */
const AUTHORIZED_AMEND_ROLES: ReadonlySet<string> = new Set<AmendmentAuthorRole>([
  'LAB_DIRECTOR',
  'CERTIFYING_SCIENTIST',
  'QC_REVIEWER',
]);

/** The baseline report version before any amendment is applied. */
export const BASELINE_VERSION = 1;

export type ReportAmendment = {
  /** The version number this amendment introduces. Must be current effective version + 1. */
  versionNumber: number;
  /** The version number this amendment supersedes. Must be the current effective version. */
  supersedesVersion: number;
  /** Raw reason code string; may be unrecognized. */
  reasonCode: string;
  /** Raw author role string; may be unrecognized or lack amend authority. */
  authorRole: string;
  /** Caller-supplied timestamp for this amendment, e.g. an ISO 8601 string. */
  timestamp: string;
};

export type AmendmentChainStatus = 'VALID' | 'INVALID';

export type AmendmentChainReasonCode =
  | 'version-reused'
  | 'version-skipped'
  | 'version-retracted'
  | 'reason-code-unknown'
  | 'author-role-unauthorized';

const REASON_MESSAGES: Record<AmendmentChainReasonCode, string> = {
  'version-reused': 'The declared version number already appears earlier in this amendment chain.',
  'version-skipped': 'The declared version number is not exactly one more than the current effective version.',
  'version-retracted': 'The declared superseded version is not the current effective version.',
  'reason-code-unknown': 'The reason code is not on the declared, bounded reason code list.',
  'author-role-unauthorized': 'The author role is not on the bounded list of roles with amend authority.',
};

/** Deterministic, privacy-safe human-readable text for a reason code, suitable for UI display. */
export function explainAmendmentChainReason(code: AmendmentChainReasonCode): string {
  return REASON_MESSAGES[code];
}

const REASON_NEXT_ACTIONS: Record<AmendmentChainReasonCode, string> = {
  'version-reused': 'Resupply a version number that has not already been used in this chain.',
  'version-skipped': 'Resupply a version number exactly one more than the current effective version.',
  'version-retracted': 'Resupply a superseded version equal to the current effective version.',
  'reason-code-unknown': 'Resupply a reason code from the declared reason code list.',
  'author-role-unauthorized': 'Resubmit this amendment from a role with amend authority.',
};

/** Deterministic, privacy-safe next corrective action for a reason code, suitable for UI display alongside the explanation. */
export function explainAmendmentChainNextAction(code: AmendmentChainReasonCode): string {
  return REASON_NEXT_ACTIONS[code];
}

export type AmendmentChainFailure = {
  /** Index into the input amendment list of the first amendment that broke a rule. */
  amendmentIndex: number;
  code: AmendmentChainReasonCode;
};

/** A single accepted link in the supersede chain. */
export type ReportVersionRecord = {
  versionNumber: number;
  supersedesVersion: number;
  reasonCode: AmendmentReasonCode;
  authorRole: AmendmentAuthorRole;
  timestamp: string;
};

export type AmendmentChainSummary = {
  reportReferenceToken: string;
  status: AmendmentChainStatus;
  /** The current effective version number: the baseline if no amendment was accepted. */
  currentEffectiveVersion: number;
  /** All amendments accepted before the first failure, in order. Empty if none were accepted. */
  supersedeChain: ReportVersionRecord[];
  failure?: AmendmentChainFailure;
};

export type AmendmentChainInputErrorCode = 'reference-token-invalid' | 'amendments-not-array' | 'amendment-malformed';

const INPUT_ERROR_MESSAGES: Record<AmendmentChainInputErrorCode, string> = {
  'reference-token-invalid': 'The report reference token is invalid.',
  'amendments-not-array': 'The amendment input is not a list of amendments.',
  'amendment-malformed': 'An amendment is missing a required field or has the wrong shape.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a fail-closed summary. */
export class AmendmentChainInputError extends Error {
  readonly code: AmendmentChainInputErrorCode;

  constructor(code: AmendmentChainInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'AmendmentChainInputError';
    this.code = code;
  }
}

function fail(code: AmendmentChainInputErrorCode): never {
  throw new AmendmentChainInputError(code);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isStructurallyValidAmendment(raw: unknown): raw is ReportAmendment {
  if (!isPlainObject(raw)) {
    return false;
  }
  return (
    isPositiveInteger(raw.versionNumber) &&
    isPositiveInteger(raw.supersedesVersion) &&
    isNonEmptyString(raw.reasonCode) &&
    isNonEmptyString(raw.authorRole) &&
    isNonEmptyString(raw.timestamp)
  );
}

/**
 * Apply an ordered list of fabricated report amendments to a report and
 * return a privacy-safe summary naming the current effective version, the
 * full accepted supersede chain, and the index and reason code of the first
 * amendment that breaks a rule, if any.
 *
 * Fail-closed: an empty amendment list is treated as a trivially valid
 * chain at the baseline version. Structurally unusable input (not an array,
 * an invalid reference token, or an amendment missing a required field)
 * throws AmendmentChainInputError instead of guessing at a summary.
 */
export function applyReportAmendments(reportReferenceToken: unknown, rawAmendments: unknown): AmendmentChainSummary {
  if (!isNonEmptyString(reportReferenceToken)) {
    fail('reference-token-invalid');
  }
  if (!Array.isArray(rawAmendments)) {
    fail('amendments-not-array');
  }

  const amendments: ReportAmendment[] = rawAmendments.map((raw) => {
    if (!isStructurallyValidAmendment(raw)) {
      fail('amendment-malformed');
    }
    return raw;
  });

  const usedVersionNumbers = new Set<number>([BASELINE_VERSION]);
  let currentEffectiveVersion = BASELINE_VERSION;
  const supersedeChain: ReportVersionRecord[] = [];

  for (let index = 0; index < amendments.length; index += 1) {
    const amendment = amendments[index];
    const invalid = (code: AmendmentChainReasonCode): AmendmentChainSummary => ({
      reportReferenceToken,
      status: 'INVALID',
      currentEffectiveVersion,
      supersedeChain,
      failure: { amendmentIndex: index, code },
    });

    if (usedVersionNumbers.has(amendment.versionNumber)) {
      return invalid('version-reused');
    }
    if (amendment.versionNumber !== currentEffectiveVersion + 1) {
      return invalid('version-skipped');
    }
    if (amendment.supersedesVersion !== currentEffectiveVersion) {
      return invalid('version-retracted');
    }
    if (!KNOWN_REASON_CODES.has(amendment.reasonCode)) {
      return invalid('reason-code-unknown');
    }
    if (!AUTHORIZED_AMEND_ROLES.has(amendment.authorRole)) {
      return invalid('author-role-unauthorized');
    }

    usedVersionNumbers.add(amendment.versionNumber);
    currentEffectiveVersion = amendment.versionNumber;
    supersedeChain.push({
      versionNumber: amendment.versionNumber,
      supersedesVersion: amendment.supersedesVersion,
      reasonCode: amendment.reasonCode as AmendmentReasonCode,
      authorRole: amendment.authorRole as AmendmentAuthorRole,
      timestamp: amendment.timestamp,
    });
  }

  return {
    reportReferenceToken,
    status: 'VALID',
    currentEffectiveVersion,
    supersedeChain,
  };
}
