/**
 * Fail-closed synthetic OHWorks instrument maintenance gate.
 *
 * This module is a pure, dependency-free function over a fabricated
 * per-instrument maintenance schedule. It performs no I/O, reads no system
 * clock, and touches no real instrument, sample, or customer data. Every
 * timestamp it compares against — the run timestamp and each task's
 * last-done timestamp — is supplied by the caller.
 *
 * Given an instrument's maintenance schedule (a list of tasks, each with a
 * bounded task code, an interval in whole days, and a last-done timestamp)
 * plus a run timestamp, it:
 *
 *   - lists which scheduled tasks are overdue and which are due soon
 *   - decides whether the instrument may be used during that run:
 *
 *       usable            - every scheduled task is current (or none exist)
 *       usable_with_flag  - at least one task is due soon, but nothing is
 *                           overdue or otherwise invalid
 *       blocked           - unknown instrument, a malformed run timestamp,
 *                           an unrecognized task code, a non-positive
 *                           interval, a malformed task timestamp, a run
 *                           timestamp before a task's last-done timestamp,
 *                           or an overdue task
 *
 * Every failure mode defaults to `blocked` rather than guessing in the
 * instrument's favor. When multiple tasks would independently block the
 * instrument, the single governing task is chosen deterministically.
 */

export type MaintenanceTaskCode =
  | 'cleaning'
  | 'filter-replacement'
  | 'lubrication'
  | 'calibration-check'
  | 'safety-inspection'
  | 'preventive-service';

export type MaintenanceTaskScheduleEntry = {
  taskCode: MaintenanceTaskCode;
  /** Whole days the task remains current for. Must be a positive integer. */
  intervalDays: number;
  /** UTC timestamp the task was last completed, e.g. "2026-01-01T12:00:00.000Z". Caller supplied. */
  lastDoneAt: string;
};

export type InstrumentMaintenanceScheduleInput = {
  instrumentId: string;
  tasks: readonly MaintenanceTaskScheduleEntry[];
};

/** Synthetic maintenance-schedule registry keyed by instrument identifier. */
export type InstrumentMaintenanceRegistry = Readonly<Record<string, InstrumentMaintenanceScheduleInput>>;

export type MaintenanceGateOptions = {
  /**
   * How many whole days before a task's next-due date a still-current task
   * is flagged as due soon instead of reported clean. Caller supplied; no
   * default clock math beyond simple day arithmetic on caller-supplied
   * timestamps. Defaults to 3. Set to 0 to disable the due-soon flag
   * entirely.
   */
  dueSoonWarningDays?: number;
};

export type InstrumentUsability = 'usable' | 'usable_with_flag' | 'blocked';

export type MaintenanceTaskReasonCode =
  | 'unknown-task-code'
  | 'task-interval-invalid'
  | 'task-timestamp-invalid'
  | 'run-before-task-last-done'
  | 'task-overdue'
  | 'task-due-soon'
  | 'task-current';

/** Bounded, privacy-safe codes explaining the overall maintenance gate decision. */
export type MaintenanceReasonCode =
  | 'unknown-instrument'
  | 'run-timestamp-invalid'
  | MaintenanceTaskReasonCode
  | 'no-scheduled-tasks'
  | 'all-tasks-current';

export type MaintenanceTaskEvaluation = {
  taskCode: string;
  reasonCode: MaintenanceTaskReasonCode;
  /** Deterministic, privacy-safe human-readable explanation of reasonCode. */
  reason: string;
  /** Present only when the task's next-due timestamp was computable. */
  dueAt?: string;
};

export type MaintenanceGateResult = {
  instrumentId: string;
  runAt: string;
  decision: InstrumentUsability;
  /** The task code that determined the decision, or null when nothing governs it. */
  governingTaskCode: string | null;
  reasonCode: MaintenanceReasonCode;
  /** Deterministic, privacy-safe human-readable explanation of reasonCode. */
  reason: string;
  overdueTasks: readonly MaintenanceTaskEvaluation[];
  dueSoonTasks: readonly MaintenanceTaskEvaluation[];
};

export type MaintenanceGateInputErrorCode =
  | 'registry-malformed'
  | 'instrument-id-malformed'
  | 'run-timestamp-malformed'
  | 'options-malformed'
  | 'schedule-malformed'
  | 'task-entry-malformed'
  | 'duplicate-task-code';

