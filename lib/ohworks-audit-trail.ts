/**
 * Fail-closed, deterministic audit trail chain verification for the
 * synthetic OHWorks pilot.
 *
 * This module is a pure, dependency-free validator: given an ordered list
 * of fabricated audit entries (a sequence number, an actor role, an action
 * code, a caller-supplied timestamp, and a hash of the previous entry), it
 * walks the list in order and returns the first entry at which the chain
 * breaks, if any. It performs no I/O and touches no real actor, patient, or
 * customer data — only bounded role and action code vocabularies and
 * synthetic sequence/timestamp/hash values ever appear in its input or
 * output.
 *
 * Each entry's declared previousHash is checked against hashAuditEntry(),
 * a declared pure hash function computed over the prior entry's canonical
 * JSON (a fixed-order field encoding, not JSON.stringify's incidental key
 * order). Because each entry's hash folds in the previousHash it was itself
 * chained against, tampering with any earlier entry — even one whose own
 * fields still look individually valid — changes that entry's hash and
 * breaks the very next link, so the break is always caught at the first
 * entry downstream of the tampering, never silently absorbed.
 *
 * An entry is rejected, in this order, for the first entry at which:
 *
 *   1. an invalid genesis link  — the first entry's previousHash is not the
 *                                  declared genesis constant
 *   2. a sequence gap           — the sequence number does not follow the
 *                                  prior entry's sequence number by exactly 1
 *   3. a broken hash link       — the entry's previousHash does not equal
 *                                  hashAuditEntry() of the prior entry
 *   4. a timestamp problem      — the timestamp is not a strict, calendar-
 *                                  valid ISO 8601 date-time with an explicit
 *                                  timezone designator (Z or a numeric
 *                                  offset), or it repeats the prior entry's
 *                                  timestamp, or precedes it
 *   5. an unknown actor role    — the actor role is not on the bounded
 *                                  known role list
 *   6. an unknown action code   — the action code is not on the bounded
 *                                  known action code list
 *   7. a disallowed action      — the action code is known but not on the
 *                                  bounded list of action codes permitted
 *                                  for the actor's role
 *
 * Structurally unusable input (not an array, or an entry missing a
 * required field or with the wrong shape) throws a typed error instead of
 * guessing at a summary.
 */

/** Bounded actor roles this module knows how to validate. */
export type AuditActorRole = 'COLLECTOR' | 'ANALYST' | 'QC_REVIEWER' | 'LAB_DIRECTOR';

const KNOWN_ROLES: ReadonlySet<string> = new Set<AuditActorRole>([
  'COLLECTOR',
  'ANALYST',
  'QC_REVIEWER',
  'LAB_DIRECTOR',
]);

/** Bounded action codes this module knows how to validate. */
export type AuditActionCode =
  | 'SAMPLE_RECEIVED'
  | 'RESULT_ENTERED'
  | 'RESULT_REVIEWED'
  | 'RESULT_AMENDED'
  | 'REPORT_RELEASED'
  | 'RECORD_VOIDED'
  | 'QC_OVERRIDE';

const KNOWN_ACTIONS: ReadonlySet<string> = new Set<AuditActionCode>([
  'SAMPLE_RECEIVED',
  'RESULT_ENTERED',
  'RESULT_REVIEWED',
  'RESULT_AMENDED',
  'REPORT_RELEASED',
  'RECORD_VOIDED',
  'QC_OVERRIDE',
]);

/** The bounded set of action codes each actor role is permitted to record. */
const PERMITTED_ACTIONS: Record<AuditActorRole, ReadonlySet<AuditActionCode>> = {
  COLLECTOR: new Set<AuditActionCode>(['SAMPLE_RECEIVED']),
  ANALYST: new Set<AuditActionCode>(['RESULT_ENTERED', 'RESULT_AMENDED']),
  QC_REVIEWER: new Set<AuditActionCode>(['RESULT_REVIEWED', 'QC_OVERRIDE']),
  LAB_DIRECTOR: new Set<AuditActionCode>(['REPORT_RELEASED', 'RECORD_VOIDED', 'QC_OVERRIDE']),
};

/**
 * Strict ISO 8601 date-time with an explicit timezone designator (Z or a
 * numeric +HH:MM/-HH:MM offset). Date.parse() also accepts date-only,
 * locale-style, and timezone-less shapes whose absolute instant depends on
 * the host's local timezone; this module never accepts those.
 */
