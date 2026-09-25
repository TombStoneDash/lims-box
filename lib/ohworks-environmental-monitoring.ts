/**
 * Fail-closed, deterministic environmental monitoring evaluator for the
 * synthetic OHWorks pilot.
 *
 * This module is a pure, dependency-free evaluator: given a caller-declared
 * per-room profile of acceptable limits for three monitored metrics
 * (temperature, humidity, pressure differential) and an ordered list of
 * fabricated readings, it walks the readings once and returns every
 * excursion — a contiguous run of out-of-range readings for one room and
 * one metric — with its start timestamp, end timestamp, duration, and worst
 * (most deviant) reading value, classified `minor` or `critical` against
 * the room's declared thresholds. It also folds the excursions into one
 * daily summary per declared room.
 *
 * It performs no I/O, reads no clock, and mutates nothing: every timestamp
 * and value used comes from the caller, which keeps the result reproducible
 * for a given input. Only bounded metric names and synthetic numeric
 * fixtures ever appear in its input or output — no real facility, patient,
 * or customer data.
 *
 * Fail-closed: a room profile list that is not an array, a profile missing
 * a required field or with invalid (non-finite or out-of-order) limits, a
 * duplicate room identifier across profiles, a reading list that is not an
 * array, a reading missing a required field or with the wrong shape, a
 * reading naming a room absent from the declared profiles, a reading naming
 * an unrecognized metric, a reading with a non-finite value, a reading with
 * an unparsable timestamp, or a reading whose timestamp precedes an earlier
 * reading's timestamp (the input is required to already be time-ordered)
 * all throw EnvironmentalMonitoringError instead of guessing at a result.
 */

/** The three metrics this evaluator knows how to monitor. */
export type EnvironmentalMetric = 'temperature' | 'humidity' | 'pressureDifferential';

const KNOWN_METRICS: ReadonlySet<string> = new Set<EnvironmentalMetric>([
  'temperature',
  'humidity',
  'pressureDifferential',
]);

/**
 * Declared acceptable window and critical breakpoints for one metric in one
 * room. A value within [minAcceptable, maxAcceptable] is normal. A value
 * outside that window is an excursion; it is classified `critical` once it
 * reaches criticalBelow (at or below) or criticalAbove (at or above), and
 * `minor` otherwise.
 */
export type MetricLimits = {
  minAcceptable: number;
  maxAcceptable: number;
  criticalBelow: number;
  criticalAbove: number;
};

/** Fabricated per-room environmental limits. Never derived from a real facility's monitoring plan. */
export type RoomEnvironmentalLimits = {
  roomId: string;
  limits: {
    temperature: MetricLimits;
    humidity: MetricLimits;
    pressureDifferential: MetricLimits;
  };
};

/** One fabricated sensor reading. */
export type EnvironmentalReading = {
  roomId: string;
  metric: EnvironmentalMetric;
  value: number;
  /** Caller-supplied UTC timestamp, e.g. "2026-01-01T12:00:00.000Z". */
  timestamp: string;
};

export type ExcursionSeverity = 'minor' | 'critical';

/** One contiguous run of out-of-range readings for one room and one metric. */
export type EnvironmentalExcursion = {
  roomId: string;
  metric: EnvironmentalMetric;
  severity: ExcursionSeverity;
  startTimestamp: string;
  endTimestamp: string;
  durationMs: number;
  /** The reading value with the greatest deviation from the acceptable window during this excursion. */
  worstValue: number;
};

/** Daily roll-up of excursion activity for one declared room. */
export type RoomDailySummary = {
  roomId: string;
  readingCount: number;
  excursionCount: number;
  minorExcursionCount: number;
  criticalExcursionCount: number;
  totalExcursionDurationMs: number;
  worstExcursion: EnvironmentalExcursion | null;
};

export type EnvironmentalMonitoringResult = {
  excursions: EnvironmentalExcursion[];
  roomSummaries: RoomDailySummary[];
};

export type EnvironmentalMonitoringErrorCode =
  | 'profiles-not-array'
  | 'profile-invalid'
  | 'room-duplicate'
  | 'readings-not-array'
  | 'reading-invalid'
  | 'room-unknown'
  | 'metric-unknown'
  | 'timestamp-invalid'
  | 'readings-out-of-order'
  | 'value-not-finite';

