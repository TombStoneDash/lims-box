/**
 * Fail-closed synthetic OHWorks calibration verification scheduler.
 *
 * This module is a pure, dependency-free function over caller-supplied,
 * synthetic instrument-analyte calibration verification records. It
 * performs no I/O, reads no system clock, and touches no real instrument,
 * sample, or customer data. Every timestamp it compares — the evaluation
 * instant, the last successful verification instant, and any trigger event
 * instants — is supplied by the caller.
 *
 * Given the last successful calibration verification for an
 * instrument-analyte pair, a caller-supplied maximum interval in days, and
 * any trigger events recorded since that verification (a reagent lot
 * change, major maintenance, a QC shift, or a manufacturer requirement),
 * it decides at a caller-supplied UTC evaluation instant whether the
 * verification is:
 *
 *   CURRENT            - within the interval, outside the due-soon window,
 *                         and no trigger event has been recorded
 *   DUE_SOON           - within the interval but inside the due-soon
 *                         window, and no trigger event has been recorded
 *   OVERDUE            - the interval has expired, or the input itself is
 *                         untrustworthy (missing/invalid/future-dated
 *                         verification, an invalid interval, an invalid
 *                         evaluation instant, or an unrecognized/invalid
 *                         trigger event)
 *   REQUIRED_BY_EVENT  - a valid trigger event has been recorded since the
 *                         last verification; this always outranks the
 *                         calendar, even when the calendar would otherwise
 *                         say CURRENT or DUE_SOON
 *
 * Every failure mode defaults to OVERDUE with a null due instant rather
 * than guessing in the schedule's favor.
 */

export type TriggerEventKind =
  | 'reagent-lot-change'
  | 'major-maintenance'
  | 'qc-shift'
  | 'manufacturer-requirement';

export type TriggerEventInput = {
  kind: TriggerEventKind;
  /** UTC timestamp the event occurred, e.g. "2026-01-01T12:00:00.000Z". Caller supplied. */
  occurredAt: string;
};

export type CalibrationVerificationScheduleInput = {
  instrumentId: string;
  analyteId: string;
  /** UTC timestamp of the last successful calibration verification, or null if none has ever been recorded. */
  lastVerifiedAt: string | null;
  /** Maximum number of days the verification remains valid for. Must be a finite, positive number. */
  maxIntervalDays: number;
  /** Trigger events recorded since the last successful verification (empty if none). */
  triggerEvents: readonly TriggerEventInput[];
};

export type CalibrationVerificationScheduleOptions = {
  /**
   * How many whole days before calendar expiry a still-current verification
   * is flagged as due soon instead of current. Caller supplied; no default
   * clock math beyond simple day arithmetic on caller-supplied timestamps.
   * Defaults to 7. Set to 0 to disable the due-soon flag entirely.
   */
  dueSoonWarningDays?: number;
};

export type CalibrationVerificationDecision = 'CURRENT' | 'DUE_SOON' | 'OVERDUE' | 'REQUIRED_BY_EVENT';

/** Bounded, privacy-safe codes explaining a calibration verification schedule decision. */
export type CalibrationVerificationReasonCode =
  | 'max-interval-invalid'
  | 'last-verification-missing'
  | 'last-verification-timestamp-invalid'
  | 'as-of-timestamp-invalid'
  | 'last-verification-in-future'
  | 'trigger-event-kind-unknown'
  | 'trigger-event-timestamp-invalid'
  | 'trigger-event-before-last-verification'
  | 'trigger-event-required'
  | 'interval-current'
  | 'interval-due-soon'
  | 'interval-overdue';

export type CalibrationVerificationScheduleResult = {
  instrumentId: string;
  analyteId: string;
  asOf: string;
  decision: CalibrationVerificationDecision;
  reasonCode: CalibrationVerificationReasonCode;
  /** Deterministic, privacy-safe human-readable explanation of reasonCode. */
  reason: string;
  /** UTC instant the verification is (or was) due, or null when it cannot be reliably computed. */
  dueAt: string | null;
  /** The trigger event kind that governs the decision, or null when no trigger event governs it. */
  governingTriggerKind: TriggerEventKind | null;
};

