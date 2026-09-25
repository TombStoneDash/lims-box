import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MethodComparisonError,
  evaluateMethodComparison,
  explainMethodComparisonCriterion,
  explainMethodComparisonError,
  type MethodComparisonDeclaration,
  type MethodComparisonErrorCode,
  type MethodComparisonGoverningCriterion,
  type MethodComparisonPair,
} from '../../lib/ohworks-method-comparison';

/**
 * All fabricated: synthetic specimen identifiers and made-up numeric values.
 * None of this represents a real patient, specimen, or instrument result.
 */
function baselineDeclaration(): MethodComparisonDeclaration {
  return {
    minPairs: 5,
    unit: 'mg/dL',
    loaMultiplier: 1.96,
    allowableBias: { maxMeanDifference: 2, maxPercentBias: 5 },
  };
}

function baselinePairs(): MethodComparisonPair[] {
  return [
    { specimenId: 'spec-synthetic-1', referenceValue: 10, referenceUnit: 'mg/dL', candidateValue: 11, candidateUnit: 'mg/dL' },
    { specimenId: 'spec-synthetic-2', referenceValue: 20, referenceUnit: 'mg/dL', candidateValue: 21, candidateUnit: 'mg/dL' },
    { specimenId: 'spec-synthetic-3', referenceValue: 30, referenceUnit: 'mg/dL', candidateValue: 29, candidateUnit: 'mg/dL' },
    { specimenId: 'spec-synthetic-4', referenceValue: 40, referenceUnit: 'mg/dL', candidateValue: 41, candidateUnit: 'mg/dL' },
    { specimenId: 'spec-synthetic-5', referenceValue: 50, referenceUnit: 'mg/dL', candidateValue: 51, candidateUnit: 'mg/dL' },
  ];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function approxEqual(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

const ALL_ERROR_CODES: MethodComparisonErrorCode[] = [
  'declaration-malformed',
  'pairs-not-array',
  'pairs-below-minimum',
  'duplicate-specimen-id',
  'pair-malformed',
  'reference-value-invalid',
  'candidate-value-invalid',
  'reference-unit-missing',
  'candidate-unit-missing',
  'reference-unit-mismatched',
  'candidate-unit-mismatched',
  'insufficient-reference-value-spread',
];

const ALL_GOVERNING_CRITERIA: MethodComparisonGoverningCriterion[] = [
  'within-allowable-bias',
  'mean-difference-exceeded',
  'percent-bias-exceeded',
];

const FORBIDDEN_WORDS = [/approved/i, /compliant/i, /accredited/i, /releasable/i];

function assertThrowsCode(fn: () => unknown, code: MethodComparisonErrorCode): void {
  assert.throws(
    fn,
    (error: unknown) => {
      assert.ok(error instanceof MethodComparisonError);
      assert.equal((error as MethodComparisonError).code, code);
      return true;
    },
  );
}

test('a well-behaved set of pairs is acceptable with within-allowable-bias as the governing criterion', () => {
  const result = evaluateMethodComparison(baselinePairs(), baselineDeclaration());
  assert.equal(result.decision, 'acceptable');
  assert.equal(result.governingCriterion, 'within-allowable-bias');
  assert.equal(result.pairCount, 5);
});

test('mean difference is the signed mean of (candidate - reference)', () => {
  const result = evaluateMethodComparison(baselinePairs(), baselineDeclaration());
  // deltas: +1, +1, -1, +1, +1 => mean 0.6
  approxEqual(result.meanDifference, 0.6);
});

test('standard deviation of differences uses the sample (n-1) formula', () => {
  const result = evaluateMethodComparison(baselinePairs(), baselineDeclaration());
  // deviations from mean 0.6: 0.4, 0.4, -1.6, 0.4, 0.4 => sum of squares 3.2, /4 = 0.8
  approxEqual(result.standardDeviationOfDifferences, Math.sqrt(0.8));
});

test('limits of agreement are mean difference plus and minus the declared multiplier times the standard deviation', () => {
  const result = evaluateMethodComparison(baselinePairs(), baselineDeclaration());
  const sd = Math.sqrt(0.8);
  assert.equal(result.limitsOfAgreement.multiplier, 1.96);
  approxEqual(result.limitsOfAgreement.lower, 0.6 - 1.96 * sd);
  approxEqual(result.limitsOfAgreement.upper, 0.6 + 1.96 * sd);
});

test('percent bias is the mean difference relative to the mean reference value', () => {
  const result = evaluateMethodComparison(baselinePairs(), baselineDeclaration());
  // mean reference value is 30, mean difference is 0.6 => 2%
  approxEqual(result.percentBias as number, 2);
});

test('percent bias is null when the mean reference value is zero', () => {
  const declaration = baselineDeclaration();
  declaration.minPairs = 2;
  const pairs: MethodComparisonPair[] = [
    { specimenId: 's1', referenceValue: -10, referenceUnit: 'mg/dL', candidateValue: -9, candidateUnit: 'mg/dL' },
    { specimenId: 's2', referenceValue: 10, referenceUnit: 'mg/dL', candidateValue: 11, candidateUnit: 'mg/dL' },
  ];
  const result = evaluateMethodComparison(pairs, declaration);
  assert.equal(result.percentBias, null);
});

test('a per-pair percent difference is null when that pair reference value is zero', () => {
  const pairs = baselinePairs();
  pairs[0] = { specimenId: 'spec-synthetic-1', referenceValue: 0, referenceUnit: 'mg/dL', candidateValue: 1, candidateUnit: 'mg/dL' };
  const result = evaluateMethodComparison(pairs, baselineDeclaration());
  assert.equal(result.pairDifferences[0].percentDifference, null);
});

test('the Passing-Bablok slope is the median of pairwise slopes between distinct-reference-value pairs', () => {
  const result = evaluateMethodComparison(baselinePairs(), baselineDeclaration());
  // pairwise slopes: 1, 0.9, 1, 1, 0.8, 1, 1, 1.2, 1.1, 1 => sorted median is 1
  approxEqual(result.passingBablok.slope, 1);
  assert.equal(result.passingBablok.pairwiseSlopeCount, 10);
});

test('the Passing-Bablok intercept is the median of (candidateValue - slope * referenceValue)', () => {
  const result = evaluateMethodComparison(baselinePairs(), baselineDeclaration());
  // with slope 1: candidate - reference => 1, 1, -1, 1, 1 => median 1
  approxEqual(result.passingBablok.intercept, 1);
});

test('a reference value set with no spread throws insufficient-reference-value-spread', () => {
  const declaration = baselineDeclaration();
  declaration.minPairs = 2;
  const pairs: MethodComparisonPair[] = [
    { specimenId: 's1', referenceValue: 100, referenceUnit: 'mg/dL', candidateValue: 101, candidateUnit: 'mg/dL' },
    { specimenId: 's2', referenceValue: 100, referenceUnit: 'mg/dL', candidateValue: 99, candidateUnit: 'mg/dL' },
  ];
  assertThrowsCode(() => evaluateMethodComparison(pairs, declaration), 'insufficient-reference-value-spread');
});

test('evaluation is pure: it does not mutate input pairs or declaration', () => {
  const pairs = baselinePairs();
  const declaration = baselineDeclaration();
  const beforePairs = JSON.stringify(pairs);
  const beforeDeclaration = JSON.stringify(declaration);
  evaluateMethodComparison(pairs, declaration);
  assert.equal(JSON.stringify(pairs), beforePairs);
  assert.equal(JSON.stringify(declaration), beforeDeclaration);
});

test('evaluation is deterministic across repeated calls', () => {
  const pairs = baselinePairs();
  const declaration = baselineDeclaration();
  const first = evaluateMethodComparison(pairs, declaration);
  const second = evaluateMethodComparison(clone(pairs), clone(declaration));
  assert.deepEqual(first, second);
});

test('a decision other than acceptable or not-acceptable is never produced', () => {
  const result = evaluateMethodComparison(baselinePairs(), baselineDeclaration());
  assert.ok(['acceptable', 'not-acceptable'].includes(result.decision));
});

test('the returned result is frozen, including nested structures', () => {
  const result = evaluateMethodComparison(baselinePairs(), baselineDeclaration());
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.limitsOfAgreement));
  assert.ok(Object.isFrozen(result.passingBablok));
  assert.ok(Object.isFrozen(result.pairDifferences));
  assert.ok(Object.isFrozen(result.pairDifferences[0]));
});

