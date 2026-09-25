import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MINIMUM_SUBJECT_COUNT,
  evaluateReferenceIntervalVerification,
  type ReferenceIntervalBounds,
  type ReferenceIntervalRule,
  type ReferenceIntervalSubjectResult,
} from '../../lib/ohworks-reference-interval-verification';

/**
 * All fabricated: synthetic subject identifiers and made-up analyte
 * concentrations. None of this represents a real patient, instrument, or
 * customer result.
 */
function interval(overrides: Partial<ReferenceIntervalBounds> = {}): ReferenceIntervalBounds {
  return { lowerBound: 10, upperBound: 20, unit: 'mg/dL', ...overrides };
}

function rule(overrides: Partial<ReferenceIntervalRule> = {}): ReferenceIntervalRule {
  return {
    minimumSubjectCount: MINIMUM_SUBJECT_COUNT,
    maxOutliersForVerified: 2,
    maxOutliersForMoreSubjects: 4,
    ...overrides,
  };
}

function subjects(
  results: number[],
  overrides: Partial<ReferenceIntervalSubjectResult> = {},
): ReferenceIntervalSubjectResult[] {
  return results.map((result, index) => ({
    subjectId: `subj-${index + 1}`,
    result,
    unit: 'mg/dL',
    healthyDeclared: true,
    ...overrides,
  }));
}

/** Twenty results, all inside [10, 20]. */
function allWithinResults(): number[] {
  return [11, 12, 13, 14, 15, 16, 17, 18, 19, 15, 11, 12, 13, 14, 16, 17, 18, 19, 15, 14];
}

// ---------------------------------------------------------------------------
// Golden path
// ---------------------------------------------------------------------------

test('twenty subjects entirely within the interval is verified with zero outliers', () => {
  const result = evaluateReferenceIntervalVerification(interval(), subjects(allWithinResults()), rule());
  assert.equal(result.decision, 'verified');
  assert.equal(result.reasonCode, 'outliers-within-verified-limit');
  assert.equal(result.totalSubjects, 20);
  assert.equal(result.outsideCount, 0);
  assert.deepEqual(result.outliers, []);
});

test('results exactly at the interval bounds are within range, not outliers', () => {
  const results = allWithinResults();
  results[0] = 10;
  results[1] = 20;
  const result = evaluateReferenceIntervalVerification(interval(), subjects(results), rule());
  assert.equal(result.decision, 'verified');
  assert.equal(result.outsideCount, 0);
});

// ---------------------------------------------------------------------------
// Outlier count decides verified vs verify_with_more_subjects vs rejected
// ---------------------------------------------------------------------------

test('exactly the declared max allowed outliers (two of twenty) is verified', () => {
  const results = allWithinResults();
  results[0] = 5;
  results[1] = 25;
  const result = evaluateReferenceIntervalVerification(interval(), subjects(results), rule());
  assert.equal(result.decision, 'verified');
  assert.equal(result.reasonCode, 'outliers-within-verified-limit');
  assert.equal(result.outsideCount, 2);
  assert.deepEqual(
    result.outliers.map((o) => [o.subjectId, o.direction]),
    [
      ['subj-1', 'below'],
      ['subj-2', 'above'],
    ],
  );
});

test('three of twenty outside the verified limit but within the more-subjects limit requires more subjects', () => {
  const results = allWithinResults();
  results[0] = 5;
  results[1] = 25;
  results[2] = 6;
  const result = evaluateReferenceIntervalVerification(interval(), subjects(results), rule());
  assert.equal(result.decision, 'verify_with_more_subjects');
  assert.equal(result.reasonCode, 'outliers-require-more-subjects');
  assert.equal(result.outsideCount, 3);
});

test('outliers exactly at the more-subjects limit still requires more subjects, not rejected', () => {
  const results = allWithinResults();
  results[0] = 5;
  results[1] = 25;
  results[2] = 6;
  results[3] = 26;
  const result = evaluateReferenceIntervalVerification(interval(), subjects(results), rule());
  assert.equal(result.decision, 'verify_with_more_subjects');
  assert.equal(result.reasonCode, 'outliers-require-more-subjects');
  assert.equal(result.outsideCount, 4);
});

test('outliers beyond the declared more-subjects limit is rejected, reporting every outlier', () => {
  const results = allWithinResults();
  results[0] = 5;
  results[1] = 25;
  results[2] = 6;
  results[3] = 26;
  results[4] = 7;
  const result = evaluateReferenceIntervalVerification(interval(), subjects(results), rule());
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'outliers-exceed-rejection-limit');
  assert.equal(result.outsideCount, 5);
  assert.equal(result.outliers.length, 5);
});

// ---------------------------------------------------------------------------
// Fail closed: fewer than the minimum subjects
// ---------------------------------------------------------------------------

test('nineteen subjects is rejected as insufficient-subjects', () => {
  const result = evaluateReferenceIntervalVerification(interval(), subjects(allWithinResults().slice(0, 19)), rule());
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'insufficient-subjects');
  assert.equal(result.totalSubjects, 19);
  assert.deepEqual(result.outliers, []);
});

test('zero subjects is rejected as insufficient-subjects', () => {
  const result = evaluateReferenceIntervalVerification(interval(), [], rule());
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'insufficient-subjects');
  assert.equal(result.totalSubjects, 0);
});

test('a rule declaring a minimum subject count below twenty is rejected as rule-malformed', () => {
  const result = evaluateReferenceIntervalVerification(
    interval(),
    subjects(allWithinResults()),
    rule({ minimumSubjectCount: 19 }),
  );
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'rule-malformed');
});

