import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LotComparisonError,
  evaluateLotComparison,
  type LotComparisonLimits,
  type LotComparisonPair,
} from '../lib/ohworks-lot-comparison';

/**
 * All fabricated: synthetic specimen identifiers and made-up numeric values.
 * None of this represents a real patient, specimen, or instrument result.
 */

function assertUnavailablePercent(fn: () => unknown): void {
  assert.throws(
    fn,
    (error: unknown) => {
      assert.ok(error instanceof LotComparisonError);
      assert.equal((error as LotComparisonError).code, 'percent-criterion-unavailable');
      return true;
    },
  );
}

test('reproduces the defect input: zero old-lot baseline with a declared per-pair percent limit now rejects instead of falsely accepting', () => {
  const limits: LotComparisonLimits = {
    minPairs: 1,
    unit: 'u',
    allowableDifference: { absolute: null, percent: 5 },
    maxMeanDifference: null,
    maxPercentBias: 5,
    maxOutlierPairs: 0,
  };
  const pairs: LotComparisonPair[] = [
    { specimenId: 's1', oldValue: 0, oldUnit: 'u', newValue: 100, newUnit: 'u' },
  ];
  assertUnavailablePercent(() => evaluateLotComparison(pairs, limits));
});

test('a per-pair percent criterion that cannot be evaluated because oldValue is zero throws percent-criterion-unavailable', () => {
  const limits: LotComparisonLimits = {
    minPairs: 2,
    unit: 'u',
    allowableDifference: { absolute: null, percent: 5 },
    maxMeanDifference: null,
    maxPercentBias: null,
    maxOutlierPairs: 0,
  };
  const pairs: LotComparisonPair[] = [
    { specimenId: 's1', oldValue: 0, oldUnit: 'u', newValue: 5, newUnit: 'u' },
    { specimenId: 's2', oldValue: 10, oldUnit: 'u', newValue: 10, newUnit: 'u' },
  ];
  assertUnavailablePercent(() => evaluateLotComparison(pairs, limits));
});

test('an aggregate percent-bias criterion that cannot be evaluated because the mean old-lot value is zero throws percent-criterion-unavailable', () => {
  const limits: LotComparisonLimits = {
    minPairs: 2,
    unit: 'u',
    allowableDifference: { absolute: 100, percent: null },
    maxMeanDifference: null,
    maxPercentBias: 5,
    maxOutlierPairs: 5,
  };
  // Opposing baselines sum to zero: mean old-lot value is 0, so percent bias is unevaluable.
  const pairs: LotComparisonPair[] = [
    { specimenId: 's1', oldValue: 10, oldUnit: 'u', newValue: 11, newUnit: 'u' },
    { specimenId: 's2', oldValue: -10, oldUnit: 'u', newValue: -9, newUnit: 'u' },
  ];
  assertUnavailablePercent(() => evaluateLotComparison(pairs, limits));
});

test('a declared per-pair percent limit with an ordinary nonzero old value evaluates normally and can still accept', () => {
  const limits: LotComparisonLimits = {
    minPairs: 2,
    unit: 'u',
    allowableDifference: { absolute: null, percent: 5 },
    maxMeanDifference: null,
    maxPercentBias: null,
    maxOutlierPairs: 0,
  };
  const pairs: LotComparisonPair[] = [
    { specimenId: 's1', oldValue: 100, oldUnit: 'u', newValue: 101, newUnit: 'u' },
    { specimenId: 's2', oldValue: 100, oldUnit: 'u', newValue: 99, newUnit: 'u' },
  ];
  const result = evaluateLotComparison(pairs, limits);
  assert.equal(result.decision, 'accept');
  assert.equal(result.pairDifferences[0].percentDifference, 1);
  assert.equal(result.pairDifferences[1].percentDifference, -1);
});

test('a declared per-pair percent limit with an ordinary nonzero old value evaluates normally and can still reject', () => {
  const limits: LotComparisonLimits = {
    minPairs: 2,
    unit: 'u',
    allowableDifference: { absolute: null, percent: 5 },
    maxMeanDifference: null,
    maxPercentBias: null,
    maxOutlierPairs: 0,
  };
  const pairs: LotComparisonPair[] = [
    { specimenId: 's1', oldValue: 100, oldUnit: 'u', newValue: 110, newUnit: 'u' },
    { specimenId: 's2', oldValue: 100, oldUnit: 'u', newValue: 99, newUnit: 'u' },
  ];
  const result = evaluateLotComparison(pairs, limits);
  assert.equal(result.decision, 'reject');
  assert.equal(result.governingCriterion, 'outlier-count-exceeded');
});

