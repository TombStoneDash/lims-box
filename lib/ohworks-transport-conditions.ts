/**
 * Fail-closed, deterministic transport-condition evaluator for the synthetic
 * OHWorks pilot.
 *
 * This module is a pure, dependency-free evaluator: given a caller-declared
 * table of acceptable transport limits per specimen type and an ordered,
 * fabricated temperature log produced by a courier data logger, it walks the
 * log once and computes every excursion — a contiguous run of readings
 * outside the specimen type's declared transport band — with its start
 * timestamp, end timestamp, duration, and worst (furthest out-of-band)
 * reading. It folds those excursions into cumulative time outside the band
 * and the single longest excursion, then classifies the specimen
 * `acceptable`, `acceptable_with_comment`, or `reject` on receipt against
 * the specimen type's declared thresholds.
 *
 * It performs no I/O, reads no clock, and mutates nothing: every timestamp
 * and value used comes from the caller, which keeps the result reproducible
 * for a given input. Only bounded specimen type names and synthetic numeric
 * fixtures ever appear in its input or output — no real courier, patient, or
 * customer data.
 *
 * Fail-closed: a limits input that is not an array, a limits entry missing a
 * required field or declaring an invalid (non-finite, out-of-order, or
 * non-positive where required) threshold, a duplicate specimen type across
 * declared limits, a log that is not a well-shaped object, a reading list
 * that is not an array, a reading missing a required field or with the
 * wrong shape, a log naming a specimen type absent from the declared
 * limits, a reading with a non-finite value, a reading with an unparsable
 * timestamp, a reading whose timestamp precedes an earlier reading's
 * timestamp (the input is required to already be time-ordered), or a gap
 * between two consecutive readings that exceeds the specimen type's
 * declared maximum logger gap all throw TransportConditionsError instead of
 * guessing at a result.
 */

/** Declared acceptable temperature band for a specimen type, in degrees Celsius. */
export type TransportBand = {
  minC: number;
  maxC: number;
};

/**
 * Fabricated per-specimen-type transport limits. Never derived from a real
 * courier's validated shipping profile.
 *
 * A specimen is `acceptable` if both the cumulative time outside the band
 * and the longest single excursion fall at or below the "acceptable"
 * thresholds. It is `acceptable_with_comment` if both fall at or below the
 * (necessarily larger or equal) "commentable" thresholds. Otherwise it is
 * `reject`.
 */
export type SpecimenTypeTransportLimits = {
  specimenType: string;
  band: TransportBand;
  maxAcceptableTotalExcursionMs: number;
  maxCommentableTotalExcursionMs: number;
  maxAcceptableSingleExcursionMs: number;
  maxCommentableSingleExcursionMs: number;
  /** Largest allowed gap between two consecutive logger readings, in milliseconds. */
  maxGapMs: number;
};

/** One fabricated courier data logger reading. */
export type TemperatureReading = {
  /** Degrees Celsius. */
  value: number;
  /** Caller-supplied UTC timestamp, e.g. "2026-01-01T12:00:00.000Z". */
  timestamp: string;
};

/** A fabricated ordered temperature log for one specimen in transit. */
export type TransportLog = {
  specimenId: string;
  specimenType: string;
  readings: TemperatureReading[];
};

/** One contiguous run of readings outside the specimen type's declared band. */
export type TransportExcursion = {
  startTimestamp: string;
  endTimestamp: string;
  durationMs: number;
  /** The reading value with the greatest deviation from the band during this excursion. */
  worstValue: number;
};

export type TransportDecision = 'acceptable' | 'acceptable_with_comment' | 'reject';

export type TransportConditionsResult = {
  specimenId: string;
  specimenType: string;
  readingCount: number;
  excursions: TransportExcursion[];
  totalExcursionMs: number;
  longestExcursionMs: number;
  decision: TransportDecision;
};

export type TransportConditionsErrorCode =
  | 'limits-not-array'
  | 'limits-invalid'
  | 'specimen-type-duplicate'
  | 'log-invalid'
  | 'readings-not-array'
  | 'reading-invalid'
  | 'specimen-type-unknown'
  | 'timestamp-invalid'
  | 'readings-out-of-order'
  | 'value-not-finite'
  | 'gap-too-large';

