/**
 * Fail-closed synthetic OHWorks instrument calibration gate.
 *
 * This module is a pure, dependency-free function over a fabricated
 * instrument registry. It performs no I/O, reads no system clock, and
 * touches no real instrument, sample, or customer data. Every timestamp it
 * compares against — the run timestamp and the instrument's last
 * calibration timestamp — is supplied by the caller.
 *
 * Given a registry lookup for an instrument plus a run timestamp, it
 * decides whether results produced during that run are:
 *
 *   releasable            - calibration is current, passed, and unflagged
 *   releasable_with_flag  - calibration is valid but carries a caveat
 *                           (a conditional pass, or the interval is close
 *                           to expiring)
 *   blocked               - the run cannot be trusted: unknown instrument,
 *                           missing/failed/pending calibration, an expired
 *                           interval, an active maintenance lock, or
 *                           malformed timestamps/interval data
 *
 * Every failure mode defaults to `blocked` rather than guessing in the
 * instrument's favor.
 */

export type CalibrationOutcome = 'pass' | 'conditional-pass' | 'fail' | 'pending' | 'not-performed';

export type MaintenanceLockReasonCode =
  | 'unscheduled-repair'
  | 'preventive-maintenance'
  | 'incident-investigation'
  | 'parts-replacement';

export type MaintenanceLockInput = {
  active: boolean;
  reasonCode: MaintenanceLockReasonCode;
  /** UTC timestamp the lock was engaged, e.g. "2026-01-01T12:00:00.000Z". Caller supplied. */
  engagedAt: string;
};

export type InstrumentRecordInput = {
  instrumentId: string;
  /** UTC timestamp of the last completed calibration, e.g. "2026-01-01T12:00:00.000Z". Caller supplied. */
  lastCalibratedAt: string;
  /** Whole days the calibration remains valid for. Must be a positive integer. */
  calibrationIntervalDays: number;
  calibrationOutcome: CalibrationOutcome;
  /** Present only when a maintenance lock has ever been recorded for this instrument. */
  maintenanceLock?: MaintenanceLockInput;
};

/** Synthetic instrument registry keyed by instrument identifier. */
export type InstrumentCalibrationRegistry = Readonly<Record<string, InstrumentRecordInput>>;

export type CalibrationGateOptions = {
  /**
   * How many whole days before interval expiry a still-valid calibration is
   * flagged instead of released clean. Caller supplied; no default clock
   * math beyond simple day arithmetic on caller-supplied timestamps.
   * Defaults to 3. Set to 0 to disable the near-expiry flag entirely.
   */
  nearExpiryWarningDays?: number;
};

export type CalibrationGateDecision = 'releasable' | 'releasable_with_flag' | 'blocked';

/** Bounded, privacy-safe codes explaining a calibration gate decision. */
export type CalibrationReasonCode =
  | 'unknown-instrument'
  | 'run-timestamp-invalid'
  | 'calibration-timestamp-invalid'
  | 'calibration-interval-invalid'
  | 'run-before-calibration'
  | 'maintenance-lock-active'
  | 'unknown-calibration-outcome'
  | 'calibration-outcome-failed'
  | 'calibration-outcome-pending'
  | 'calibration-outcome-not-performed'
  | 'calibration-interval-expired'
  | 'calibration-outcome-conditional-pass'
  | 'calibration-interval-near-expiry'
  | 'calibration-current-and-passed';

export type CalibrationGateResult = {
  instrumentId: string;
  runAt: string;
  decision: CalibrationGateDecision;
  reasonCode: CalibrationReasonCode;
  /** Deterministic, privacy-safe human-readable explanation of reasonCode. */
  reason: string;
};

export type CalibrationGateInputErrorCode =
  | 'registry-malformed'
  | 'instrument-id-malformed'
  | 'run-timestamp-malformed'
  | 'options-malformed'
  | 'instrument-record-malformed';

