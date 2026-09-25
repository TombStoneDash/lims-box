/**
 * Fail-closed, deterministic OHWorks worklist sequencing for the synthetic
 * pilot.
 *
 * This module is a pure, dependency-free planner: given a fabricated list of
 * specimens (a bounded priority and a caller-supplied accession sequence), a
 * declared QC bracketing rule (insert QC at the start of a run, after every N
 * patient specimens, and at the end of a run), and a maximum run length, it
 * deterministically orders the specimens, inserts QC entries at the
 * bracketed positions, and splits the result into runs whenever the maximum
 * run length would otherwise be exceeded.
 *
 * Specimens are considered in priority order (`stat` before `urgent` before
 * `routine`) and, within the same priority, ascending accession-sequence
 * order, so the result never depends on the order specimens were listed in.
 *
 * An unrecognized priority, a non-finite accession sequence, a duplicate
 * specimen identifier, a QC interval that is not a positive integer, an
 * empty QC sample identifier, or a maximum run length that cannot even hold
 * one bracketed specimen all fail closed by throwing WorklistSequencingError
 * rather than guessing at a plan.
 */

/** Bounded specimen priorities, ordered from highest to lowest precedence. */
export type WorklistPriority = 'stat' | 'urgent' | 'routine';

const PRIORITY_RANK: Record<WorklistPriority, number> = {
  stat: 0,
  urgent: 1,
  routine: 2,
};

/** Fabricated specimen awaiting worklist sequencing. Never a real patient or accession record. */
export type WorklistSpecimen = {
  /** Synthetic specimen identifier. Must be unique within a single planning call. */
  specimenId: string;
  /** Raw priority string; may be unrecognized. */
  priority: string;
  /**
   * Caller-supplied monotonic accession order. Lower values were accessioned
   * earlier and are preferred as a tiebreaker within the same priority.
   */
  accessionSequence: number;
};

/** Declared QC bracketing rule: QC at the start of each run, every N patient specimens, and at the end. */
export type QCBracketingRule = {
  /** Number of patient specimens between QC insertions. Must be a finite positive integer. */
  everyNSamples: number;
  /** Synthetic QC sample identifier prefix used to name generated QC entries. Must be non-empty. */
  qcSampleId: string;
};

export type WorklistPlanRequest = {
  specimens: ReadonlyArray<WorklistSpecimen>;
  bracketingRule: QCBracketingRule;
  /** Maximum number of worklist entries (patient specimens plus inserted QC) permitted in a single run. */
  maxRunLength: number;
};

export type WorklistEntry =
  | {
      kind: 'patient';
      specimenId: string;
      priority: WorklistPriority;
      accessionSequence: number;
    }
  | {
      kind: 'qc';
      specimenId: string;
      bracketKind: 'start' | 'interval' | 'end';
    };

export type WorklistRun = {
  runIndex: number;
  entries: WorklistEntry[];
};

/** Positions (0-based, within a single run's entries) of that run's QC bracket. */
export type WorklistBracketBoundaries = {
  runIndex: number;
  /** Position of the QC entry placed before the run's first patient specimen. */
  startPosition: number;
  /** Positions of QC entries inserted after every N patient specimens, excluding one reused as the end position. */
  intervalPositions: number[];
  /** Position of the QC entry placed after the run's last patient specimen. */
  endPosition: number;
};

export type WorklistPlan = {
  runs: WorklistRun[];
  brackets: WorklistBracketBoundaries[];
};

/** Minimum entries a run must be able to hold: a start QC, one patient specimen, and an end QC. */
const MIN_RUN_LENGTH = 3;

export type WorklistSequencingErrorCode =
  | 'qc-interval-invalid'
  | 'qc-sample-id-invalid'
  | 'max-run-length-invalid'
  | 'max-run-length-too-small'
  | 'specimen-id-duplicate'
  | 'specimen-priority-unknown'
  | 'specimen-accession-sequence-invalid';

const ERROR_MESSAGES: Record<WorklistSequencingErrorCode, string> = {
  'qc-interval-invalid': 'The QC bracketing interval (everyNSamples) must be a finite positive integer.',
  'qc-sample-id-invalid': 'The QC bracketing rule must declare a non-empty qcSampleId.',
  'max-run-length-invalid': 'The maximum run length must be a finite positive integer.',
  'max-run-length-too-small': 'The maximum run length cannot hold even one bracketed patient specimen.',
  'specimen-id-duplicate': 'More than one specimen was submitted with the same specimen identifier.',
  'specimen-priority-unknown': 'A specimen priority is not a recognized bounded value.',
  'specimen-accession-sequence-invalid': 'A specimen accession sequence must be a finite number.',
};

/** Deterministic, human-readable text for a fail-closed error code. */
export function explainWorklistSequencingError(code: WorklistSequencingErrorCode): string {
  return ERROR_MESSAGES[code];
}

/** Thrown for any input this planner cannot safely resolve to a deterministic worklist plan. */
export class WorklistSequencingError extends Error {
  readonly code: WorklistSequencingErrorCode;

  constructor(code: WorklistSequencingErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'WorklistSequencingError';
    this.code = code;
  }
}

function isKnownPriority(value: string): value is WorklistPriority {
  return Object.prototype.hasOwnProperty.call(PRIORITY_RANK, value);
}

