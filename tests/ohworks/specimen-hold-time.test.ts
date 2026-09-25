import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateSpecimenHoldTime,
  explainSpecimenHoldTimeError,
  SpecimenHoldTimeError,
  type AnalyteHoldTimeProfile,
  type SpecimenHoldTimeErrorCode,
} from '../../lib/ohworks-specimen-hold-time';

/**
 * All fabricated: synthetic analyte codes and made-up collection/receipt
 * timestamps. None of this represents a real patient, specimen, or result.
 */
function baselineProfile(overrides: Partial<AnalyteHoldTimeProfile> = {}): AnalyteHoldTimeProfile {
  return {
    analyteCode: 'GLUCOSE',
    maxHoldTimeMs: 8 * 60 * 60 * 1000, // 8 hours
    storageCondition: 'refrigerated',
    ...overrides,
  };
}

const COLLECTED_AT = '2026-01-01T08:00:00.000Z';

function referenceAtAfter(ms: number): string {
  return new Date(Date.parse(COLLECTED_AT) + ms).toISOString();
}

test('reports within_window well inside the hold window', () => {
  const result = evaluateSpecimenHoldTime(baselineProfile(), COLLECTED_AT, referenceAtAfter(60 * 60 * 1000));
  assert.equal(result.status, 'within_window');
  assert.equal(result.ruleCode, 'within-hold-window');
  assert.equal(result.elapsedMs, 60 * 60 * 1000);
  assert.equal(result.maxHoldTimeMs, 8 * 60 * 60 * 1000);
  if (result.status === 'within_window') {
    assert.equal(result.remainingMs, 7 * 60 * 60 * 1000);
  }
});

test('reports the exact remaining duration at the boundary just before near-expiry', () => {
  const maxHoldTimeMs = 8 * 60 * 60 * 1000;
  const justBeforeThreshold = maxHoldTimeMs * 0.9 - 1;
  const result = evaluateSpecimenHoldTime(baselineProfile(), COLLECTED_AT, referenceAtAfter(justBeforeThreshold));
  assert.equal(result.status, 'within_window');
  if (result.status === 'within_window') {
    assert.equal(result.remainingMs, maxHoldTimeMs - justBeforeThreshold);
  }
});

test('reports near_expiry exactly at the 90% default threshold', () => {
  const maxHoldTimeMs = 8 * 60 * 60 * 1000;
  const atThreshold = maxHoldTimeMs * 0.9;
  const result = evaluateSpecimenHoldTime(baselineProfile(), COLLECTED_AT, referenceAtAfter(atThreshold));
  assert.equal(result.status, 'near_expiry');
  assert.equal(result.ruleCode, 'near-expiry-threshold-reached');
  if (result.status === 'near_expiry') {
    assert.equal(result.remainingMs, maxHoldTimeMs - atThreshold);
  }
});

test('reports expired exactly at the maximum hold time with zero overdue', () => {
  const maxHoldTimeMs = 8 * 60 * 60 * 1000;
  const result = evaluateSpecimenHoldTime(baselineProfile(), COLLECTED_AT, referenceAtAfter(maxHoldTimeMs));
  assert.equal(result.status, 'expired');
  assert.equal(result.ruleCode, 'max-hold-time-exceeded');
  if (result.status === 'expired') {
    assert.equal(result.overdueMs, 0);
  }
});

test('reports the exact overdue duration well past the maximum hold time', () => {
  const maxHoldTimeMs = 8 * 60 * 60 * 1000;
  const overdueBy = 45 * 60 * 1000;
  const result = evaluateSpecimenHoldTime(baselineProfile(), COLLECTED_AT, referenceAtAfter(maxHoldTimeMs + overdueBy));
  assert.equal(result.status, 'expired');
  if (result.status === 'expired') {
    assert.equal(result.overdueMs, overdueBy);
    assert.equal(result.elapsedMs, maxHoldTimeMs + overdueBy);
  }
});

test('honors a caller-supplied near-expiry fraction', () => {
  const maxHoldTimeMs = 10 * 60 * 60 * 1000;
  const profile = baselineProfile({ maxHoldTimeMs, nearExpiryFraction: 0.5 });
  const atHalf = maxHoldTimeMs * 0.5;
  const result = evaluateSpecimenHoldTime(profile, COLLECTED_AT, referenceAtAfter(atHalf));
  assert.equal(result.status, 'near_expiry');
});

test('fails closed on an unknown analyte code', () => {
  assert.throws(
    () => evaluateSpecimenHoldTime(baselineProfile({ analyteCode: 'UNOBTANIUM' }), COLLECTED_AT, referenceAtAfter(0)),
    (error: unknown) => error instanceof SpecimenHoldTimeError && error.code === 'analyte-unknown',
  );
});

test('fails closed on an unsupported storage condition', () => {
  assert.throws(
    () =>
      evaluateSpecimenHoldTime(
        baselineProfile({ storageCondition: 'lunar_vacuum' }),
        COLLECTED_AT,
        referenceAtAfter(0),
      ),
    (error: unknown) => error instanceof SpecimenHoldTimeError && error.code === 'storage-condition-unsupported',
  );
});

test('fails closed on a non-positive maximum hold time', () => {
  assert.throws(
    () => evaluateSpecimenHoldTime(baselineProfile({ maxHoldTimeMs: 0 }), COLLECTED_AT, referenceAtAfter(0)),
    (error: unknown) => error instanceof SpecimenHoldTimeError && error.code === 'max-hold-time-invalid',
  );
});

