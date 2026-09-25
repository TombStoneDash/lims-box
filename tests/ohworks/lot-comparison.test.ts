import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LotComparisonError,
  evaluateLotComparison,
  explainLotComparisonCriterion,
  explainLotComparisonError,
  type LotComparisonErrorCode,
  type LotComparisonGoverningCriterion,
  type LotComparisonLimits,
  type LotComparisonPair,
} from '../../lib/ohworks-lot-comparison';

/**
 * All fabricated: synthetic specimen identifiers and made-up numeric values.
 * None of this represents a real patient, specimen, or instrument result.
 */
function baselineLimits(): LotComparisonLimits {
  return {
    minPairs: 5,
    unit: 'mg/dL',
    allowableDifference: { absolute: 5, percent: 10 },
    maxMeanDifference: 2,
    maxPercentBias: 5,
    maxOutlierPairs: 1,
  };
}

function baselinePairs(): LotComparisonPair[] {
  return [
    { specimenId: 'spec-synthetic-1', oldValue: 100, oldUnit: 'mg/dL', newValue: 101, newUnit: 'mg/dL' },
    { specimenId: 'spec-synthetic-2', oldValue: 100, oldUnit: 'mg/dL', newValue: 99, newUnit: 'mg/dL' },
    { specimenId: 'spec-synthetic-3', oldValue: 100, oldUnit: 'mg/dL', newValue: 102, newUnit: 'mg/dL' },
    { specimenId: 'spec-synthetic-4', oldValue: 100, oldUnit: 'mg/dL', newValue: 98, newUnit: 'mg/dL' },
    { specimenId: 'spec-synthetic-5', oldValue: 100, oldUnit: 'mg/dL', newValue: 100, newUnit: 'mg/dL' },
  ];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const ALL_ERROR_CODES: LotComparisonErrorCode[] = [
  'limits-malformed',
  'pairs-not-array',
  'pairs-below-minimum',
  'duplicate-specimen-id',
  'pair-malformed',
  'old-value-invalid',
  'new-value-invalid',
  'old-unit-missing',
  'new-unit-missing',
  'old-unit-mismatched',
  'new-unit-mismatched',
];

const ALL_GOVERNING_CRITERIA: LotComparisonGoverningCriterion[] = [
  'within-limits',
  'mean-difference-exceeded',
  'percent-bias-exceeded',
  'outlier-count-exceeded',
];

const FORBIDDEN_WORDS = [/approved/i, /compliant/i, /accredited/i, /releasable/i];

function assertThrowsCode(fn: () => unknown, code: LotComparisonErrorCode): void {
  assert.throws(
    fn,
    (error: unknown) => {
      assert.ok(error instanceof LotComparisonError);
      assert.equal((error as LotComparisonError).code, code);
      return true;
    },
  );
}

test('a well-behaved set of pairs is accepted with within-limits as the governing criterion', () => {
  const result = evaluateLotComparison(baselinePairs(), baselineLimits());
  assert.equal(result.decision, 'accept');
  assert.equal(result.governingCriterion, 'within-limits');
  assert.equal(result.pairCount, 5);
  assert.equal(result.outlierCount, 0);
});

test('mean difference is the signed mean of (new - old)', () => {
  const result = evaluateLotComparison(baselinePairs(), baselineLimits());
  // deltas: +1, -1, +2, -2, 0 => mean 0
  assert.equal(result.meanDifference, 0);
});

test('percent bias is null when the mean old-lot value is zero', () => {
  const limits = baselineLimits();
  limits.allowableDifference = { absolute: 5, percent: null };
  const pairs: LotComparisonPair[] = [
    { specimenId: 's1', oldValue: 0, oldUnit: 'mg/dL', newValue: 1, newUnit: 'mg/dL' },
    { specimenId: 's2', oldValue: 0, oldUnit: 'mg/dL', newValue: -1, newUnit: 'mg/dL' },
    { specimenId: 's3', oldValue: 0, oldUnit: 'mg/dL', newValue: 0, newUnit: 'mg/dL' },
    { specimenId: 's4', oldValue: 0, oldUnit: 'mg/dL', newValue: 1, newUnit: 'mg/dL' },
    { specimenId: 's5', oldValue: 0, oldUnit: 'mg/dL', newValue: -1, newUnit: 'mg/dL' },
  ];
  const result = evaluateLotComparison(pairs, limits);
  assert.equal(result.percentBias, null);
});

test('a per-pair percent difference is null when that pair old value is zero', () => {
  const pairs = baselinePairs();
  pairs[0] = { specimenId: 'spec-synthetic-1', oldValue: 0, oldUnit: 'mg/dL', newValue: 1, newUnit: 'mg/dL' };
  const result = evaluateLotComparison(pairs, baselineLimits());
  assert.equal(result.pairDifferences[0].percentDifference, null);
});

test('evaluation is pure: it does not mutate input pairs or limits', () => {
  const pairs = baselinePairs();
  const limits = baselineLimits();
  const beforePairs = JSON.stringify(pairs);
  const beforeLimits = JSON.stringify(limits);
  evaluateLotComparison(pairs, limits);
  assert.equal(JSON.stringify(pairs), beforePairs);
  assert.equal(JSON.stringify(limits), beforeLimits);
});

test('evaluation is deterministic across repeated calls', () => {
  const pairs = baselinePairs();
  const limits = baselineLimits();
  const first = evaluateLotComparison(pairs, limits);
  const second = evaluateLotComparison(clone(pairs), clone(limits));
  assert.deepEqual(first, second);
});

test('a decision other than accept or reject is never produced', () => {
  const result = evaluateLotComparison(baselinePairs(), baselineLimits());
  assert.ok(['accept', 'reject'].includes(result.decision));
});

test('the returned result is frozen, including the per-pair differences array', () => {
  const result = evaluateLotComparison(baselinePairs(), baselineLimits());
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.pairDifferences));
  assert.ok(Object.isFrozen(result.pairDifferences[0]));
});

