import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assignSpecimensToBatches,
  BatchAssignmentError,
  explainBatchAssignmentError,
  explainBatchAssignmentExclusionRule,
  type BatchAssignmentErrorCode,
  type BatchAssignmentExclusionRuleCode,
  type BatchAssignmentSpecimen,
  type BatchDefinition,
} from '../../lib/ohworks-batch-assignment';

/**
 * All fabricated: synthetic specimen and batch identifiers, analyte and
 * matrix codes drawn from the module's bounded registries. None of this
 * represents a real patient, specimen, or laboratory run.
 */
function specimen(overrides: Partial<BatchAssignmentSpecimen> = {}): BatchAssignmentSpecimen {
  return {
    specimenId: 'SPEC-1',
    analyteCode: 'GLUCOSE',
    matrixCode: 'SERUM',
    priority: 'routine',
    accessionSequence: 1,
    ...overrides,
  };
}

function batch(overrides: Partial<BatchDefinition> = {}): BatchDefinition {
  return {
    batchId: 'BATCH-1',
    capacity: 1,
    permittedAnalytes: ['GLUCOSE'],
    permittedMatrices: ['SERUM'],
    ...overrides,
  };
}

test('assigns a single well-formed specimen to the only permitting batch', () => {
  const result = assignSpecimensToBatches([specimen()], [batch()]);
  assert.deepEqual(result.assignments, [{ specimenId: 'SPEC-1', batchId: 'BATCH-1' }]);
  assert.deepEqual(result.unassignedSpecimens, []);
});

test('orders assignment by priority regardless of input order', () => {
  const specimens = [
    specimen({ specimenId: 'ROUTINE-1', priority: 'routine', accessionSequence: 1 }),
    specimen({ specimenId: 'STAT-1', priority: 'stat', accessionSequence: 2 }),
    specimen({ specimenId: 'URGENT-1', priority: 'urgent', accessionSequence: 3 }),
  ];
  const batches = [batch({ batchId: 'BATCH-1', capacity: 3 })];

  const result = assignSpecimensToBatches(specimens, batches);
  assert.deepEqual(
    result.assignments.map((placement) => placement.specimenId),
    ['STAT-1', 'URGENT-1', 'ROUTINE-1'],
  );
});

test('breaks ties within the same priority by ascending accession sequence', () => {
  const specimens = [
    specimen({ specimenId: 'LATER', priority: 'routine', accessionSequence: 5 }),
    specimen({ specimenId: 'EARLIER', priority: 'routine', accessionSequence: 2 }),
  ];
  const batches = [batch({ batchId: 'BATCH-1', capacity: 2 })];

  const result = assignSpecimensToBatches(specimens, batches);
  assert.deepEqual(
    result.assignments.map((placement) => placement.specimenId),
    ['EARLIER', 'LATER'],
  );
});

test('breaks ties within the same priority and accession sequence by specimen identifier', () => {
  const specimens = [
    specimen({ specimenId: 'SPEC-B', priority: 'routine', accessionSequence: 1 }),
    specimen({ specimenId: 'SPEC-A', priority: 'routine', accessionSequence: 1 }),
  ];
  const batches = [batch({ batchId: 'BATCH-1', capacity: 2 })];

  const result = assignSpecimensToBatches(specimens, batches);
  assert.deepEqual(
    result.assignments.map((placement) => placement.specimenId),
    ['SPEC-A', 'SPEC-B'],
  );
});

test('fills batches in the order they were given when more than one batch is eligible', () => {
  const specimens = [specimen({ specimenId: 'SPEC-1' })];
  const batches = [
    batch({ batchId: 'BATCH-FIRST', capacity: 1 }),
    batch({ batchId: 'BATCH-SECOND', capacity: 1 }),
  ];

  const result = assignSpecimensToBatches(specimens, batches);
  assert.deepEqual(result.assignments, [{ specimenId: 'SPEC-1', batchId: 'BATCH-FIRST' }]);
});

test('overflows into the next eligible batch once the first is full', () => {
  const specimens = [
    specimen({ specimenId: 'SPEC-1', accessionSequence: 1 }),
    specimen({ specimenId: 'SPEC-2', accessionSequence: 2 }),
  ];
  const batches = [
    batch({ batchId: 'BATCH-FIRST', capacity: 1 }),
    batch({ batchId: 'BATCH-SECOND', capacity: 1 }),
  ];

  const result = assignSpecimensToBatches(specimens, batches);
  assert.deepEqual(result.assignments, [
    { specimenId: 'SPEC-1', batchId: 'BATCH-FIRST' },
    { specimenId: 'SPEC-2', batchId: 'BATCH-SECOND' },
  ]);
});

