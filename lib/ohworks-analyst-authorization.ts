/**
 * Fail-closed, privacy-safe analyst release authorization for the synthetic
 * OHWorks pilot.
 *
 * This module is a pure, dependency-free decision function: given a
 * fabricated analyst record (a bounded role, a list of per-method
 * competency entries, and an optional suspension window) and a fabricated
 * result to release (its method, its criticality flag, an "as of" timestamp
 * supplied by the caller, and an optional second reviewer id), it returns a
 * deterministic authorized/refused decision naming the single rule that
 * decided it. It performs no I/O and touches no real analyst, patient, or
 * customer data.
 *
 * Authorization requires, in this order:
 *
 *   1. a parsable "as of" timestamp
 *   2. at least one competency entry for the exact result method
 *   3. a competency entry for that method that is current as of the
 *      timestamp (assessed at or before it, not yet expired)
 *   4. no suspension active as of the timestamp
 *   5. for results flagged CRITICAL, a second reviewer distinct from the
 *      releasing analyst
 *
 * Fail-closed: an unparsable timestamp, no competency entry for the method,
 * no current competency entry, an active suspension, a missing second
 * reviewer on a critical result, or a second reviewer equal to the
 * releasing analyst are all refused rather than guessed at. Structurally
 * unusable input (wrong shape, missing required field, unknown role or
 * flag) throws a typed error instead of returning a decision.
 */

/** Bounded analyst roles this module knows how to validate. */
export type AnalystRole = 'TRAINEE' | 'ANALYST' | 'SENIOR_ANALYST' | 'LAB_DIRECTOR';

const KNOWN_ROLES: ReadonlySet<string> = new Set<AnalystRole>([
  'TRAINEE',
  'ANALYST',
  'SENIOR_ANALYST',
  'LAB_DIRECTOR',
]);

/** Bounded result criticality flags this module knows how to validate. */
export type ResultFlag = 'ROUTINE' | 'CRITICAL';

const KNOWN_FLAGS: ReadonlySet<string> = new Set<ResultFlag>(['ROUTINE', 'CRITICAL']);

export type CompetencyEntry = {
  /** The exact method this competency entry covers, e.g. "EPA-200.8". */
  method: string;
  /** Caller-supplied timestamp the competency was assessed, e.g. an ISO 8601 string. */
  assessedAt: string;
  /** Caller-supplied timestamp the competency expires, e.g. an ISO 8601 string. */
  expiresAt: string;
};

export type Suspension = {
  /** Caller-supplied timestamp the suspension begins. */
  startsAt: string;
  /** Caller-supplied timestamp the suspension ends. Omitted means indefinite. */
  endsAt?: string;
};

export type AnalystRecord = {
  /** Synthetic analyst identifier. Never a real name. */
  analystId: string;
  role: AnalystRole;
  competencies: CompetencyEntry[];
  suspension?: Suspension;
};

export type ReleaseCandidate = {
  /** Synthetic result identifier. Never a real name. */
  resultId: string;
  method: string;
  flag: ResultFlag;
  /** Caller-supplied "as of" timestamp the release decision is evaluated against. */
  timestamp: string;
  /** Synthetic identifier of a second reviewer, if one was recorded. Never a real name. */
  secondReviewerId?: string;
};

export type AuthorizationDecision = 'AUTHORIZED' | 'REFUSED';

export type AuthorizationRuleCode =
  | 'timestamp-invalid'
  | 'method-unknown'
  | 'competency-expired'
  | 'analyst-suspended'
  | 'second-reviewer-required'
  | 'second-reviewer-same-as-analyst'
  | 'routine-authorized'
  | 'critical-authorized-with-second-reviewer';

const RULE_MESSAGES: Record<AuthorizationRuleCode, string> = {
  'timestamp-invalid': 'The release evaluation timestamp could not be parsed.',
  'method-unknown': 'The analyst has no competency entry on file for this exact method.',
  'competency-expired': 'The analyst has no competency entry for this method that is current as of the evaluation timestamp.',
  'analyst-suspended': 'The analyst has a suspension active as of the evaluation timestamp.',
  'second-reviewer-required': 'This result is flagged critical and requires a second reviewer, but none was supplied.',
  'second-reviewer-same-as-analyst': 'The supplied second reviewer is the same analyst releasing the result.',
  'routine-authorized': 'The result is routine and the releasing analyst holds current, unsuspended competency for the method.',
  'critical-authorized-with-second-reviewer': 'The result is critical and a distinct second reviewer was supplied alongside current, unsuspended competency.',
};

/** Deterministic, privacy-safe human-readable text for a rule code, suitable for UI display. */
export function explainAuthorizationRule(code: AuthorizationRuleCode): string {
  return RULE_MESSAGES[code];
}

/** The privacy-safe decision. No analyst id, role, or reviewer id ever appears in this output. */
export type AuthorizationSummary = {
  resultId: string;
  decision: AuthorizationDecision;
  rule: AuthorizationRuleCode;
};

export type AnalystAuthorizationInputErrorCode = 'analyst-malformed' | 'candidate-malformed';

const INPUT_ERROR_MESSAGES: Record<AnalystAuthorizationInputErrorCode, string> = {
  'analyst-malformed': 'The analyst record is missing a required field or has the wrong shape.',
  'candidate-malformed': 'The release candidate is missing a required field or has the wrong shape.',
};

