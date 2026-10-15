import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSampleDisposalRecord,
  evaluateSampleRetention,
  SampleRetentionError,
  type SampleDisposalRequest,
  type SampleRetentionProfile,
} from '../../lib/ohworks-sample-retention';

/**
 * All fabricated: synthetic analyte classes, specimen identifiers, and
 * made-up report/current timestamps. None of this represents a real
 * patient, specimen, or result.
 */
function baselineProfile(overrides: Partial<SampleRetentionProfile> = {}): SampleRetentionProfile {
  return {
    analyteClass: 'HEMATOLOGY',
    retentionPeriodMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    legalHold: false,
    ...overrides,
  };
}

function baselineRequest(overrides: Partial<SampleDisposalRequest> = {}): SampleDisposalRequest {
  return {
    specimenId: 'SPEC-0001',
    methodCode: 'INCINERATION',
    witnessRole: 'LAB_SUPERVISOR',
    ...overrides,
  };
}

const VALID_CURRENT = '2026-03-10T12:00:00Z';

// --- report date: impossible calendar values fail closed ---

test('fails closed on a report date of February 30th', () => {
  assert.throws(
    () => evaluateSampleRetention(baselineProfile(), '2026-02-30T12:00:00Z', VALID_CURRENT),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'report-date-invalid',
  );
});

test('fails closed on a report date of April 31st', () => {
  assert.throws(
    () => evaluateSampleRetention(baselineProfile(), '2026-04-31T00:00:00Z', VALID_CURRENT),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'report-date-invalid',
  );
});

test('fails closed on a report date of February 29th in a non-leap year', () => {
  assert.throws(
    () => evaluateSampleRetention(baselineProfile(), '2026-02-29T00:00:00Z', VALID_CURRENT),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'report-date-invalid',
  );
});

test('fails closed on a report date with hour 24', () => {
  assert.throws(
    () => evaluateSampleRetention(baselineProfile(), '2026-02-01T24:00:00Z', VALID_CURRENT),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'report-date-invalid',
  );
});

// --- current timestamp: impossible calendar values fail closed ---

test('fails closed on a current timestamp of February 30th', () => {
  assert.throws(
    () => evaluateSampleRetention(baselineProfile(), '2026-02-01T00:00:00Z', '2026-02-30T12:00:00Z'),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'current-timestamp-invalid',
  );
});

test('fails closed on a current timestamp of April 31st', () => {
  assert.throws(
    () => evaluateSampleRetention(baselineProfile(), '2026-04-01T00:00:00Z', '2026-04-31T00:00:00Z'),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'current-timestamp-invalid',
  );
});

test('fails closed on a current timestamp of February 29th in a non-leap year', () => {
  assert.throws(
    () => evaluateSampleRetention(baselineProfile(), '2026-02-01T00:00:00Z', '2026-02-29T00:00:00Z'),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'current-timestamp-invalid',
  );
});

test('fails closed on a current timestamp with hour 24', () => {
  assert.throws(
    () => evaluateSampleRetention(baselineProfile(), '2026-02-01T00:00:00Z', '2026-02-01T24:00:00Z'),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'current-timestamp-invalid',
  );
});

// --- valid controls keep working ---

test('accepts a valid report date and current timestamp without fractional seconds', () => {
  const result = evaluateSampleRetention(baselineProfile(), '2026-03-01T12:00:00Z', VALID_CURRENT);
  assert.equal(result.status, 'eligible_for_disposal');
});

test('accepts a valid report date and current timestamp with fractional seconds', () => {
  const result = evaluateSampleRetention(
    baselineProfile(),
    '2026-03-01T12:00:00.000Z',
    '2026-03-10T12:00:00.500Z',
  );
  assert.equal(result.status, 'eligible_for_disposal');
});

test('accepts February 29th in a leap year', () => {
  const result = evaluateSampleRetention(baselineProfile(), '2028-02-29T00:00:00Z', '2028-03-10T00:00:00Z');
  assert.equal(result.status, 'eligible_for_disposal');
});

// --- createSampleDisposalRecord fails closed on an impossible report date ---

test('createSampleDisposalRecord fails closed on an impossible report date', () => {
  assert.throws(
    () =>
      createSampleDisposalRecord(baselineProfile(), '2026-02-30T12:00:00Z', VALID_CURRENT, baselineRequest()),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'report-date-invalid',
  );
});
