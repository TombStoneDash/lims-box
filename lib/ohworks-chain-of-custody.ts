/**
 * Fail-closed, privacy-safe chain-of-custody validation for the synthetic
 * OHWorks pilot.
 *
 * This module is a pure, dependency-free validator: given a caller-supplied
 * opaque specimen reference token and an ordered list of fabricated custody
 * transfers (a releasing actor and role, a receiving actor and role, a
 * caller-supplied timestamp, and an optional seal id), it walks the list in
 * order and returns the first rule the chain breaks, if any. It performs no
 * I/O, touches no real specimen, patient, or customer data, and never
 * returns an actor name, a role, a timestamp, or a seal id in its output —
 * only a bounded transfer index and a bounded reason code.
 *
 * A chain is rejected, in this order, for the first transfer at which:
 *
 *   1. a custody gap        — the releasing actor does not match the actor
 *                              who received custody in the prior transfer
 *   2. a timestamp problem   — the timestamp is not a strict, calendar-valid
 *                              ISO 8601 date-time with an explicit timezone
 *                              designator (Z or a numeric offset), or it
 *                              repeats the prior transfer's timestamp, or
 *                              precedes it
 *   3. a self-transfer       — the releasing and receiving actor are the same
 *   4. an unknown role       — the releasing or receiving role is not on the
 *                              bounded known role list
 *   5. a broken/reused seal  — a supplied seal id does not match the
 *                              required seal id format, or repeats a seal id
 *                              already used earlier in the chain
 *   6. post-disposal transfer — the transfer follows an earlier transfer
 *                              recorded as the terminal disposal event
 *
 * Structurally unusable input (not an array, a transfer missing a required
 * field, or an invalid reference token) throws a typed error instead of
 * guessing at a summary.
 */

/** Bounded custody roles this module knows how to validate. */
export type CustodyRole =
  | 'COLLECTOR'
  | 'COURIER'
  | 'RECEIVING_ANALYST'
  | 'STORAGE_CUSTODIAN'
  | 'QC_REVIEWER'
  | 'DISPOSAL_AGENT';

const KNOWN_ROLES: ReadonlySet<string> = new Set<CustodyRole>([
  'COLLECTOR',
  'COURIER',
  'RECEIVING_ANALYST',
  'STORAGE_CUSTODIAN',
  'QC_REVIEWER',
  'DISPOSAL_AGENT',
]);

/** A transfer is either an ordinary handoff or the terminal disposal event; nothing may follow a disposal event. */
export type CustodyEventType = 'TRANSFER' | 'DISPOSAL';

const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set<CustodyEventType>(['TRANSFER', 'DISPOSAL']);

/** Seal ids must be uppercase alphanumeric, 4-32 characters, e.g. "SEAL0042". */
const SEAL_ID_PATTERN = /^[A-Z0-9]{4,32}$/;

/**
 * Strict ISO 8601 date-time with an explicit timezone designator (Z or a
 * numeric +HH:MM/-HH:MM offset). Date.parse() also accepts date-only,
 * locale-style, and timezone-less shapes whose absolute instant depends on
 * the host's local timezone; this module never accepts those.
 */
const STRICT_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  return DAYS_IN_MONTH[month - 1];
}

/**
 * Days since the Unix epoch for a proleptic-Gregorian calendar date
 * (Howard Hinnant's days_from_civil algorithm). Pure integer arithmetic —
 * consults no Date object and no host timezone.
 */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/**
 * Parse a strict, explicit-timezone ISO 8601 timestamp into epoch
 * milliseconds, or NaN if it is malformed or names a calendar-invalid date
 * (e.g. 2026-02-30, which Date.parse silently rolls over into March).
 * Computed entirely from the parsed digits and the parsed offset — never
 * from a Date object or the host timezone — so the result, and therefore
 * chain ordering, is identical no matter what timezone the process runs in.
 */
function parseStrictTimestamp(raw: string): number {
  const match = STRICT_TIMESTAMP_PATTERN.exec(raw);
  if (!match) {
    return NaN;
  }
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr, fractionStr, tz] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = Number(secondStr);

  if (month < 1 || month > 12) {
    return NaN;
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    return NaN;
  }
  if (hour > 23 || minute > 59 || second > 59) {
    return NaN;
  }

  let offsetMinutes = 0;
  if (tz !== 'Z') {
    const sign = tz[0] === '-' ? -1 : 1;
    const offsetHours = Number(tz.slice(1, 3));
    const offsetMins = Number(tz.slice(4, 6));
    if (offsetHours > 23 || offsetMins > 59) {
      return NaN;
    }
    offsetMinutes = sign * (offsetHours * 60 + offsetMins);
  }

  const fractionMs = fractionStr ? Math.round(Number(`0.${fractionStr}`) * 1000) : 0;
  const utcMs =
    daysFromCivil(year, month, day) * 86_400_000 +
    hour * 3_600_000 +
    minute * 60_000 +
    second * 1_000 +
    fractionMs;

  return utcMs - offsetMinutes * 60_000;
}

