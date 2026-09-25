/**
 * Deterministic, pure OHWorks turnaround-time computation for the synthetic
 * pilot.
 *
 * Given caller-supplied collection, receipt, analysis, and report
 * timestamps plus a bounded priority class, this module computes each
 * pipeline stage's net duration (after subtracting any caller-supplied
 * paused intervals, e.g. a specimen placed on hold), the total net
 * duration, and flags the result `on_target`, `at_risk`, or `breached`
 * against the priority class's target — naming the stage most responsible
 * when the result is not `on_target`.
 *
 * This module performs no I/O and reads no clock: every timestamp it
 * reasons about is supplied by the caller. A missing, unparsable, or
 * non-existent-calendar-date stage timestamp, a negative stage duration
 * (raw, or after paused time is subtracted), a malformed or overlapping
 * paused interval, or an unrecognized priority class all fail closed by
 * throwing TurnaroundTimeInputError rather than guessing.
 */

/** The three pipeline stages this module measures, in chronological order. */
export type TurnaroundStage = 'collection_to_receipt' | 'receipt_to_analysis' | 'analysis_to_report';

export const TURNAROUND_STAGES: readonly TurnaroundStage[] = [
  'collection_to_receipt',
  'receipt_to_analysis',
  'analysis_to_report',
];

/** Bounded priority classes this module knows a target duration for. */
export type PriorityClass = 'ROUTINE' | 'URGENT' | 'STAT';

export const PRIORITY_CLASSES: readonly PriorityClass[] = ['ROUTINE', 'URGENT', 'STAT'];

type PriorityClassConfig = {
  stageTargetMinutes: Record<TurnaroundStage, number>;
  /** Fraction of the total target at which a still-on-time result is flagged at_risk. */
  atRiskThresholdRatio: number;
};

const PRIORITY_CLASS_CONFIG: Record<PriorityClass, PriorityClassConfig> = {
  ROUTINE: {
    stageTargetMinutes: {
      collection_to_receipt: 720,
      receipt_to_analysis: 1440,
      analysis_to_report: 720,
    },
    atRiskThresholdRatio: 0.8,
  },
  URGENT: {
    stageTargetMinutes: {
      collection_to_receipt: 60,
      receipt_to_analysis: 120,
      analysis_to_report: 60,
    },
    atRiskThresholdRatio: 0.8,
  },
  STAT: {
    stageTargetMinutes: {
      collection_to_receipt: 15,
      receipt_to_analysis: 30,
      analysis_to_report: 15,
    },
    atRiskThresholdRatio: 0.8,
  },
};

const KNOWN_PRIORITY_CLASSES: ReadonlySet<string> = new Set<PriorityClass>(PRIORITY_CLASSES);

function targetTotalMinutesFor(config: PriorityClassConfig): number {
  return TURNAROUND_STAGES.reduce((sum, stage) => sum + config.stageTargetMinutes[stage], 0);
}

/** Caller-supplied UTC ISO stage timestamps, e.g. "2026-01-01T12:00:00.000Z". Must end in "Z". */
export type TurnaroundTimestamps = {
  collectedAt: string;
  receivedAt: string;
  analyzedAt: string;
  reportedAt: string;
};

/** A caller-declared interval during which the specimen's clock was paused, e.g. an on-hold period. */
export type PausedInterval = {
  startedAt: string;
  endedAt: string;
  reason?: string;
};

export type TurnaroundInput = {
  priorityClass: string;
  timestamps: TurnaroundTimestamps;
  pausedIntervals?: ReadonlyArray<PausedInterval>;
};

export type TurnaroundStageDuration = {
  stage: TurnaroundStage;
  /** Net minutes elapsed in this stage, after subtracting any overlapping paused time. */
  durationMinutes: number;
  /** Minutes of this stage's window that overlapped a paused interval. */
  pausedMinutes: number;
  targetMinutes: number;
};

export type TurnaroundStatus = 'on_target' | 'at_risk' | 'breached';

export type TurnaroundResult = {
  priorityClass: PriorityClass;
  stages: TurnaroundStageDuration[];
  totalDurationMinutes: number;
  totalPausedMinutes: number;
  targetTotalMinutes: number;
  status: TurnaroundStatus;
  /** The stage with the largest overrun against its own target. Present only when status is not on_target. */
  causingStage?: TurnaroundStage;
};

export type TurnaroundTimeInputErrorCode =
  | 'input-malformed'
  | 'priority-class-unknown'
  | 'timestamps-missing'
  | 'timestamp-invalid'
  | 'timestamp-not-utc'
  | 'timestamp-nonexistent-date'
  | 'stage-duration-negative'
  | 'paused-intervals-not-array'
  | 'paused-interval-invalid'
  | 'paused-interval-overlap';

