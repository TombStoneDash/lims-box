/**
 * Fail-closed synthetic OHWorks add-on test eligibility evaluator.
 *
 * When a provider calls after the fact to add a new test onto a specimen
 * that was already collected — and possibly already partially used — the
 * lab needs one composed yes/no/conditional answer instead of three
 * separate checks. This module is a pure, dependency-free evaluator that
 * composes three independent facts about a fabricated specimen:
 *
 *   - whether the specimen has already been discarded or fully consumed,
 *     which makes an add-on impossible regardless of anything else;
 *   - whether the specimen is still within the analyte's stability window,
 *     using the same elapsed-time notion as `ohworks-stability-window`
 *     (see that module for the richer per-storage-condition segment
 *     evaluator this simplified single-window check does not replace);
 *   - whether there is enough remaining volume for the new test, and
 *     whether honoring the add-on would leave the specimen with no safety
 *     buffer for any future add-on or repeat, mirroring the
 *     runnable/short distinction in `ohworks-sample-volume`.
 *
 * It performs no I/O, reads no system clock (the caller supplies `now`),
 * mutates no SENAITE or database state, and touches no real subject,
 * specimen, or customer data.
 */

/**
 * Strict ISO 8601 date-time with an explicit timezone designator (Z or a
 * numeric +HH:MM/-HH:MM offset). Date.parse() also accepts date-only,
 * locale-style, and timezone-less shapes whose absolute instant depends on
 * the host's local timezone, and silently rolls over impossible calendar
 * dates (e.g. "2026-02-30"); this module never accepts those.
 */
const STRICT_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

/** Fixed, privacy-safe message: never echoes caller-supplied timestamp text. */
const INVALID_TIME_MESSAGE =
  'Add-on eligibility requires a valid, calendar-correct collection timestamp and evaluation timestamp, with the evaluation timestamp not preceding collection.';

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
 * milliseconds, or NaN if it is malformed or names a calendar-invalid date.
 * Computed entirely from the parsed digits and the parsed offset — never
 * from a Date object or the host timezone — so the result is identical no
 * matter what timezone the process runs in.
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

export type AddOnSpecimenStatus = 'available' | 'discarded' | 'fully_consumed';

export type AddOnEligibilityStatus =
  | 'eligible'
  | 'specimen_unavailable'
  | 'stability_expired'
  | 'insufficient_volume'
  | 'eligible_with_buffer_warning';

export type AddOnEligibilityInput = {
  specimenStatus: AddOnSpecimenStatus;
  /** ISO 8601 timestamp the specimen was collected. */
  collectedAt: string;
  /** ISO 8601 timestamp the add-on request is being evaluated. */
  now: string;
  /** Maximum hours the analyte remains stable in this specimen since collection. */
  stabilityHoursForAnalyte: number;
  /** Volume, in microliters, currently remaining in the specimen. */
  remainingVolumeMicroliters: number;
  /** Volume, in microliters, the new add-on test requires. */
  requiredVolumeMicroliters: number;
  /** Minimum volume, in microliters, that must remain after this test for any future add-on or repeat. */
  requiresMinimumBufferMicroliters: number;
};

export type AddOnEligibilityResult = {
  eligible: boolean;
  status: AddOnEligibilityStatus;
  hoursSinceCollection: number;
  issues: string[];
};

function result(
  eligible: boolean,
  status: AddOnEligibilityStatus,
  hoursSinceCollection: number,
  issues: string[],
): AddOnEligibilityResult {
  return { eligible, status, hoursSinceCollection, issues: [...issues] };
}

/**
 * Decide whether a new test can be added onto a fabricated, already-
 * collected specimen, composing specimen availability, analyte stability,
 * and remaining volume into a single eligible / ineligible / eligible-with-
 * warning outcome.
 *
 * A discarded or fully consumed specimen short-circuits to
 * `specimen_unavailable` without evaluating stability or volume, since
 * those checks are moot once the specimen no longer exists to draw from.
 * Otherwise, stability is checked first (an expired specimen cannot host
 * any add-on no matter how much volume remains), then volume sufficiency,
 * then whether honoring the test would leave less than the required safety
 * buffer for a future add-on or repeat.
 *
 * Before any eligibility decision is made for an available specimen, both
 * `collectedAt` and `now` must be strict, calendar-valid ISO 8601 instants
 * with an explicit timezone designator, and `now` must not precede
 * `collectedAt`. Any other shape — malformed text, an impossible calendar
 * date like February 30, or an evaluation time before collection — throws a
 * fixed, privacy-safe RangeError rather than silently producing an
 * eligibility outcome from an unknowable elapsed time.
 */
export function evaluateAddOnEligibility(input: AddOnEligibilityInput): AddOnEligibilityResult {
  if (input.specimenStatus === 'discarded' || input.specimenStatus === 'fully_consumed') {
    const hoursSinceCollection = (Date.parse(input.now) - Date.parse(input.collectedAt)) / (1000 * 60 * 60);
    return result(false, 'specimen_unavailable', hoursSinceCollection, [
      `Specimen is ${input.specimenStatus.replace('_', ' ')} and cannot host an add-on test.`,
    ]);
  }

  const collectedAtMs = parseStrictTimestamp(input.collectedAt);
  const nowMs = parseStrictTimestamp(input.now);
  if (!Number.isFinite(collectedAtMs) || !Number.isFinite(nowMs) || nowMs < collectedAtMs) {
    throw new RangeError(INVALID_TIME_MESSAGE);
  }

  const hoursSinceCollection = (nowMs - collectedAtMs) / (1000 * 60 * 60);

  if (hoursSinceCollection > input.stabilityHoursForAnalyte) {
    return result(false, 'stability_expired', hoursSinceCollection, [
      `Specimen is ${hoursSinceCollection.toFixed(2)}h post-collection, exceeding the analyte's ${input.stabilityHoursForAnalyte}h stability window.`,
    ]);
  }

  if (input.remainingVolumeMicroliters < input.requiredVolumeMicroliters) {
    return result(false, 'insufficient_volume', hoursSinceCollection, [
      `Remaining volume ${input.remainingVolumeMicroliters}uL is less than the ${input.requiredVolumeMicroliters}uL required for this test.`,
    ]);
  }

  const remainingAfterTest = input.remainingVolumeMicroliters - input.requiredVolumeMicroliters;
  if (remainingAfterTest < input.requiresMinimumBufferMicroliters) {
    return result(true, 'eligible_with_buffer_warning', hoursSinceCollection, [
      `Running this test leaves ${remainingAfterTest}uL, below the required ${input.requiresMinimumBufferMicroliters}uL safety buffer for future add-ons or repeats.`,
    ]);
  }

  return result(true, 'eligible', hoursSinceCollection, []);
}
