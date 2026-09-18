/**
 * Fail-closed synthetic OHWorks specimen stability window check.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated
 * analyte's declared stability windows (a maximum allowed duration per
 * storage condition — room temperature, refrigerated, or frozen), a
 * fabricated specimen's collection timestamp, its fabricated storage
 * condition history (a chronological list of condition+timestamp entries
 * marking when each condition segment began), and the fabricated result
 * timestamp, it splits the specimen's life into condition segments,
 * computes the elapsed time of each segment, and classifies the specimen
 * as tested within its stability window or expired.
 *
 * It performs no I/O, reads no system clock, mutates no SENAITE or database
 * state, and touches no real subject, specimen, or customer data. It never
 * asserts approval, compliance, accreditation, or releasability.
 *
 *   - within-window: every condition segment is documented and its elapsed
 *     time is within the declared window for that condition.
 *   - expired: any segment used a condition with no declared window, the
 *     history has a gap or is out of order, or any segment's elapsed time
 *     exceeds its declared window.
 *
 * Anything that would require guessing -- an unparsable timestamp, an
 * undocumented condition, a gap between collection and the first recorded
 * condition, out-of-order history, or a result timestamp before the last
 * recorded condition -- fails closed to `expired` instead of assuming the
 * specimen was stable. Structurally unusable input (missing identity
 * fields, malformed history entries, or invalid/empty/duplicate window
 * declarations) throws StabilityWindowInputError instead of guessing at an
 * outcome.
 */

export const STORAGE_CONDITIONS = ['room-temp', 'refrigerated', 'frozen'] as const;

export type StorageCondition = (typeof STORAGE_CONDITIONS)[number];

function isStorageCondition(value: unknown): value is StorageCondition {
  return typeof value === 'string' && (STORAGE_CONDITIONS as readonly string[]).includes(value);
}

export type StabilityWindowDeclaration = {
  condition: StorageCondition;
  /** Inclusive maximum elapsed time, in milliseconds, permitted in this condition before the specimen is expired. */
  maxDurationMs: number;
};

export type StorageConditionEntry = {
  condition: StorageCondition;
  /** ISO 8601 timestamp this condition segment began. */
  at: string;
};

export type StabilityCheckStatus = 'within-window' | 'expired';

export type StabilityCheckReasonCode =
  | 'within-all-windows'
  | 'collected-timestamp-invalid'
  | 'result-timestamp-invalid'
  | 'result-before-collection'
  | 'entry-timestamp-invalid'
  | 'history-empty'
  | 'history-start-gap'
  | 'history-not-chronological'
  | 'result-before-last-segment'
  | 'undocumented-condition'
  | 'window-exceeded';

const REASON_MESSAGES: Record<StabilityCheckReasonCode, string> = {
  'within-all-windows': 'Every storage condition segment is documented and within its declared stability window.',
  'collected-timestamp-invalid': 'The specimen collection timestamp could not be parsed.',
  'result-timestamp-invalid': 'The result timestamp could not be parsed.',
  'result-before-collection': 'The result timestamp is not after the specimen collection timestamp.',
  'entry-timestamp-invalid': 'A storage condition history entry timestamp could not be parsed.',
  'history-empty': 'No storage condition history was recorded for this specimen.',
  'history-start-gap': 'The first recorded storage condition does not begin at the collection timestamp, leaving an undocumented gap.',
  'history-not-chronological': 'The storage condition history is not in strictly increasing chronological order.',
  'result-before-last-segment': 'The result timestamp is before the last recorded storage condition began.',
  'undocumented-condition': 'A recorded storage condition segment has no declared stability window for this analyte.',
  'window-exceeded': 'A storage condition segment exceeded its declared stability window.',
};

/** Deterministic, privacy-safe human-readable text for a stability check reason code, suitable for UI display. */
export function explainStabilityCheckReason(code: StabilityCheckReasonCode): string {
  return REASON_MESSAGES[code];
}

export type StabilitySegmentResult = {
  condition: StorageCondition;
  startAt: string;
  endAt: string;
  /** end - start, in milliseconds. */
  elapsedMs: number;
  /** The declared window applied to this segment, or null if the condition is undocumented. */
  windowMs: number | null;
  withinWindow: boolean;
};

