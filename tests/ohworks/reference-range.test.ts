import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateReferenceRange,
  type ReferenceRangeInput,
} from '../../lib/ohworks-reference-range';

/**
 * All fabricated: synthetic analyte values, units, and limits. None of this
 * represents a real instrument, patient, or customer result.
 */
function baselineInput(): ReferenceRangeInput {
  return {
    result: 15,
    unit: 'mg/L',
    limitOfDetection: 1,
    upperLimitOfQuantitation: 100,
    referenceRange: { lowerBound: 5, upperBound: 20, unit: 'mg/L' },
  };
}

test('a value inside the declared reference range is within_range with the matching flag', () => {
  const evaluation = evaluateReferenceRange(baselineInput());
  assert.equal(evaluation.classification, 'within_range');
  assert.equal(evaluation.flag, 'WITHIN REFERENCE RANGE');
  assert.deepEqual(evaluation.reasons, []);
});

test('a value exactly at the reference range upper bound is within_range', () => {
  const input = baselineInput();
  input.result = 20;
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'within_range');
});

test('a value exactly at the limit of detection is within_range, not below_detection', () => {
  const input = baselineInput();
  input.result = 1;
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'within_range');
});

test('a value exactly at the upper limit of quantitation is within_range, not above_quantitation', () => {
  const input = baselineInput();
  input.result = 100;
  input.referenceRange.upperBound = 100;
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'within_range');
});

test('a value below the limit of detection is below_detection', () => {
  const input = baselineInput();
  input.result = 0.5;
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'below_detection');
  assert.equal(evaluation.flag, 'BELOW DETECTION LIMIT');
});

test('a value above the reference range upper bound but within quantitation is above_range', () => {
  const input = baselineInput();
  input.result = 25;
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'above_range');
  assert.equal(evaluation.flag, 'ABOVE REFERENCE RANGE');
});

test('a value above the upper limit of quantitation is above_quantitation, taking priority over above_range', () => {
  const input = baselineInput();
  input.result = 150;
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'above_quantitation');
  assert.equal(evaluation.flag, 'ABOVE QUANTITATION LIMIT');
});

test('a value below the declared reference range lower bound but above detection is within_range', () => {
  const input = baselineInput();
  input.result = 2;
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'within_range');
});

test('a less-than censored value at the limit of detection is below_detection', () => {
  const input = baselineInput();
  input.result = '<1';
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'below_detection');
  assert.deepEqual(evaluation.reasons, []);
});

test('a less-than censored value with surrounding whitespace is handled the same way', () => {
  const input = baselineInput();
  input.result = '<  1  ';
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'below_detection');
});

test('a greater-than censored value at the upper limit of quantitation is above_quantitation', () => {
  const input = baselineInput();
  input.result = '>100';
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'above_quantitation');
  assert.deepEqual(evaluation.reasons, []);
});

test('a less-than censored value whose threshold does not match the limit of detection is invalid', () => {
  const input = baselineInput();
  input.result = '<5';
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'invalid');
  assert.deepEqual(evaluation.reasons, [{ code: 'censored-threshold-mismatch' }]);
});

test('a greater-than censored value whose threshold does not match the upper limit of quantitation is invalid', () => {
  const input = baselineInput();
  input.result = '>50';
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'invalid');
  assert.deepEqual(evaluation.reasons, [{ code: 'censored-threshold-mismatch' }]);
});

test('a plain numeric string result is parsed as a direct numeric value', () => {
  const input = baselineInput();
  input.result = '15';
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'within_range');
});

test('a non-finite numeric result fails closed to invalid', () => {
  const input = baselineInput();
  input.result = NaN;
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'invalid');
  assert.ok(evaluation.reasons.some((r) => r.code === 'result-non-finite'));
});

test('an Infinity numeric result fails closed to invalid', () => {
  const input = baselineInput();
  input.result = Infinity;
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'invalid');
  assert.ok(evaluation.reasons.some((r) => r.code === 'result-non-finite'));
});

test('an unparsable string result fails closed to invalid', () => {
  const input = baselineInput();
  input.result = 'not-a-number';
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'invalid');
  assert.ok(evaluation.reasons.some((r) => r.code === 'result-non-finite'));
});

test('an empty string result fails closed to invalid', () => {
  const input = baselineInput();
  input.result = '   ';
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'invalid');
  assert.ok(evaluation.reasons.some((r) => r.code === 'result-non-finite'));
});

test('a unit mismatch between the result and the declared reference range fails closed to invalid', () => {
  const input = baselineInput();
  input.unit = 'g/L';
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'invalid');
  assert.ok(evaluation.reasons.some((r) => r.code === 'unit-mismatch'));
});

