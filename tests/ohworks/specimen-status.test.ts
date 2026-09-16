import assert from 'node:assert/strict';
import test from 'node:test';

import {
  explainSpecimenStatusReason,
  projectSpecimenStatuses,
  SpecimenStatusInputError,
  type SpecimenInternalRecord,
  type SpecimenLifecycleState,
  type SpecimenStatus,
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

const EXPECTED_STATUS_BY_STATE: Record<SpecimenLifecycleState, SpecimenStatus> = {
  INTAKE_LOGGED: 'received',
  ACCESSIONED: 'received',
  IN_PREPARATION: 'in_progress',
  IN_ANALYSIS: 'in_progress',
  PENDING_QC_REVIEW: 'review',
  QC_REVIEW_IN_PROGRESS: 'review',
  VERIFIED: 'completed',
  REPORTED: 'completed',
  ON_HOLD: 'exception',
  REJECTED: 'exception',
  CANCELLED: 'exception',
  LOST: 'exception',
};

test('maps every known internal lifecycle state to its bounded external status', () => {
  for (const [lifecycleState, expectedStatus] of Object.entries(EXPECTED_STATUS_BY_STATE)) {
    const [view] = projectSpecimenStatuses(
      [baselineRecord({ lifecycleState, referenceToken: `ref-${lifecycleState}` })],
      baselineContext(),
    );
    assert.equal(view.status, expectedStatus, `expected ${lifecycleState} -> ${expectedStatus}`);
    assert.equal(view.referenceToken, `ref-${lifecycleState}`);
    assert.equal(view.reasonCode, undefined, `${lifecycleState} is a known state and should carry no reason code`);
  }
});

test('covers all five bounded external statuses across the known state set', () => {
  const observed = new Set(Object.values(EXPECTED_STATUS_BY_STATE));
  assert.deepEqual(
    [...observed].sort(),
    ['completed', 'exception', 'in_progress', 'received', 'review'].sort(),
  );
});

test('fails closed on an unrecognized internal lifecycle state', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ lifecycleState: 'TESTING_IN_THE_FIELD' })],
    baselineContext(),
  );
  assert.equal(view.status, 'exception');
  assert.equal(view.reasonCode, 'lifecycle-state-unknown');
});

test('fails closed on an empty-string internal lifecycle state', () => {
  assert.throws(
    () => projectSpecimenStatuses([baselineRecord({ lifecycleState: '' })], baselineContext()),
    SpecimenStatusInputError,
  );
});

test('fails closed on an unparsable timestamp', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ updatedAt: 'not-a-timestamp' })],
    baselineContext(),
  );
  assert.equal(view.status, 'exception');
  assert.equal(view.reasonCode, 'timestamp-invalid');
});

test('fails closed on a nonexistent calendar date (February 30th)', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ updatedAt: '2026-02-30T12:00:00Z' })],
    baselineContext(),
  );
  assert.equal(view.status, 'exception');
  assert.equal(view.reasonCode, 'timestamp-invalid');
});

test('fails closed on a nonexistent calendar date (April 31st)', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ updatedAt: '2026-04-31T12:00:00Z' })],
    baselineContext(),
  );
  assert.equal(view.status, 'exception');
  assert.equal(view.reasonCode, 'timestamp-invalid');
});

test('fails closed on an out-of-range hour field (24:00:00)', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ updatedAt: '2026-09-16T24:00:00Z' })],
    baselineContext(),
  );
  assert.equal(view.status, 'exception');
  assert.equal(view.reasonCode, 'timestamp-invalid');
});

test('fails closed on an out-of-range minute field', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ updatedAt: '2026-09-16T12:60:00Z' })],
    baselineContext(),
  );
  assert.equal(view.status, 'exception');
  assert.equal(view.reasonCode, 'timestamp-invalid');
});

test('fails closed on an out-of-range second field', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ updatedAt: '2026-09-16T12:00:60Z' })],
    baselineContext(),
  );
  assert.equal(view.status, 'exception');
  assert.equal(view.reasonCode, 'timestamp-invalid');
});