function validateBracketingRule(rule: QCBracketingRule): void {
  if (!Number.isFinite(rule.everyNSamples) || !Number.isInteger(rule.everyNSamples) || rule.everyNSamples <= 0) {
    throw new WorklistSequencingError('qc-interval-invalid');
  }
  if (rule.qcSampleId.length === 0) {
    throw new WorklistSequencingError('qc-sample-id-invalid');
  }
}

function validateMaxRunLength(maxRunLength: number, hasSpecimens: boolean): void {
  if (!Number.isFinite(maxRunLength) || !Number.isInteger(maxRunLength) || maxRunLength <= 0) {
    throw new WorklistSequencingError('max-run-length-invalid');
  }
  if (hasSpecimens && maxRunLength < MIN_RUN_LENGTH) {
    throw new WorklistSequencingError('max-run-length-too-small');
  }
}

function validateSpecimens(specimens: ReadonlyArray<WorklistSpecimen>): void {
  const seenSpecimenIds = new Set<string>();
  for (const specimen of specimens) {
    if (seenSpecimenIds.has(specimen.specimenId)) {
      throw new WorklistSequencingError('specimen-id-duplicate');
    }
    seenSpecimenIds.add(specimen.specimenId);

    if (!isKnownPriority(specimen.priority)) {
      throw new WorklistSequencingError('specimen-priority-unknown');
    }

    if (!Number.isFinite(specimen.accessionSequence)) {
      throw new WorklistSequencingError('specimen-accession-sequence-invalid');
    }
  }
}

function comparePrecedence(a: WorklistSpecimen, b: WorklistSpecimen): number {
  const rankDelta = PRIORITY_RANK[a.priority as WorklistPriority] - PRIORITY_RANK[b.priority as WorklistPriority];
  if (rankDelta !== 0) {
    return rankDelta;
  }
  if (a.accessionSequence !== b.accessionSequence) {
    return a.accessionSequence - b.accessionSequence;
  }
  return a.specimenId < b.specimenId ? -1 : a.specimenId > b.specimenId ? 1 : 0;
}

function qcEntry(qcSampleId: string, runIndex: number, bracketKind: 'start' | 'interval' | 'end', occurrence: number): WorklistEntry {
  return {
    kind: 'qc',
    specimenId: `${qcSampleId}-r${runIndex + 1}-${bracketKind}-${occurrence}`,
    bracketKind,
  };
}

/**
 * Deterministically order fabricated specimens by priority (stat, then
 * urgent, then routine) and, within the same priority, ascending accession
 * sequence; insert QC entries at the start of each run, after every N
 * patient specimens, and at the end of each run; and split the ordered
 * worklist into runs whenever the maximum run length would otherwise be
 * exceeded.
 *
 * Fail-closed: an unrecognized specimen priority, a non-finite accession
 * sequence, a duplicate specimen identifier, a QC interval that is not a
 * positive integer, an empty QC sample identifier, or a maximum run length
 * that cannot hold even one bracketed specimen all throw
 * WorklistSequencingError instead of guessing at a plan.
 */
export function buildWorklistPlan(request: WorklistPlanRequest): WorklistPlan {
  const { specimens, bracketingRule, maxRunLength } = request;

  validateBracketingRule(bracketingRule);
  validateMaxRunLength(maxRunLength, specimens.length > 0);
  validateSpecimens(specimens);

  if (specimens.length === 0) {
    return { runs: [], brackets: [] };
  }

  const everyN = bracketingRule.everyNSamples;
  const ordered = [...specimens].sort(comparePrecedence);

  const runs: WorklistRun[] = [];
  const brackets: WorklistBracketBoundaries[] = [];

  let cursor = 0;
  let runIndex = 0;

  while (cursor < ordered.length) {
    const entries: WorklistEntry[] = [];
    let intervalOccurrence = 0;
    let patientCountSinceLastQC = 0;

    entries.push(qcEntry(bracketingRule.qcSampleId, runIndex, 'start', 1));

    while (cursor < ordered.length) {
      const willTriggerInterval = patientCountSinceLastQC + 1 === everyN;
      const cost = willTriggerInterval ? 2 : 1;
      const reserve = willTriggerInterval ? 0 : 1;

      if (entries.length + cost + reserve > maxRunLength) {
        break;
      }

      const specimen = ordered[cursor];
      entries.push({
        kind: 'patient',
        specimenId: specimen.specimenId,
        priority: specimen.priority as WorklistPriority,
        accessionSequence: specimen.accessionSequence,
      });
      cursor += 1;
      patientCountSinceLastQC += 1;

      if (willTriggerInterval) {
        intervalOccurrence += 1;
        entries.push(qcEntry(bracketingRule.qcSampleId, runIndex, 'interval', intervalOccurrence));
        patientCountSinceLastQC = 0;
      }
    }

    const lastEntry = entries[entries.length - 1];
    let endPosition: number;
    const intervalPositions: number[] = [];
    entries.forEach((entry, position) => {
      if (entry.kind === 'qc' && entry.bracketKind === 'interval') {
        intervalPositions.push(position);
      }
    });

    if (lastEntry.kind === 'qc' && lastEntry.bracketKind === 'interval') {
      endPosition = entries.length - 1;
      intervalPositions.pop();
      entries[endPosition] = { ...lastEntry, bracketKind: 'end' };
    } else {
      entries.push(qcEntry(bracketingRule.qcSampleId, runIndex, 'end', 1));
      endPosition = entries.length - 1;
    }

    runs.push({ runIndex, entries });
    brackets.push({
      runIndex,
      startPosition: 0,
      intervalPositions,
      endPosition,
    });

    runIndex += 1;
  }

  return { runs, brackets };
}