const INPUT_ERROR_MESSAGES: Record<MaintenanceGateInputErrorCode, string> = {
  'registry-malformed': 'The instrument maintenance registry is not a valid lookup object.',
  'instrument-id-malformed': 'The requested instrument identifier is not a non-empty string.',
  'run-timestamp-malformed': 'The supplied run timestamp is not a non-empty string.',
  'options-malformed': 'The maintenance gate options are invalid.',
  'schedule-malformed': 'The registry entry for this instrument is missing a required field or has the wrong shape.',
  'task-entry-malformed': 'A scheduled maintenance task entry is missing a required field or has the wrong shape.',
  'duplicate-task-code': 'The maintenance schedule lists the same task code more than once.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a reason code. */
export class MaintenanceGateInputError extends Error {
  readonly code: MaintenanceGateInputErrorCode;

  constructor(code: MaintenanceGateInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'MaintenanceGateInputError';
    this.code = code;
  }
}

const DEFAULT_DUE_SOON_WARNING_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const KNOWN_TASK_CODES: ReadonlySet<string> = new Set<MaintenanceTaskCode>([
  'cleaning',
  'filter-replacement',
  'lubrication',
  'calibration-check',
  'safety-inspection',
  'preventive-service',
]);

const TASK_REASON_MESSAGES: Record<MaintenanceTaskReasonCode, string> = {
  'unknown-task-code': 'The scheduled task code is not a recognized bounded value.',
  'task-interval-invalid': 'The task interval is not a positive whole number of days.',
  'task-timestamp-invalid': 'The task last-done timestamp could not be parsed as an explicit UTC timestamp.',
  'run-before-task-last-done': 'The run timestamp comes before the task was last completed.',
  'task-overdue': 'The task interval has elapsed as of the run timestamp.',
  'task-due-soon': 'The task is current but its interval is close to elapsing.',
  'task-current': 'The task is current and not close to its next-due date.',
};

const REASON_MESSAGES: Record<MaintenanceReasonCode, string> = {
  'unknown-instrument': 'No maintenance schedule exists for this instrument identifier.',
  'run-timestamp-invalid': 'The run timestamp could not be parsed as an explicit UTC timestamp.',
  'no-scheduled-tasks': 'The instrument has no scheduled maintenance tasks, so it is usable by default.',
  'all-tasks-current': 'Every scheduled maintenance task is current.',
  ...TASK_REASON_MESSAGES,
};

/**
 * Task-level reason codes that force the instrument to blocked, ranked by
 * severity. When several tasks independently block the instrument, the
 * evaluation with the highest severity governs; ties keep the
 * first-encountered task for determinism.
 */
const BLOCKING_TASK_SEVERITY: Partial<Record<MaintenanceTaskReasonCode, number>> = {
  'unknown-task-code': 5,
  'task-interval-invalid': 4,
  'task-timestamp-invalid': 3,
  'run-before-task-last-done': 2,
  'task-overdue': 1,
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isUtcTimestamp(value: string): boolean {
  return value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

function isStructurallyValidTaskEntry(raw: unknown): raw is MaintenanceTaskScheduleEntry {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.taskCode) &&
    typeof candidate.intervalDays === 'number' &&
    Number.isFinite(candidate.intervalDays) &&
    isNonEmptyString(candidate.lastDoneAt)
  );
}

function isStructurallyValidSchedule(raw: unknown): raw is InstrumentMaintenanceScheduleInput {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return isNonEmptyString(candidate.instrumentId) && Array.isArray(candidate.tasks);
}

function isStructurallyValidOptions(raw: unknown): raw is MaintenanceGateOptions {
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

function taskResult(taskCode: string, reasonCode: MaintenanceTaskReasonCode, dueAt?: string): MaintenanceTaskEvaluation {
  return Object.freeze({
    taskCode,
    reasonCode,
    reason: TASK_REASON_MESSAGES[reasonCode],
    ...(dueAt !== undefined ? { dueAt } : {}),
  });
}

function toResult(
  instrumentId: string,
  runAt: string,
  decision: InstrumentUsability,
  reasonCode: MaintenanceReasonCode,
  governingTaskCode: string | null,
  overdueTasks: readonly MaintenanceTaskEvaluation[],
  dueSoonTasks: readonly MaintenanceTaskEvaluation[],
): MaintenanceGateResult {
  return Object.freeze({
    instrumentId,
    runAt,
    decision,
    governingTaskCode,
    reasonCode,
    reason: REASON_MESSAGES[reasonCode],
    overdueTasks: Object.freeze([...overdueTasks]),
    dueSoonTasks: Object.freeze([...dueSoonTasks]),
  });
}

function evaluateTask(entry: MaintenanceTaskScheduleEntry, runAtMs: number, dueSoonWarningDays: number): MaintenanceTaskEvaluation {
  if (!KNOWN_TASK_CODES.has(entry.taskCode)) {
    return taskResult(entry.taskCode, 'unknown-task-code');
  }
  if (!Number.isInteger(entry.intervalDays) || entry.intervalDays <= 0) {
    return taskResult(entry.taskCode, 'task-interval-invalid');
  }
  if (!isUtcTimestamp(entry.lastDoneAt)) {
    return taskResult(entry.taskCode, 'task-timestamp-invalid');
  }

  const lastDoneAtMs = Date.parse(entry.lastDoneAt);
  if (runAtMs < lastDoneAtMs) {
    return taskResult(entry.taskCode, 'run-before-task-last-done');
  }

  const dueAtMs = lastDoneAtMs + entry.intervalDays * MS_PER_DAY;
  const dueAt = new Date(dueAtMs).toISOString();

  if (runAtMs >= dueAtMs) {
    return taskResult(entry.taskCode, 'task-overdue', dueAt);
  }

  if (dueSoonWarningDays > 0 && dueAtMs - runAtMs <= dueSoonWarningDays * MS_PER_DAY) {
    return taskResult(entry.taskCode, 'task-due-soon', dueAt);
  }

  return taskResult(entry.taskCode, 'task-current', dueAt);
}

/**
 * Evaluate whether an instrument may be used for a run, based on its
 * caller-supplied maintenance schedule.
 *
 * Fail-closed: an instrument missing from the registry, a malformed run
 * timestamp, an unrecognized task code, a non-positive task interval, a
 * malformed task timestamp, a run timestamp before a task's last-done
 * timestamp (non-monotonic), or any overdue task all resolve to `blocked`.
 * A schedule with no tasks, or where every task is current, resolves to
 * `usable`. A schedule where nothing is overdue or invalid but at least
 * one task is due soon resolves to `usable_with_flag`.
 *
 * Structurally unusable input (a malformed registry, instrument id, run
 * timestamp, options, schedule entry, task entry, or a schedule with a
 * duplicated task code) throws MaintenanceGateInputError instead of
 * guessing at a reason code.
 */
export function evaluateInstrumentMaintenanceGate(
  registry: InstrumentMaintenanceRegistry,
  instrumentId: string,
  runAt: string,
  options?: MaintenanceGateOptions,
): MaintenanceGateResult {
  if (typeof registry !== 'object' || registry === null || Array.isArray(registry)) {
    throw new MaintenanceGateInputError('registry-malformed');
  }
  if (!isNonEmptyString(instrumentId)) {
    throw new MaintenanceGateInputError('instrument-id-malformed');
  }
  if (!isNonEmptyString(runAt)) {
    throw new MaintenanceGateInputError('run-timestamp-malformed');
  }
  if (!isStructurallyValidOptions(options)) {
    throw new MaintenanceGateInputError('options-malformed');
  }

  const raw = (registry as Record<string, unknown>)[instrumentId];
  if (raw === undefined) {
    return toResult(instrumentId, runAt, 'blocked', 'unknown-instrument', null, [], []);
  }
  if (!isStructurallyValidSchedule(raw)) {
    throw new MaintenanceGateInputError('schedule-malformed');
  }

  const seenTaskCodes = new Set<string>();
  for (const entry of raw.tasks as unknown[]) {
    if (!isStructurallyValidTaskEntry(entry)) {
      throw new MaintenanceGateInputError('task-entry-malformed');
    }
    if (seenTaskCodes.has(entry.taskCode)) {
      throw new MaintenanceGateInputError('duplicate-task-code');
    }
    seenTaskCodes.add(entry.taskCode);
  }

  if (!isUtcTimestamp(runAt)) {
    return toResult(instrumentId, runAt, 'blocked', 'run-timestamp-invalid', null, [], []);
  }

  if (raw.tasks.length === 0) {
    return toResult(instrumentId, runAt, 'usable', 'no-scheduled-tasks', null, [], []);
  }

  const runAtMs = Date.parse(runAt);
  const dueSoonWarningDays = options?.dueSoonWarningDays ?? DEFAULT_DUE_SOON_WARNING_DAYS;

  const evaluations = raw.tasks.map((entry) => evaluateTask(entry, runAtMs, dueSoonWarningDays));

  const overdueTasks = evaluations.filter((evaluation) => evaluation.reasonCode === 'task-overdue');
  const dueSoonTasks = evaluations.filter((evaluation) => evaluation.reasonCode === 'task-due-soon');

  let governing: MaintenanceTaskEvaluation | undefined;
  let governingSeverity = -1;
  for (const evaluation of evaluations) {
    const severity = BLOCKING_TASK_SEVERITY[evaluation.reasonCode];
    if (severity !== undefined && severity > governingSeverity) {
      governing = evaluation;
      governingSeverity = severity;
    }
  }

  if (governing !== undefined) {
    return toResult(instrumentId, runAt, 'blocked', governing.reasonCode, governing.taskCode, overdueTasks, dueSoonTasks);
  }

  if (dueSoonTasks.length > 0) {
    let soonest = dueSoonTasks[0];
    for (const evaluation of dueSoonTasks) {
      if (evaluation.dueAt !== undefined && soonest.dueAt !== undefined && Date.parse(evaluation.dueAt) < Date.parse(soonest.dueAt)) {
        soonest = evaluation;
      }
    }
    return toResult(instrumentId, runAt, 'usable_with_flag', 'task-due-soon', soonest.taskCode, overdueTasks, dueSoonTasks);
  }

  return toResult(instrumentId, runAt, 'usable', 'all-tasks-current', null, overdueTasks, dueSoonTasks);
}

/** Deterministic, privacy-safe human-readable text for a reason code, suitable for UI display. */
export function explainMaintenanceGateReason(reasonCode: MaintenanceReasonCode): string {
  return REASON_MESSAGES[reasonCode];
}