test('a mean difference exactly at the declared limit does not reject', () => {
  const limits = baselineLimits();
  limits.maxMeanDifference = 0;
  const pairs = baselinePairs(); // mean difference is exactly 0
  const result = evaluateLotComparison(pairs, limits);
  assert.equal(result.decision, 'accept');
});

test('a mean difference exceeding the declared limit rejects with mean-difference-exceeded', () => {
  const limits = baselineLimits();
  limits.maxMeanDifference = 0.5;
  const pairs = baselinePairs(); // mean difference is exactly 0, so nudge it
  pairs[4] = { specimenId: 'spec-synthetic-5', oldValue: 100, oldUnit: 'mg/dL', newValue: 103, newUnit: 'mg/dL' };
  const result = evaluateLotComparison(pairs, limits);
  assert.equal(result.decision, 'reject');
  assert.equal(result.governingCriterion, 'mean-difference-exceeded');
});

test('a percent bias exceeding the declared limit rejects with percent-bias-exceeded when mean difference is within limit', () => {
  const limits: LotComparisonLimits = {
    minPairs: 3,
    unit: 'mg/dL',
    allowableDifference: { absolute: 100, percent: 100 },
    maxMeanDifference: 100,
    maxPercentBias: 5,
    maxOutlierPairs: 5,
  };
  const pairs: LotComparisonPair[] = [
    { specimenId: 's1', oldValue: 10, oldUnit: 'mg/dL', newValue: 11, newUnit: 'mg/dL' },
    { specimenId: 's2', oldValue: 10, oldUnit: 'mg/dL', newValue: 11, newUnit: 'mg/dL' },
    { specimenId: 's3', oldValue: 10, oldUnit: 'mg/dL', newValue: 11, newUnit: 'mg/dL' },
  ];
  const result = evaluateLotComparison(pairs, limits);
  assert.equal(result.decision, 'reject');
  assert.equal(result.governingCriterion, 'percent-bias-exceeded');
  assert.equal(result.percentBias, 10);
});