const INPUT_ERROR_MESSAGES: Record<TurnaroundTimeInputErrorCode, string> = {
  'input-malformed': 'The turnaround-time input is not a valid object.',
  'priority-class-unknown': 'The priority class is not a recognized bounded value.',
  'timestamps-missing': 'One or more required stage timestamps is missing.',
  'timestamp-invalid': 'A stage timestamp could not be parsed.',
  'timestamp-not-utc': 'A stage timestamp is not an explicit UTC timestamp.',
  'timestamp-nonexistent-date': 'A timestamp does not name a real UTC calendar instant.',
  'stage-duration-negative': 'A stage duration is negative, either before or after subtracting paused time.',
  'paused-intervals-not-array': 'The paused intervals input is not a list.',
  'paused-interval-invalid': 'A paused interval is missing a required field, unparsable, or ends before it starts.',
  'paused-interval-overlap': 'Two or more paused intervals overlap in time.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a fail-closed result. */
export class TurnaroundTimeInputError extends Error {
  readonly code: TurnaroundTimeInputErrorCode;
  readonly stage?: TurnaroundStage;

  constructor(code: TurnaroundTimeInputErrorCode, stage?: TurnaroundStage) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'TurnaroundTimeInputError';
    this.code = code;
    this.stage = stage;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isUtcTimestamp(value: string): boolean {
  return value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

const ISO_UTC_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Rejects ISO-8601 UTC timestamps whose calendar fields do not name a real
 * instant, e.g. "2026-02-30T12:00:00Z". `Date.parse` silently rolls values
 * like this over into the following month rather than failing, so calendar
 * validity must be checked against the literal digits, not the parsed value.
 */
function namesRealCalendarUtcInstant(value: string): boolean {
  const match = ISO_UTC_TIMESTAMP_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = Number(secondStr);

  if (month < 1 || month > 12) {
    return false;
  }
  const daysInMonth = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  if (day < 1 || day > daysInMonth) {
    return false;
  }
  if (hour > 23 || minute > 59 || second > 59) {
    return false;
  }
  return true;
}

function parseRequiredTimestamp(value: unknown): number {
  if (!isNonEmptyString(value)) {
    throw new TurnaroundTimeInputError('timestamps-missing');
  }
  if (!Number.isFinite(Date.parse(value))) {
    throw new TurnaroundTimeInputError('timestamp-invalid');
  }
  if (!isUtcTimestamp(value)) {
    throw new TurnaroundTimeInputError('timestamp-not-utc');
  }
  if (!namesRealCalendarUtcInstant(value)) {
    throw new TurnaroundTimeInputError('timestamp-nonexistent-date');
  }
  return Date.parse(value);
}

function isValidPriorityClass(value: unknown): value is PriorityClass {
  return typeof value === 'string' && KNOWN_PRIORITY_CLASSES.has(value);
}

type ParsedPausedInterval = { startMs: number; endMs: number };

function parsePausedIntervals(raw: unknown): ParsedPausedInterval[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new TurnaroundTimeInputError('paused-intervals-not-array');
  }
  return raw.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new TurnaroundTimeInputError('paused-interval-invalid');
    }
    const candidate = entry as Record<string, unknown>;
    const startedAt = candidate.startedAt;
    const endedAt = candidate.endedAt;
    if (!isNonEmptyString(startedAt) || !isNonEmptyString(endedAt)) {
      throw new TurnaroundTimeInputError('paused-interval-invalid');
    }
    if (!Number.isFinite(Date.parse(startedAt)) || !isUtcTimestamp(startedAt)) {
      throw new TurnaroundTimeInputError('paused-interval-invalid');
    }
    if (!Number.isFinite(Date.parse(endedAt)) || !isUtcTimestamp(endedAt)) {
      throw new TurnaroundTimeInputError('paused-interval-invalid');
    }
    if (!namesRealCalendarUtcInstant(startedAt) || !namesRealCalendarUtcInstant(endedAt)) {
      throw new TurnaroundTimeInputError('paused-interval-invalid');
    }
    const startMs = Date.parse(startedAt);
    const endMs = Date.parse(endedAt);
    if (endMs < startMs) {
      throw new TurnaroundTimeInputError('paused-interval-invalid');
    }
    return { startMs, endMs };
  }).sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

/**
 * Rejects duplicate, nested, and partially overlapping paused intervals so
 * they cannot be silently double-subtracted from the same stage window.
 * Intervals that merely touch at a shared boundary (adjacent) or do not
 * overlap at all remain valid. `intervals` must already be sorted by
 * startMs.
 */
