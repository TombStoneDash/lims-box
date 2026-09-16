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

// --- PR153 calendar-correction regression corpus -------------------------
//
// PR153's reviewed helper fell back to "not invalid" whenever a single
// canonical regex (full millisecond precision, uppercase "T", plain
// 4-digit year) failed to match, so every other accepted timestamp form
// bypassed calendar validation entirely and impossible dates like
// February 30th completed instead of failing closed. These cases pin
// calendar/clock validity across every accepted form.

test('accepts a valid Feb 28 date in a non-leap year', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ updatedAt: '2026-02-28T12:00:00.000Z' })],
    baselineContext(),
  );
  assert.equal(view.status, 'received');
  assert.equal(view.reasonCode, undefined);
});

test('accepts a valid Feb 29 leap day', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ updatedAt: '2028-02-29T12:00:00.000Z' })],
    baselineContext(),
  );
  assert.equal(view.status, 'received');
  assert.equal(view.reasonCode, undefined);
});

const VALID_ALTERNATE_FORMS = [
  { label: 'minute precision', updatedAt: '2026-01-05T12:00Z' },
  { label: 'space separator', updatedAt: '2026-01-05 12:00:00Z' },
  { label: 'lowercase-t separator', updatedAt: '2026-01-05t12:00:00Z' },
  { label: 'expanded year', updatedAt: '+002026-01-05T12:00:00.000Z' },
  { label: 'single-digit fractional seconds', updatedAt: '2026-01-05T12:00:00.5Z' },
  { label: 'microsecond-scale fractional seconds', updatedAt: '2026-01-05T12:00:00.123456Z' },
];

for (const { label, updatedAt } of VALID_ALTERNATE_FORMS) {
  test(`accepts a valid calendar date using the ${label} form`, () => {
    const [view] = projectSpecimenStatuses([baselineRecord({ updatedAt })], baselineContext());
    assert.equal(view.status, 'received', `${label}: expected acceptance for ${updatedAt}`);
    assert.equal(view.reasonCode, undefined);
    assert.deepEqual(Object.keys(view).sort(), ['referenceToken', 'status']);
  });
}

const IMPOSSIBLE_FEB_30_FORMS = [
  { label: 'full millisecond precision', updatedAt: '2026-02-30T12:00:00.000Z' },
  { label: 'minute precision', updatedAt: '2026-02-30T12:00Z' },
  { label: 'space separator', updatedAt: '2026-02-30 12:00:00Z' },
  { label: 'lowercase-t separator', updatedAt: '2026-02-30t12:00:00Z' },
  { label: 'expanded year', updatedAt: '+002026-02-30T12:00:00.000Z' },
];

for (const { label, updatedAt } of IMPOSSIBLE_FEB_30_FORMS) {
  test(`rejects the impossible date Feb 30 in the ${label} form`, () => {
    const [view] = projectSpecimenStatuses([baselineRecord({ updatedAt })], baselineContext());
    assert.equal(view.status, 'exception', `${label}: expected fail-closed for ${updatedAt}`);
    assert.equal(view.reasonCode, 'timestamp-invalid');
  });
}

const OTHER_IMPOSSIBLE_CALENDAR_VALUES = [
  { label: 'Feb 29 in a non-leap year', updatedAt: '2026-02-29T12:00:00.000Z' },
  { label: 'April 31st (April has 30 days)', updatedAt: '2026-04-31T12:00:00.000Z' },
  { label: 'month 13', updatedAt: '2026-13-01T12:00:00.000Z' },
  { label: 'day 0', updatedAt: '2026-01-00T12:00:00.000Z' },
  { label: 'hour 24', updatedAt: '2026-01-01T24:00:00.000Z' },
  { label: 'minute 60', updatedAt: '2026-01-01T12:60:00.000Z' },
  { label: 'second 60', updatedAt: '2026-01-01T12:00:60.000Z' },
];

for (const { label, updatedAt } of OTHER_IMPOSSIBLE_CALENDAR_VALUES) {
  test(`rejects the impossible calendar/clock value: ${label}`, () => {
    const [view] = projectSpecimenStatuses([baselineRecord({ updatedAt })], baselineContext());
    assert.equal(view.status, 'exception', `${label}: expected fail-closed for ${updatedAt}`);
    assert.equal(view.reasonCode, 'timestamp-invalid');
  });
}

const UNSUPPORTED_FORMS_FAIL_CLOSED = [
  { label: 'date with no time component', updatedAt: '2026-01-01' },
  { label: 'ordinal (day-of-year) date', updatedAt: '2026-060T12:00:00Z' },
  { label: 'ISO week date', updatedAt: '2026-W09-1T12:00:00Z' },
  { label: 'out-of-range expanded year', updatedAt: '+999999-01-01T12:00:00Z' },
  { label: 'negative-zero expanded year', updatedAt: '-000000-01-01T12:00:00Z' },
];

for (const { label, updatedAt } of UNSUPPORTED_FORMS_FAIL_CLOSED) {
  test(`fails closed rather than bypassing calendar validation for an unsupported form: ${label}`, () => {
    const [view] = projectSpecimenStatuses([baselineRecord({ updatedAt })], baselineContext());
    assert.equal(view.status, 'exception', `${label}: expected fail-closed for ${updatedAt}`);
    assert.equal(view.reasonCode, 'timestamp-invalid');
  });
}

const NON_UTC_ALTERNATE_FORMS = [
  { label: 'minute precision with no trailing Z', updatedAt: '2026-01-05T12:00' },
  { label: 'space separator with no trailing Z', updatedAt: '2026-01-05 12:00:00' },
  { label: 'explicit numeric UTC offset instead of Z', updatedAt: '2026-01-01T12:00:00.000+05:00' },
  { label: 'explicit numeric UTC offset instead of Z (colon-free)', updatedAt: '2026-09-16T12:00:00+0100' },
];

for (const { label, updatedAt } of NON_UTC_ALTERNATE_FORMS) {
  test(`fails closed with timestamp-not-utc for a calendar-valid but unmarked form: ${label}`, () => {
    const [view] = projectSpecimenStatuses([baselineRecord({ updatedAt })], baselineContext());
    assert.equal(view.status, 'exception', `${label}: expected fail-closed for ${updatedAt}`);
    assert.equal(view.reasonCode, 'timestamp-not-utc');
  });
}

test('preserves timestamp-not-utc for a parseable non-UTC-offset value', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ updatedAt: '2026-09-16T12:00:00+01:00' })],
    baselineContext(),
  );
  assert.equal(view.status, 'exception');
  assert.equal(view.reasonCode, 'timestamp-not-utc');
});

test('tenant-mismatch still takes precedence over an impossible-calendar timestamp', () => {
  const [view] = projectSpecimenStatuses(
    [baselineRecord({ tenantId: 'tenant-synthetic-other', updatedAt: '2026-02-30T12:00Z' })],
    baselineContext(),
  );
  assert.equal(view.reasonCode, 'tenant-mismatch');
});

test('explainSpecimenStatusReason returns deterministic, privacy-safe text for every reason code', () => {
  const reasonCodes = ['tenant-mismatch', 'timestamp-invalid', 'timestamp-not-utc', 'lifecycle-state-unknown'] as const;
  for (const code of reasonCodes) {
    const message = explainSpecimenStatusReason(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});
