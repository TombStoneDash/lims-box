import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateSpecimenHoldTime,
  SpecimenHoldTimeError,
  type AnalyteHoldTimeProfile,
} from '../../lib/ohworks-specimen-hold-time';

/**
 * All fabricated: synthetic analyte codes and made-up collection/receipt
 * timestamps. None of this represents a real patient, specimen, or result.
 */
function baselineProfile(overrides: Partial<AnalyteHoldTimeProfile> = {}): AnalyteHoldTimeProfile {
  return {
    analyteCode: 'GLUCOSE',
    maxHoldTimeMs: 8 * 60 * 60 * 1000,
    storageCondition: 'refrigerated',
    ...overrides,
  };
}

const VALID_COLLECTED_AT = '2026-01-01T08:00:00.000Z';
const VALID_REFERENCE_AT = '2026-01-01T09:00:00.000Z';

function assertCollectedAtInvalid(collectedAt: string) {
  assert.throws(
    () => evaluateSpecimenHoldTime(baselineProfile(), collectedAt, VALID_REFERENCE_AT),
    (error: unknown) => error instanceof SpecimenHoldTimeError && error.code === 'collected-at-invalid',
  );
}

function assertReferenceAtInvalid(referenceAt: string) {
  assert.throws(
    () => evaluateSpecimenHoldTime(baselineProfile(), VALID_COLLECTED_AT, referenceAt),
    (error: unknown) => error instanceof SpecimenHoldTimeError && error.code === 'reference-at-invalid',
  );
}

test('fails closed on a nonexistent February 30 collection timestamp', () => {
  assertCollectedAtInvalid('2026-02-30T08:00:00Z');
});

test('fails closed on a nonexistent February 30 reference timestamp', () => {
  assertReferenceAtInvalid('2026-02-30T08:00:00Z');
});

test('fails closed on a nonexistent April 31 collection timestamp', () => {
  assertCollectedAtInvalid('2026-04-31T08:00:00Z');
});

test('fails closed on a nonexistent April 31 reference timestamp', () => {
  assertReferenceAtInvalid('2026-04-31T08:00:00Z');
});

test('fails closed on a nonexistent February 29 in a non-leap year (2026) for collection', () => {
  assertCollectedAtInvalid('2026-02-29T00:00:00Z');
});

test('fails closed on a nonexistent February 29 in a non-leap year (2026) for reference', () => {
  assertReferenceAtInvalid('2026-02-29T00:00:00Z');
});

test('fails closed on an out-of-range month (13) for collection', () => {
  assertCollectedAtInvalid('2026-13-01T00:00:00Z');
});

test('fails closed on an out-of-range month (13) for reference', () => {
  assertReferenceAtInvalid('2026-13-01T00:00:00Z');
});

test('fails closed on a loose, non-strict-ISO string with a trailing Z for collection', () => {
  assertCollectedAtInvalid('Jan 5, 2026 08:00 Z');
});

test('fails closed on a loose, non-strict-ISO string with a trailing Z for reference', () => {
  assertReferenceAtInvalid('Jan 5, 2026 08:00 Z');
});

test('accepts a real leap day (2028-02-29) as both collection and reference', () => {
  const result = evaluateSpecimenHoldTime(
    baselineProfile(),
    '2028-02-29T00:00:00Z',
    '2028-02-29T01:00:00Z',
  );
  assert.equal(result.status, 'within_window');
  assert.equal(result.elapsedMs, 60 * 60 * 1000);
});

test('accepts a timestamp with a .000Z millisecond suffix', () => {
  const result = evaluateSpecimenHoldTime(
    baselineProfile(),
    '2026-01-01T08:00:00.000Z',
    '2026-01-01T09:00:00.000Z',
  );
  assert.equal(result.status, 'within_window');
  assert.equal(result.elapsedMs, 60 * 60 * 1000);
});