test('a mean difference exactly at the declared limit does not reject', () => {
  const declaration = baselineDeclaration();
  declaration.allowableBias = { maxMeanDifference: 0.6, maxPercentBias: null };
  const result = evaluateMethodComparison(baselinePairs(), declaration); // mean difference is exactly 0.6
  assert.equal(result.decision, 'acceptable');
});

test('a mean difference exceeding the declared limit rejects with mean-difference-exceeded', () => {
  const declaration = baselineDeclaration();
  declaration.allowableBias = { maxMeanDifference: 0.5, maxPercentBias: null };
  const result = evaluateMethodComparison(baselinePairs(), declaration); // mean difference is 0.6
  assert.equal(result.decision, 'not-acceptable');
  assert.equal(result.governingCriterion, 'mean-difference-exceeded');
});

test('a percent bias exceeding the declared limit rejects with percent-bias-exceeded when mean difference is within limit', () => {
  const declaration: MethodComparisonDeclaration = {
    minPairs: 3,
    unit: 'mg/dL',
    loaMultiplier: 2,
    allowableBias: { maxMeanDifference: 100, maxPercentBias: 5 },
  };
  const pairs: MethodComparisonPair[] = [
    { specimenId: 's1', referenceValue: 5, referenceUnit: 'mg/dL', candidateValue: 6, candidateUnit: 'mg/dL' },
    { specimenId: 's2', referenceValue: 10, referenceUnit: 'mg/dL', candidateValue: 11, candidateUnit: 'mg/dL' },
    { specimenId: 's3', referenceValue: 15, referenceUnit: 'mg/dL', candidateValue: 16, candidateUnit: 'mg/dL' },
  ];
  const result = evaluateMethodComparison(pairs, declaration);
  assert.equal(result.decision, 'not-acceptable');
  assert.equal(result.governingCriterion, 'percent-bias-exceeded');
  approxEqual(result.percentBias as number, 10);
});

