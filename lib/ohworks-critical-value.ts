/**
 * Pure, dependency-free OHWorks critical-value notification planner.
 *
 * Given a fabricated observed result, its analyte's declared critical
 * limits, and a caller-supplied "identified" timestamp, this module decides
 * whether the result is critical and, if so, produces the notification
 * record structure a caller would act on: which roles must be notified, the
 * acknowledgement deadline computed from the supplied timestamp, and
 * whether spoken read-back confirmation is required. It also tracks the
 * acknowledgement state machine (pending -> acknowledged | escalated ->
 * acknowledged) across caller-supplied timestamps.
 *
 * It performs no I/O, reads no system clock (every timestamp is
 * caller-supplied), sends no notification, mutates no SENAITE or database
 * state, and touches no real subject, sample, or customer data.
 *
 * Fail-closed: a structurally unusable or ambiguous request — a malformed
 * result, missing or malformed critical limits, a unit that does not match
 * between the result and its limits, an analyte mismatch, an invalid
 * timestamp, or an acknowledgement transition that is out of order or not
 * reachable from the current state — throws CriticalValueInputError
 * instead of guessing.
 */

export type CriticalRange = {
  /** Lower critical bound, or null if this range is not bounded below. */
  low: number | null;
  /** Upper critical bound, or null if this range is not bounded above. */
  high: number | null;
};

export type AnalyteCriticalLimits = {
  /** Fabricated analyte/parameter code this range is declared for. */
  analyteCode: string;
  unit: string;
  range: CriticalRange;
};

export type ObservedResult = {
  /** Synthetic subject identifier. Never a real patient or customer identifier. */
  subjectId: string;
  /** Fabricated analyte/parameter code. */
  analyteCode: string;
  value: unknown;
  unit: string;
};

export type NotificationRole = 'ORDERING_PROVIDER' | 'COVERING_PROVIDER' | 'CHARGE_NURSE' | 'LAB_DIRECTOR';

const KNOWN_NOTIFICATION_ROLES: ReadonlySet<string> = new Set<NotificationRole>([
  'ORDERING_PROVIDER',
  'COVERING_PROVIDER',
  'CHARGE_NURSE',
  'LAB_DIRECTOR',
]);

export type EvaluateCriticalValueInput = {
  result: ObservedResult;
  /** The analyte's declared critical limits. Missing (null/undefined) fails closed. */
  limits: AnalyteCriticalLimits | null | undefined;
  /** Caller-supplied ISO 8601 timestamp the result was identified. Never read from the system clock. */
  identifiedAt: string;
  /** Minutes from identifiedAt within which acknowledgement is required. Must be a positive finite number. */
  acknowledgementWindowMinutes: number;
  /** Roles that must be notified for this result, in caller-declared policy order. */
  notifyRoles: ReadonlyArray<NotificationRole>;
};

export type NotificationRecord = {
  role: NotificationRole;
  /** ISO 8601 deadline: identifiedAt + acknowledgementWindowMinutes. */
  acknowledgementDeadline: string;
  /** Always true: every critical-value notification modeled here requires spoken read-back confirmation. */
  readBackRequired: boolean;
};

export type CriticalValueEvaluation = {
  subjectId: string;
  analyteCode: string;
  value: number;
  unit: string;
  isCritical: boolean;
  /** Which declared bound the value breached, or null when the value is not critical. */
  breached: 'low' | 'high' | null;
  /** One record per notifyRoles entry, or null when the value is not critical. */
  notifications: ReadonlyArray<NotificationRecord> | null;
};

export type CriticalValueInputErrorCode =
  | 'result-malformed'
  | 'value-invalid'
  | 'limits-missing'
  | 'limits-malformed'
  | 'limits-range-empty'
  | 'limits-range-inverted'
  | 'analyte-mismatch'
  | 'unit-mismatch'
  | 'identified-at-invalid'
  | 'acknowledgement-window-invalid'
  | 'notify-roles-empty'
  | 'notify-roles-invalid'
  | 'history-malformed'
  | 'transition-timestamp-invalid'
  | 'transition-not-after-previous'
  | 'transition-unreachable';