test('outer-whitespace and case differences in matching units are tolerated, not flagged mismatched', () => {
  const input = baselineInput();
  input.unit = '  MG/L  ';
  input.referenceRange.unit = 'Mg/L';
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'within_range');
});

test('a missing result unit fails closed to invalid as a unit mismatch', () => {
  const input = baselineInput();
  (input as { unit: unknown }).unit = '';
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'invalid');
  assert.ok(evaluation.reasons.some((r) => r.code === 'unit-mismatch'));
});

test('a non-string reference range unit fails closed to invalid as a unit mismatch', () => {
  const input = baselineInput();
  (input.referenceRange as unknown as { unit: unknown }).unit = 7;
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'invalid');
  assert.ok(evaluation.reasons.some((r) => r.code === 'unit-mismatch'));
});

test('a non-finite limit of detection fails closed to invalid', () => {
  const input = baselineInput();
  input.limitOfDetection = NaN;
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'invalid');
  assert.ok(evaluation.reasons.some((r) => r.code === 'limit-of-detection-non-finite'));
});

test('a non-finite upper limit of quantitation fails closed to invalid', () => {
  const input = baselineInput();
  input.upperLimitOfQuantitation = Infinity;
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'invalid');
  assert.ok(evaluation.reasons.some((r) => r.code === 'upper-limit-of-quantitation-non-finite'));
});

test('an inverted detection/quantitation range (LOD above ULOQ) fails closed to invalid', () => {
  const input = baselineInput();
  input.limitOfDetection = 200;
  input.upperLimitOfQuantitation = 100;
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'invalid');
  assert.ok(evaluation.reasons.some((r) => r.code === 'detection-quantitation-range-inverted'));
});

test('a limit of detection exactly equal to the upper limit of quantitation is not inverted', () => {
  const input = baselineInput();
  input.limitOfDetection = 50;
  input.upperLimitOfQuantitation = 50;
  input.result = 50;
  const evaluation = evaluateReferenceRange(input);
  assert.notEqual(evaluation.classification, 'invalid');
});

test('an inverted declared reference range fails closed to invalid', () => {
  const input = baselineInput();
  input.referenceRange = { lowerBound: 25, upperBound: 5, unit: 'mg/L' };
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'invalid');
  assert.ok(evaluation.reasons.some((r) => r.code === 'reference-range-inverted'));
});

test('a reference range with an equal lower and upper bound is not inverted', () => {
  const input = baselineInput();
  input.referenceRange = { lowerBound: 15, upperBound: 15, unit: 'mg/L' };
  const evaluation = evaluateReferenceRange(input);
  assert.notEqual(evaluation.classification, 'invalid');
});

test('a non-finite reference range bound fails closed to invalid', () => {
  const input = baselineInput();
  input.referenceRange.upperBound = NaN;
  const evaluation = evaluateReferenceRange(input);
  assert.equal(evaluation.classification, 'invalid');
  assert.ok(evaluation.reasons.some((r) => r.code === 'reference-range-bound-non-finite'));
});

test('multiple independent defects are all reported, deterministically sorted', () => {
  const input = baselineInput();
  input.result = NaN;
  input.unit = 'g/L';
  input.limitOfDetection = NaN;
  const evaluation = evaluateReferenceRange(input);
  const codes = evaluation.reasons.map((r) => r.code);
  assert.deepEqual(
    codes,
    ['limit-of-detection-non-finite', 'result-non-finite', 'unit-mismatch'].sort(),
  );
  assert.deepEqual([...codes].sort(), codes);
});

test('evaluation is pure: it does not mutate the input', () => {
  const input = baselineInput();
  const before = JSON.stringify(input);
  evaluateReferenceRange(input);
  assert.equal(JSON.stringify(input), before);
});

test('evaluation is deterministic across repeated calls with the same input', () => {
  const first = evaluateReferenceRange(baselineInput());
  const second = evaluateReferenceRange(baselineInput());
  assert.deepEqual(first, second);
});

test('every classification is one of the five defined outcomes', () => {
  const allowed = ['below_detection', 'within_range', 'above_range', 'above_quantitation', 'invalid'];
  const scenarios: ReferenceRangeInput[] = [
    baselineInput(),
    { ...baselineInput(), result: 0.5 },
    { ...baselineInput(), result: 25 },
    { ...baselineInput(), result: 150 },
    { ...baselineInput(), result: NaN },
  ];
  for (const scenario of scenarios) {
    const evaluation = evaluateReferenceRange(scenario);
    assert.ok(allowed.includes(evaluation.classification));
  }
});
