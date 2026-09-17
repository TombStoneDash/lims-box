/**
 * Deterministic, fail-closed external reference-lab send-out tracking for
 * the synthetic OHWorks pilot.
 *
 * This module is a pure, dependency-free evaluator: given a bounded
 * synthetic reference-lab identifier, the lab's declared turnaround (in
 * whole days, from receipt to result), and an ordered list of fabricated
 * state-transition events — each with a caller-supplied timestamp and,
 * from `shipped` onward, a courier/shipment reference — it validates the
 * transition sequence and, when valid, computes the expected result date
 * and flags an overdue send-out.
 *
 * A send-out record moves through exactly these states, in this order,
 * one step at a time: `prepared`, `shipped`, `received_by_reference`,
 * `resulted`, `returned`. A record may stop at any state (e.g. still
 * `shipped` and awaiting receipt); it may never skip a state, repeat a
 * state, or move backward.
 *
 * The expected result date is computed as the `received_by_reference`
 * timestamp plus the declared turnaround — the lab's promised turnaround
 * only starts once it has the specimen in hand, so a record that has not
 * yet reached `received_by_reference` has no expected result date and is
 * never flagged overdue, no matter how long shipping takes. A record with
 * an expected result date that has not reached `resulted` by the
 * caller-supplied "as of" timestamp is `overdue`; a record that reached
 * `resulted` after its expected result date is flagged `resultedLate`
 * instead.
 *
 * This module performs no I/O and reads no clock: every timestamp,
 * including "now", is supplied by the caller, which keeps every result
 * reproducible. It touches no real specimen, patient, or customer data —
 * only fabricated identifiers and timestamps.
 *
 * It fails closed, in this order, at the first event that breaks a rule:
 *
 *   1. an unrecognized reference lab   — the lab id is not on the bounded
 *                                        known reference-lab list
 *   2. an unknown state                — the event's state is not one of
 *                                        the five bounded states
 *   3. a broken sequence                — the first event is not
 *                                        `prepared`, a state repeats, a
 *                                        state moves backward, or a state
 *                                        is skipped
 *   4. a timestamp problem              — the timestamp is not a strict,
 *                                        calendar-valid ISO 8601
 *                                        date-time with an explicit
 *                                        timezone designator, or it
 *                                        repeats or precedes the prior
 *                                        event's timestamp
 *   5. a missing/invalid/mismatched     — from `shipped` onward, the
 *      shipment reference               event lacks a courier reference,
 *                                        the reference fails the required
 *                                        format, or (for `shipped`,
 *                                        `received_by_reference`, and
 *                                        `resulted`, which share one
 *                                        outbound shipment) it disagrees
 *                                        with the reference already set
 *
 * Structurally unusable input (not an object, an out-of-range turnaround,
 * an empty or non-array event list, an event missing a required field, or
 * an unparsable "as of" timestamp) throws a typed error instead of
 * guessing at a summary.
 */

/** The five states a send-out record moves through, in fixed order. */
export type SendoutState = 'prepared' | 'shipped' | 'received_by_reference' | 'resulted' | 'returned';

export const SENDOUT_STATES: readonly SendoutState[] = [
  'prepared',
  'shipped',
  'received_by_reference',
  'resulted',
  'returned',
];

const STATE_ORDER: Record<SendoutState, number> = {
  prepared: 0,
  shipped: 1,
  received_by_reference: 2,
  resulted: 3,
  returned: 4,
};

const KNOWN_STATES: ReadonlySet<string> = new Set<SendoutState>(SENDOUT_STATES);

/** Bounded synthetic reference-lab registry this module recognizes. Never a real vendor name. */
export type ReferenceLabId = 'REFLAB_ALPHA' | 'REFLAB_BRAVO' | 'REFLAB_CHARLIE' | 'REFLAB_DELTA';

export const KNOWN_REFERENCE_LAB_IDS: readonly ReferenceLabId[] = [
  'REFLAB_ALPHA',
  'REFLAB_BRAVO',
  'REFLAB_CHARLIE',
  'REFLAB_DELTA',
];

const KNOWN_REFERENCE_LAB_SET: ReadonlySet<string> = new Set<ReferenceLabId>(KNOWN_REFERENCE_LAB_IDS);

/** Whether `id` is on the bounded known reference-lab list. */
export function isKnownReferenceLab(id: unknown): boolean {
  return typeof id === 'string' && KNOWN_REFERENCE_LAB_SET.has(id);
}