test('an outlier count exceeding the declared limit rejects with outlier-count-exceeded when mean and percent bias are within limit', () => {
  const limits: LotComparisonLimits = {
    minPairs: 5,
    unit: 'mg/dL',
    allowableDifference: { absolute: 5, percent: null },
    maxMeanDifference: 100,
    maxPercentBias: 100,
    maxOutlierPairs: 1,
  };
  const pairs: LotComparisonPair[] = [
    { specimenId: 's1', oldValue: 100, oldUnit: 'mg/dL', newValue: 108, newUnit: 'mg/dL' },
    { specimenId: 's2', oldValue: 100, oldUnit: 'mg/dL', newValue: 92, newUnit: 'mg/dL' },
    { specimenId: 's3', oldValue: 100, oldUnit: 'mg/dL', newValue: 108, newUnit: 'mg/dL' },
    { specimenId: 's4', oldValue: 100, oldUnit: 'mg/dL', newValue: 100, newUnit: 'mg/dL' },
    { specimenId: 's5', oldValue: 100, oldUnit: 'mg/dL', newValue: 100, newUnit: 'mg/dL' },
  ];
  const result = evaluateLotComparison(pairs, limits);
  assert.equal(result.outlierCount, 3);
  assert.equal(result.decision, 'reject');
  assert.equal(result.governingCriterion, 'outlier-count-exceeded');
});

test('an outlier count exactly at the declared limit does not reject', () => {
  const limits: LotComparisonLimits = {
    minPairs: 5,
    unit: 'mg/dL',
    allowableDifference: { absolute: 5, percent: null },
    maxMeanDifference: 100,
    maxPercentBias: 100,
    maxOutlierPairs: 2,
  };
  const pairs: LotComparisonPair[] = [
    { specimenId: 's1', oldValue: 100, oldUnit: 'mg/dL', newValue: 108, newUnit: 'mg/dL' },
    { specimenId: 's2', oldValue: 100, oldUnit: 'mg/dL', newValue: 92, newUnit: 'mg/dL' },
    { specimenId: 's3', oldValue: 100, oldUnit: 'mg/dL', newValue: 100, newUnit: 'mg/dL' },
    { specimenId: 's4', oldValue: 100, oldUnit: 'mg/dL', newValue: 100, newUnit: 'mg/dL' },
    { specimenId: 's5', oldValue: 100, oldUnit: 'mg/dL', newValue: 100, newUnit: 'mg/dL' },
  ];
  const result = evaluateLotComparison(pairs, limits);
  assert.equal(result.outlierCount, 2);
  assert.equal(result.decision, 'accept');
});

test('mean-difference-exceeded takes priority over percent-bias-exceeded and outlier-count-exceeded', () => {
  const limits: LotComparisonLimits = {
    minPairs: 3,
    unit: 'mg/dL',
    allowableDifference: { absolute: 0, percent: null },
    maxMeanDifference: 0,
    maxPercentBias: 0,
    maxOutlierPairs: 0,
  };
  const pairs: LotComparisonPair[] = [
    { specimenId: 's1', oldValue: 10, oldUnit: 'mg/dL', newValue: 11, newUnit: 'mg/dL' },
    { specimenId: 's2', oldValue: 10, oldUnit: 'mg/dL', newValue: 11, newUnit: 'mg/dL' },
    { specimenId: 's3', oldValue: 10, oldUnit: 'mg/dL', newValue: 11, newUnit: 'mg/dL' },
  ];
  const result = evaluateLotComparison(pairs, limits);
  assert.equal(result.decision, 'reject');
  assert.equal(result.governingCriterion, 'mean-difference-exceeded');
});

