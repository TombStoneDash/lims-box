/**
 * Fail-closed, deterministic OHWorks analytical batch assignment for the
 * synthetic pilot.
 *
 * This module is a pure, dependency-free planner: given a fabricated list of
 * specimens (an analyte, a matrix, a bounded priority, and a caller-supplied
 * accession sequence) and a fabricated list of batch definitions (a
 * capacity, the analytes the batch permits, and the matrices the batch
 * permits), it deterministically assigns each specimen to at most one batch.
 *
 * Specimens are considered in priority order (`stat` before `urgent` before
 * `routine`), and within the same priority in ascending accession-sequence
 * order, so the result never depends on the order specimens were listed in.
 * Batches are filled in the order they were given, so ties between equally
 * eligible batches always resolve the same way.
 *
 * An unknown analyte or matrix code (on either a specimen or a batch's
 * permitted lists), an unknown priority, a non-finite accession sequence, a
 * zero or negative batch capacity, or a duplicate specimen identifier all
 * fail closed by throwing BatchAssignmentError rather than guessing at a
 * plan. A specimen that is well-formed but cannot be placed — because no
 * batch permits its analyte/matrix combination, or every batch that does is
 * already full — is never dropped silently; it is returned in
 * `unassignedSpecimens` along with the rule code that excluded it.
 */

/** Bounded specimen priorities, ordered from highest to lowest precedence. */
export type BatchAssignmentPriority = 'stat' | 'urgent' | 'routine';

const PRIORITY_RANK: Record<BatchAssignmentPriority, number> = {
  stat: 0,
  urgent: 1,
  routine: 2,
};

/** Bounded registry of analyte codes this module knows how to assign. Never a real assay catalog. */
const KNOWN_ANALYTE_CODES: ReadonlySet<string> = new Set<string>([
  'GLUCOSE',
  'POTASSIUM',
  'CBC',
  'TSH',
  'LACTATE',
  'BLOOD_CULTURE',
]);

/** Bounded registry of matrix codes this module knows how to assign. Never a real specimen catalog. */
const KNOWN_MATRIX_CODES: ReadonlySet<string> = new Set<string>([
  'SERUM',
  'PLASMA',
  'WHOLE_BLOOD',
  'URINE',
  'CSF',
]);

/** Fabricated specimen awaiting batch assignment. Never a real patient or accession record. */
export type BatchAssignmentSpecimen = {
  /** Synthetic specimen identifier. Must be unique within a single assignment call. */
  specimenId: string;
  /** Raw analyte code; may be unrecognized. */
  analyteCode: string;
  /** Raw matrix code; may be unrecognized. */
  matrixCode: string;
  /** Raw priority string; may be unrecognized. */
  priority: string;
  /**
   * Caller-supplied monotonic accession order. Lower values were accessioned
   * earlier and are preferred as a tiebreaker within the same priority.
   */
  accessionSequence: number;
};

/** Fabricated analytical batch definition. Never a real run sheet or instrument queue. */
export type BatchDefinition = {
  /** Synthetic batch identifier. */
  batchId: string;
  /** Maximum number of specimens this batch may hold. Must be a positive integer. */
  capacity: number;
  /** Raw analyte codes this batch may accept; entries may be unrecognized. */
  permittedAnalytes: readonly string[];
  /** Raw matrix codes this batch may accept; entries may be unrecognized. */
  permittedMatrices: readonly string[];
};

export type BatchAssignmentPlacement = {
  specimenId: string;
  batchId: string;
};

export type BatchAssignmentExclusionRuleCode = 'no-permitting-batch' | 'capacity-exhausted';

export type UnassignedSpecimen = {
  specimenId: string;
  ruleCode: BatchAssignmentExclusionRuleCode;
};

const EXCLUSION_RULE_MESSAGES: Record<BatchAssignmentExclusionRuleCode, string> = {
  'no-permitting-batch': 'No batch permits this specimen\'s analyte and matrix combination.',
  'capacity-exhausted': 'Every batch that permits this specimen\'s analyte and matrix combination is already full.',
};

/** Deterministic, human-readable text for an unassignable-specimen exclusion rule. */
export function explainBatchAssignmentExclusionRule(ruleCode: BatchAssignmentExclusionRuleCode): string {
  return EXCLUSION_RULE_MESSAGES[ruleCode];
}

export type BatchAssignmentResult = {
  /** Deterministic placements, ordered by the same priority/accession precedence used to compute them. */
  assignments: BatchAssignmentPlacement[];
  /** Specimens that could not be placed, in the same precedence order, each with the rule that excluded it. */
  unassignedSpecimens: UnassignedSpecimen[];
};

export type BatchAssignmentErrorCode =
  | 'batch-id-duplicate'
  | 'batch-capacity-invalid'
  | 'batch-permitted-analyte-unknown'
  | 'batch-permitted-matrix-unknown'
  | 'specimen-id-duplicate'
  | 'specimen-analyte-unknown'
  | 'specimen-matrix-unknown'
  | 'specimen-priority-unknown'
  | 'specimen-accession-sequence-invalid';

const ERROR_MESSAGES: Record<BatchAssignmentErrorCode, string> = {
  'batch-id-duplicate': 'More than one batch definition was submitted with the same batch identifier.',
  'batch-capacity-invalid': 'A batch capacity must be a finite integer greater than zero.',
  'batch-permitted-analyte-unknown': 'A batch permits an analyte code that is not a recognized bounded value.',
  'batch-permitted-matrix-unknown': 'A batch permits a matrix code that is not a recognized bounded value.',
  'specimen-id-duplicate': 'More than one specimen was submitted with the same specimen identifier.',
  'specimen-analyte-unknown': 'A specimen analyte code is not a recognized bounded value.',
  'specimen-matrix-unknown': 'A specimen matrix code is not a recognized bounded value.',
  'specimen-priority-unknown': 'A specimen priority is not a recognized bounded value.',
  'specimen-accession-sequence-invalid': 'A specimen accession sequence must be a finite number.',
};