test('a declared aggregate percent-bias limit with an ordinary nonzero mean old value evaluates normally', () => {
  const limits: LotComparisonLimits = {
    minPairs: 2,
    unit: 'u',
    allowableDifference: { absolute: 100, percent: null },
    maxMeanDifference: null,
    maxPercentBias: 5,
    maxOutlierPairs: 5,
  };
  const pairs: LotComparisonPair[] = [
    { specimenId: 's1', oldValue: 100, oldUnit: 'u', newValue: 101, newUnit: 'u' },
    { specimenId: 's2', oldValue: 100, oldUnit: 'u', newValue: 99, newUnit: 'u' },
  ];
  const result = evaluateLotComparison(pairs, limits);
  assert.equal(result.decision, 'accept');
  assert.equal(result.percentBias, 0);
});

test('absolute-only comparisons continue to work: a zero old-lot baseline does not throw when no percent criterion is declared', () => {
  const limits: LotComparisonLimits = {
    minPairs: 1,
    unit: 'u',
    allowableDifference: { absolute: 5, percent: null },
    maxMeanDifference: null,
    maxPercentBias: null,
    maxOutlierPairs: 0,
  };
  const pairs: LotComparisonPair[] = [
    { specimenId: 's1', oldValue: 0, oldUnit: 'u', newValue: 1, newUnit: 'u' },
  ];
  const result = evaluateLotComparison(pairs, limits);
  assert.equal(result.decision, 'accept');
  assert.equal(result.pairDifferences[0].percentDifference, null);
  assert.equal(result.percentBias, null);
});

test('absolute-only comparisons continue to work: opposing zero-sum baselines do not throw when no aggregate percent-bias criterion is declared', () => {
  const limits: LotComparisonLimits = {
    minPairs: 2,
    unit: 'u',
    allowableDifference: { absolute: 5, percent: null },
    maxMeanDifference: null,
    maxPercentBias: null,
    maxOutlierPairs: 0,
  };
  const pairs: LotComparisonPair[] = [
    { specimenId: 's1', oldValue: 10, oldUnit: 'u', newValue: 11, newUnit: 'u' },
    { specimenId: 's2', oldValue: -10, oldUnit: 'u', newValue: -9, newUnit: 'u' },
  ];
  const result = evaluateLotComparison(pairs, limits);
  assert.equal(result.decision, 'accept');
  assert.equal(result.percentBias, null);
});

test('absolute-only comparisons can still reject on the absolute criterion with a zero baseline', () => {
  const limits: LotComparisonLimits = {
    minPairs: 1,
    unit: 'u',
    allowableDifference: { absolute: 5, percent: null },
    maxMeanDifference: null,
    maxPercentBias: null,
    maxOutlierPairs: 0,
  };
  const pairs: LotComparisonPair[] = [
    { specimenId: 's1', oldValue: 0, oldUnit: 'u', newValue: 100, newUnit: 'u' },
  ];
  const result = evaluateLotComparison(pairs, limits);
  assert.equal(result.decision, 'reject');
  assert.equal(result.governingCriterion, 'outlier-count-exceeded');
});

test('percent-criterion-unavailable has a non-empty, privacy-safe explanation that never echoes submitted values', () => {
  const limits: LotComparisonLimits = {
    minPairs: 1,
    unit: 'u',
    allowableDifference: { absolute: null, percent: 5 },
    maxMeanDifference: null,
    maxPercentBias: null,
    maxOutlierPairs: 0,
  };
  const pairs: LotComparisonPair[] = [
    { specimenId: 'spec-synthetic-secret', oldValue: 0, oldUnit: 'u', newValue: 100, newUnit: 'u' },
  ];
  try {
    evaluateLotComparison(pairs, limits);
    assert.fail('expected evaluateLotComparison to throw');
  } catch (error) {
    assert.ok(error instanceof LotComparisonError);
    assert.equal((error as LotComparisonError).code, 'percent-criterion-unavailable');
    assert.ok((error as Error).message.length > 0);
    assert.doesNotMatch((error as Error).message, /spec-synthetic/);
    assert.doesNotMatch((error as Error).message, /100/);
  }
});