test('mean-difference-exceeded takes priority over percent-bias-exceeded', () => {
  const declaration: MethodComparisonDeclaration = {
    minPairs: 3,
    unit: 'mg/dL',
    loaMultiplier: 2,
    allowableBias: { maxMeanDifference: 0, maxPercentBias: 0 },
  };
  const pairs: MethodComparisonPair[] = [
    { specimenId: 's1', referenceValue: 5, referenceUnit: 'mg/dL', candidateValue: 6, candidateUnit: 'mg/dL' },
    { specimenId: 's2', referenceValue: 10, referenceUnit: 'mg/dL', candidateValue: 11, candidateUnit: 'mg/dL' },
    { specimenId: 's3', referenceValue: 15, referenceUnit: 'mg/dL', candidateValue: 16, candidateUnit: 'mg/dL' },
  ];
  const result = evaluateMethodComparison(pairs, declaration);
  assert.equal(result.decision, 'not-acceptable');
  assert.equal(result.governingCriterion, 'mean-difference-exceeded');
});

test('fewer pairs than the declared minimum throws pairs-below-minimum', () => {
  const pairs = baselinePairs().slice(0, 4);
  assertThrowsCode(() => evaluateMethodComparison(pairs, baselineDeclaration()), 'pairs-below-minimum');
});

test('a non-array pairs input throws pairs-not-array', () => {
  assertThrowsCode(
    () => evaluateMethodComparison('not-an-array' as unknown as MethodComparisonPair[], baselineDeclaration()),
    'pairs-not-array',
  );
});

test('malformed declared parameters throw declaration-malformed', () => {
  assertThrowsCode(
    () => evaluateMethodComparison(baselinePairs(), {} as unknown as MethodComparisonDeclaration),
    'declaration-malformed',
  );
});

test('declared parameters with minPairs below 2 throw declaration-malformed', () => {
  const declaration = baselineDeclaration();
  (declaration as unknown as { minPairs: number }).minPairs = 1;
  assertThrowsCode(() => evaluateMethodComparison(baselinePairs(), declaration), 'declaration-malformed');
});

test('declared parameters with a non-integer minPairs throw declaration-malformed', () => {
  const declaration = baselineDeclaration();
  (declaration as unknown as { minPairs: number }).minPairs = 2.5;
  assertThrowsCode(() => evaluateMethodComparison(baselinePairs(), declaration), 'declaration-malformed');
});

test('declared parameters with a non-positive loaMultiplier throw declaration-malformed', () => {
  const declaration = baselineDeclaration();
  declaration.loaMultiplier = 0;
  assertThrowsCode(() => evaluateMethodComparison(baselinePairs(), declaration), 'declaration-malformed');
});

test('declared parameters with a non-finite loaMultiplier throw declaration-malformed', () => {
  const declaration = baselineDeclaration();
  (declaration as unknown as { loaMultiplier: number }).loaMultiplier = Number.POSITIVE_INFINITY;
  assertThrowsCode(() => evaluateMethodComparison(baselinePairs(), declaration), 'declaration-malformed');
});

test('declared allowable bias with both axes null throws declaration-malformed', () => {
  const declaration = baselineDeclaration();
  declaration.allowableBias = { maxMeanDifference: null, maxPercentBias: null };
  assertThrowsCode(() => evaluateMethodComparison(baselinePairs(), declaration), 'declaration-malformed');
});

test('declared allowable bias with a negative axis throws declaration-malformed', () => {
  const declaration = baselineDeclaration();
  declaration.allowableBias = { maxMeanDifference: -1, maxPercentBias: null };
  assertThrowsCode(() => evaluateMethodComparison(baselinePairs(), declaration), 'declaration-malformed');
});