export type CustodyTransfer = {
  /** Synthetic actor identifier releasing custody. Never a real name. */
  releasingActor: string;
  /** Raw releasing role string; may be unrecognized. */
  releasingRole: string;
  /** Synthetic actor identifier receiving custody. Never a real name. */
  receivingActor: string;
  /** Raw receiving role string; may be unrecognized. */
  receivingRole: string;
  /** Caller-supplied timestamp for this transfer, e.g. an ISO 8601 string. */
  timestamp: string;
  /** Optional seal id applied or verified during this transfer. */
  sealId?: string;
  /** Defaults to 'TRANSFER' when omitted. */
  eventType?: CustodyEventType;
};

export type CustodyChainStatus = 'VALID' | 'INVALID';

export type CustodyChainReasonCode =
  | 'custody-gap'
  | 'timestamp-invalid'
  | 'timestamp-duplicate'
  | 'timestamp-out-of-order'
  | 'self-transfer'
  | 'releasing-role-unknown'
  | 'receiving-role-unknown'
  | 'seal-id-invalid'
  | 'seal-id-reused'
  | 'transfer-after-disposal';

const REASON_MESSAGES: Record<CustodyChainReasonCode, string> = {
  'custody-gap': 'The releasing actor for this transfer does not match the actor who received custody in the prior transfer.',
  'timestamp-invalid': 'The transfer timestamp could not be parsed.',
  'timestamp-duplicate': 'The transfer timestamp repeats the prior transfer’s timestamp.',
  'timestamp-out-of-order': 'The transfer timestamp precedes the prior transfer’s timestamp.',
  'self-transfer': 'The releasing and receiving actor for this transfer are the same.',
  'releasing-role-unknown': 'The releasing role is not on the bounded known role list.',
  'receiving-role-unknown': 'The receiving role is not on the bounded known role list.',
  'seal-id-invalid': 'The supplied seal id does not match the required seal id format.',
  'seal-id-reused': 'The supplied seal id was already used earlier in this custody chain.',
  'transfer-after-disposal': 'This transfer occurs after an earlier transfer recorded as the terminal disposal event.',
};

/** Deterministic, privacy-safe human-readable text for a reason code, suitable for UI display. */
export function explainCustodyChainReason(code: CustodyChainReasonCode): string {
  return REASON_MESSAGES[code];
}

const REASON_NEXT_ACTIONS: Record<CustodyChainReasonCode, string> = {
  'custody-gap': 'Correct the releasing actor so it matches who last received custody, or supply the missing intermediate transfer.',
  'timestamp-invalid': 'Resupply a parsable timestamp for this transfer.',
  'timestamp-duplicate': 'Resupply a timestamp strictly later than the prior transfer.',
  'timestamp-out-of-order': 'Resupply a timestamp strictly later than the prior transfer, or correct the chain order.',
  'self-transfer': 'Correct the releasing or receiving actor so they are not the same.',
  'releasing-role-unknown': 'Resupply a releasing role from the known role list.',
  'receiving-role-unknown': 'Resupply a receiving role from the known role list.',
  'seal-id-invalid': 'Resupply a seal id matching the required format.',
  'seal-id-reused': 'Resupply a seal id that has not already been used earlier in this chain.',
  'transfer-after-disposal': 'Remove or correct this transfer; no custody transfer may follow the terminal disposal event.',
};

/** Deterministic, privacy-safe next corrective action for a reason code, suitable for UI display alongside the explanation. */
export function explainCustodyChainNextAction(code: CustodyChainReasonCode): string {
  return REASON_NEXT_ACTIONS[code];
}

export type CustodyChainFailure = {
  /** Index into the input transfer list of the first transfer that broke a rule. */
  transferIndex: number;
  code: CustodyChainReasonCode;
};

/** The privacy-safe summary. No actor, role, timestamp, or seal id ever appears in this output. */
export type CustodyChainSummary = {
  referenceToken: string;
  status: CustodyChainStatus;
  failure?: CustodyChainFailure;
};