/** Deterministic, human-readable text for a fail-closed error code. */
export function explainBatchAssignmentError(code: BatchAssignmentErrorCode): string {
  return ERROR_MESSAGES[code];
}

/** Thrown for any input this planner cannot safely resolve to a deterministic assignment plan. */
export class BatchAssignmentError extends Error {
  readonly code: BatchAssignmentErrorCode;

  constructor(code: BatchAssignmentErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'BatchAssignmentError';
    this.code = code;
  }
}

function isKnownPriority(value: string): value is BatchAssignmentPriority {
  return Object.prototype.hasOwnProperty.call(PRIORITY_RANK, value);
}

function validateBatches(batches: ReadonlyArray<BatchDefinition>): void {
  const seenBatchIds = new Set<string>();
  for (const batch of batches) {
    if (seenBatchIds.has(batch.batchId)) {
      throw new BatchAssignmentError('batch-id-duplicate');
    }
    seenBatchIds.add(batch.batchId);

    if (!Number.isFinite(batch.capacity) || !Number.isInteger(batch.capacity) || batch.capacity <= 0) {
      throw new BatchAssignmentError('batch-capacity-invalid');
    }

    for (const analyteCode of batch.permittedAnalytes) {
      if (!KNOWN_ANALYTE_CODES.has(analyteCode)) {
        throw new BatchAssignmentError('batch-permitted-analyte-unknown');
      }
    }

    for (const matrixCode of batch.permittedMatrices) {
      if (!KNOWN_MATRIX_CODES.has(matrixCode)) {
        throw new BatchAssignmentError('batch-permitted-matrix-unknown');
      }
    }
  }
}

function validateSpecimens(specimens: ReadonlyArray<BatchAssignmentSpecimen>): void {
  const seenSpecimenIds = new Set<string>();
  for (const specimen of specimens) {
    if (seenSpecimenIds.has(specimen.specimenId)) {
      throw new BatchAssignmentError('specimen-id-duplicate');
    }
    seenSpecimenIds.add(specimen.specimenId);

    if (!KNOWN_ANALYTE_CODES.has(specimen.analyteCode)) {
      throw new BatchAssignmentError('specimen-analyte-unknown');
    }

    if (!KNOWN_MATRIX_CODES.has(specimen.matrixCode)) {
      throw new BatchAssignmentError('specimen-matrix-unknown');
    }

    if (!isKnownPriority(specimen.priority)) {
      throw new BatchAssignmentError('specimen-priority-unknown');
    }

    if (!Number.isFinite(specimen.accessionSequence)) {
      throw new BatchAssignmentError('specimen-accession-sequence-invalid');
    }
  }
}

function comparePrecedence(a: BatchAssignmentSpecimen, b: BatchAssignmentSpecimen): number {
  const rankDelta = PRIORITY_RANK[a.priority as BatchAssignmentPriority] - PRIORITY_RANK[b.priority as BatchAssignmentPriority];
  if (rankDelta !== 0) {
    return rankDelta;
  }
  if (a.accessionSequence !== b.accessionSequence) {
    return a.accessionSequence - b.accessionSequence;
  }
  return a.specimenId < b.specimenId ? -1 : a.specimenId > b.specimenId ? 1 : 0;
}

/**
 * Deterministically assign fabricated specimens to fabricated analytical
 * batches by priority (stat, then urgent, then routine) and, within the same
 * priority, ascending accession sequence.
 *
 * Fail-closed: an unrecognized specimen or batch-permitted analyte/matrix
 * code, an unrecognized specimen priority, a non-finite accession sequence,
 * a duplicate batch or specimen identifier, or a zero/negative/non-integer
 * batch capacity all throw BatchAssignmentError instead of guessing at a
 * plan. A well-formed specimen that cannot be placed is returned in
 * `unassignedSpecimens` with the rule code that excluded it, never dropped.
 */
export function assignSpecimensToBatches(
  specimens: ReadonlyArray<BatchAssignmentSpecimen>,
  batches: ReadonlyArray<BatchDefinition>,
): BatchAssignmentResult {
  validateBatches(batches);
  validateSpecimens(specimens);

  const remainingCapacity = new Map<string, number>(batches.map((batch) => [batch.batchId, batch.capacity]));

  const orderedSpecimens = [...specimens].sort(comparePrecedence);

  const assignments: BatchAssignmentPlacement[] = [];
  const unassignedSpecimens: UnassignedSpecimen[] = [];

  for (const specimen of orderedSpecimens) {
    const eligibleBatches = batches.filter(
      (batch) =>
        batch.permittedAnalytes.includes(specimen.analyteCode) && batch.permittedMatrices.includes(specimen.matrixCode),
    );

    if (eligibleBatches.length === 0) {
      unassignedSpecimens.push({ specimenId: specimen.specimenId, ruleCode: 'no-permitting-batch' });
      continue;
    }

    const chosenBatch = eligibleBatches.find((batch) => (remainingCapacity.get(batch.batchId) ?? 0) > 0);

    if (chosenBatch === undefined) {
      unassignedSpecimens.push({ specimenId: specimen.specimenId, ruleCode: 'capacity-exhausted' });
      continue;
    }

    remainingCapacity.set(chosenBatch.batchId, (remainingCapacity.get(chosenBatch.batchId) ?? 0) - 1);
    assignments.push({ specimenId: specimen.specimenId, batchId: chosenBatch.batchId });
  }

  return { assignments, unassignedSpecimens };
}