const ERROR_MESSAGES: Record<TransportConditionsErrorCode, string> = {
  'limits-not-array': 'The specimen type transport limits input is not a list of limits.',
  'limits-invalid': 'A specimen type transport limits entry is missing a required field or declares invalid thresholds.',
  'specimen-type-duplicate': 'The same specimen type appears in more than one declared transport limits entry.',
  'log-invalid': 'The transport log is missing a required field or has the wrong shape.',
  'readings-not-array': 'The transport log reading input is not a list of readings.',
  'reading-invalid': 'A reading is missing a required field or has the wrong shape.',
  'specimen-type-unknown': 'The transport log names a specimen type absent from the declared limits.',
  'timestamp-invalid': 'The reading timestamp could not be parsed as a UTC timestamp.',
  'readings-out-of-order': 'The reading timestamp precedes an earlier reading in the input.',
  'value-not-finite': 'The reading value is not a finite number.',
  'gap-too-large': 'The gap between two consecutive readings exceeds the specimen type\'s declared maximum logger gap.',
};

/** Deterministic, human-readable text for a fail-closed error code. */
export function explainTransportConditionsError(code: TransportConditionsErrorCode): string {
  return ERROR_MESSAGES[code];
}

/** Thrown for any input this evaluator cannot safely resolve to a transport decision. */
export class TransportConditionsError extends Error {
  readonly code: TransportConditionsErrorCode;

  constructor(code: TransportConditionsErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'TransportConditionsError';
    this.code = code;
  }
}