function assertNoOverlappingPausedIntervals(intervals: readonly ParsedPausedInterval[]): void {
  let maxEndSoFarMs = -Infinity;
  for (const interval of intervals) {
    if (interval.startMs < maxEndSoFarMs) {
      throw new TurnaroundTimeInputError('paused-interval-overlap');
    }
    maxEndSoFarMs = Math.max(maxEndSoFarMs, interval.endMs);
  }
}

function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Compute deterministic turnaround-time stage durations, total, and status
 * for a single specimen from caller-supplied timestamps.
 *
 * Fails closed (throws TurnaroundTimeInputError) on: a malformed input
 * object; an unrecognized priority class; a missing, unparsable, non-UTC,
 * or non-existent-calendar-date stage timestamp; a malformed or overlapping
 * paused interval; and a negative stage duration, whether from out-of-order
 * timestamps or from paused time exceeding a stage's raw span.
 */
export function computeTurnaroundTime(input: TurnaroundInput): TurnaroundResult {
  if (typeof input !== 'object' || input === null) {
    throw new TurnaroundTimeInputError('input-malformed');
  }

  if (!isValidPriorityClass(input.priorityClass)) {
    throw new TurnaroundTimeInputError('priority-class-unknown');
  }
  const config = PRIORITY_CLASS_CONFIG[input.priorityClass];

  const timestamps = input.timestamps;
  if (typeof timestamps !== 'object' || timestamps === null) {
    throw new TurnaroundTimeInputError('timestamps-missing');
  }

  const collectedAtMs = parseRequiredTimestamp(timestamps.collectedAt);
  const receivedAtMs = parseRequiredTimestamp(timestamps.receivedAt);
  const analyzedAtMs = parseRequiredTimestamp(timestamps.analyzedAt);
  const reportedAtMs = parseRequiredTimestamp(timestamps.reportedAt);

  const stageWindows: Record<TurnaroundStage, { startMs: number; endMs: number }> = {
    collection_to_receipt: { startMs: collectedAtMs, endMs: receivedAtMs },
    receipt_to_analysis: { startMs: receivedAtMs, endMs: analyzedAtMs },
    analysis_to_report: { startMs: analyzedAtMs, endMs: reportedAtMs },
  };

  for (const stage of TURNAROUND_STAGES) {
    if (stageWindows[stage].endMs < stageWindows[stage].startMs) {
      throw new TurnaroundTimeInputError('stage-duration-negative', stage);
    }
  }

  const pausedIntervals = parsePausedIntervals(input.pausedIntervals);
  assertNoOverlappingPausedIntervals(pausedIntervals);

  const stages: TurnaroundStageDuration[] = TURNAROUND_STAGES.map((stage) => {
    const window = stageWindows[stage];
    const rawMs = window.endMs - window.startMs;
    const pausedMs = pausedIntervals.reduce(
      (sum, interval) => sum + overlapMs(window.startMs, window.endMs, interval.startMs, interval.endMs),
      0,
    );
    const netMs = rawMs - pausedMs;
    if (netMs < 0) {
      throw new TurnaroundTimeInputError('stage-duration-negative', stage);
    }
    return {
      stage,
      durationMinutes: netMs / 60000,
      pausedMinutes: pausedMs / 60000,
      targetMinutes: config.stageTargetMinutes[stage],
    };
  });

  const totalDurationMinutes = stages.reduce((sum, s) => sum + s.durationMinutes, 0);
  const totalPausedMinutes = stages.reduce((sum, s) => sum + s.pausedMinutes, 0);
  const targetTotalMinutes = targetTotalMinutesFor(config);
  const atRiskThreshold = targetTotalMinutes * config.atRiskThresholdRatio;

  let status: TurnaroundStatus;
  if (totalDurationMinutes > targetTotalMinutes) {
    status = 'breached';
  } else if (totalDurationMinutes > atRiskThreshold) {
    status = 'at_risk';
  } else {
    status = 'on_target';
  }

  let causingStage: TurnaroundStage | undefined;
  if (status !== 'on_target') {
    let maxOverrun = -Infinity;
    for (const stageDuration of stages) {
      const overrun = stageDuration.durationMinutes - stageDuration.targetMinutes;
      if (overrun > maxOverrun) {
        maxOverrun = overrun;
        causingStage = stageDuration.stage;
      }
    }
  }

  return {
    priorityClass: input.priorityClass,
    stages,
    totalDurationMinutes,
    totalPausedMinutes,
    targetTotalMinutes,
    status,
    ...(causingStage ? { causingStage } : {}),
  };
}