test('fails closed on February 29th in a non-leap year', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ updatedAt: '2026-02-29T12:00:00Z' })],
    baselineContext(),
  );
  assert.equal(view.status, 'exception');
  assert.equal(view.reasonCode, 'timestamp-invalid');
});

test('accepts a valid leap day in a leap year', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ updatedAt: '2024-02-29T12:00:00Z' })],
    baselineContext(),
  );
  assert.equal(view.status, 'received');
  assert.equal(view.reasonCode, undefined);
});

test('rejects a century year that is not a leap year despite being divisible by 4 (1900-02-29)', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ updatedAt: '1900-02-29T12:00:00Z' })],
    baselineContext(),
  );
  assert.equal(view.status, 'exception');
  assert.equal(view.reasonCode, 'timestamp-invalid');
});

test('accepts a leap day in a year divisible by 400 (2000-02-29)', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ updatedAt: '2000-02-29T12:00:00Z' })],
    baselineContext(),
  );
  assert.equal(view.status, 'received');
  assert.equal(view.reasonCode, undefined);
});

test('preserves a valid fractional-second timestamp with non-millisecond precision', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ updatedAt: '2026-09-16T12:00:00.123456Z' })],
    baselineContext(),
  );
  assert.equal(view.status, 'received');
  assert.equal(view.reasonCode, undefined);
});

test('preserves a valid timestamp with no fractional seconds at all', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ updatedAt: '2026-09-16T12:00:00Z' })],
    baselineContext(),
  );
  assert.equal(view.status, 'received');
  assert.equal(view.reasonCode, undefined);
});

test('fails closed on the last day of a 30-day month being rolled from day 31 (June 31st)', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ updatedAt: '2026-06-31T12:00:00Z' })],
    baselineContext(),
  );
  assert.equal(view.status, 'exception');
  assert.equal(view.reasonCode, 'timestamp-invalid');
});

test('nonexistent calendar date does not leak the raw timestamp into the view', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ updatedAt: '2026-02-30T12:00:00Z' })],
    baselineContext(),
  );
  assert.deepEqual(Object.keys(view).sort(), ['reasonCode', 'referenceToken', 'status']);
  assert.ok(!JSON.stringify(view).includes('2026-02-30'));
});

test('tenant mismatch takes precedence over a nonexistent calendar date', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ tenantId: 'tenant-synthetic-other', updatedAt: '2026-02-30T12:00:00Z' })],
    baselineContext(),
  );
  assert.equal(view.reasonCode, 'tenant-mismatch');
});

test('non-UTC suffix check still takes precedence over calendar validity for a missing Z', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ updatedAt: '2026-02-30T12:00:00.000' })],
    baselineContext(),
  );
  assert.equal(view.reasonCode, 'timestamp-not-utc');
});

test('fails closed on a non-UTC (no trailing Z) timestamp', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ updatedAt: '2026-01-01T12:00:00.000' })],
    baselineContext(),
  );
  assert.equal(view.status, 'exception');
  assert.equal(view.reasonCode, 'timestamp-not-utc');
});

test('fails closed on a tenant mismatch', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ tenantId: 'tenant-synthetic-other' })],
    baselineContext(),
  );
  assert.equal(view.status, 'exception');
  assert.equal(view.reasonCode, 'tenant-mismatch');
});

test('checks tenant mismatch before timestamp validity', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ tenantId: 'tenant-synthetic-other', updatedAt: 'not-a-timestamp' })],
    baselineContext(),
  );
  assert.equal(view.reasonCode, 'tenant-mismatch');
});

test('checks timestamp validity before lifecycle state', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ updatedAt: 'not-a-timestamp', lifecycleState: 'NOT_A_REAL_STATE' })],
    baselineContext(),
  );
  assert.equal(view.reasonCode, 'timestamp-invalid');
});

