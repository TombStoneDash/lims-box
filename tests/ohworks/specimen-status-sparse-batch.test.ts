import assert from 'node:assert/strict';
import test from 'node:test';

import {
  projectSpecimenStatuses,
  SpecimenStatusInputError,
  type SpecimenInternalRecord,
  type SpecimenStatusContext,
} from '../../lib/ohworks-specimen-status';

/**
 * All fabricated: synthetic tenant/reference tokens and made-up lifecycle
 * timestamps. None of this represents a real patient, sample, or result.
 */
function baselineContext(): SpecimenStatusContext {
  return { tenantId: 'tenant-synthetic-a' };
}

function baselineRecord(overrides: Partial<SpecimenInternalRecord> = {}): SpecimenInternalRecord {
  return {
    tenantId: 'tenant-synthetic-a',
    referenceToken: 'ref-synthetic-1',
    lifecycleState: 'INTAKE_LOGGED',
    updatedAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

function assertMalformed(records: ReadonlyArray<unknown>): void {
  assert.throws(
    () => projectSpecimenStatuses(records, baselineContext()),
    (error: unknown) => error instanceof SpecimenStatusInputError && error.code === 'record-malformed',
  );
}

test('throws record-malformed for a leading array hole', () => {
  const records = [, baselineRecord({ referenceToken: 'ref-b' })];
  assertMalformed(records);
});

test('throws record-malformed for a middle array hole', () => {
  const records = [
    baselineRecord({ referenceToken: 'ref-a' }),
    ,
    baselineRecord({ referenceToken: 'ref-c' }),
  ];
  assertMalformed(records);
});

test('throws record-malformed for a trailing array hole', () => {
  const records = [baselineRecord({ referenceToken: 'ref-a' }), ,];
  assertMalformed(records);
});

test('throws record-malformed for a sparse array created with new Array(1)', () => {
  const records = new Array(1) as unknown[];
  assertMalformed(records);
});

test('throws record-malformed for a sparse array created with new Array(2) mixed with a valid entry', () => {
  const records = new Array(2) as unknown[];
  records[1] = baselineRecord({ referenceToken: 'ref-b' });
  assertMalformed(records);
});

test('still projects a dense batch of valid records in input order', () => {
  const records = [
    baselineRecord({ referenceToken: 'ref-a', lifecycleState: 'INTAKE_LOGGED' }),
    baselineRecord({ referenceToken: 'ref-b', lifecycleState: 'VERIFIED' }),
    baselineRecord({ referenceToken: 'ref-c', lifecycleState: 'IN_ANALYSIS' }),
  ];

  const views = projectSpecimenStatuses(records, baselineContext());

  assert.deepEqual(
    views.map((v) => [v.referenceToken, v.status]),
    [
      ['ref-a', 'received'],
      ['ref-b', 'completed'],
      ['ref-c', 'in_progress'],
    ],
  );
});
