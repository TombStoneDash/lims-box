import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRecordPurgeManifest,
  evaluateRecordRetention,
  RecordRetentionError,
  type RecordPurgeEntry,
  type RecordRetentionProfile,
} from '../../lib/ohworks-record-retention';

/**
 * All fabricated: synthetic record classes, record identifiers, and made-up
 * timestamps, including the impossible calendar dates under test. None of
 * this represents a real patient, specimen, or laboratory record.
 *
 * Regression coverage for lims-box#566: `Date.parse` silently rolls an
 * impossible calendar date (e.g. 2026-02-30) forward into the next valid
 * date (2026-03-02) instead of rejecting it. These tests confirm the
 * evaluator now rejects such inputs instead of accepting them as if they
 * were real dates.
 */

const NONEXISTENT_FEB_30 = '2026-02-30T12:00:00.000Z';
const NONEXISTENT_APRIL_31 = '2026-04-31T12:00:00.000Z';
const NONEXISTENT_FEB_29_NON_LEAP = '2026-02-29T12:00:00.000Z'; // 2026 is not a leap year
const VALID_LEAP_DAY = '2028-02-29T12:00:00.000Z'; // 2028 is a leap year

function baselineProfile(overrides: Partial<RecordRetentionProfile> = {}): RecordRetentionProfile {
  return {
    recordClass: 'QC_LOG',
    retentionPeriodMs: 24 * 60 * 60 * 1000, // 1 day
    litigationHold: false,
    ...overrides,
  };
}

function baselineEntry(overrides: Partial<RecordPurgeEntry> = {}): RecordPurgeEntry {
  return {
    recordId: 'REC-0001',
    profile: baselineProfile(),
    creationDate: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// --- creation date position ---

test('fails closed on a nonexistent February 30 creation date (does not roll over to March)', () => {
  assert.throws(
    () => evaluateRecordRetention(baselineProfile(), NONEXISTENT_FEB_30, '2026-03-04T12:00:00.000Z'),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'creation-date-invalid',
  );
});

test('fails closed on a nonexistent April 31 creation date', () => {
  assert.throws(
    () => evaluateRecordRetention(baselineProfile(), NONEXISTENT_APRIL_31, '2026-05-04T12:00:00.000Z'),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'creation-date-invalid',
  );
});

test('fails closed on a nonexistent February 29 creation date in a non-leap year', () => {
  assert.throws(
    () => evaluateRecordRetention(baselineProfile(), NONEXISTENT_FEB_29_NON_LEAP, '2026-03-04T12:00:00.000Z'),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'creation-date-invalid',
  );
});

test('accepts a valid February 29 creation date in a leap year', () => {
  const result = evaluateRecordRetention(baselineProfile(), VALID_LEAP_DAY, '2028-03-01T12:00:00.000Z');
  assert.equal(result.status, 'eligible_for_purge');
});

// --- current timestamp position ---

test('fails closed on a nonexistent February 30 current timestamp', () => {
  assert.throws(
    () => evaluateRecordRetention(baselineProfile(), '2026-01-01T00:00:00.000Z', NONEXISTENT_FEB_30),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'current-timestamp-invalid',
  );
});

test('fails closed on a nonexistent April 31 current timestamp', () => {
  assert.throws(
    () => evaluateRecordRetention(baselineProfile(), '2026-01-01T00:00:00.000Z', NONEXISTENT_APRIL_31),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'current-timestamp-invalid',
  );
});

test('fails closed on a nonexistent February 29 current timestamp in a non-leap year', () => {
  assert.throws(
    () => evaluateRecordRetention(baselineProfile(), '2026-01-01T00:00:00.000Z', NONEXISTENT_FEB_29_NON_LEAP),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'current-timestamp-invalid',
  );
});

test('accepts a valid February 29 current timestamp in a leap year', () => {
  const result = evaluateRecordRetention(baselineProfile(), '2028-02-28T00:00:00.000Z', VALID_LEAP_DAY);
  assert.equal(result.status, 'eligible_for_purge');
});

// --- the exact reported defect: eligible_for_purge must not be reachable via an impossible creation date ---

test('does not report eligible_for_purge for the reproduced defect scenario (synthetic QC_LOG, nonexistent Feb 30 creation date)', () => {
  assert.throws(
    () =>
      evaluateRecordRetention(
        { recordClass: 'QC_LOG', retentionPeriodMs: 86_400_000, litigationHold: false },
        NONEXISTENT_FEB_30,
        '2026-03-04T12:00:00.000Z',
      ),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'creation-date-invalid',
  );
});

// --- manifest purge timestamp position ---

test('fails closed on a nonexistent February 30 purge timestamp for a populated manifest batch', () => {
  assert.throws(
    () => createRecordPurgeManifest([baselineEntry()], NONEXISTENT_FEB_30),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'purge-timestamp-invalid',
  );
});

test('fails closed on a nonexistent April 31 purge timestamp', () => {
  assert.throws(
    () => createRecordPurgeManifest([baselineEntry()], NONEXISTENT_APRIL_31),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'purge-timestamp-invalid',
  );
});

test('fails closed on a nonexistent February 29 purge timestamp in a non-leap year', () => {
  assert.throws(
    () => createRecordPurgeManifest([baselineEntry()], NONEXISTENT_FEB_29_NON_LEAP),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'purge-timestamp-invalid',
  );
});

test('an impossible purge timestamp is rejected even for an empty manifest batch', () => {
  assert.throws(
    () => createRecordPurgeManifest([], NONEXISTENT_FEB_30),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'purge-timestamp-invalid',
  );
});

test('accepts a valid February 29 purge timestamp in a leap year', () => {
  const manifest = createRecordPurgeManifest(
    [baselineEntry({ creationDate: '2028-02-28T00:00:00.000Z' })],
    VALID_LEAP_DAY,
  );
  assert.deepEqual(manifest, { purgeTimestamp: VALID_LEAP_DAY, recordIds: ['REC-0001'] });
});

// --- supported fractional seconds remain accepted alongside strict calendar validation ---

test('still accepts valid timestamps with fractional seconds', () => {
  const result = evaluateRecordRetention(
    baselineProfile(),
    '2026-01-01T00:00:00.123Z',
    '2026-01-02T00:00:00.999999Z',
  );
  assert.equal(result.status, 'eligible_for_purge');
});

// --- out-of-range clock fields, not just calendar fields ---

test('fails closed on an out-of-range hour (24)', () => {
  assert.throws(
    () => evaluateRecordRetention(baselineProfile(), '2026-01-01T24:00:00.000Z', '2026-01-02T00:00:00.000Z'),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'creation-date-invalid',
  );
});

test('fails closed on an out-of-range minute (60)', () => {
  assert.throws(
    () => evaluateRecordRetention(baselineProfile(), '2026-01-01T00:60:00.000Z', '2026-01-02T00:00:00.000Z'),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'creation-date-invalid',
  );
});

test('fails closed on an out-of-range second (60)', () => {
  assert.throws(
    () => evaluateRecordRetention(baselineProfile(), '2026-01-01T00:00:60.000Z', '2026-01-02T00:00:00.000Z'),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'creation-date-invalid',
  );
});