test('projection view excludes names, identifiers, raw notes, and results', () => {
  const record = baselineRecord({
    patientName: 'Synthetic Patient Doe',
    submitterName: 'Synthetic Submitter Roe',
    sampleIdentifier: 'SAMPLE-SYNTH-REAL-0001',
    accessionNumber: 'ACC-SYNTH-REAL-0001',
    rawNotes: 'Synthetic free-text note mentioning a fabricated contact detail.',
    resultValues: { analyte: 'SYNTH-ANALYTE', value: 42, unit: 'mg/L' },
  });

  const [view] = projectSpecimenStatuses([record], baselineContext());

  assert.deepEqual(Object.keys(view).sort(), ['referenceToken', 'status']);

  const serialized = JSON.stringify(view);
  assert.ok(!serialized.includes('Patient'));
  assert.ok(!serialized.includes('Submitter'));
  assert.ok(!serialized.includes('SAMPLE-SYNTH-REAL-0001'));
  assert.ok(!serialized.includes('ACC-SYNTH-REAL-0001'));
  assert.ok(!serialized.includes('free-text note'));
  assert.ok(!serialized.includes('SYNTH-ANALYTE'));
  assert.ok(!serialized.includes('42'));
});

test('exception views also carry no residual internal fields', () => {
  const record = baselineRecord({
    lifecycleState: 'UNKNOWN_STATE',
    patientName: 'Synthetic Patient Doe',
    rawNotes: 'Synthetic note',
    resultValues: { value: 7 },
  });

  const [view] = projectSpecimenStatuses([record], baselineContext());

  assert.deepEqual(Object.keys(view).sort(), ['reasonCode', 'referenceToken', 'status']);
  assert.ok(!JSON.stringify(view).includes('Patient'));
});

test('projects a batch of mixed records in input order', () => {
  const records = [
    baselineRecord({ referenceToken: 'ref-a', lifecycleState: 'INTAKE_LOGGED' }),
    baselineRecord({ referenceToken: 'ref-b', lifecycleState: 'VERIFIED' }),
    baselineRecord({ referenceToken: 'ref-c', lifecycleState: 'BOGUS_STATE' }),
  ];

  const views = projectSpecimenStatuses(records, baselineContext());

  assert.deepEqual(
    views.map((v) => [v.referenceToken, v.status]),
    [
      ['ref-a', 'received'],
      ['ref-b', 'completed'],
      ['ref-c', 'exception'],
    ],
  );
});

test('throws SpecimenStatusInputError when the batch is not an array', () => {
  assert.throws(
    () => projectSpecimenStatuses('not-an-array' as unknown as unknown[], baselineContext()),
    (error: unknown) => error instanceof SpecimenStatusInputError && error.code === 'records-not-array',
  );
});

test('throws SpecimenStatusInputError for an invalid context', () => {
  assert.throws(
    () => projectSpecimenStatuses([baselineRecord()], { tenantId: '' } as SpecimenStatusContext),
    (error: unknown) => error instanceof SpecimenStatusInputError && error.code === 'invalid-context',
  );
});

test('throws SpecimenStatusInputError for a record missing a required identity field', () => {
  const malformed = { ...baselineRecord(), referenceToken: undefined };
  assert.throws(
    () => projectSpecimenStatuses([malformed], baselineContext()),
    (error: unknown) => error instanceof SpecimenStatusInputError && error.code === 'record-malformed',
  );
});

test('throws SpecimenStatusInputError for a non-object record', () => {
  assert.throws(
    () => projectSpecimenStatuses([null], baselineContext()),
    (error: unknown) => error instanceof SpecimenStatusInputError && error.code === 'record-malformed',
  );
});

test('explainSpecimenStatusReason returns deterministic, privacy-safe text for every reason code', () => {
  const reasonCodes = ['tenant-mismatch', 'timestamp-invalid', 'timestamp-not-utc', 'lifecycle-state-unknown'] as const;
  for (const code of reasonCodes) {
    const message = explainSpecimenStatusReason(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});
