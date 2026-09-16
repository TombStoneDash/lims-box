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
 * reasons about is supplied by the caller. A missing or unparsable stage
 * timestamp, a negative stage duration (raw, or after paused time is
 * subtracted), a malformed paused interval, or an unrecognized priority
 * class all fail closed by throwing TurnaroundTimeInputError rather than
 * guessing.
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
  | 'stage-duration-negative'
  | 'paused-intervals-not-array'
  | 'paused-interval-invalid';

const INPUT_ERROR_MESSAGES: Record<TurnaroundTimeInputErrorCode, string> = {
  'input-malformed': 'The turnaround-time input is not a valid object.',
  'priority-class-unknown': 'The priority class is not a recognized bounded value.',
  'timestamps-missing': 'One or more required stage timestamps is missing.',
  'timestamp-invalid': 'A stage timestamp could not be parsed.',
  'timestamp-not-utc': 'A stage timestamp is not an explicit UTC timestamp.',
  'stage-duration-negative': 'A stage duration is negative, either before or after subtracting paused time.',
  'paused-intervals-not-array': 'The paused intervals input is not a list.',
  'paused-interval-invalid': 'A paused interval is missing a required field, unparsable, or ends before it starts.',
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
    const startMs = Date.parse(startedAt);
    const endMs = Date.parse(endedAt);
    if (endMs < startMs) {
      throw new TurnaroundTimeInputError('paused-interval-invalid');
    }
    return { startMs, endMs };
  });
}

function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Compute deterministic turnaround-time stage durations, total, and status
 * for a single specimen from caller-supplied timestamps.
 *
 * Fails closed (throws TurnaroundTimeInputError) on: a malformed input
 * object; an unrecognized priority class; a missing, unparsable, or
 * non-UTC stage timestamp; a malformed paused interval; and a negative
 * stage duration, whether from out-of-order timestamps or from paused time
 * exceeding a stage's raw span.
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