const INPUT_ERROR_MESSAGES: Record<CalibrationGateInputErrorCode, string> = {
  'registry-malformed': 'The instrument calibration registry is not a valid lookup object.',
  'instrument-id-malformed': 'The requested instrument identifier is not a non-empty string.',
  'run-timestamp-malformed': 'The supplied run timestamp is not a non-empty string.',
  'options-malformed': 'The calibration gate options are invalid.',
  'instrument-record-malformed': 'The registry entry for this instrument is missing a required field or has the wrong shape.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a reason code. */
export class CalibrationGateInputError extends Error {
  readonly code: CalibrationGateInputErrorCode;

  constructor(code: CalibrationGateInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'CalibrationGateInputError';
    this.code = code;
  }
}

const DEFAULT_NEAR_EXPIRY_WARNING_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const KNOWN_CALIBRATION_OUTCOMES: ReadonlySet<string> = new Set<CalibrationOutcome>([
  'pass',
  'conditional-pass',
  'fail',
  'pending',
  'not-performed',
]);

const REASON_DECISIONS: Record<CalibrationReasonCode, CalibrationGateDecision> = {
  'unknown-instrument': 'blocked',
  'run-timestamp-invalid': 'blocked',
  'calibration-timestamp-invalid': 'blocked',
  'calibration-interval-invalid': 'blocked',
  'run-before-calibration': 'blocked',
  'maintenance-lock-active': 'blocked',
  'unknown-calibration-outcome': 'blocked',
  'calibration-outcome-failed': 'blocked',
  'calibration-outcome-pending': 'blocked',
  'calibration-outcome-not-performed': 'blocked',
  'calibration-interval-expired': 'blocked',
  'calibration-outcome-conditional-pass': 'releasable_with_flag',
  'calibration-interval-near-expiry': 'releasable_with_flag',
  'calibration-current-and-passed': 'releasable',
};

const REASON_MESSAGES: Record<CalibrationReasonCode, string> = {
  'unknown-instrument': 'No calibration record exists for this instrument identifier.',
  'run-timestamp-invalid': 'The run timestamp could not be parsed as an explicit UTC timestamp.',
  'calibration-timestamp-invalid': 'The last-calibration timestamp could not be parsed as an explicit UTC timestamp.',
  'calibration-interval-invalid': 'The calibration interval is not a positive whole number of days.',
  'run-before-calibration': 'The run timestamp comes before the instrument was last calibrated.',
  'maintenance-lock-active': 'An active maintenance lock is recorded against this instrument.',
  'unknown-calibration-outcome': 'The recorded calibration outcome is not a recognized bounded value.',
  'calibration-outcome-failed': 'The most recent calibration attempt failed.',
  'calibration-outcome-pending': 'The most recent calibration attempt is still pending.',
  'calibration-outcome-not-performed': 'No calibration has been performed for this instrument.',
  'calibration-interval-expired': 'The calibration interval has expired as of the run timestamp.',
  'calibration-outcome-conditional-pass': 'Calibration is current but was only a conditional pass.',
  'calibration-interval-near-expiry': 'Calibration is current but the interval is close to expiring.',
  'calibration-current-and-passed': 'Calibration is current and the last outcome was a clean pass.',
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isUtcTimestamp(value: string): boolean {
  return value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

function isStructurallyValidMaintenanceLock(raw: unknown): raw is MaintenanceLockInput {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    typeof candidate.active === 'boolean' &&
    isNonEmptyString(candidate.reasonCode) &&
    isNonEmptyString(candidate.engagedAt)
  );
}

function isStructurallyValidRecord(raw: unknown): raw is InstrumentRecordInput {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.instrumentId) &&
    isNonEmptyString(candidate.lastCalibratedAt) &&
    typeof candidate.calibrationIntervalDays === 'number' &&
    Number.isFinite(candidate.calibrationIntervalDays) &&
    isNonEmptyString(candidate.calibrationOutcome) &&
    (candidate.maintenanceLock === undefined || isStructurallyValidMaintenanceLock(candidate.maintenanceLock))
  );
}

function isStructurallyValidOptions(raw: unknown): raw is CalibrationGateOptions {
  if (raw === undefined) {
    return true;
  }
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  if (candidate.nearExpiryWarningDays === undefined) {
    return true;
  }
  return typeof candidate.nearExpiryWarningDays === 'number' && Number.isFinite(candidate.nearExpiryWarningDays) && candidate.nearExpiryWarningDays >= 0;
}

function toResult(
  instrumentId: string,
  runAt: string,
  reasonCode: CalibrationReasonCode,
): CalibrationGateResult {
  return Object.freeze({
    instrumentId,
    runAt,
    decision: REASON_DECISIONS[reasonCode],
    reasonCode,
    reason: REASON_MESSAGES[reasonCode],
  });
}