test('a per-pair percent difference exceeding the allowable percent counts as an outlier even when absolute is within limit', () => {
  const limits: LotComparisonLimits = {
    minPairs: 3,
    unit: 'mg/dL',
    allowableDifference: { absolute: 100, percent: 10 },
    maxMeanDifference: 100,
    maxPercentBias: 100,
    maxOutlierPairs: 0,
  };
  const pairs: LotComparisonPair[] = [
    { specimenId: 's1', oldValue: 10, oldUnit: 'mg/dL', newValue: 12, newUnit: 'mg/dL' }, // 20% over, under absolute
    { specimenId: 's2', oldValue: 10, oldUnit: 'mg/dL', newValue: 10, newUnit: 'mg/dL' },
    { specimenId: 's3', oldValue: 10, oldUnit: 'mg/dL', newValue: 10, newUnit: 'mg/dL' },
  ];
  const result = evaluateLotComparison(pairs, limits);
  assert.equal(result.pairDifferences[0].isOutlier, true);
  assert.equal(result.decision, 'reject');
  assert.equal(result.governingCriterion, 'outlier-count-exceeded');
});

test('fewer pairs than the declared minimum throws pairs-below-minimum', () => {
  const pairs = baselinePairs().slice(0, 4);
  assertThrowsCode(() => evaluateLotComparison(pairs, baselineLimits()), 'pairs-below-minimum');
});

test('a non-array pairs input throws pairs-not-array', () => {
  assertThrowsCode(
    () => evaluateLotComparison('not-an-array' as unknown as LotComparisonPair[], baselineLimits()),
    'pairs-not-array',
  );
});

test('malformed declared limits throw limits-malformed', () => {
  assertThrowsCode(
    () => evaluateLotComparison(baselinePairs(), {} as unknown as LotComparisonLimits),
    'limits-malformed',
  );
});

test('declared limits with a non-integer minPairs throw limits-malformed', () => {
  const limits = baselineLimits();
  (limits as unknown as { minPairs: number }).minPairs = 2.5;
  assertThrowsCode(() => evaluateLotComparison(baselinePairs(), limits), 'limits-malformed');
});

test('declared allowable difference with both axes null throws limits-malformed', () => {
  const limits = baselineLimits();
  limits.allowableDifference = { absolute: null, percent: null };
  assertThrowsCode(() => evaluateLotComparison(baselinePairs(), limits), 'limits-malformed');
});

test('declared allowable difference with a negative axis throws limits-malformed', () => {
  const limits = baselineLimits();
  limits.allowableDifference = { absolute: -1, percent: null };
  assertThrowsCode(() => evaluateLotComparison(baselinePairs(), limits), 'limits-malformed');
});

test('a non-integer maxOutlierPairs throws limits-malformed', () => {
  const limits = baselineLimits();
  (limits as unknown as { maxOutlierPairs: number }).maxOutlierPairs = 1.5;
  assertThrowsCode(() => evaluateLotComparison(baselinePairs(), limits), 'limits-malformed');
});

test('a duplicate specimen identifier throws duplicate-specimen-id', () => {
  const pairs = baselinePairs();
  pairs[1] = { ...pairs[1], specimenId: pairs[0].specimenId };
  assertThrowsCode(() => evaluateLotComparison(pairs, baselineLimits()), 'duplicate-specimen-id');
});

test('a pair missing a specimen identifier throws pair-malformed', () => {
  const pairs = baselinePairs();
  delete (pairs[0] as Partial<LotComparisonPair>).specimenId;
  assertThrowsCode(() => evaluateLotComparison(pairs, baselineLimits()), 'pair-malformed');
});

test('a non-finite old value throws old-value-invalid', () => {
  const pairs = baselinePairs();
  (pairs[0] as unknown as { oldValue: unknown }).oldValue = 'not-a-number';
  assertThrowsCode(() => evaluateLotComparison(pairs, baselineLimits()), 'old-value-invalid');
});