/** Shipment/courier tracking references must be uppercase alphanumeric with optional dashes, 6-40 characters. */
const COURIER_REFERENCE_PATTERN = /^[A-Z0-9][A-Z0-9-]{4,38}[A-Z0-9]$/;

const MIN_TURNAROUND_DAYS = 1;
const MAX_TURNAROUND_DAYS = 365;
const DAY_MS = 86_400_000;

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
 * Inverse of daysFromCivil (Howard Hinnant's civil_from_days algorithm):
 * turns a day count since the Unix epoch back into a proleptic-Gregorian
 * calendar date. Also pure integer arithmetic — no Date object, no host
 * timezone.
 */
function civilFromDays(z: number): { year: number; month: number; day: number } {
  const zAdj = z + 719468;
  const era = Math.floor((zAdj >= 0 ? zAdj : zAdj - 146096) / 146097);
  const doe = zAdj - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  const year = y + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

/**
 * Parse a strict, explicit-timezone ISO 8601 timestamp into epoch
 * milliseconds, or NaN if it is malformed or names a calendar-invalid date
 * (e.g. 2026-02-30, which Date.parse silently rolls over into March).
 * Computed entirely from the parsed digits and the parsed offset — never
 * from a Date object or the host timezone.
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

/** Format epoch milliseconds back into a strict UTC ISO 8601 timestamp, e.g. "2026-01-05T00:00:00.000Z". */
function formatIsoUtc(epochMs: number): string {
  const days = Math.floor(epochMs / DAY_MS);
  const msOfDay = epochMs - days * DAY_MS;
  const { year, month, day } = civilFromDays(days);
  const hour = Math.floor(msOfDay / 3_600_000);
  const minute = Math.floor((msOfDay % 3_600_000) / 60_000);
  const second = Math.floor((msOfDay % 60_000) / 1000);
  const ms = msOfDay % 1000;
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}.${pad(ms, 3)}Z`;
}

/** A single fabricated state-transition event in a send-out record. */
export type SendoutEvent = {
  state: SendoutState;
  /** Caller-supplied strict ISO 8601 timestamp with explicit timezone designator. */
  occurredAt: string;
  /**
   * Shipment/courier tracking reference. Required from `shipped` onward.
   * `shipped`, `received_by_reference`, and `resulted` share one outbound
   * shipment and must carry the same reference; `returned` is a separate
   * shipment leg and may carry a different one.
   */
  courierReference?: string;
};

export type SendoutInput = {
  /** Synthetic reference-lab identifier. Must be on the bounded known reference-lab list. */
  referenceLabId: string;
  /** The reference lab's declared turnaround, in whole days, from receipt to result. */
  declaredTurnaroundDays: number;
  /** Ordered list of state-transition events; the first must be `prepared`. */
  events: ReadonlyArray<SendoutEvent>;
};

export type SendoutStatus = 'VALID' | 'INVALID';

export type SendoutReasonCode =
  | 'reference-lab-unknown'
  | 'state-unknown'
  | 'first-event-not-prepared'
  | 'state-repeated'
  | 'state-out-of-order'
  | 'state-skipped'
  | 'timestamp-invalid'
  | 'timestamp-duplicate'
  | 'timestamp-out-of-order'
  | 'courier-reference-missing'
  | 'courier-reference-invalid'
  | 'courier-reference-mismatch';

const REASON_MESSAGES: Record<SendoutReasonCode, string> = {
  'reference-lab-unknown': 'The reference lab id is not on the bounded known reference-lab list.',
  'state-unknown': 'The event state is not one of the five bounded send-out states.',
  'first-event-not-prepared': 'The first event in a send-out record must be the prepared state.',
  'state-repeated': 'This event repeats the same state as the prior event.',
  'state-out-of-order': 'This event moves to a state that precedes the prior event.',
  'state-skipped': 'This event skips over a required intermediate state.',
  'timestamp-invalid': 'The event timestamp could not be parsed.',
  'timestamp-duplicate': 'The event timestamp repeats the prior event’s timestamp.',
  'timestamp-out-of-order': 'The event timestamp precedes the prior event’s timestamp.',
  'courier-reference-missing': 'A courier/shipment reference is required from the shipped state onward.',
  'courier-reference-invalid': 'The courier/shipment reference does not match the required format.',
  'courier-reference-mismatch': 'The courier/shipment reference disagrees with the outbound shipment’s reference.',
};

/** Deterministic, privacy-safe human-readable text for a reason code, suitable for display. */
export function explainSendoutReason(code: SendoutReasonCode): string {
  return REASON_MESSAGES[code];
}

const REASON_NEXT_ACTIONS: Record<SendoutReasonCode, string> = {
  'reference-lab-unknown': 'Resupply a reference lab id from the known reference-lab list.',
  'state-unknown': 'Resupply an event state from the five bounded send-out states.',
  'first-event-not-prepared': 'Reorder the event list so the first event is the prepared state.',
  'state-repeated': 'Remove the duplicate event or correct its state.',
  'state-out-of-order': 'Correct the event order so states only move forward.',
  'state-skipped': 'Supply the missing intermediate state event.',
  'timestamp-invalid': 'Resupply a parsable timestamp for this event.',
  'timestamp-duplicate': 'Resupply a timestamp strictly later than the prior event.',
  'timestamp-out-of-order': 'Resupply a timestamp strictly later than the prior event, or correct the event order.',
  'courier-reference-missing': 'Resupply a courier/shipment reference for this event.',
  'courier-reference-invalid': 'Resupply a courier/shipment reference matching the required format.',
  'courier-reference-mismatch': 'Resupply the same outbound shipment reference used for the shipped event.',
};

/** Deterministic, privacy-safe next corrective action for a reason code. */
export function explainSendoutNextAction(code: SendoutReasonCode): string {
  return REASON_NEXT_ACTIONS[code];
}

export type SendoutFailure = {
  /** Index into the input event list of the first event that broke a rule, or -1 for a record-level failure. */
  eventIndex: number;
  code: SendoutReasonCode;
};

export type SendoutSummary = {
  referenceLabId: string;
  status: SendoutStatus;
  /** The state of the last event in the record. Only present when status is VALID. */
  currentState?: SendoutState;
  /** received_by_reference timestamp plus the declared turnaround. Only present once the record has reached received_by_reference. */
  expectedResultDate?: string;
  /** True when the record has an expected result date, has not yet reached resulted, and the "as of" timestamp is past it. */
  overdue: boolean;
  /** Whole days past the expected result date, only present when overdue is true. */
  daysOverdue?: number;
  /** True when the record reached resulted after its expected result date. */
  resultedLate?: boolean;
  failure?: SendoutFailure;
};

export type SendoutInputErrorCode =
  | 'input-not-object'
  | 'reference-lab-id-invalid'
  | 'turnaround-days-invalid'
  | 'events-not-array'
  | 'events-empty'
  | 'event-malformed'
  | 'as-of-timestamp-invalid';

const INPUT_ERROR_MESSAGES: Record<SendoutInputErrorCode, string> = {
  'input-not-object': 'The send-out input is not an object.',
  'reference-lab-id-invalid': 'The reference lab id is invalid.',
  'turnaround-days-invalid': `The declared turnaround must be a whole number of days between ${MIN_TURNAROUND_DAYS} and ${MAX_TURNAROUND_DAYS}.`,
  'events-not-array': 'The send-out event input is not a list of events.',
  'events-empty': 'A send-out record must include at least the prepared event.',
  'event-malformed': 'A send-out event is missing a required field or has the wrong shape.',
  'as-of-timestamp-invalid': 'The "as of" timestamp is invalid.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a fail-closed summary. */
export class SendoutInputError extends Error {
  readonly code: SendoutInputErrorCode;

  constructor(code: SendoutInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'SendoutInputError';
    this.code = code;
  }
}

function fail(code: SendoutInputErrorCode): never {
  throw new SendoutInputError(code);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStructurallyValidEvent(raw: unknown): raw is SendoutEvent {
  if (!isPlainObject(raw)) {
    return false;
  }
  return (
    isNonEmptyString(raw.state) &&
    isNonEmptyString(raw.occurredAt) &&
    (raw.courierReference === undefined || isNonEmptyString(raw.courierReference))
  );
}

/**
 * Validate a fabricated send-out record's state-transition sequence and,
 * when valid, compute its expected result date and overdue status as of
 * the caller-supplied `asOfTimestamp`.
 *
 * Fail-closed: structurally unusable input (not an object, an out-of-range
 * turnaround, an empty or non-array event list, a malformed event, or an
 * unparsable "as of" timestamp) throws SendoutInputError. An unrecognized
 * reference lab, a missing/invalid/mismatched shipment reference, or an
 * out-of-order transition instead returns an INVALID summary naming the
 * first offending event and reason code.
 */
export function evaluateSendout(rawInput: unknown, rawAsOfTimestamp: unknown): SendoutSummary {
  if (!isPlainObject(rawInput)) {
    fail('input-not-object');
  }

  const { referenceLabId, declaredTurnaroundDays, events: rawEvents } = rawInput;

  if (!isNonEmptyString(referenceLabId)) {
    fail('reference-lab-id-invalid');
  }
  if (
    typeof declaredTurnaroundDays !== 'number' ||
    !Number.isInteger(declaredTurnaroundDays) ||
    declaredTurnaroundDays < MIN_TURNAROUND_DAYS ||
    declaredTurnaroundDays > MAX_TURNAROUND_DAYS
  ) {
    fail('turnaround-days-invalid');
  }
  if (!Array.isArray(rawEvents)) {
    fail('events-not-array');
  }
  if (rawEvents.length === 0) {
    fail('events-empty');
  }

  const events: SendoutEvent[] = rawEvents.map((raw) => {
    if (!isStructurallyValidEvent(raw)) {
      fail('event-malformed');
    }
    return raw;
  });

  if (!isNonEmptyString(rawAsOfTimestamp)) {
    fail('as-of-timestamp-invalid');
  }
  const asOfMs = parseStrictTimestamp(rawAsOfTimestamp);
  if (!Number.isFinite(asOfMs)) {
    fail('as-of-timestamp-invalid');
  }

  const invalid = (eventIndex: number, code: SendoutReasonCode): SendoutSummary => ({
    referenceLabId,
    status: 'INVALID',
    overdue: false,
    failure: { eventIndex, code },
  });

  if (!KNOWN_REFERENCE_LAB_SET.has(referenceLabId)) {
    return invalid(-1, 'reference-lab-unknown');
  }

  let previousStateIndex = -1;
  let previousTimestampMs: number | undefined;
  let outboundCourierReference: string | undefined;
  let receivedAtMs: number | undefined;
  let resultedAtMs: number | undefined;
  let currentState: SendoutState | undefined;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];

    if (!KNOWN_STATES.has(event.state)) {
      return invalid(index, 'state-unknown');
    }
    const stateIndex = STATE_ORDER[event.state];

    if (index === 0 && stateIndex !== STATE_ORDER.prepared) {
      return invalid(index, 'first-event-not-prepared');
    }
    if (stateIndex === previousStateIndex) {
      return invalid(index, 'state-repeated');
    }
    if (stateIndex < previousStateIndex) {
      return invalid(index, 'state-out-of-order');
    }
    if (stateIndex > previousStateIndex + 1) {
      return invalid(index, 'state-skipped');
    }

    const timestampMs = parseStrictTimestamp(event.occurredAt);
    if (!Number.isFinite(timestampMs)) {
      return invalid(index, 'timestamp-invalid');
    }
    if (previousTimestampMs !== undefined) {
      if (timestampMs === previousTimestampMs) {
        return invalid(index, 'timestamp-duplicate');
      }
      if (timestampMs < previousTimestampMs) {
        return invalid(index, 'timestamp-out-of-order');
      }
    }

    if (stateIndex >= STATE_ORDER.shipped) {
      if (!isNonEmptyString(event.courierReference)) {
        return invalid(index, 'courier-reference-missing');
      }
      if (!COURIER_REFERENCE_PATTERN.test(event.courierReference)) {
        return invalid(index, 'courier-reference-invalid');
      }
      if (stateIndex <= STATE_ORDER.resulted) {
        if (outboundCourierReference === undefined) {
          outboundCourierReference = event.courierReference;
        } else if (event.courierReference !== outboundCourierReference) {
          return invalid(index, 'courier-reference-mismatch');
        }
      }
    }

    if (event.state === 'received_by_reference') {
      receivedAtMs = timestampMs;
    }
    if (event.state === 'resulted') {
      resultedAtMs = timestampMs;
    }

    previousStateIndex = stateIndex;
    previousTimestampMs = timestampMs;
    currentState = event.state;
  }

  let expectedResultDate: string | undefined;
  let expectedResultMs: number | undefined;
  if (receivedAtMs !== undefined) {
    expectedResultMs = receivedAtMs + declaredTurnaroundDays * DAY_MS;
    expectedResultDate = formatIsoUtc(expectedResultMs);
  }

  let overdue = false;
  let daysOverdue: number | undefined;
  let resultedLate: boolean | undefined;

  if (expectedResultMs !== undefined) {
    if (resultedAtMs !== undefined) {
      resultedLate = resultedAtMs > expectedResultMs;
    } else if (asOfMs > expectedResultMs) {
      overdue = true;
      daysOverdue = Math.floor((asOfMs - expectedResultMs) / DAY_MS);
    }
  }

  return {
    referenceLabId,
    status: 'VALID',
    currentState,
    expectedResultDate,
    overdue,
    daysOverdue,
    resultedLate,
  };
}