export type CalibrationVerificationScheduleInputErrorCode =
  | 'input-malformed'
  | 'instrument-id-malformed'
  | 'analyte-id-malformed'
  | 'last-verified-at-malformed'
  | 'max-interval-malformed'
  | 'trigger-events-malformed'
  | 'trigger-event-malformed'
  | 'as-of-malformed'
  | 'options-malformed';

const INPUT_ERROR_MESSAGES: Record<CalibrationVerificationScheduleInputErrorCode, string> = {
  'input-malformed': 'The calibration verification schedule input is not a valid object.',
  'instrument-id-malformed': 'The instrument identifier is not a non-empty string.',
  'analyte-id-malformed': 'The analyte identifier is not a non-empty string.',
  'last-verified-at-malformed': 'The last-verified-at field is not null or a non-empty string.',
  'max-interval-malformed': 'The maximum interval in days is not a number.',
  'trigger-events-malformed': 'The trigger events field is not an array.',
  'trigger-event-malformed': 'A trigger event is missing a required field or has the wrong shape.',
  'as-of-malformed': 'The supplied evaluation timestamp is not a non-empty string.',
  'options-malformed': 'The calibration verification schedule options are invalid.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a reason code. */
export class CalibrationVerificationScheduleInputError extends Error {
  readonly code: CalibrationVerificationScheduleInputErrorCode;

  constructor(code: CalibrationVerificationScheduleInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'CalibrationVerificationScheduleInputError';
    this.code = code;
  }
}

const DEFAULT_DUE_SOON_WARNING_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const KNOWN_TRIGGER_EVENT_KINDS: ReadonlySet<string> = new Set<TriggerEventKind>([
  'reagent-lot-change',
  'major-maintenance',
  'qc-shift',
  'manufacturer-requirement',
]);

/** Tie-break order when multiple trigger events share the earliest occurredAt instant. */
const TRIGGER_EVENT_KIND_PRIORITY: readonly TriggerEventKind[] = [
  'reagent-lot-change',
  'major-maintenance',
  'qc-shift',
  'manufacturer-requirement',
];

const REASON_DECISIONS: Record<CalibrationVerificationReasonCode, CalibrationVerificationDecision> = {
  'max-interval-invalid': 'OVERDUE',
  'last-verification-missing': 'OVERDUE',
  'last-verification-timestamp-invalid': 'OVERDUE',
  'as-of-timestamp-invalid': 'OVERDUE',
  'last-verification-in-future': 'OVERDUE',
  'trigger-event-kind-unknown': 'OVERDUE',
  'trigger-event-timestamp-invalid': 'OVERDUE',
  'trigger-event-before-last-verification': 'OVERDUE',
  'trigger-event-required': 'REQUIRED_BY_EVENT',
  'interval-current': 'CURRENT',
  'interval-due-soon': 'DUE_SOON',
  'interval-overdue': 'OVERDUE',
};

const REASON_MESSAGES: Record<CalibrationVerificationReasonCode, string> = {
  'max-interval-invalid': 'The maximum verification interval is not a finite, positive number of days.',
  'last-verification-missing': 'No successful calibration verification has ever been recorded.',
  'last-verification-timestamp-invalid': 'The last-verification timestamp could not be parsed as an explicit UTC timestamp.',
  'as-of-timestamp-invalid': 'The evaluation timestamp could not be parsed as an explicit UTC timestamp.',
  'last-verification-in-future': 'The last-verification timestamp comes after the evaluation timestamp.',
  'trigger-event-kind-unknown': 'A recorded trigger event has an unrecognized kind.',
  'trigger-event-timestamp-invalid': 'A recorded trigger event timestamp could not be parsed as an explicit UTC timestamp.',
  'trigger-event-before-last-verification': 'A recorded trigger event occurred before the last successful verification.',
  'trigger-event-required': 'A trigger event recorded since the last verification requires re-verification regardless of the calendar interval.',
  'interval-current': 'The verification is current and no trigger event has been recorded since it was performed.',
  'interval-due-soon': 'The verification interval is close to expiring and no trigger event has been recorded since it was performed.',
  'interval-overdue': 'The verification interval has expired as of the evaluation timestamp.',
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isUtcTimestamp(value: string): boolean {
  return value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

function isStructurallyValidTriggerEvent(raw: unknown): raw is TriggerEventInput {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return isNonEmptyString(candidate.kind) && isNonEmptyString(candidate.occurredAt);
}

function isStructurallyValidOptions(raw: unknown): raw is CalibrationVerificationScheduleOptions {
  if (raw === undefined) {
    return true;
  }
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  if (candidate.dueSoonWarningDays === undefined) {
    return true;
  }
  return (
    typeof candidate.dueSoonWarningDays === 'number' &&
    Number.isFinite(candidate.dueSoonWarningDays) &&
    candidate.dueSoonWarningDays >= 0
  );
}

function toResult(
  instrumentId: string,
  analyteId: string,
  asOf: string,
  reasonCode: CalibrationVerificationReasonCode,
  dueAt: string | null,
  governingTriggerKind: TriggerEventKind | null = null,
): CalibrationVerificationScheduleResult {
  return Object.freeze({
    instrumentId,
    analyteId,
    asOf,
    decision: REASON_DECISIONS[reasonCode],
    reasonCode,
    reason: REASON_MESSAGES[reasonCode],
    dueAt,
    governingTriggerKind,
  });
}

function triggerEventPriorityIndex(kind: TriggerEventKind): number {
  return TRIGGER_EVENT_KIND_PRIORITY.indexOf(kind);
}

/**
 * Evaluate the calibration verification schedule for an instrument-analyte
 * pair at a caller-supplied UTC evaluation instant.
 *
 * Fail-closed: a non-positive or non-finite interval, a missing or invalid
 * last-verification timestamp, an invalid evaluation timestamp, a
 * last-verification timestamp after the evaluation timestamp, or any
 * trigger event with an unrecognized kind, an invalid timestamp, or a
 * timestamp before the last verification, all resolve to OVERDUE with a
 * null due instant. Otherwise, any valid trigger event recorded since the
 * last verification resolves to REQUIRED_BY_EVENT — always outranking the
 * calendar — and only in the absence of trigger events is the decision
 * computed from the calendar interval alone.
 *
 * Structurally unusable input (a malformed input object, identifiers,
 * trigger events array or entries, evaluation timestamp, or options)
 * throws CalibrationVerificationScheduleInputError instead of guessing at
 * a reason code.
 */
export function evaluateCalibrationVerificationSchedule(
  input: CalibrationVerificationScheduleInput,
  asOf: string,
  options?: CalibrationVerificationScheduleOptions,
): CalibrationVerificationScheduleResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new CalibrationVerificationScheduleInputError('input-malformed');
  }
  const candidate = input as Record<string, unknown>;
  if (!isNonEmptyString(candidate.instrumentId)) {
    throw new CalibrationVerificationScheduleInputError('instrument-id-malformed');
  }
  if (!isNonEmptyString(candidate.analyteId)) {
    throw new CalibrationVerificationScheduleInputError('analyte-id-malformed');
  }
  if (!(candidate.lastVerifiedAt === null || isNonEmptyString(candidate.lastVerifiedAt))) {
    throw new CalibrationVerificationScheduleInputError('last-verified-at-malformed');
  }
  if (typeof candidate.maxIntervalDays !== 'number') {
    throw new CalibrationVerificationScheduleInputError('max-interval-malformed');
  }
  if (!Array.isArray(candidate.triggerEvents)) {
    throw new CalibrationVerificationScheduleInputError('trigger-events-malformed');
  }
  for (const rawEvent of candidate.triggerEvents) {
    if (!isStructurallyValidTriggerEvent(rawEvent)) {
      throw new CalibrationVerificationScheduleInputError('trigger-event-malformed');
    }
  }
  if (!isNonEmptyString(asOf)) {
    throw new CalibrationVerificationScheduleInputError('as-of-malformed');
  }
  if (!isStructurallyValidOptions(options)) {
    throw new CalibrationVerificationScheduleInputError('options-malformed');
  }

  const instrumentId = candidate.instrumentId;
  const analyteId = candidate.analyteId;
  const lastVerifiedAt = candidate.lastVerifiedAt as string | null;
  const maxIntervalDays = candidate.maxIntervalDays;
  const triggerEvents = candidate.triggerEvents as readonly TriggerEventInput[];

  if (!Number.isFinite(maxIntervalDays) || maxIntervalDays <= 0) {
    return toResult(instrumentId, analyteId, asOf, 'max-interval-invalid', null);
  }

  if (lastVerifiedAt === null) {
    return toResult(instrumentId, analyteId, asOf, 'last-verification-missing', null);
  }
  if (!isUtcTimestamp(lastVerifiedAt)) {
    return toResult(instrumentId, analyteId, asOf, 'last-verification-timestamp-invalid', null);
  }
  if (!isUtcTimestamp(asOf)) {
    return toResult(instrumentId, analyteId, asOf, 'as-of-timestamp-invalid', null);
  }

  const lastVerifiedAtMs = Date.parse(lastVerifiedAt);
  const asOfMs = Date.parse(asOf);

  if (lastVerifiedAtMs > asOfMs) {
    return toResult(instrumentId, analyteId, asOf, 'last-verification-in-future', null);
  }

  for (const event of triggerEvents) {
    if (!KNOWN_TRIGGER_EVENT_KINDS.has(event.kind)) {
      return toResult(instrumentId, analyteId, asOf, 'trigger-event-kind-unknown', null);
    }
  }
  for (const event of triggerEvents) {
    if (!isUtcTimestamp(event.occurredAt)) {
      return toResult(instrumentId, analyteId, asOf, 'trigger-event-timestamp-invalid', null);
    }
  }
  for (const event of triggerEvents) {
    if (Date.parse(event.occurredAt) < lastVerifiedAtMs) {
      return toResult(instrumentId, analyteId, asOf, 'trigger-event-before-last-verification', null);
    }
  }

  if (triggerEvents.length > 0) {
    const governingEvent = triggerEvents.reduce((earliest, candidate) => {
      const earliestMs = Date.parse(earliest.occurredAt);
      const candidateMs = Date.parse(candidate.occurredAt);
      if (candidateMs !== earliestMs) {
        return candidateMs < earliestMs ? candidate : earliest;
      }
      return triggerEventPriorityIndex(candidate.kind) < triggerEventPriorityIndex(earliest.kind) ? candidate : earliest;
    });
    return toResult(
      instrumentId,
      analyteId,
      asOf,
      'trigger-event-required',
      new Date(Date.parse(governingEvent.occurredAt)).toISOString(),
      governingEvent.kind,
    );
  }

  const dueSoonWarningDays = options?.dueSoonWarningDays ?? DEFAULT_DUE_SOON_WARNING_DAYS;
  const dueAtMs = lastVerifiedAtMs + maxIntervalDays * MS_PER_DAY;
  const dueAt = new Date(dueAtMs).toISOString();

  if (asOfMs >= dueAtMs) {
    return toResult(instrumentId, analyteId, asOf, 'interval-overdue', dueAt);
  }
  if (dueSoonWarningDays > 0 && dueAtMs - asOfMs <= dueSoonWarningDays * MS_PER_DAY) {
    return toResult(instrumentId, analyteId, asOf, 'interval-due-soon', dueAt);
  }
  return toResult(instrumentId, analyteId, asOf, 'interval-current', dueAt);
}

/** Deterministic, privacy-safe human-readable text for a reason code, suitable for UI display. */
export function explainCalibrationVerificationReason(reasonCode: CalibrationVerificationReasonCode): string {
  return REASON_MESSAGES[reasonCode];
}