const ERROR_MESSAGES: Record<EnvironmentalMonitoringErrorCode, string> = {
  'profiles-not-array': 'The room profile input is not a list of profiles.',
  'profile-invalid': 'A room profile is missing a required field or declares invalid limits.',
  'room-duplicate': 'The same room identifier appears in more than one declared profile.',
  'readings-not-array': 'The reading input is not a list of readings.',
  'reading-invalid': 'A reading is missing a required field or has the wrong shape.',
  'room-unknown': 'The reading names a room absent from the declared profiles.',
  'metric-unknown': 'The reading names a metric outside the known bounded set.',
  'timestamp-invalid': 'The reading timestamp could not be parsed as a UTC timestamp.',
  'readings-out-of-order': 'The reading timestamp precedes an earlier reading in the input.',
  'value-not-finite': 'The reading value is not a finite number.',
};

/** Deterministic, human-readable text for a fail-closed error code. */
export function explainEnvironmentalMonitoringError(code: EnvironmentalMonitoringErrorCode): string {
  return ERROR_MESSAGES[code];
}

/** Thrown for any input this evaluator cannot safely resolve to excursions and summaries. */
export class EnvironmentalMonitoringError extends Error {
  readonly code: EnvironmentalMonitoringErrorCode;

  constructor(code: EnvironmentalMonitoringErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'EnvironmentalMonitoringError';
    this.code = code;
  }
}