const INPUT_ERROR_MESSAGES: Record<CriticalValueInputErrorCode, string> = {
  'result-malformed': 'The observed result is missing a required identity field.',
  'value-invalid': 'The observed result’s value is not a finite number.',
  'limits-missing': 'No critical limits were declared for this analyte.',
  'limits-malformed': 'The declared critical limits are not structurally valid.',
  'limits-range-empty': 'The declared critical range has no lower or upper bound.',
  'limits-range-inverted': 'The declared critical range’s lower bound is not strictly below its upper bound.',
  'analyte-mismatch': 'The declared critical limits are for a different analyte than the observed result.',
  'unit-mismatch': 'The observed result’s unit does not match the declared critical limits’ unit.',
  'identified-at-invalid': 'The result’s identified timestamp could not be parsed.',
  'acknowledgement-window-invalid': 'The acknowledgement window must be a positive finite number of minutes.',
  'notify-roles-empty': 'At least one role must be declared to notify for a critical result.',
  'notify-roles-invalid': 'The declared notify roles contain an unrecognized or duplicate role.',
  'history-malformed': 'The acknowledgement history is not a non-empty list of valid events.',
  'transition-timestamp-invalid': 'The acknowledgement transition’s timestamp could not be parsed.',
  'transition-not-after-previous': 'The acknowledgement transition’s timestamp is not strictly after the previous event’s timestamp.',
  'transition-unreachable': 'The acknowledgement transition is not reachable from the current state.',
};

/** Thrown for structurally unusable or ambiguous input that cannot be safely evaluated or transitioned. */
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

function validateResultShape(result: ObservedResult): void {
  if (!isPlainObject(result)) {
    fail('result-malformed');
  }
  const candidate = result as unknown as Record<string, unknown>;
  if (!isNonEmptyString(candidate.subjectId) || !isNonEmptyString(candidate.analyteCode) || !isNonEmptyString(candidate.unit)) {
    fail('result-malformed');
  }
}

function validateLimits(limits: AnalyteCriticalLimits | null | undefined): {
  analyteCode: string;
  unit: string;
  range: { low: number | null; high: number | null };
} {
  if (limits === null || limits === undefined) {
    fail('limits-missing');
  }
  if (!isPlainObject(limits)) {
    fail('limits-malformed');
  }
  const candidate = limits as unknown as Record<string, unknown>;
  if (!isNonEmptyString(candidate.analyteCode) || !isNonEmptyString(candidate.unit) || !isPlainObject(candidate.range)) {
    fail('limits-malformed');
  }
  const range = candidate.range as Record<string, unknown>;
  const low = range.low;
  const high = range.high;
  if (
    (low !== null && typeof low !== 'number') ||
    (high !== null && typeof high !== 'number') ||
    (typeof low === 'number' && !Number.isFinite(low)) ||
    (typeof high === 'number' && !Number.isFinite(high))
  ) {
    fail('limits-malformed');
  }
  const resolvedLow = low as number | null;
  const resolvedHigh = high as number | null;
  if (resolvedLow === null && resolvedHigh === null) {
    fail('limits-range-empty');
  }
  if (resolvedLow !== null && resolvedHigh !== null && resolvedLow >= resolvedHigh) {
    fail('limits-range-inverted');
  }
  return { analyteCode: candidate.analyteCode as string, unit: candidate.unit as string, range: { low: resolvedLow, high: resolvedHigh } };
}

function validateNotifyRoles(notifyRoles: ReadonlyArray<NotificationRole>): void {
  if (!Array.isArray(notifyRoles) || notifyRoles.length === 0) {
    fail('notify-roles-empty');
  }
  const seen = new Set<string>();
  for (const role of notifyRoles) {
    if (typeof role !== 'string' || !KNOWN_NOTIFICATION_ROLES.has(role) || seen.has(role)) {
      fail('notify-roles-invalid');
    }
    seen.add(role);
  }
}

/**
 * Decide whether an observed result is critical against its analyte's
 * declared limits and, if so, build the notification record structure
 * (role, acknowledgement deadline, read-back requirement) for each
 * caller-declared role. This function never sends anything — it only
 * decides and describes.
 */