/** Thrown for structurally unusable input that cannot be safely assigned an authorization decision. */
export class AnalystAuthorizationInputError extends Error {
  readonly code: AnalystAuthorizationInputErrorCode;

  constructor(code: AnalystAuthorizationInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'AnalystAuthorizationInputError';
    this.code = code;
  }
}

function fail(code: AnalystAuthorizationInputErrorCode): never {
  throw new AnalystAuthorizationInputError(code);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStructurallyValidCompetencyEntry(raw: unknown): raw is CompetencyEntry {
  if (!isPlainObject(raw)) {
    return false;
  }
  return isNonEmptyString(raw.method) && isNonEmptyString(raw.assessedAt) && isNonEmptyString(raw.expiresAt);
}

function isStructurallyValidSuspension(raw: unknown): raw is Suspension {
  if (!isPlainObject(raw)) {
    return false;
  }
  return isNonEmptyString(raw.startsAt) && (raw.endsAt === undefined || isNonEmptyString(raw.endsAt));
}

function isStructurallyValidAnalyst(raw: unknown): raw is AnalystRecord {
  if (!isPlainObject(raw)) {
    return false;
  }
  if (!isNonEmptyString(raw.analystId) || !isNonEmptyString(raw.role) || !KNOWN_ROLES.has(raw.role)) {
    return false;
  }
  if (!Array.isArray(raw.competencies) || !raw.competencies.every(isStructurallyValidCompetencyEntry)) {
    return false;
  }
  if (raw.suspension !== undefined && !isStructurallyValidSuspension(raw.suspension)) {
    return false;
  }
  return true;
}

function isStructurallyValidCandidate(raw: unknown): raw is ReleaseCandidate {
  if (!isPlainObject(raw)) {
    return false;
  }
  return (
    isNonEmptyString(raw.resultId) &&
    isNonEmptyString(raw.method) &&
    isNonEmptyString(raw.flag) &&
    KNOWN_FLAGS.has(raw.flag) &&
    isNonEmptyString(raw.timestamp) &&
    (raw.secondReviewerId === undefined || isNonEmptyString(raw.secondReviewerId))
  );
}

/**
 * Suspension is treated as active, fail-closed, whenever its window cannot
 * be conclusively proven to exclude the evaluation timestamp: an unparsable
 * start or end timestamp is assumed active rather than assumed clear.
 */
function isSuspensionActive(suspension: Suspension, asOfMs: number): boolean {
  const startsAtMs = Date.parse(suspension.startsAt);
  if (!Number.isFinite(startsAtMs)) {
    return true;
  }
  if (asOfMs < startsAtMs) {
    return false;
  }
  if (suspension.endsAt === undefined) {
    return true;
  }
  const endsAtMs = Date.parse(suspension.endsAt);
  if (!Number.isFinite(endsAtMs)) {
    return true;
  }
  return asOfMs < endsAtMs;
}

function isCompetencyCurrent(entry: CompetencyEntry, asOfMs: number): boolean {
  const assessedAtMs = Date.parse(entry.assessedAt);
  const expiresAtMs = Date.parse(entry.expiresAt);
  if (!Number.isFinite(assessedAtMs) || !Number.isFinite(expiresAtMs)) {
    return false;
  }
  return assessedAtMs <= asOfMs && asOfMs < expiresAtMs;
}

/**
 * Decide whether a fabricated analyst may release a fabricated result, and
 * name the single rule that decided it.
 *
 * Fail-closed: see the module-level documentation for the full, ordered
 * list of refusal rules. Structurally unusable input throws
 * AnalystAuthorizationInputError instead of guessing at a decision.
 */
export function authorizeAnalystRelease(rawAnalyst: unknown, rawCandidate: unknown): AuthorizationSummary {
  if (!isStructurallyValidAnalyst(rawAnalyst)) {
    fail('analyst-malformed');
  }
  if (!isStructurallyValidCandidate(rawCandidate)) {
    fail('candidate-malformed');
  }

  const analyst = rawAnalyst;
  const candidate = rawCandidate;

  const refuse = (rule: AuthorizationRuleCode): AuthorizationSummary => ({
    resultId: candidate.resultId,
    decision: 'REFUSED',
    rule,
  });

  const asOfMs = Date.parse(candidate.timestamp);
  if (!Number.isFinite(asOfMs)) {
    return refuse('timestamp-invalid');
  }

  const competenciesForMethod = analyst.competencies.filter((entry) => entry.method === candidate.method);
  if (competenciesForMethod.length === 0) {
    return refuse('method-unknown');
  }

  const hasCurrentCompetency = competenciesForMethod.some((entry) => isCompetencyCurrent(entry, asOfMs));
  if (!hasCurrentCompetency) {
    return refuse('competency-expired');
  }

  if (analyst.suspension !== undefined && isSuspensionActive(analyst.suspension, asOfMs)) {
    return refuse('analyst-suspended');
  }

  if (candidate.flag === 'CRITICAL') {
    if (candidate.secondReviewerId === undefined) {
      return refuse('second-reviewer-required');
    }
    if (candidate.secondReviewerId === analyst.analystId) {
      return refuse('second-reviewer-same-as-analyst');
    }
    return { resultId: candidate.resultId, decision: 'AUTHORIZED', rule: 'critical-authorized-with-second-reviewer' };
  }

  return { resultId: candidate.resultId, decision: 'AUTHORIZED', rule: 'routine-authorized' };
}