function fail(code: EnvironmentalMonitoringErrorCode): never {
  throw new EnvironmentalMonitoringError(code);
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

function isValidMetricLimits(value: unknown): value is MetricLimits {
  if (!isPlainObject(value)) {
    return false;
  }
  const { minAcceptable, maxAcceptable, criticalBelow, criticalAbove } = value;
  if (
    !isFiniteNumber(minAcceptable) ||
    !isFiniteNumber(maxAcceptable) ||
    !isFiniteNumber(criticalBelow) ||
    !isFiniteNumber(criticalAbove)
  ) {
    return false;
  }
  return criticalBelow < minAcceptable && minAcceptable < maxAcceptable && maxAcceptable < criticalAbove;
}

function isValidProfile(raw: unknown): raw is RoomEnvironmentalLimits {
  if (!isPlainObject(raw) || !isNonEmptyString(raw.roomId) || !isPlainObject(raw.limits)) {
    return false;
  }
  const { limits } = raw;
  return (
    isValidMetricLimits(limits.temperature) &&
    isValidMetricLimits(limits.humidity) &&
    isValidMetricLimits(limits.pressureDifferential)
  );
}

function isValidReadingShape(raw: unknown): raw is EnvironmentalReading {
  if (!isPlainObject(raw)) {
    return false;
  }
  return (
    isNonEmptyString(raw.roomId) &&
    isNonEmptyString(raw.metric) &&
    typeof raw.value === 'number' &&
    isNonEmptyString(raw.timestamp)
  );
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

function deviationFromRange(value: number, limits: MetricLimits): number {
  if (value < limits.minAcceptable) {
    return limits.minAcceptable - value;
  }
  if (value > limits.maxAcceptable) {
    return value - limits.maxAcceptable;
  }
  return 0;
}

function classifySeverity(value: number, limits: MetricLimits): ExcursionSeverity {
  return value <= limits.criticalBelow || value >= limits.criticalAbove ? 'critical' : 'minor';
}

type OpenExcursion = {
  roomId: string;
  metric: EnvironmentalMetric;
  startTimestamp: string;
  startTimeMs: number;
  endTimestamp: string;
  endTimeMs: number;
  worstValue: number;
  worstDeviation: number;
};

function closeExcursion(open: OpenExcursion, limits: MetricLimits): EnvironmentalExcursion {
  return {
    roomId: open.roomId,
    metric: open.metric,
    severity: classifySeverity(open.worstValue, limits),
    startTimestamp: open.startTimestamp,
    endTimestamp: open.endTimestamp,
    durationMs: open.endTimeMs - open.startTimeMs,
    worstValue: open.worstValue,
  };
}

/** Rank used to pick the single worst excursion in a room: critical outranks minor, then longer duration, then earlier start, then metric name. */
function isWorseExcursion(candidate: EnvironmentalExcursion, current: EnvironmentalExcursion): boolean {
  if (candidate.severity !== current.severity) {
    return candidate.severity === 'critical';
  }
  if (candidate.durationMs !== current.durationMs) {
    return candidate.durationMs > current.durationMs;
  }
  if (candidate.startTimestamp !== current.startTimestamp) {
    return candidate.startTimestamp < current.startTimestamp;
  }
  return candidate.metric < current.metric;
}

/**
 * Evaluate a caller-declared set of per-room environmental limits against
 * an ordered list of fabricated readings, returning every excursion and one
 * daily summary per declared room.
 *
 * Readings must already be supplied in non-decreasing timestamp order,
 * matching the order they were sensed in; this function never reorders
 * them itself. Excursions are tracked independently per (roomId, metric)
 * pair, so an out-of-range temperature run and an out-of-range humidity run
 * in the same room are reported as separate excursions.
 *
 * Fail-closed: see the module-level doc comment for the full list of
 * conditions that throw EnvironmentalMonitoringError instead of guessing at
 * a result.
 */
export function evaluateEnvironmentalMonitoring(
  rawProfiles: unknown,
  rawReadings: unknown,
): EnvironmentalMonitoringResult {
  if (!Array.isArray(rawProfiles)) {
    fail('profiles-not-array');
  }

  const profilesByRoomId = new Map<string, RoomEnvironmentalLimits>();
  for (const raw of rawProfiles) {
    if (!isValidProfile(raw)) {
      fail('profile-invalid');
    }
    if (profilesByRoomId.has(raw.roomId)) {
      fail('room-duplicate');
    }
    profilesByRoomId.set(raw.roomId, raw);
  }

  if (!Array.isArray(rawReadings)) {
    fail('readings-not-array');
  }

  const readings: EnvironmentalReading[] = rawReadings.map((raw) => {
    if (!isValidReadingShape(raw)) {
      fail('reading-invalid');
    }
    return raw;
  });

  const excursions: EnvironmentalExcursion[] = [];
  const open = new Map<string, OpenExcursion>();
  const readingCountByRoom = new Map<string, number>();
  let previousTimeMs: number | undefined;

  for (const reading of readings) {
    const profile = profilesByRoomId.get(reading.roomId);
    if (profile === undefined) {
      fail('room-unknown');
    }
    if (!KNOWN_METRICS.has(reading.metric)) {
      fail('metric-unknown');
    }
    const timeMs = parseUtcTimestamp(reading.timestamp);
    if (timeMs === undefined) {
      fail('timestamp-invalid');
    }
    if (previousTimeMs !== undefined && timeMs < previousTimeMs) {
      fail('readings-out-of-order');
    }
    if (!isFiniteNumber(reading.value)) {
      fail('value-not-finite');
    }
    previousTimeMs = timeMs;

    readingCountByRoom.set(reading.roomId, (readingCountByRoom.get(reading.roomId) ?? 0) + 1);

    const limits = profile.limits[reading.metric];
    const key = `${reading.roomId} ${reading.metric}`;
    const deviation = deviationFromRange(reading.value, limits);
    const existing = open.get(key);

    if (deviation > 0) {
      if (existing === undefined) {
        open.set(key, {
          roomId: reading.roomId,
          metric: reading.metric,
          startTimestamp: reading.timestamp,
          startTimeMs: timeMs,
          endTimestamp: reading.timestamp,
          endTimeMs: timeMs,
          worstValue: reading.value,
          worstDeviation: deviation,
        });
      } else {
        existing.endTimestamp = reading.timestamp;
        existing.endTimeMs = timeMs;
        if (deviation > existing.worstDeviation) {
          existing.worstValue = reading.value;
          existing.worstDeviation = deviation;
        }
      }
    } else if (existing !== undefined) {
      excursions.push(closeExcursion(existing, limits));
      open.delete(key);
    }
  }

  for (const [key, existing] of open) {
    const roomId = key.slice(0, key.indexOf(' '));
    const limits = (profilesByRoomId.get(roomId) as RoomEnvironmentalLimits).limits[existing.metric];
    excursions.push(closeExcursion(existing, limits));
  }

  const roomSummaries: RoomDailySummary[] = [...profilesByRoomId.keys()].map((roomId) => {
    const roomExcursions = excursions.filter((excursion) => excursion.roomId === roomId);
    let worstExcursion: EnvironmentalExcursion | null = null;
    let totalExcursionDurationMs = 0;
    let minorExcursionCount = 0;
    let criticalExcursionCount = 0;

    for (const excursion of roomExcursions) {
      totalExcursionDurationMs += excursion.durationMs;
      if (excursion.severity === 'critical') {
        criticalExcursionCount += 1;
      } else {
        minorExcursionCount += 1;
      }
      if (worstExcursion === null || isWorseExcursion(excursion, worstExcursion)) {
        worstExcursion = excursion;
      }
    }

    return {
      roomId,
      readingCount: readingCountByRoom.get(roomId) ?? 0,
      excursionCount: roomExcursions.length,
      minorExcursionCount,
      criticalExcursionCount,
      totalExcursionDurationMs,
      worstExcursion,
    };
  });

  return { excursions, roomSummaries };
}