test('a rule whose more-subjects limit is below its verified limit is rejected as rule-malformed', () => {
  const result = evaluateReferenceIntervalVerification(
    interval(),
    subjects(allWithinResults()),
    rule({ maxOutliersForVerified: 3, maxOutliersForMoreSubjects: 2 }),
  );
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'rule-malformed');
});

test('a non-integer outlier limit in the rule is rejected as rule-malformed', () => {
  const result = evaluateReferenceIntervalVerification(
    interval(),
    subjects(allWithinResults()),
    rule({ maxOutliersForVerified: 1.5 }),
  );
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'rule-malformed');
});

// ---------------------------------------------------------------------------
// Fail closed: inverted interval
// ---------------------------------------------------------------------------

test('an inverted interval (lower bound above upper bound) is rejected as interval-inverted', () => {
  const result = evaluateReferenceIntervalVerification(
    interval({ lowerBound: 20, upperBound: 10 }),
    subjects(allWithinResults()),
    rule(),
  );
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'interval-inverted');
});

test('an interval with equal bounds is not inverted', () => {
  const results = new Array(20).fill(15);
  const result = evaluateReferenceIntervalVerification(
    interval({ lowerBound: 15, upperBound: 15 }),
    subjects(results),
    rule(),
  );
  assert.equal(result.decision, 'verified');
  assert.equal(result.outsideCount, 0);
});

test('a non-finite interval bound is rejected as interval-bound-non-finite', () => {
  const result = evaluateReferenceIntervalVerification(
    interval({ upperBound: NaN }),
    subjects(allWithinResults()),
    rule(),
  );
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'interval-bound-non-finite');
});

test('an Infinity interval bound is rejected as interval-bound-non-finite', () => {
  const result = evaluateReferenceIntervalVerification(
    interval({ lowerBound: -Infinity }),
    subjects(allWithinResults()),
    rule(),
  );
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'interval-bound-non-finite');
});

test('a blank interval unit is rejected as interval-unit-invalid', () => {
  const result = evaluateReferenceIntervalVerification(
    interval({ unit: '   ' }),
    subjects(allWithinResults()),
    rule(),
  );
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'interval-unit-invalid');
});

// ---------------------------------------------------------------------------
// Fail closed: unit mismatch
// ---------------------------------------------------------------------------

test('a subject reported in a different unit is rejected as unit-mismatch', () => {
  const input = subjects(allWithinResults());
  input[0] = { ...input[0], unit: 'mmol/L' };
  const result = evaluateReferenceIntervalVerification(interval(), input, rule());
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'unit-mismatch');
});

test('unit comparison is case- and whitespace-insensitive', () => {
  const input = subjects(allWithinResults());
  input[0] = { ...input[0], unit: '  MG/DL  ' };
  const result = evaluateReferenceIntervalVerification(interval(), input, rule());
  assert.equal(result.decision, 'verified');
});

// ---------------------------------------------------------------------------
// Fail closed: subject not declared healthy, or malformed
// ---------------------------------------------------------------------------

test('a subject not declared healthy is rejected as subject-not-declared-healthy', () => {
  const input = subjects(allWithinResults());
  input[5] = { ...input[5], healthyDeclared: false };
  const result = evaluateReferenceIntervalVerification(interval(), input, rule());
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'subject-not-declared-healthy');
});

test('a subject entry missing a required field is rejected as subject-malformed', () => {
  const input = subjects(allWithinResults()) as unknown[];
  const malformed = { ...(input[0] as object) } as Partial<ReferenceIntervalSubjectResult>;
  delete malformed.result;
  input[0] = malformed;
  const result = evaluateReferenceIntervalVerification(
    interval(),
    input as ReferenceIntervalSubjectResult[],
    rule(),
  );
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'subject-malformed');
});

test('a subject with a non-finite result is rejected as subject-malformed', () => {
  const input = subjects(allWithinResults());
  input[0] = { ...input[0], result: NaN };
  const result = evaluateReferenceIntervalVerification(interval(), input, rule());
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'subject-malformed');
});

test('a subject with a blank subject id is rejected as subject-malformed', () => {
  const input = subjects(allWithinResults());
  input[0] = { ...input[0], subjectId: '  ' };
  const result = evaluateReferenceIntervalVerification(interval(), input, rule());
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'subject-malformed');
});

test('a non-array subjects input is rejected as insufficient-subjects', () => {
  const result = evaluateReferenceIntervalVerification(
    interval(),
    null as unknown as ReferenceIntervalSubjectResult[],
    rule(),
  );
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'insufficient-subjects');
  assert.equal(result.totalSubjects, 0);
});

// ---------------------------------------------------------------------------
// Result shape is frozen and deterministic
// ---------------------------------------------------------------------------

test('the returned result and its outliers are frozen', () => {
  const results = allWithinResults();
  results[0] = 5;
  const result = evaluateReferenceIntervalVerification(interval(), subjects(results), rule());
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.outliers));
  assert.ok(Object.isFrozen(result.outliers[0]));
});

test('repeated evaluation of the same input is byte-for-byte identical', () => {
  const results = allWithinResults();
  results[0] = 5;
  results[1] = 25;
  const first = evaluateReferenceIntervalVerification(interval(), subjects(results), rule());
  const second = evaluateReferenceIntervalVerification(interval(), subjects(results), rule());
  assert.deepEqual(first, second);
});