test('higher-priority specimens claim capacity ahead of lower-priority specimens listed first', () => {
  const specimens = [
    specimen({ specimenId: 'ROUTINE-1', priority: 'routine', accessionSequence: 1 }),
    specimen({ specimenId: 'STAT-1', priority: 'stat', accessionSequence: 2 }),
  ];
  const batches = [batch({ batchId: 'BATCH-1', capacity: 1 })];

  const result = assignSpecimensToBatches(specimens, batches);
  assert.deepEqual(result.assignments, [{ specimenId: 'STAT-1', batchId: 'BATCH-1' }]);
  assert.deepEqual(result.unassignedSpecimens, [{ specimenId: 'ROUTINE-1', ruleCode: 'capacity-exhausted' }]);
});

test('excludes a specimen with no-permitting-batch when no batch accepts its analyte/matrix combination', () => {
  const specimens = [specimen({ analyteCode: 'TSH', matrixCode: 'CSF' })];
  const batches = [batch({ permittedAnalytes: ['GLUCOSE'], permittedMatrices: ['SERUM'] })];

  const result = assignSpecimensToBatches(specimens, batches);
  assert.deepEqual(result.assignments, []);
  assert.deepEqual(result.unassignedSpecimens, [{ specimenId: 'SPEC-1', ruleCode: 'no-permitting-batch' }]);
});

test('excludes a specimen with capacity-exhausted when every permitting batch is full', () => {
  const specimens = [
    specimen({ specimenId: 'SPEC-1', accessionSequence: 1 }),
    specimen({ specimenId: 'SPEC-2', accessionSequence: 2 }),
  ];
  const batches = [batch({ batchId: 'BATCH-1', capacity: 1 })];

  const result = assignSpecimensToBatches(specimens, batches);
  assert.deepEqual(result.assignments, [{ specimenId: 'SPEC-1', batchId: 'BATCH-1' }]);
  assert.deepEqual(result.unassignedSpecimens, [{ specimenId: 'SPEC-2', ruleCode: 'capacity-exhausted' }]);
});

test('an unmatched matrix takes precedence over capacity when a batch matches only on analyte', () => {
  const specimens = [specimen({ analyteCode: 'GLUCOSE', matrixCode: 'URINE' })];
  const batches = [batch({ permittedAnalytes: ['GLUCOSE'], permittedMatrices: ['SERUM'], capacity: 5 })];

  const result = assignSpecimensToBatches(specimens, batches);
  assert.deepEqual(result.unassignedSpecimens, [{ specimenId: 'SPEC-1', ruleCode: 'no-permitting-batch' }]);
});

test('handles an empty specimen list', () => {
  const result = assignSpecimensToBatches([], [batch()]);
  assert.deepEqual(result, { assignments: [], unassignedSpecimens: [] });
});

test('every specimen is unassignable when no batches are given', () => {
  const result = assignSpecimensToBatches([specimen()], []);
  assert.deepEqual(result.unassignedSpecimens, [{ specimenId: 'SPEC-1', ruleCode: 'no-permitting-batch' }]);
});

test('fails closed on an unknown specimen analyte code', () => {
  assert.throws(
    () => assignSpecimensToBatches([specimen({ analyteCode: 'UNOBTANIUM' })], [batch()]),
    (error: unknown) => error instanceof BatchAssignmentError && error.code === 'specimen-analyte-unknown',
  );
});

test('fails closed on an unknown specimen matrix code', () => {
  assert.throws(
    () => assignSpecimensToBatches([specimen({ matrixCode: 'LUNAR_REGOLITH' })], [batch()]),
    (error: unknown) => error instanceof BatchAssignmentError && error.code === 'specimen-matrix-unknown',
  );
});

test('fails closed on an unknown specimen priority', () => {
  assert.throws(
    () => assignSpecimensToBatches([specimen({ priority: 'whenever' })], [batch()]),
    (error: unknown) => error instanceof BatchAssignmentError && error.code === 'specimen-priority-unknown',
  );
});

test('fails closed on a non-finite specimen accession sequence', () => {
  assert.throws(
    () => assignSpecimensToBatches([specimen({ accessionSequence: Number.POSITIVE_INFINITY })], [batch()]),
    (error: unknown) => error instanceof BatchAssignmentError && error.code === 'specimen-accession-sequence-invalid',
  );
  assert.throws(
    () => assignSpecimensToBatches([specimen({ accessionSequence: Number.NaN })], [batch()]),
    (error: unknown) => error instanceof BatchAssignmentError && error.code === 'specimen-accession-sequence-invalid',
  );
});