test('fails closed on a non-finite maximum hold time', () => {
  assert.throws(
    () =>
      evaluateSpecimenHoldTime(
        baselineProfile({ maxHoldTimeMs: Number.POSITIVE_INFINITY }),
        COLLECTED_AT,
        referenceAtAfter(0),
      ),
    (error: unknown) => error instanceof SpecimenHoldTimeError && error.code === 'max-hold-time-invalid',
  );
});

test('fails closed on a near-expiry fraction outside (0, 1)', () => {
  assert.throws(
    () =>
      evaluateSpecimenHoldTime(baselineProfile({ nearExpiryFraction: 1 }), COLLECTED_AT, referenceAtAfter(0)),
    (error: unknown) => error instanceof SpecimenHoldTimeError && error.code === 'near-expiry-fraction-invalid',
  );
  assert.throws(
    () =>
      evaluateSpecimenHoldTime(baselineProfile({ nearExpiryFraction: 0 }), COLLECTED_AT, referenceAtAfter(0)),
    (error: unknown) => error instanceof SpecimenHoldTimeError && error.code === 'near-expiry-fraction-invalid',
  );
});

test('fails closed on a missing collection timestamp', () => {
  assert.throws(
    () => evaluateSpecimenHoldTime(baselineProfile(), '' as string, referenceAtAfter(0)),
    (error: unknown) => error instanceof SpecimenHoldTimeError && error.code === 'collected-at-missing',
  );
});

test('fails closed on an unparsable collection timestamp', () => {
  assert.throws(
    () => evaluateSpecimenHoldTime(baselineProfile(), 'not-a-timestamp', referenceAtAfter(0)),
    (error: unknown) => error instanceof SpecimenHoldTimeError && error.code === 'collected-at-invalid',
  );
});

test('fails closed on a non-UTC (no trailing Z) collection timestamp', () => {
  assert.throws(
    () => evaluateSpecimenHoldTime(baselineProfile(), '2026-01-01T08:00:00.000', referenceAtAfter(0)),
    (error: unknown) => error instanceof SpecimenHoldTimeError && error.code === 'collected-at-invalid',
  );
});

test('fails closed on a missing reference timestamp', () => {
  assert.throws(
    () => evaluateSpecimenHoldTime(baselineProfile(), COLLECTED_AT, '' as string),
    (error: unknown) => error instanceof SpecimenHoldTimeError && error.code === 'reference-at-missing',
  );
});

test('fails closed on an unparsable reference timestamp', () => {
  assert.throws(
    () => evaluateSpecimenHoldTime(baselineProfile(), COLLECTED_AT, 'not-a-timestamp'),
    (error: unknown) => error instanceof SpecimenHoldTimeError && error.code === 'reference-at-invalid',
  );
});

test('fails closed on a non-UTC (no trailing Z) reference timestamp', () => {
  assert.throws(
    () => evaluateSpecimenHoldTime(baselineProfile(), COLLECTED_AT, '2026-01-01T09:00:00.000'),
    (error: unknown) => error instanceof SpecimenHoldTimeError && error.code === 'reference-at-invalid',
  );
});

test('fails closed on a non-monotonic reference timestamp preceding collection', () => {
  assert.throws(
    () => evaluateSpecimenHoldTime(baselineProfile(), COLLECTED_AT, referenceAtAfter(-1)),
    (error: unknown) => error instanceof SpecimenHoldTimeError && error.code === 'timestamps-non-monotonic',
  );
});

test('allows a reference timestamp exactly equal to the collection timestamp', () => {
  const result = evaluateSpecimenHoldTime(baselineProfile(), COLLECTED_AT, COLLECTED_AT);
  assert.equal(result.status, 'within_window');
  assert.equal(result.elapsedMs, 0);
});

test('checks analyte before storage condition', () => {
  assert.throws(
    () =>
      evaluateSpecimenHoldTime(
        baselineProfile({ analyteCode: 'UNOBTANIUM', storageCondition: 'lunar_vacuum' }),
        COLLECTED_AT,
        referenceAtAfter(0),
      ),
    (error: unknown) => error instanceof SpecimenHoldTimeError && error.code === 'analyte-unknown',
  );
});

test('checks collection timestamp before reference timestamp', () => {
  assert.throws(
    () => evaluateSpecimenHoldTime(baselineProfile(), 'not-a-timestamp', 'also-not-a-timestamp'),
    (error: unknown) => error instanceof SpecimenHoldTimeError && error.code === 'collected-at-invalid',
  );
});

test('explainSpecimenHoldTimeError returns deterministic, non-empty text for every error code', () => {
  const codes: SpecimenHoldTimeErrorCode[] = [
    'analyte-unknown',
    'storage-condition-unsupported',
    'max-hold-time-invalid',
    'near-expiry-fraction-invalid',
    'collected-at-missing',
    'collected-at-invalid',
    'reference-at-missing',
    'reference-at-invalid',
    'timestamps-non-monotonic',
  ];
  for (const code of codes) {
    const message = explainSpecimenHoldTimeError(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

test('never reads the system clock: identical inputs always produce identical output', () => {
  const first = evaluateSpecimenHoldTime(baselineProfile(), COLLECTED_AT, referenceAtAfter(60 * 60 * 1000));
  const second = evaluateSpecimenHoldTime(baselineProfile(), COLLECTED_AT, referenceAtAfter(60 * 60 * 1000));
  assert.deepEqual(first, second);
});
