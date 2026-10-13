/**
 * Fail-closed, deterministic OHWorks critical-value NOTIFICATION DECISION
 * builder.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated
 * result, its analyte's fabricated declared critical limits (the breach
 * bounds, who must be notified by role, whether a read-back confirmation is
 * required, and the acknowledgement window), and a caller-supplied ISO 8601
 * timestamp the result was identified, it decides whether the value is
 * critical and, if so, produces a notification record describing who must
 * be notified, the acknowledgement deadline, and the read-back requirement.
 * It never sends, schedules, or triggers any outbound notification itself --
 * the returned record is a decision for a caller to act on.
 *
 * A second, independent piece of this module tracks the acknowledgement
 * lifecycle of a notification record ('pending' -> 'acknowledged' or
 * 'escalated') using caller-supplied timestamps for each transition. It
 * performs no I/O, reads no system clock, mutates no SENAITE or database
 * state, and touches no real subject, sample, or customer data.
 *
 * Decision shape:
 *   - A value breaches the declared critical limits when it is less than or
 *     equal to a declared low bound, or greater than or equal to a declared
 *     high bound. A value that breaches neither bound is not critical and no
 *     notification record is produced.
 *   - A breaching value is critical. The notification record's
 *     acknowledgeByDeadline is the identifiedAt timestamp advanced by the
 *     limits' declared acknowledgeWithinMinutes.
 *   - Fail-closed: a missing or malformed limits declaration, a declared
 *     unit that does not match the result's declared unit, an empty or
 *     inverted critical range, an empty notifyRoles list, a non-finite
 *     result value, or an unparseable identifiedAt timestamp all throw
 *     CriticalValueInputError rather than silently treating the value as
 *     non-critical.
 *
 * Acknowledgement lifecycle shape:
 *   - A fresh record starts 'pending' at the notification's identifiedAt.
 *   - From 'pending', the next caller-supplied event may acknowledge (moving
 *     to 'acknowledged') or escalate (moving to 'escalated').
 *   - From 'escalated', the next event may only acknowledge (moving to
 *     'acknowledged'); a second escalation is rejected rather than guessed
 *     at, since this module does not know how many escalation tiers a
 *     caller's policy allows.
 *   - 'acknowledged' is terminal: any further event is rejected.
 *   - Fail-closed: an unparseable event timestamp, or an event timestamp
 *     that is not strictly after the record's most recent transition
 *     (out-of-order acknowledgement), throws CriticalValueInputError instead
 *     of silently reordering history.
 */

export type NotificationRole = 'ORDERING_PROVIDER' | 'CHARGE_NURSE' | 'LAB_DIRECTOR';

const KNOWN_NOTIFICATION_ROLES: ReadonlySet<string> = new Set<NotificationRole>([
  'ORDERING_PROVIDER',
  'CHARGE_NURSE',
  'LAB_DIRECTOR',
]);

export type CriticalLimits = {
  analyteCode: string;
  unit: string;
  /** Lower critical bound, or null if this range is not bounded below. */
  low: number | null;
  /** Upper critical bound, or null if this range is not bounded above. */
  high: number | null;
  /** Ordered, declared roles that must be notified when this analyte's critical limits are breached. */
  notifyRoles: readonly NotificationRole[];
  readBackRequired: boolean;
  /** Minutes allowed, from identifiedAt, before the notification must be acknowledged. Must be a positive finite number. */
  acknowledgeWithinMinutes: number;
};

export type CriticalResultInput = {
  /** Synthetic subject identifier. Never a real patient or customer identifier. */
  subjectId: string;
  /** Fabricated analyte/parameter code. */
  analyteCode: string;
  /** Raw fabricated observed value, exactly as received; may be nonnumeric. */
  value: unknown;
  unit: string;
};