test('a non-finite new value throws new-value-invalid', () => {
  const pairs = baselinePairs();
  (pairs[0] as unknown as { newValue: unknown }).newValue = Number.POSITIVE_INFINITY;
  assertThrowsCode(() => evaluateLotComparison(pairs, baselineLimits()), 'new-value-invalid');
});

test('a numeric-looking string value is accepted as numeric', () => {
  const pairs = baselinePairs();
  (pairs[0] as unknown as { oldValue: unknown }).oldValue = '100';
  const result = evaluateLotComparison(pairs, baselineLimits());
  assert.equal(result.decision, 'accept');
});

test('a missing old unit throws old-unit-missing', () => {
  const pairs = baselinePairs();
  delete pairs[0].oldUnit;
  assertThrowsCode(() => evaluateLotComparison(pairs, baselineLimits()), 'old-unit-missing');
});

test('a missing new unit throws new-unit-missing', () => {
  const pairs = baselinePairs();
  delete pairs[0].newUnit;
  assertThrowsCode(() => evaluateLotComparison(pairs, baselineLimits()), 'new-unit-missing');
});

test('an old unit mismatched with the declared comparison unit throws old-unit-mismatched', () => {
  const pairs = baselinePairs();
  pairs[0].oldUnit = 'g/dL';
  assertThrowsCode(() => evaluateLotComparison(pairs, baselineLimits()), 'old-unit-mismatched');
});

test('a new unit mismatched with the declared comparison unit throws new-unit-mismatched', () => {
  const pairs = baselinePairs();
  pairs[0].newUnit = 'g/dL';
  assertThrowsCode(() => evaluateLotComparison(pairs, baselineLimits()), 'new-unit-mismatched');
});

test('unit comparison ignores outer whitespace and case', () => {
  const pairs = baselinePairs();
  pairs[0].oldUnit = '  MG/DL  ';
  pairs[0].newUnit = 'Mg/Dl';
  const result = evaluateLotComparison(pairs, baselineLimits());
  assert.equal(result.decision, 'accept');
});

test('unit comparison never infers a conversion: g/dL still mismatches mg/dL', () => {
  const pairs = baselinePairs();
  pairs.forEach((pair) => {
    pair.oldUnit = 'g/dL';
    pair.newUnit = 'g/dL';
  });
  assertThrowsCode(() => evaluateLotComparison(pairs, baselineLimits()), 'old-unit-mismatched');
});

test('a typed error message never echoes any submitted specimen identifier', () => {
  const pairs = baselinePairs();
  delete (pairs[0] as Partial<LotComparisonPair>).specimenId;
  try {
    evaluateLotComparison(pairs, baselineLimits());
    assert.fail('expected evaluateLotComparison to throw');
  } catch (error) {
    assert.ok(error instanceof LotComparisonError);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch((error as Error).message, pattern);
    }
    assert.doesNotMatch((error as Error).message, /spec-synthetic/);
  }
});

test('every error code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_ERROR_CODES) {
    const message = explainLotComparisonError(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /spec-synthetic/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('every governing criterion has a non-empty, privacy-safe explanation', () => {
  for (const criterion of ALL_GOVERNING_CRITERIA) {
    const message = explainLotComparisonCriterion(criterion);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(explainLotComparisonError('pairs-below-minimum'), explainLotComparisonError('pairs-below-minimum'));
  assert.equal(
    explainLotComparisonCriterion('mean-difference-exceeded'),
    explainLotComparisonCriterion('mean-difference-exceeded'),
  );
});

test('no decision or criterion ever uses approval, compliance, accreditation, or release language', () => {
  const decisions: string[] = ['accept', 'reject'];
  for (const value of [...decisions, ...ALL_GOVERNING_CRITERIA]) {
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(value, pattern);
    }
  }
});