export function evaluateCriticalValue(input: EvaluateCriticalValueInput): CriticalValueEvaluation {
  validateResultShape(input.result);
  const result = input.result;

  const value = toFiniteNumber(result.value);
  if (value === undefined) {
    fail('value-invalid');
  }

  const limits = validateLimits(input.limits);

  if (limits.analyteCode !== result.analyteCode) {
    fail('analyte-mismatch');
  }
  if (limits.unit !== result.unit) {
    fail('unit-mismatch');
  }

  const identifiedTime = Date.parse(input.identifiedAt);
  if (!Number.isFinite(identifiedTime)) {
    fail('identified-at-invalid');
  }

  const acknowledgementWindowMinutes = toFiniteNumber(input.acknowledgementWindowMinutes);
  if (acknowledgementWindowMinutes === undefined || acknowledgementWindowMinutes <= 0) {
    fail('acknowledgement-window-invalid');
  }

  validateNotifyRoles(input.notifyRoles);

  const breachesLow = limits.range.low !== null && value <= limits.range.low;
  const breachesHigh = limits.range.high !== null && value >= limits.range.high;
  const isCritical = breachesLow || breachesHigh;
  const breached: 'low' | 'high' | null = breachesLow ? 'low' : breachesHigh ? 'high' : null;

  let notifications: NotificationRecord[] | null = null;
  if (isCritical) {
    const deadline = new Date(identifiedTime + acknowledgementWindowMinutes * 60000).toISOString();
    notifications = input.notifyRoles.map((role) =>
      Object.freeze({
        role,
        acknowledgementDeadline: deadline,
        readBackRequired: true,
      }),
    );
  }

  return Object.freeze({
    subjectId: result.subjectId,
    analyteCode: result.analyteCode,
    value,
    unit: result.unit,
    isCritical,
    breached,
    notifications,
  });
}

export type AcknowledgementState = 'pending' | 'acknowledged' | 'escalated';

export type AcknowledgementEvent = {
  state: AcknowledgementState;
  /** Caller-supplied ISO 8601 timestamp this state was entered. */
  at: string;
};

const ALLOWED_ACKNOWLEDGEMENT_TRANSITIONS: Record<AcknowledgementState, ReadonlySet<AcknowledgementState>> = {
  pending: new Set<AcknowledgementState>(['acknowledged', 'escalated']),
  escalated: new Set<AcknowledgementState>(['acknowledged']),
  acknowledged: new Set<AcknowledgementState>([]),
};

/** Build the initial single-event acknowledgement history, seeded to 'pending' at the caller-supplied timestamp. */
export function initialAcknowledgementHistory(at: string): AcknowledgementEvent[] {
  if (!isNonEmptyString(at) || !Number.isFinite(Date.parse(at))) {
    fail('transition-timestamp-invalid');
  }
  return [Object.freeze({ state: 'pending' as const, at })];
}

function isAcknowledgementEvent(value: unknown): value is AcknowledgementEvent {
  return (
    isPlainObject(value) &&
    (value.state === 'pending' || value.state === 'acknowledged' || value.state === 'escalated') &&
    isNonEmptyString(value.at)
  );
}

/**
 * Append a caller-supplied acknowledgement transition to an existing
 * history and return a new, immutable history array. Fails closed — rather
 * than recording an inconsistent chain — when: the existing history is
 * malformed or empty, the next timestamp cannot be parsed, the next
 * timestamp is not strictly after the previous event's timestamp (an
 * out-of-order acknowledgement), or the next state is not reachable from
 * the current state (e.g. 'acknowledged' is terminal; 'escalated' cannot
 * revert to 'pending').
 */
export function appendAcknowledgementEvent(
  history: ReadonlyArray<AcknowledgementEvent>,
  next: AcknowledgementEvent,
): AcknowledgementEvent[] {
  if (!Array.isArray(history) || history.length === 0 || !history.every(isAcknowledgementEvent)) {
    fail('history-malformed');
  }
  if (!isAcknowledgementEvent(next)) {
    fail('history-malformed');
  }

  const previous = history[history.length - 1];
  const previousTime = Date.parse(previous.at);
  const nextTime = Date.parse(next.at);
  if (!Number.isFinite(nextTime)) {
    fail('transition-timestamp-invalid');
  }
  if (nextTime <= previousTime) {
    fail('transition-not-after-previous');
  }
  if (!ALLOWED_ACKNOWLEDGEMENT_TRANSITIONS[previous.state].has(next.state)) {
    fail('transition-unreachable');
  }

  return [...history, Object.freeze({ state: next.state, at: next.at })];
}

/** The current acknowledgement state: the state of the most recent event in the history. */
export function currentAcknowledgementState(history: ReadonlyArray<AcknowledgementEvent>): AcknowledgementState {
  if (!Array.isArray(history) || history.length === 0 || !history.every(isAcknowledgementEvent)) {
    fail('history-malformed');
  }
  return history[history.length - 1].state;
}