export type CriticalNotificationRecord = {
  subjectId: string;
  analyteCode: string;
  value: number;
  unit: string;
  notifyRoles: NotificationRole[];
  readBackRequired: boolean;
  identifiedAt: string;
  /** ISO 8601 timestamp: identifiedAt advanced by the limits' declared acknowledgeWithinMinutes. */
  acknowledgeByDeadline: string;
};

export type CriticalValueDecision = {
  isCritical: boolean;
  notification: CriticalNotificationRecord | null;
};

export type CriticalValueInputErrorCode =
  | 'result-malformed'
  | 'result-value-invalid'
  | 'limits-missing'
  | 'limits-malformed'
  | 'limits-analyte-mismatch'
  | 'limits-unit-mismatch'
  | 'limits-range-malformed'
  | 'limits-range-empty'
  | 'limits-range-inverted'
  | 'limits-roles-empty'
  | 'limits-roles-unknown'
  | 'limits-acknowledge-window-invalid'
  | 'identified-at-invalid'
  | 'acknowledgement-record-malformed'
  | 'acknowledgement-event-malformed'
  | 'acknowledgement-event-timestamp-invalid'
  | 'acknowledgement-event-out-of-order'
  | 'acknowledgement-invalid-transition';

const INPUT_ERROR_MESSAGES: Record<CriticalValueInputErrorCode, string> = {
  'result-malformed': 'The result is missing a required identity field.',
  'result-value-invalid': 'The result’s value is not a finite number.',
  'limits-missing': 'No critical limits were declared for this analyte.',
  'limits-malformed': 'The declared critical limits are not structurally valid.',
  'limits-analyte-mismatch': 'The result analyte does not match the declared limits analyte.',
  'limits-unit-mismatch': 'The result’s declared unit does not match the critical limits’ declared unit.',
  'limits-range-malformed': 'The declared critical range bounds are not numbers or null.',
  'limits-range-empty': 'The declared critical range has no lower or upper bound.',
  'limits-range-inverted': 'The declared critical range’s lower bound is not strictly below its upper bound.',
  'limits-roles-empty': 'The declared critical limits do not name any role to notify.',
  'limits-roles-unknown': 'The declared critical limits name a notification role that is not recognized.',
  'limits-acknowledge-window-invalid': 'The declared acknowledgement window must be a positive finite number of minutes.',
  'identified-at-invalid': 'The result’s identified timestamp could not be parsed.',
  'acknowledgement-record-malformed': 'The acknowledgement record is not structurally valid.',
  'acknowledgement-event-malformed': 'The acknowledgement event is not structurally valid.',
  'acknowledgement-event-timestamp-invalid': 'The acknowledgement event’s timestamp could not be parsed.',
  'acknowledgement-event-out-of-order':
    'The acknowledgement event’s timestamp is not strictly after the record’s most recent transition.',
  'acknowledgement-invalid-transition': 'The acknowledgement event is not a valid transition from the record’s current state.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a critical-value decision or acknowledgement transition. */
export class CriticalValueInputError extends Error {
  readonly code: CriticalValueInputErrorCode;

  constructor(code: CriticalValueInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'CriticalValueInputError';
    this.code = code;
  }
}

function fail(code: CriticalValueInputErrorCode): never {
  throw new CriticalValueInputError(code);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Date.parse accepts calendar dates that do not exist (e.g. 2026-04-31) and
 * silently rolls them over into the following month. Validate the declared
 * calendar date before delegating to Date.parse so an impossible date is
 * rejected rather than reinterpreted.
 */
function parseCalendarInstant(value: string): number {
  const date = /^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})(?=[Tt\s]|$)/.exec(value);
  if (!date) return Date.parse(value);

  const year = Number(date[1]);
  const month = Number(date[2]);
  const day = Number(date[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) return NaN;

  return Date.parse(value);
}

function validateResultShape(result: CriticalResultInput): void {
  if (!isPlainObject(result)) {
    fail('result-malformed');
  }
  const candidate = result as unknown as Record<string, unknown>;
  if (
    !isNonEmptyString(candidate.subjectId) ||
    !isNonEmptyString(candidate.analyteCode) ||
    !isNonEmptyString(candidate.unit)
  ) {
    fail('result-malformed');
  }
}

function validateLimits(limits: CriticalLimits, resultUnit: string, resultAnalyte: string): { low: number | null; high: number | null } {
  if (limits === null || limits === undefined) {
    fail('limits-missing');
  }
  if (!isPlainObject(limits)) {
    fail('limits-malformed');
  }
  const candidate = limits as unknown as Record<string, unknown>;
  if (!isNonEmptyString(candidate.analyteCode) || !isNonEmptyString(candidate.unit)) {
    fail('limits-malformed');
  }
  if (candidate.analyteCode !== resultAnalyte) {
    fail('limits-analyte-mismatch');
  }
  if (candidate.unit !== resultUnit) {
    fail('limits-unit-mismatch');
  }

  const low = candidate.low;
  const high = candidate.high;
  if (
    (low !== null && typeof low !== 'number') ||
    (high !== null && typeof high !== 'number') ||
    (typeof low === 'number' && !Number.isFinite(low)) ||
    (typeof high === 'number' && !Number.isFinite(high))
  ) {
    fail('limits-range-malformed');
  }
  const resolvedLow = low as number | null;
  const resolvedHigh = high as number | null;
  if (resolvedLow === null && resolvedHigh === null) {
    fail('limits-range-empty');
  }
  if (resolvedLow !== null && resolvedHigh !== null && resolvedLow >= resolvedHigh) {
    fail('limits-range-inverted');
  }

  if (!Array.isArray(candidate.notifyRoles) || candidate.notifyRoles.length === 0) {
    fail('limits-roles-empty');
  }
  for (const role of candidate.notifyRoles) {
    if (typeof role !== 'string' || !KNOWN_NOTIFICATION_ROLES.has(role)) {
      fail('limits-roles-unknown');
    }
  }

  if (typeof candidate.readBackRequired !== 'boolean') {
    fail('limits-malformed');
  }

  const acknowledgeWithinMinutes = toFiniteNumber(candidate.acknowledgeWithinMinutes);
  if (acknowledgeWithinMinutes === undefined || acknowledgeWithinMinutes <= 0) {
    fail('limits-acknowledge-window-invalid');
  }

  return { low: resolvedLow, high: resolvedHigh };
}

/**
 * Decide whether a fabricated result breaches its analyte's fabricated
 * declared critical limits and, if so, build the notification record a
 * caller must act on.
 *
 * Fail-closed: see the module doc for the full list of inputs that throw
 * CriticalValueInputError rather than guessing at a decision.
 */
export function evaluateCriticalValue(
  result: CriticalResultInput,
  limits: CriticalLimits,
  identifiedAt: string,
): CriticalValueDecision {
  validateResultShape(result);
  const range = validateLimits(limits, result.unit, result.analyteCode);

  const value = toFiniteNumber(result.value);
  if (value === undefined) {
    fail('result-value-invalid');
  }

  const identifiedTime = parseCalendarInstant(identifiedAt);
  if (!Number.isFinite(identifiedTime)) {
    fail('identified-at-invalid');
  }

  const breachesLow = range.low !== null && value <= range.low;
  const breachesHigh = range.high !== null && value >= range.high;
  if (!breachesLow && !breachesHigh) {
    return { isCritical: false, notification: null };
  }

  const deadlineTime = identifiedTime + limits.acknowledgeWithinMinutes * 60000;

  const notification: CriticalNotificationRecord = Object.freeze({
    subjectId: result.subjectId,
    analyteCode: result.analyteCode,
    value,
    unit: result.unit,
    notifyRoles: [...limits.notifyRoles],
    readBackRequired: limits.readBackRequired,
    identifiedAt,
    acknowledgeByDeadline: new Date(deadlineTime).toISOString(),
  });

  return { isCritical: true, notification };
}

export type AcknowledgementState = 'pending' | 'acknowledged' | 'escalated';

export type AcknowledgementTransition = {
  state: AcknowledgementState;
  at: string;
};

export type AcknowledgementRecord = {
  state: AcknowledgementState;
  history: ReadonlyArray<AcknowledgementTransition>;
};

export type AcknowledgementEvent = {
  type: 'acknowledge' | 'escalate';
  at: string;
};

const ALLOWED_TRANSITIONS: Record<AcknowledgementState, Partial<Record<AcknowledgementEvent['type'], AcknowledgementState>>> = {
  pending: { acknowledge: 'acknowledged', escalate: 'escalated' },
  escalated: { acknowledge: 'acknowledged' },
  acknowledged: {},
};

/** Build a fresh, 'pending' acknowledgement record anchored at the notification's identifiedAt. */
export function createAcknowledgementRecord(identifiedAt: string): AcknowledgementRecord {
  const identifiedTime = parseCalendarInstant(identifiedAt);
  if (!Number.isFinite(identifiedTime)) {
    fail('identified-at-invalid');
  }
  return Object.freeze({
    state: 'pending' as const,
    history: Object.freeze([Object.freeze({ state: 'pending' as const, at: identifiedAt })]),
  });
}

/**
 * Apply a single caller-supplied acknowledgement-lifecycle event to a
 * record, returning a new, immutable record. The input record is never
 * mutated.
 *
 * Fail-closed: see the module doc's acknowledgement lifecycle shape for the
 * full list of events that throw CriticalValueInputError rather than
 * guessing at a transition.
 */
export function applyAcknowledgementEvent(record: AcknowledgementRecord, event: AcknowledgementEvent): AcknowledgementRecord {
  if (!isPlainObject(record) || !Array.isArray(record.history) || record.history.length === 0) {
    fail('acknowledgement-record-malformed');
  }
  let previousState: AcknowledgementState | undefined;
  let previousTime = -Infinity;
  for (const transition of record.history) {
    if (!isPlainObject(transition) || !isNonEmptyString(transition.at)) {
      fail('acknowledgement-record-malformed');
    }
    const time = parseCalendarInstant(transition.at);
    const legalState = previousState === undefined
      ? transition.state === 'pending'
      : (previousState === 'pending' && (transition.state === 'escalated' || transition.state === 'acknowledged')) ||
        (previousState === 'escalated' && transition.state === 'acknowledged');
    if (!legalState || !Number.isFinite(time) || time <= previousTime) {
      fail('acknowledgement-record-malformed');
    }
    previousState = transition.state;
    previousTime = time;
  }
  if (record.state !== previousState) {
    fail('acknowledgement-record-malformed');
  }
  if (!isPlainObject(event) || (event.type !== 'acknowledge' && event.type !== 'escalate') || !isNonEmptyString(event.at)) {
    fail('acknowledgement-event-malformed');
  }

  const eventTime = parseCalendarInstant(event.at);
  if (!Number.isFinite(eventTime)) {
    fail('acknowledgement-event-timestamp-invalid');
  }

  const lastTransition = record.history[record.history.length - 1];
  const lastTime = parseCalendarInstant(lastTransition.at);
  if (!Number.isFinite(lastTime)) {
    fail('acknowledgement-event-timestamp-invalid');
  }
  if (eventTime <= lastTime) {
    fail('acknowledgement-event-out-of-order');
  }

  const nextState = ALLOWED_TRANSITIONS[record.state]?.[event.type];
  if (!nextState) {
    fail('acknowledgement-invalid-transition');
  }

  return Object.freeze({
    state: nextState,
    history: Object.freeze([...record.history.map((transition) => Object.freeze({ ...transition })), Object.freeze({ state: nextState, at: event.at })]),
  });
}