test('fails closed on a duplicate specimen identifier', () => {
  const specimens = [
    specimen({ specimenId: 'SPEC-1', accessionSequence: 1 }),
    specimen({ specimenId: 'SPEC-1', accessionSequence: 2 }),
  ];
  assert.throws(
    () => assignSpecimensToBatches(specimens, [batch({ capacity: 2 })]),
    (error: unknown) => error instanceof BatchAssignmentError && error.code === 'specimen-id-duplicate',
  );
});

test('fails closed on an unknown batch-permitted analyte code', () => {
  assert.throws(
    () => assignSpecimensToBatches([specimen()], [batch({ permittedAnalytes: ['UNOBTANIUM'] })]),
    (error: unknown) => error instanceof BatchAssignmentError && error.code === 'batch-permitted-analyte-unknown',
  );
});

test('fails closed on an unknown batch-permitted matrix code', () => {
  assert.throws(
    () => assignSpecimensToBatches([specimen()], [batch({ permittedMatrices: ['LUNAR_REGOLITH'] })]),
    (error: unknown) => error instanceof BatchAssignmentError && error.code === 'batch-permitted-matrix-unknown',
  );
});

test('fails closed on zero batch capacity', () => {
  assert.throws(
    () => assignSpecimensToBatches([specimen()], [batch({ capacity: 0 })]),
    (error: unknown) => error instanceof BatchAssignmentError && error.code === 'batch-capacity-invalid',
  );
});

test('fails closed on negative batch capacity', () => {
  assert.throws(
    () => assignSpecimensToBatches([specimen()], [batch({ capacity: -3 })]),
    (error: unknown) => error instanceof BatchAssignmentError && error.code === 'batch-capacity-invalid',
  );
});

test('fails closed on a non-integer batch capacity', () => {
  assert.throws(
    () => assignSpecimensToBatches([specimen()], [batch({ capacity: 1.5 })]),
    (error: unknown) => error instanceof BatchAssignmentError && error.code === 'batch-capacity-invalid',
  );
});

test('fails closed on a non-finite batch capacity', () => {
  assert.throws(
    () => assignSpecimensToBatches([specimen()], [batch({ capacity: Number.POSITIVE_INFINITY })]),
    (error: unknown) => error instanceof BatchAssignmentError && error.code === 'batch-capacity-invalid',
  );
});

test('fails closed on a duplicate batch identifier', () => {
  const batches = [batch({ batchId: 'BATCH-1' }), batch({ batchId: 'BATCH-1' })];
  assert.throws(
    () => assignSpecimensToBatches([specimen()], batches),
    (error: unknown) => error instanceof BatchAssignmentError && error.code === 'batch-id-duplicate',
  );
});

test('validates all batches before considering any specimen', () => {
  assert.throws(
    () =>
      assignSpecimensToBatches(
        [specimen({ analyteCode: 'UNOBTANIUM' })],
        [batch({ capacity: -1 })],
      ),
    (error: unknown) => error instanceof BatchAssignmentError && error.code === 'batch-capacity-invalid',
  );
});

test('explainBatchAssignmentError returns deterministic, non-empty text for every error code', () => {
  const codes: BatchAssignmentErrorCode[] = [
    'batch-id-duplicate',
    'batch-capacity-invalid',
    'batch-permitted-analyte-unknown',
    'batch-permitted-matrix-unknown',
    'specimen-id-duplicate',
    'specimen-analyte-unknown',
    'specimen-matrix-unknown',
    'specimen-priority-unknown',
    'specimen-accession-sequence-invalid',
  ];
  for (const code of codes) {
    const message = explainBatchAssignmentError(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

test('explainBatchAssignmentExclusionRule returns deterministic, non-empty text for every rule code', () => {
  const codes: BatchAssignmentExclusionRuleCode[] = ['no-permitting-batch', 'capacity-exhausted'];
  for (const code of codes) {
    const message = explainBatchAssignmentExclusionRule(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

test('identical inputs always produce an identical plan regardless of input list order', () => {
  const specimens = [
    specimen({ specimenId: 'SPEC-1', priority: 'urgent', accessionSequence: 3 }),
    specimen({ specimenId: 'SPEC-2', priority: 'stat', accessionSequence: 1 }),
    specimen({ specimenId: 'SPEC-3', priority: 'routine', accessionSequence: 2 }),
  ];
  const batches = [batch({ batchId: 'BATCH-1', capacity: 2 })];

  const first = assignSpecimensToBatches(specimens, batches);
  const second = assignSpecimensToBatches([...specimens].reverse(), batches);

  assert.deepEqual(first, second);
});