test('a duplicate specimen identifier throws duplicate-specimen-id', () => {
  const pairs = baselinePairs();
  pairs[1] = { ...pairs[1], specimenId: pairs[0].specimenId };
  assertThrowsCode(() => evaluateMethodComparison(pairs, baselineDeclaration()), 'duplicate-specimen-id');
});

test('a pair missing a specimen identifier throws pair-malformed', () => {
  const pairs = baselinePairs();
  delete (pairs[0] as Partial<MethodComparisonPair>).specimenId;
  assertThrowsCode(() => evaluateMethodComparison(pairs, baselineDeclaration()), 'pair-malformed');
});

test('a non-finite reference value throws reference-value-invalid', () => {
  const pairs = baselinePairs();
  (pairs[0] as unknown as { referenceValue: unknown }).referenceValue = 'not-a-number';
  assertThrowsCode(() => evaluateMethodComparison(pairs, baselineDeclaration()), 'reference-value-invalid');
});

test('a non-finite candidate value throws candidate-value-invalid', () => {
  const pairs = baselinePairs();
  (pairs[0] as unknown as { candidateValue: unknown }).candidateValue = Number.POSITIVE_INFINITY;
  assertThrowsCode(() => evaluateMethodComparison(pairs, baselineDeclaration()), 'candidate-value-invalid');
});

test('a numeric-looking string value is accepted as numeric', () => {
  const pairs = baselinePairs();
  (pairs[0] as unknown as { referenceValue: unknown }).referenceValue = '10';
  const result = evaluateMethodComparison(pairs, baselineDeclaration());
  assert.equal(result.decision, 'acceptable');
});

test('a missing reference unit throws reference-unit-missing', () => {
  const pairs = baselinePairs();
  delete pairs[0].referenceUnit;
  assertThrowsCode(() => evaluateMethodComparison(pairs, baselineDeclaration()), 'reference-unit-missing');
});

test('a missing candidate unit throws candidate-unit-missing', () => {
  const pairs = baselinePairs();
  delete pairs[0].candidateUnit;
  assertThrowsCode(() => evaluateMethodComparison(pairs, baselineDeclaration()), 'candidate-unit-missing');
});

test('a reference unit mismatched with the declared comparison unit throws reference-unit-mismatched', () => {
  const pairs = baselinePairs();
  pairs[0].referenceUnit = 'g/dL';
  assertThrowsCode(() => evaluateMethodComparison(pairs, baselineDeclaration()), 'reference-unit-mismatched');
});

test('a candidate unit mismatched with the declared comparison unit throws candidate-unit-mismatched', () => {
  const pairs = baselinePairs();
  pairs[0].candidateUnit = 'g/dL';
  assertThrowsCode(() => evaluateMethodComparison(pairs, baselineDeclaration()), 'candidate-unit-mismatched');
});

test('unit comparison ignores outer whitespace and case', () => {
  const pairs = baselinePairs();
  pairs[0].referenceUnit = '  MG/DL  ';
  pairs[0].candidateUnit = 'Mg/Dl';
  const result = evaluateMethodComparison(pairs, baselineDeclaration());
  assert.equal(result.decision, 'acceptable');
});

test('unit comparison never infers a conversion: g/dL still mismatches mg/dL', () => {
  const pairs = baselinePairs();
  pairs.forEach((pair) => {
    pair.referenceUnit = 'g/dL';
    pair.candidateUnit = 'g/dL';
  });
  assertThrowsCode(() => evaluateMethodComparison(pairs, baselineDeclaration()), 'reference-unit-mismatched');
});

test('a typed error message never echoes any submitted specimen identifier', () => {
  const pairs = baselinePairs();
  delete (pairs[0] as Partial<MethodComparisonPair>).specimenId;
  try {
    evaluateMethodComparison(pairs, baselineDeclaration());
    assert.fail('expected evaluateMethodComparison to throw');
  } catch (error) {
    assert.ok(error instanceof MethodComparisonError);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch((error as Error).message, pattern);
    }
    assert.doesNotMatch((error as Error).message, /spec-synthetic/);
  }
});

test('every error code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_ERROR_CODES) {
    const message = explainMethodComparisonError(code);
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
    const message = explainMethodComparisonCriterion(criterion);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(explainMethodComparisonError('pairs-below-minimum'), explainMethodComparisonError('pairs-below-minimum'));
  assert.equal(
    explainMethodComparisonCriterion('mean-difference-exceeded'),
    explainMethodComparisonCriterion('mean-difference-exceeded'),
  );
});

test('no decision or criterion ever uses approval, compliance, accreditation, or release language', () => {
  const decisions: string[] = ['acceptable', 'not-acceptable'];
  for (const value of [...decisions, ...ALL_GOVERNING_CRITERIA]) {
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(value, pattern);
    }
  }
});
