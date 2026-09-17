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
 * Every caller-supplied timestamp (the evaluation timestamp, each
 * competency's assessedAt/expiresAt, and a suspension's startsAt/endsAt)
 * must be a real calendar instant written with an explicit UTC "Z" or
 * numeric offset. Timezone-naive strings and calendar-invalid dates (e.g.
 * a rolled-over "2026-02-30") are rejected rather than guessed at, and
 * validity is evaluated timezone-independently so the same instant decides
 * identically no matter which explicit offset it was written with.
 *
 * Fail-closed: an unparsable timestamp, no competency entry for the method,
 * no current competency entry, an active or indeterminate suspension, a
 * missing (including whitespace-only) second reviewer on a critical
 * result, or a second reviewer equal to the releasing analyst are all
 * refused rather than guessed at. Structurally unusable input (wrong
 * shape, missing required field, unknown role or flag) throws a typed
 * error instead of returning a decision.
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
 * Matches only the explicit-zone ISO 8601 date-time form: a full calendar
 * date and time of day followed by either "Z" or a numeric "+HH:MM" /
 * "-HH:MM" offset. Timezone-naive strings (no trailing zone) do not match
 * and are rejected outright rather than resolved against an ambient
 * default timezone.
 */
const EXPLICIT_ZONE_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Parses a caller-supplied timestamp into a UTC epoch millisecond instant,
 * or undefined if it is not a real calendar instant written with an
 * explicit zone. Calendar validity (e.g. rejecting a rolled-over
 * "2026-02-30") is checked via a UTC round trip on the written fields
 * themselves, independent of the offset attached to them, so the same
 * written instant is judged identically regardless of which explicit
 * offset expressed it.
 */
function parseExplicitZoneInstant(value: string): number | undefined {
  const match = EXPLICIT_ZONE_TIMESTAMP.exec(value);
  if (match === null) {
    return undefined;
  }
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr, fracStr, zone] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = Number(secondStr);
  const millisecond = fracStr === undefined ? 0 : Number(fracStr.slice(0, 3).padEnd(3, '0'));

  const naiveMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const roundTrip = new Date(naiveMs);
  const isRealCalendarInstant =
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day &&
    roundTrip.getUTCHours() === hour &&
    roundTrip.getUTCMinutes() === minute &&
    roundTrip.getUTCSeconds() === second;
  if (!isRealCalendarInstant) {
    return undefined;
  }

  if (zone === 'Z') {
    return naiveMs;
  }

  const offsetSign = zone[0] === '-' ? -1 : 1;
  const offsetHours = Number(zone.slice(1, 3));
  const offsetMinutes = Number(zone.slice(4, 6));
  return naiveMs - offsetSign * (offsetHours * 60 + offsetMinutes) * 60_000;
}

/**
 * Suspension is treated as active, fail-closed, whenever its window cannot
 * be conclusively proven to exclude the evaluation timestamp: an unparsable
 * start or end timestamp, or a window whose start is after its end, is
 * assumed active rather than assumed clear. The window's internal
 * consistency is checked before deciding activity so a future-dated start
 * paired with a corrupted (or merely unparsable) end cannot be waved
 * through just because the evaluation instant precedes the start.
 */
function isSuspensionActive(suspension: Suspension, asOfMs: number): boolean {
  const startsAtMs = parseExplicitZoneInstant(suspension.startsAt);
  if (startsAtMs === undefined) {
    return true;
  }
  if (suspension.endsAt === undefined) {
    return asOfMs >= startsAtMs;
  }
  const endsAtMs = parseExplicitZoneInstant(suspension.endsAt);
  if (endsAtMs === undefined) {
    return true;
  }
  if (startsAtMs > endsAtMs) {
    return true;
  }
  return asOfMs >= startsAtMs && asOfMs < endsAtMs;
}

function isCompetencyCurrent(entry: CompetencyEntry, asOfMs: number): boolean {
  const assessedAtMs = parseExplicitZoneInstant(entry.assessedAt);
  const expiresAtMs = parseExplicitZoneInstant(entry.expiresAt);
  if (assessedAtMs === undefined || expiresAtMs === undefined) {
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

  const asOfMs = parseExplicitZoneInstant(candidate.timestamp);
  if (asOfMs === undefined) {
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
    const secondReviewerId = candidate.secondReviewerId?.trim();
    if (!secondReviewerId) {
      return refuse('second-reviewer-required');
    }
    if (secondReviewerId === analyst.analystId) {
      return refuse('second-reviewer-same-as-analyst');
    }
    return { resultId: candidate.resultId, decision: 'AUTHORIZED', rule: 'critical-authorized-with-second-reviewer' };
  }

  return { resultId: candidate.resultId, decision: 'AUTHORIZED', rule: 'routine-authorized' };
}