function fail(code: TransportConditionsErrorCode): never {
  throw new TransportConditionsError(code);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isValidBand(value: unknown): value is TransportBand {
  if (!isPlainObject(value)) {
    return false;
  }
  const { minC, maxC } = value;
  return isFiniteNumber(minC) && isFiniteNumber(maxC) && minC < maxC;
}

function isValidLimits(raw: unknown): raw is SpecimenTypeTransportLimits {
  if (!isPlainObject(raw) || !isNonEmptyString(raw.specimenType) || !isValidBand(raw.band)) {
    return false;
  }
  const {
    maxAcceptableTotalExcursionMs,
    maxCommentableTotalExcursionMs,
    maxAcceptableSingleExcursionMs,
    maxCommentableSingleExcursionMs,
    maxGapMs,
  } = raw;
  if (
    !isNonNegativeFiniteNumber(maxAcceptableTotalExcursionMs) ||
    !isNonNegativeFiniteNumber(maxCommentableTotalExcursionMs) ||
    !isNonNegativeFiniteNumber(maxAcceptableSingleExcursionMs) ||
    !isNonNegativeFiniteNumber(maxCommentableSingleExcursionMs) ||
    !isPositiveFiniteNumber(maxGapMs)
  ) {
    return false;
  }
  return (
    maxAcceptableTotalExcursionMs <= maxCommentableTotalExcursionMs &&
    maxAcceptableSingleExcursionMs <= maxCommentableSingleExcursionMs
  );
}

function isValidLogShape(raw: unknown): raw is { specimenId: string; specimenType: string; readings: unknown } {
  if (!isPlainObject(raw)) {
    return false;
  }
  return isNonEmptyString(raw.specimenId) && isNonEmptyString(raw.specimenType) && 'readings' in raw;
}

function isValidReadingShape(raw: unknown): raw is TemperatureReading {
  if (!isPlainObject(raw)) {
    return false;
  }
  return typeof raw.value === 'number' && isNonEmptyString(raw.timestamp);
}

const UTC_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

/**
 * Parses a caller-supplied timestamp into a UTC epoch millisecond instant,
 * or undefined if it is not a real calendar instant written in strict
 * "Z"-suffixed form. The round trip through Date.UTC() and back is checked
 * entirely in UTC fields, so validity never depends on the host process's
 * local timezone.
 */
function parseUtcTimestamp(value: string): number | undefined {
  const match = UTC_TIMESTAMP.exec(value);
  if (match === null) {
    return undefined;
  }
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr, fracStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = Number(secondStr);
  const millisecond = fracStr === undefined ? 0 : Number(fracStr.padEnd(3, '0'));

  const naiveMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const roundTrip = new Date(naiveMs);
  const isRealCalendarInstant =
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day &&
    roundTrip.getUTCHours() === hour &&
    roundTrip.getUTCMinutes() === minute &&
    roundTrip.getUTCSeconds() === second;
  return isRealCalendarInstant ? naiveMs : undefined;
}

function deviationFromBand(value: number, band: TransportBand): number {
  if (value < band.minC) {
    return band.minC - value;
  }
  if (value > band.maxC) {
    return value - band.maxC;
  }
  return 0;
}

type OpenExcursion = {
  startTimestamp: string;
  startTimeMs: number;
  endTimestamp: string;
  endTimeMs: number;
  worstValue: number;
  worstDeviation: number;
};

function closeExcursion(open: OpenExcursion): TransportExcursion {
  return {
    startTimestamp: open.startTimestamp,
    endTimestamp: open.endTimestamp,
    durationMs: open.endTimeMs - open.startTimeMs,
    worstValue: open.worstValue,
  };
}

function decide(
  totalExcursionMs: number,
  longestExcursionMs: number,
  limits: SpecimenTypeTransportLimits,
): TransportDecision {
  if (
    totalExcursionMs <= limits.maxAcceptableTotalExcursionMs &&
    longestExcursionMs <= limits.maxAcceptableSingleExcursionMs
  ) {
    return 'acceptable';
  }
  if (
    totalExcursionMs <= limits.maxCommentableTotalExcursionMs &&
    longestExcursionMs <= limits.maxCommentableSingleExcursionMs
  ) {
    return 'acceptable_with_comment';
  }
  return 'reject';
}

/**
 * Evaluate a caller-declared table of per-specimen-type transport limits
 * against one fabricated, ordered temperature log, returning every
 * excursion, cumulative time outside the band, the longest single
 * excursion, and the receipt decision.
 *
 * Readings must already be supplied in non-decreasing timestamp order,
 * matching the order they were logged in; this function never reorders
 * them itself. Consecutive readings whose gap exceeds the specimen type's
 * declared maxGapMs are treated as an unreliable log and rejected outright,
 * rather than silently assumed to be in-band for the missing interval.
 *
 * Fail-closed: see the module-level doc comment for the full list of
 * conditions that throw TransportConditionsError instead of guessing at a
 * result.
 */
export function evaluateTransportConditions(rawLimits: unknown, rawLog: unknown): TransportConditionsResult {
  if (!Array.isArray(rawLimits)) {
    fail('limits-not-array');
  }

  const limitsBySpecimenType = new Map<string, SpecimenTypeTransportLimits>();
  for (const raw of rawLimits) {
    if (!isValidLimits(raw)) {
      fail('limits-invalid');
    }
    if (limitsBySpecimenType.has(raw.specimenType)) {
      fail('specimen-type-duplicate');
    }
    limitsBySpecimenType.set(raw.specimenType, raw);
  }

  if (!isValidLogShape(rawLog)) {
    fail('log-invalid');
  }

  const { specimenId, specimenType, readings: rawReadings } = rawLog;

  const limits = limitsBySpecimenType.get(specimenType);
  if (limits === undefined) {
    fail('specimen-type-unknown');
  }

  if (!Array.isArray(rawReadings)) {
    fail('readings-not-array');
  }

  const readings: TemperatureReading[] = rawReadings.map((raw) => {
    if (!isValidReadingShape(raw)) {
      fail('reading-invalid');
    }
    return raw;
  });

  const excursions: TransportExcursion[] = [];
  let open: OpenExcursion | undefined;
  let previousTimeMs: number | undefined;

  for (const readingItem of readings) {
    const timeMs = parseUtcTimestamp(readingItem.timestamp);
    if (timeMs === undefined) {
      fail('timestamp-invalid');
    }
    if (previousTimeMs !== undefined) {
      if (timeMs < previousTimeMs) {
        fail('readings-out-of-order');
      }
      if (timeMs - previousTimeMs > limits.maxGapMs) {
        fail('gap-too-large');
      }
    }
    if (!isFiniteNumber(readingItem.value)) {
      fail('value-not-finite');
    }
    previousTimeMs = timeMs;

    const deviation = deviationFromBand(readingItem.value, limits.band);

    if (deviation > 0) {
      if (open === undefined) {
        open = {
          startTimestamp: readingItem.timestamp,
          startTimeMs: timeMs,
          endTimestamp: readingItem.timestamp,
          endTimeMs: timeMs,
          worstValue: readingItem.value,
          worstDeviation: deviation,
        };
      } else {
        open.endTimestamp = readingItem.timestamp;
        open.endTimeMs = timeMs;
        if (deviation > open.worstDeviation) {
          open.worstValue = readingItem.value;
          open.worstDeviation = deviation;
        }
      }
    } else if (open !== undefined) {
      excursions.push(closeExcursion(open));
      open = undefined;
    }
  }

  if (open !== undefined) {
    excursions.push(closeExcursion(open));
  }

  const totalExcursionMs = excursions.reduce((sum, excursion) => sum + excursion.durationMs, 0);
  const longestExcursionMs = excursions.reduce((max, excursion) => Math.max(max, excursion.durationMs), 0);

  return {
    specimenId,
    specimenType,
    readingCount: readings.length,
    excursions,
    totalExcursionMs,
    longestExcursionMs,
    decision: decide(totalExcursionMs, longestExcursionMs, limits),
  };
}