const EXPLICIT_ZONE_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Parses a caller-supplied timestamp into a UTC epoch millisecond instant,
 * or undefined if it is not a real calendar instant written with an
 * explicit zone. Calendar validity (e.g. rejecting a rolled-over
 * "2026-02-30") is checked via a UTC round trip on the written fields
 * themselves, independent of the offset attached to them, so the same
 * written instant is judged identically regardless of the host's timezone.
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
  if (offsetHours > 23 || offsetMinutes > 59) {
    return undefined;
  }
  return naiveMs - offsetSign * (offsetHours * 60 + offsetMinutes) * 60_000;
}

export type AuditEntry = {
  /** Position of this entry within its chain. */
  sequence: number;
  actorRole: AuditActorRole;
  actionCode: AuditActionCode;
  /** Caller-supplied timestamp for this entry, e.g. an ISO 8601 string. */
  timestamp: string;
  /** Declared hash of the prior entry's canonical JSON, or the genesis constant for the first entry. */
  previousHash: string;
};

/**
 * The declared previousHash value required of the first entry in any
 * chain. A chain has no entry before its first one, so there is no prior
 * canonical JSON to hash; this constant stands in for that absence.
 */
export const GENESIS_PREVIOUS_HASH = 'GENESIS';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a, 32-bit, rendered as 8 lowercase hex digits. A small, pure,
 * dependency-free string hash — not cryptographically secure, and not
 * meant to be; it exists only to make accidental or deliberate mutation of
 * an entry's declared fields detectable via a mismatched downstream link,
 * which is all a synthetic fixture chain needs.
 */
