import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
  return { lowerBound: 3, upperBound: 6, unit: 'mmol/L', ...overrides };
}

function rule(overrides: Partial<ReferenceIntervalRule> = {}): ReferenceIntervalRule {
  return {
    minimumSubjectCount: 20,
    maxOutliersForVerified: 2,
    maxOutliersForMoreSubjects: 4,
    ...overrides,
  };
}

function subjectWithId(subjectId: string): ReferenceIntervalSubjectResult {
  return { subjectId, result: 5, unit: 'mmol/L', healthyDeclared: true };
}

// ---------------------------------------------------------------------------
// Fail closed: duplicate reference subject
// ---------------------------------------------------------------------------

test('twenty rows from a single repeated subject id is rejected as subject-duplicate', () => {
  const input = new Array(20).fill(null).map(() => subjectWithId('S1'));
  const result = evaluateReferenceIntervalVerification(interval(), input, rule());
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'subject-duplicate');
  assert.equal(result.totalSubjects, 20);
  assert.equal(result.outsideCount, 0);
  assert.deepEqual(result.outliers, []);
});

test('twenty distinct subject ids is verified', () => {
  const input = new Array(20).fill(null).map((_, index) => subjectWithId(`S${index}`));
  const result = evaluateReferenceIntervalVerification(interval(), input, rule());
  assert.equal(result.decision, 'verified');
  assert.equal(result.reasonCode, 'outliers-within-verified-limit');
  assert.equal(result.totalSubjects, 20);
});

test('a subject id that repeats only with surrounding whitespace is still a duplicate', () => {
  const input = new Array(20).fill(null).map((_, index) => subjectWithId(`S${index}`));
  input[19] = subjectWithId(' S0 ');
  const result = evaluateReferenceIntervalVerification(interval(), input, rule());
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'subject-duplicate');
  assert.equal(result.totalSubjects, 20);
});