export type StabilityCheckOutcome = {
  status: StabilityCheckStatus;
  reasonCode: StabilityCheckReasonCode;
  /** Per-segment evaluation, in chronological order. Empty when segments could not be built at all. */
  segments: ReadonlyArray<StabilitySegmentResult>;
};

export type StabilityWindowInputErrorCode =
  | 'specimen-malformed'
  | 'history-not-array'
  | 'history-entry-invalid'
  | 'windows-not-array'
  | 'windows-empty'
  | 'windows-invalid'
  | 'windows-duplicate-condition';

const INPUT_ERROR_MESSAGES: Record<StabilityWindowInputErrorCode, string> = {
  'specimen-malformed': 'The specimen is missing a required identity field.',
  'history-not-array': 'The storage condition history is not a list.',
  'history-entry-invalid': 'A storage condition history entry is not structurally valid.',
  'windows-not-array': 'The declared stability windows are not a list.',
  'windows-empty': 'No stability windows were declared for this analyte.',
  'windows-invalid': 'A declared stability window is not structurally valid.',
  'windows-duplicate-condition': 'More than one declared stability window shares the same storage condition.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a stability outcome. */
export class StabilityWindowInputError extends Error {
  readonly code: StabilityWindowInputErrorCode;

  constructor(code: StabilityWindowInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'StabilityWindowInputError';
    this.code = code;
  }
}

export type StabilityCheckInput = {
  /** Fabricated specimen identifier, for traceability only; never echoed in error messages. */
  specimenId: string;
  /** Fabricated analyte/parameter code. */
  analyteCode: string;
  /** ISO 8601 timestamp the specimen was collected. */
  collectedAt: string;
  /** Chronological list of storage condition changes; must begin at collectedAt with no gaps. */
  history: ReadonlyArray<StorageConditionEntry>;
  /** ISO 8601 timestamp the result was produced. */
  resultAt: string;
  /** Declared stability windows for this analyte, one per documented storage condition. */
  windows: ReadonlyArray<StabilityWindowDeclaration>;
};

function hasRequiredIdentity(
  value: unknown,
): value is { specimenId: string; analyteCode: string; collectedAt: string; resultAt: string } & Record<
  string,
  unknown
> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.specimenId === 'string' &&
    candidate.specimenId.length > 0 &&
    typeof candidate.analyteCode === 'string' &&
    candidate.analyteCode.length > 0 &&
    typeof candidate.collectedAt === 'string' &&
    typeof candidate.resultAt === 'string'
  );
}

function isValidHistoryEntry(entry: unknown): entry is StorageConditionEntry {
  if (typeof entry !== 'object' || entry === null) {
    return false;
  }
  const candidate = entry as Record<string, unknown>;
  return isStorageCondition(candidate.condition) && typeof candidate.at === 'string';
}

function validateHistory(history: ReadonlyArray<StorageConditionEntry>): void {
  if (!Array.isArray(history)) {
    throw new StabilityWindowInputError('history-not-array');
  }
  for (const entry of history) {
    if (!isValidHistoryEntry(entry)) {
      throw new StabilityWindowInputError('history-entry-invalid');
    }
  }
}

function isValidWindow(window: unknown): window is StabilityWindowDeclaration {
  if (typeof window !== 'object' || window === null) {
    return false;
  }
  const candidate = window as Record<string, unknown>;
  return (
    isStorageCondition(candidate.condition) &&
    typeof candidate.maxDurationMs === 'number' &&
    Number.isFinite(candidate.maxDurationMs) &&
    candidate.maxDurationMs >= 0
  );
}

