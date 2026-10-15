import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MethodComparisonError,
  evaluateMethodComparison,
  explainMethodComparisonError,
  type MethodComparisonDeclaration,
  type MethodComparisonPair,
} from '../../lib/ohworks-method-comparison';

function declaration(maxMeanDifference: number | null = null, maxPercentBias: number | null = 5): MethodComparisonDeclaration {
  return { minPairs: 2, unit: 'mg/dL', loaMultiplier: 1.96, allowableBias: { maxMeanDifference, maxPercentBias } };
}

// All values and identifiers are synthetic.
function pairs(references: number[], difference: number): MethodComparisonPair[] {
  return references.map((referenceValue, index) => ({
    specimenId: `synthetic-${index}`,
    referenceValue,
    referenceUnit: 'mg/dL',
    candidateValue: referenceValue + difference,
    candidateUnit: 'mg/dL',
  }));
}

for (const difference of [100, 0]) {
  test(`zero reference mean with difference ${difference} cannot resolve a sole percent-bias criterion`, () => {
    assert.throws(() => evaluateMethodComparison(pairs([-10, 10], difference), declaration()), (error: unknown) => {
      assert.ok(error instanceof MethodComparisonError);
      assert.equal(error.code, 'percent-bias-unavailable');
      assert.equal(error.message, 'Percent bias cannot be evaluated because the mean reference-method value is zero and no absolute mean-difference limit is declared.');
      assert.equal(explainMethodComparisonError(error.code), error.message);
      return true;
    });
  });
}

test('zero reference mean retains null percent bias and uses a declared absolute limit', () => {
  for (const percentLimit of [null, 5]) {
    for (const absoluteLimit of [5, 100]) {
      const result = evaluateMethodComparison(pairs([-10, 10], 100), declaration(absoluteLimit, percentLimit));
      assert.equal(result.percentBias, null);
      assert.equal(result.meanDifference, 100);
      assert.equal(result.decision, absoluteLimit === 5 ? 'not-acceptable' : 'acceptable');
      assert.equal(result.governingCriterion, absoluteLimit === 5 ? 'mean-difference-exceeded' : 'within-allowable-bias');
    }
  }
});

test('nonzero reference mean still evaluates a sole percent-bias criterion', () => {
  for (const difference of [1, 2]) {
    const result = evaluateMethodComparison(pairs([10, 30], difference), declaration());
    assert.equal(result.meanDifference, difference);
    assert.equal(result.percentBias, difference * 5);
    assert.equal(result.decision, difference === 1 ? 'acceptable' : 'not-acceptable');
    assert.equal(result.governingCriterion, difference === 1 ? 'within-allowable-bias' : 'percent-bias-exceeded');
  }
});

test('insufficient reference spread retains precedence over unavailable percent bias', () => {
  assert.throws(() => evaluateMethodComparison(pairs([0, 0], 100), declaration()), (error: unknown) => {
    assert.ok(error instanceof MethodComparisonError);
    assert.equal(error.code, 'insufficient-reference-value-spread');
    return true;
  });
});