function fnv1a32Hex(input: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * The canonical JSON encoding of an audit entry's declared fields, in a
 * fixed field order chosen by this module rather than left to incidental
 * object key order. This is the exact string hashAuditEntry() hashes.
 */
export function canonicalAuditEntryJson(entry: AuditEntry): string {
  return JSON.stringify({
    sequence: entry.sequence,
    actorRole: entry.actorRole,
    actionCode: entry.actionCode,
    timestamp: entry.timestamp,
    previousHash: entry.previousHash,
  });
}

/**
 * The declared pure hash function this module uses to link entries: FNV-1a
 * over an entry's canonical JSON. Pure and deterministic — the same entry
 * always hashes to the same value, in any process, on any machine.
 */
export function hashAuditEntry(entry: AuditEntry): string {
  return fnv1a32Hex(canonicalAuditEntryJson(entry));
}

export type AuditTrailStatus = 'VERIFIED' | 'BROKEN';

export type AuditTrailReasonCode =
  | 'genesis-hash-invalid'
  | 'sequence-gap'
  | 'previous-hash-mismatch'
  | 'timestamp-invalid'
  | 'timestamp-duplicate'
  | 'timestamp-out-of-order'
  | 'actor-role-unknown'
  | 'action-code-unknown'
  | 'action-not-permitted-for-role';

const REASON_MESSAGES: Record<AuditTrailReasonCode, string> = {
  'genesis-hash-invalid': 'The first entry’s previousHash is not the declared genesis constant.',
  'sequence-gap': 'This entry’s sequence number does not follow the prior entry’s by exactly 1.',
  'previous-hash-mismatch': 'This entry’s previousHash does not match the computed hash of the prior entry.',
  'timestamp-invalid': 'The entry timestamp could not be parsed.',
  'timestamp-duplicate': 'The entry timestamp repeats the prior entry’s timestamp.',
  'timestamp-out-of-order': 'The entry timestamp precedes the prior entry’s timestamp.',
  'actor-role-unknown': 'The actor role is not on the bounded known role list.',
  'action-code-unknown': 'The action code is not on the bounded known action code list.',
  'action-not-permitted-for-role': 'This action code is not permitted for this actor’s role.',
};

/** Deterministic, privacy-safe human-readable text for a reason code, suitable for UI display. */
export function explainAuditTrailReason(code: AuditTrailReasonCode): string {
  return REASON_MESSAGES[code];
}

const REASON_NEXT_ACTIONS: Record<AuditTrailReasonCode, string> = {
  'genesis-hash-invalid': 'Resupply the first entry with previousHash set to the declared genesis constant.',
  'sequence-gap': 'Resupply the missing intermediate entry, or correct this entry’s sequence number.',
  'previous-hash-mismatch': 'Investigate tampering: recompute the prior entry’s hash and confirm it was not altered after being recorded.',
  'timestamp-invalid': 'Resupply a parsable timestamp for this entry.',
  'timestamp-duplicate': 'Resupply a timestamp strictly later than the prior entry.',
  'timestamp-out-of-order': 'Resupply a timestamp strictly later than the prior entry, or correct the chain order.',
  'actor-role-unknown': 'Resupply an actor role from the known role list.',
  'action-code-unknown': 'Resupply an action code from the known action code list.',
  'action-not-permitted-for-role': 'Resupply an action code permitted for this actor’s role, or correct the role.',
};

/** Deterministic, privacy-safe next corrective action for a reason code, suitable for UI display alongside the explanation. */
export function explainAuditTrailNextAction(code: AuditTrailReasonCode): string {
  return REASON_NEXT_ACTIONS[code];
}

export type AuditTrailFailure = {
  /** Index into the input entry list of the first entry that broke a rule. */
  entryIndex: number;
  code: AuditTrailReasonCode;
};

export type AuditTrailSummary = {
  status: AuditTrailStatus;
  entryCount: number;
  /** hashAuditEntry() of the final entry, present only when status is VERIFIED and entryCount > 0. */
  finalHash?: string;
  failure?: AuditTrailFailure;
};

export type AuditTrailInputErrorCode = 'entries-not-array' | 'entry-malformed';

const INPUT_ERROR_MESSAGES: Record<AuditTrailInputErrorCode, string> = {
  'entries-not-array': 'The audit entry input is not a list of entries.',
  'entry-malformed': 'An audit entry is missing a required field or has the wrong shape.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a fail-closed summary. */
export class AuditTrailInputError extends Error {
  readonly code: AuditTrailInputErrorCode;

  constructor(code: AuditTrailInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'AuditTrailInputError';
    this.code = code;
  }
}

function fail(code: AuditTrailInputErrorCode): never {
  throw new AuditTrailInputError(code);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStructurallyValidEntry(raw: unknown): raw is AuditEntry {
  if (!isPlainObject(raw)) {
    return false;
  }
  return (
    typeof raw.sequence === 'number' &&
    Number.isInteger(raw.sequence) &&
    isNonEmptyString(raw.actorRole) &&
    isNonEmptyString(raw.actionCode) &&
    isNonEmptyString(raw.timestamp) &&
    isNonEmptyString(raw.previousHash)
  );
}

/**
 * Verify an ordered list of fabricated audit entries and return a
 * deterministic summary naming only the index and reason code of the first
 * entry that breaks a chain rule, if any.
 *
 * Fail-closed: an empty entry list is treated as a trivially verified
 * chain of length 0. Structurally unusable input (not an array, or an
 * entry missing a required field or with the wrong shape) throws
 * AuditTrailInputError instead of guessing at a summary.
 */
export function verifyAuditTrail(rawEntries: unknown): AuditTrailSummary {
  if (!Array.isArray(rawEntries)) {
    fail('entries-not-array');
  }

  const entries: AuditEntry[] = rawEntries.map((raw) => {
    if (!isStructurallyValidEntry(raw)) {
      fail('entry-malformed');
    }
    return raw;
  });

  if (entries.length === 0) {
    return { status: 'VERIFIED', entryCount: 0 };
  }

  let previousEntry: AuditEntry | undefined;
  let previousTimestampMs: number | undefined;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const broken = (code: AuditTrailReasonCode): AuditTrailSummary => ({
      status: 'BROKEN',
      entryCount: entries.length,
      failure: { entryIndex: index, code },
    });

    if (previousEntry === undefined) {
      if (entry.previousHash !== GENESIS_PREVIOUS_HASH) {
        return broken('genesis-hash-invalid');
      }
    } else {
      if (entry.sequence !== previousEntry.sequence + 1) {
        return broken('sequence-gap');
      }
      if (entry.previousHash !== hashAuditEntry(previousEntry)) {
        return broken('previous-hash-mismatch');
      }
    }

    const timestampMs = parseExplicitZoneInstant(entry.timestamp);
    if (timestampMs === undefined) {
      return broken('timestamp-invalid');
    }
    if (previousTimestampMs !== undefined) {
      if (timestampMs === previousTimestampMs) {
        return broken('timestamp-duplicate');
      }
      if (timestampMs < previousTimestampMs) {
        return broken('timestamp-out-of-order');
      }
    }

    if (!KNOWN_ROLES.has(entry.actorRole)) {
      return broken('actor-role-unknown');
    }
    if (!KNOWN_ACTIONS.has(entry.actionCode)) {
      return broken('action-code-unknown');
    }
    if (!PERMITTED_ACTIONS[entry.actorRole].has(entry.actionCode)) {
      return broken('action-not-permitted-for-role');
    }

    previousEntry = entry;
    previousTimestampMs = timestampMs;
  }

  return { status: 'VERIFIED', entryCount: entries.length, finalHash: hashAuditEntry(previousEntry as AuditEntry) };
}