function validateWindows(
  windows: ReadonlyArray<StabilityWindowDeclaration>,
): Map<StorageCondition, StabilityWindowDeclaration> {
  if (!Array.isArray(windows)) {
    throw new StabilityWindowInputError('windows-not-array');
  }
  if (windows.length === 0) {
    throw new StabilityWindowInputError('windows-empty');
  }
  for (const window of windows) {
    if (!isValidWindow(window)) {
      throw new StabilityWindowInputError('windows-invalid');
    }
  }

  const byCondition = new Map<StorageCondition, StabilityWindowDeclaration>();
  for (const window of windows) {
    if (byCondition.has(window.condition)) {
      throw new StabilityWindowInputError('windows-duplicate-condition');
    }
    byCondition.set(window.condition, window);
  }
  return byCondition;
}

function outcome(
  status: StabilityCheckStatus,
  reasonCode: StabilityCheckReasonCode,
  segments: ReadonlyArray<StabilitySegmentResult>,
): StabilityCheckOutcome {
  return Object.freeze({ status, reasonCode, segments: Object.freeze([...segments]) });
}

/**
 * Evaluate a fabricated specimen's storage condition history against
 * declared per-condition stability windows for its analyte, and return a
 * single conservative outcome covering every condition segment.
 *
 * Fail-closed: an unparsable timestamp, a gap between collection and the
 * first recorded condition, out-of-order history, a result timestamp
 * before the last recorded condition, an undocumented storage condition,
 * or elapsed time exceeding any applicable window all resolve to
 * `expired` rather than assuming the specimen remained stable. A
 * structurally unusable request (missing identity fields, malformed
 * history entries, or invalid/empty/duplicate window declarations) throws
 * StabilityWindowInputError instead of guessing at an outcome.
 */
export function evaluateSpecimenStability(input: StabilityCheckInput): StabilityCheckOutcome {
  const windowsByCondition = validateWindows(input.windows);
  validateHistory(input.history);

  if (!hasRequiredIdentity(input)) {
    throw new StabilityWindowInputError('specimen-malformed');
  }

  const collectedTime = Date.parse(input.collectedAt);
  if (!Number.isFinite(collectedTime)) {
    return outcome('expired', 'collected-timestamp-invalid', []);
  }

  const resultTime = Date.parse(input.resultAt);
  if (!Number.isFinite(resultTime)) {
    return outcome('expired', 'result-timestamp-invalid', []);
  }

  if (resultTime < collectedTime) {
    return outcome('expired', 'result-before-collection', []);
  }

  if (input.history.length === 0) {
    return outcome('expired', 'history-empty', []);
  }

  const entryTimes: number[] = [];
  for (const entry of input.history) {
    const parsed = Date.parse(entry.at);
    if (!Number.isFinite(parsed)) {
      return outcome('expired', 'entry-timestamp-invalid', []);
    }
    entryTimes.push(parsed);
  }

  if (entryTimes[0] !== collectedTime) {
    return outcome('expired', 'history-start-gap', []);
  }

  for (let i = 1; i < entryTimes.length; i += 1) {
    if (entryTimes[i] <= entryTimes[i - 1]) {
      return outcome('expired', 'history-not-chronological', []);
    }
  }

  const lastEntryTime = entryTimes[entryTimes.length - 1];
  if (resultTime < lastEntryTime) {
    return outcome('expired', 'result-before-last-segment', []);
  }

  const segments: StabilitySegmentResult[] = input.history.map((entry, index) => {
    const startTime = entryTimes[index];
    const endTime = index + 1 < entryTimes.length ? entryTimes[index + 1] : resultTime;
    const window = windowsByCondition.get(entry.condition) ?? null;
    const elapsedMs = endTime - startTime;
    return {
      condition: entry.condition,
      startAt: entry.at,
      endAt: index + 1 < input.history.length ? input.history[index + 1].at : input.resultAt,
      elapsedMs,
      windowMs: window ? window.maxDurationMs : null,
      withinWindow: window !== null && elapsedMs <= window.maxDurationMs,
    };
  });

  const undocumentedSegment = segments.find((segment) => segment.windowMs === null);
  if (undocumentedSegment) {
    return outcome('expired', 'undocumented-condition', segments);
  }

  const exceededSegment = segments.find((segment) => !segment.withinWindow);
  if (exceededSegment) {
    return outcome('expired', 'window-exceeded', segments);
  }

  return outcome('within-window', 'within-all-windows', segments);
}