/**
 * Evaluate whether results from a run against a given instrument are
 * releasable, releasable with a flag, or blocked.
 *
 * Fail-closed: an instrument missing from the registry, a malformed or
 * out-of-order timestamp, a non-positive calibration interval, an active
 * maintenance lock, an unrecognized or non-passing calibration outcome, or
 * an expired calibration interval all resolve to `blocked`. Only a
 * currently valid `pass` resolves to `releasable`; a currently valid
 * `conditional-pass`, or a `pass` inside the near-expiry warning window,
 * resolves to `releasable_with_flag`.
 *
 * Structurally unusable input (a malformed registry, instrument id, run
 * timestamp, options, or registry entry) throws CalibrationGateInputError
 * instead of guessing at a reason code.
 */
export function evaluateInstrumentCalibrationGate(
  registry: InstrumentCalibrationRegistry,
  instrumentId: string,
  runAt: string,
  options?: CalibrationGateOptions,
): CalibrationGateResult {
  if (typeof registry !== 'object' || registry === null || Array.isArray(registry)) {
    throw new CalibrationGateInputError('registry-malformed');
  }
  if (!isNonEmptyString(instrumentId)) {
    throw new CalibrationGateInputError('instrument-id-malformed');
  }
  if (!isNonEmptyString(runAt)) {
    throw new CalibrationGateInputError('run-timestamp-malformed');
  }
  if (!isStructurallyValidOptions(options)) {
    throw new CalibrationGateInputError('options-malformed');
  }

  const raw = (registry as Record<string, unknown>)[instrumentId];
  if (raw === undefined) {
    return toResult(instrumentId, runAt, 'unknown-instrument');
  }
  if (!isStructurallyValidRecord(raw)) {
    throw new CalibrationGateInputError('instrument-record-malformed');
  }

  if (!isUtcTimestamp(runAt)) {
    return toResult(instrumentId, runAt, 'run-timestamp-invalid');
  }
  if (!isUtcTimestamp(raw.lastCalibratedAt)) {
    return toResult(instrumentId, runAt, 'calibration-timestamp-invalid');
  }
  if (!Number.isInteger(raw.calibrationIntervalDays) || raw.calibrationIntervalDays <= 0) {
    return toResult(instrumentId, runAt, 'calibration-interval-invalid');
  }

  const runAtMs = Date.parse(runAt);
  const lastCalibratedAtMs = Date.parse(raw.lastCalibratedAt);
  if (runAtMs < lastCalibratedAtMs) {
    return toResult(instrumentId, runAt, 'run-before-calibration');
  }

  if (raw.maintenanceLock?.active === true) {
    return toResult(instrumentId, runAt, 'maintenance-lock-active');
  }

  if (!KNOWN_CALIBRATION_OUTCOMES.has(raw.calibrationOutcome)) {
    return toResult(instrumentId, runAt, 'unknown-calibration-outcome');
  }
  if (raw.calibrationOutcome === 'fail') {
    return toResult(instrumentId, runAt, 'calibration-outcome-failed');
  }
  if (raw.calibrationOutcome === 'pending') {
    return toResult(instrumentId, runAt, 'calibration-outcome-pending');
  }
  if (raw.calibrationOutcome === 'not-performed') {
    return toResult(instrumentId, runAt, 'calibration-outcome-not-performed');
  }

  const expiresAtMs = lastCalibratedAtMs + raw.calibrationIntervalDays * MS_PER_DAY;
  if (runAtMs >= expiresAtMs) {
    return toResult(instrumentId, runAt, 'calibration-interval-expired');
  }

  if (raw.calibrationOutcome === 'conditional-pass') {
    return toResult(instrumentId, runAt, 'calibration-outcome-conditional-pass');
  }

  const nearExpiryWarningDays = options?.nearExpiryWarningDays ?? DEFAULT_NEAR_EXPIRY_WARNING_DAYS;
  if (nearExpiryWarningDays > 0 && expiresAtMs - runAtMs <= nearExpiryWarningDays * MS_PER_DAY) {
    return toResult(instrumentId, runAt, 'calibration-interval-near-expiry');
  }

  return toResult(instrumentId, runAt, 'calibration-current-and-passed');
}

/** Deterministic, privacy-safe human-readable text for a reason code, suitable for UI display. */
export function explainCalibrationGateReason(reasonCode: CalibrationReasonCode): string {
  return REASON_MESSAGES[reasonCode];
}
