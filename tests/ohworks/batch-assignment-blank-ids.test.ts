import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assignSpecimensToBatches,
  BatchAssignmentError,
  explainBatchAssignmentError,
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

test('fails closed on an empty-string specimen identifier', () => {
  assert.throws(
    () => assignSpecimensToBatches([specimen({ specimenId: '' })], [batch()]),
    (error: unknown) => error instanceof BatchAssignmentError && error.code === 'specimen-id-invalid',
  );
});

test('fails closed on a whitespace-only specimen identifier', () => {
  assert.throws(
    () => assignSpecimensToBatches([specimen({ specimenId: '   ' })], [batch()]),
    (error: unknown) => error instanceof BatchAssignmentError && error.code === 'specimen-id-invalid',
  );
});

test('fails closed on a non-string specimen identifier', () => {
  assert.throws(
    () =>
      assignSpecimensToBatches(
        [specimen({ specimenId: 42 as unknown as string })],
        [batch()],
      ),
    (error: unknown) => error instanceof BatchAssignmentError && error.code === 'specimen-id-invalid',
  );
});

test('fails closed on an empty-string batch identifier', () => {
  assert.throws(
    () => assignSpecimensToBatches([specimen()], [batch({ batchId: '' })]),
    (error: unknown) => error instanceof BatchAssignmentError && error.code === 'batch-id-invalid',
  );
});

test('fails closed on a whitespace-only batch identifier', () => {
  assert.throws(
    () => assignSpecimensToBatches([specimen()], [batch({ batchId: '   ' })]),
    (error: unknown) => error instanceof BatchAssignmentError && error.code === 'batch-id-invalid',
  );
});

test('fails closed on a non-string batch identifier', () => {
  assert.throws(
    () =>
      assignSpecimensToBatches(
        [specimen()],
        [batch({ batchId: 42 as unknown as string })],
      ),
    (error: unknown) => error instanceof BatchAssignmentError && error.code === 'batch-id-invalid',
  );
});

test('validates batch identifiers before specimen identifiers', () => {
  assert.throws(
    () =>
      assignSpecimensToBatches(
        [specimen({ specimenId: '' })],
        [batch({ batchId: '  ' })],
      ),
    (error: unknown) => error instanceof BatchAssignmentError && error.code === 'batch-id-invalid',
  );
});

test('a well-formed specimen and batch identifier still assign normally', () => {
  const result = assignSpecimensToBatches([specimen()], [batch()]);
  assert.deepEqual(result.assignments, [{ specimenId: 'SPEC-1', batchId: 'BATCH-1' }]);
  assert.deepEqual(result.unassignedSpecimens, []);
});

test('explainBatchAssignmentError returns non-empty text for the new blank-id codes', () => {
  for (const code of ['specimen-id-invalid', 'batch-id-invalid'] as const) {
    const message = explainBatchAssignmentError(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});