export type CustodyChainInputErrorCode = 'reference-token-invalid' | 'transfers-not-array' | 'transfer-malformed';

const INPUT_ERROR_MESSAGES: Record<CustodyChainInputErrorCode, string> = {
  'reference-token-invalid': 'The specimen reference token is invalid.',
  'transfers-not-array': 'The custody transfer input is not a list of transfers.',
  'transfer-malformed': 'A custody transfer is missing a required field or has the wrong shape.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a fail-closed summary. */
export class CustodyChainInputError extends Error {
  readonly code: CustodyChainInputErrorCode;

  constructor(code: CustodyChainInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'CustodyChainInputError';
    this.code = code;
  }
}

function fail(code: CustodyChainInputErrorCode): never {
  throw new CustodyChainInputError(code);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStructurallyValidTransfer(raw: unknown): raw is CustodyTransfer {
  if (!isPlainObject(raw)) {
    return false;
  }
  return (
    isNonEmptyString(raw.releasingActor) &&
    isNonEmptyString(raw.releasingRole) &&
    isNonEmptyString(raw.receivingActor) &&
    isNonEmptyString(raw.receivingRole) &&
    isNonEmptyString(raw.timestamp) &&
    (raw.sealId === undefined || isNonEmptyString(raw.sealId)) &&
    (raw.eventType === undefined || KNOWN_EVENT_TYPES.has(raw.eventType as string))
  );
}

/**
 * Validate an ordered list of fabricated custody transfers for a specimen
 * and return a privacy-safe summary naming only the index and reason code of
 * the first transfer that breaks a chain-of-custody rule, if any.
 *
 * Fail-closed: an empty transfer list is treated as a trivially valid chain.
 * Structurally unusable input (not an array, an invalid reference token, or
 * a transfer missing a required field) throws CustodyChainInputError instead
 * of guessing at a summary.
 */
export function validateCustodyChain(referenceToken: unknown, rawTransfers: unknown): CustodyChainSummary {
  if (!isNonEmptyString(referenceToken)) {
    fail('reference-token-invalid');
  }
  if (!Array.isArray(rawTransfers)) {
    fail('transfers-not-array');
  }

  const transfers: CustodyTransfer[] = rawTransfers.map((raw) => {
    if (!isStructurallyValidTransfer(raw)) {
      fail('transfer-malformed');
    }
    return raw;
  });

  const seenSealIds = new Set<string>();
  let previousReceivingActor: string | undefined;
  let previousTimestampMs: number | undefined;
  let disposalSeen = false;

  for (let index = 0; index < transfers.length; index += 1) {
    const transfer = transfers[index];
    const invalid = (code: CustodyChainReasonCode): CustodyChainSummary => ({
      referenceToken,
      status: 'INVALID',
      failure: { transferIndex: index, code },
    });

    if (previousReceivingActor !== undefined && transfer.releasingActor !== previousReceivingActor) {
      return invalid('custody-gap');
    }

    const timestampMs = parseStrictTimestamp(transfer.timestamp);
    if (!Number.isFinite(timestampMs)) {
      return invalid('timestamp-invalid');
    }
    if (previousTimestampMs !== undefined) {
      if (timestampMs === previousTimestampMs) {
        return invalid('timestamp-duplicate');
      }
      if (timestampMs < previousTimestampMs) {
        return invalid('timestamp-out-of-order');
      }
    }

    if (transfer.releasingActor === transfer.receivingActor) {
      return invalid('self-transfer');
    }

    if (!KNOWN_ROLES.has(transfer.releasingRole)) {
      return invalid('releasing-role-unknown');
    }
    if (!KNOWN_ROLES.has(transfer.receivingRole)) {
      return invalid('receiving-role-unknown');
    }

    if (transfer.sealId !== undefined) {
      if (!SEAL_ID_PATTERN.test(transfer.sealId)) {
        return invalid('seal-id-invalid');
      }
      if (seenSealIds.has(transfer.sealId)) {
        return invalid('seal-id-reused');
      }
    }

    if (disposalSeen) {
      return invalid('transfer-after-disposal');
    }

    if (transfer.sealId !== undefined) {
      seenSealIds.add(transfer.sealId);
    }
    previousReceivingActor = transfer.receivingActor;
    previousTimestampMs = timestampMs;
    if (transfer.eventType === 'DISPOSAL') {
      disposalSeen = true;
    }
  }

  return { referenceToken, status: 'VALID' };
}
