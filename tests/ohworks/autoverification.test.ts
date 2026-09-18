import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateAutoVerification,
  explainAutoVerificationReason,
  type AutoVerificationHoldReasonCode,
  type AutoVerificationRequest,
} from '../../lib/ohworks-autoverification';

/**
 * All fabricated: synthetic analyte codes and made-up numeric values. None
 * of this represents a real patient, sample, instrument, or result.
 */
function baselineRequest(): AutoVerificationRequest {
  return {
    result: {
      analyteCode: 'ANALYTE-SYNTH-A',
      value: 100,
      unit: 'mg/L',
      instrumentFlags: [],
    },
    qcState: 'in-control',
    deltaCheckStatus: 'pass',
    measurementRange: { lowerBound: 0, upperBound: 500, unit: 'mg/L' },
    criticalLimits: { lower: 5, upper: 400, unit: 'mg/L' },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const ALL_REASON_CODES: AutoVerificationHoldReasonCode[] = [
  'analyte-code-invalid',
  'value-invalid',
  'unit-invalid',
  'instrument-flags-invalid',
  'instrument-flag-present',
  'qc-state-invalid',
  'qc-missing',
  'qc-out-of-control',
  'qc-warning',
  'delta-check-invalid',
  'delta-check-blocked',
  'delta-check-flagged',
  'measurement-range-invalid',
  'measurement-range-unit-mismatch',
  'value-outside-measurement-range',
  'critical-limits-invalid',
  'critical-limits-unit-mismatch',
  'value-critical',
];

test('every declared reason code has a non-empty, static explanation', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainAutoVerificationReason(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

test('a fully clean baseline result auto-releases with no reasons', () => {
  const outcome = evaluateAutoVerification(baselineRequest());
  assert.equal(outcome.decision, 'AUTO_RELEASE');
  assert.deepEqual(outcome.reasons, []);
});

test('a missing analyte code holds', () => {
  const request = baselineRequest();
  request.result.analyteCode = '';
  const outcome = evaluateAutoVerification(request);
  assert.equal(outcome.decision, 'HOLD_FOR_REVIEW');
  assert.deepEqual(outcome.reasons, ['analyte-code-invalid']);
});

test('a non-finite value holds', () => {
  const request = baselineRequest();
  request.result.value = Number.NaN;
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['value-invalid']);
});

test('a non-numeric string value holds', () => {
  const request = baselineRequest();
  request.result.value = 'not-a-number';
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['value-invalid']);
});

test('a numeric string value is accepted like a number', () => {
  const request = baselineRequest();
  request.result.value = '100';
  const outcome = evaluateAutoVerification(request);
  assert.equal(outcome.decision, 'AUTO_RELEASE');
});

test('a missing unit holds', () => {
  const request = baselineRequest();
  request.result.unit = '';
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['unit-invalid']);
});

test('a non-string unit holds', () => {
  const request = baselineRequest();
  request.result.unit = 42;
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['unit-invalid']);
});

test('malformed instrument flags hold', () => {
  const request = baselineRequest();
  request.result.instrumentFlags = ['ok', 42, ''];
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['instrument-flags-invalid']);
});

test('a non-array instrument flag field holds', () => {
  const request = baselineRequest();
  request.result.instrumentFlags = 'HEMOLYZED';
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['instrument-flags-invalid']);
});

test('any present instrument flag holds even when everything else is clean', () => {
  const request = baselineRequest();
  request.result.instrumentFlags = ['HEMOLYZED'];
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['instrument-flag-present']);
});

test('an unrecognized QC state holds', () => {
  const request = baselineRequest();
  request.qcState = 'unspecified';
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['qc-state-invalid']);
});

test('a missing QC state string holds', () => {
  const request = baselineRequest();
  (request as { qcState?: unknown }).qcState = undefined;
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['qc-state-invalid']);
});

test('missing QC always holds even with every other input clean', () => {
  const request = baselineRequest();
  request.qcState = 'missing';
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['qc-missing']);
});

test('out-of-control QC always holds even with every other input clean', () => {
  const request = baselineRequest();
  request.qcState = 'out-of-control';
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['qc-out-of-control']);
});

test('warning QC holds; it is never folded into a pass', () => {
  const request = baselineRequest();
  request.qcState = 'warning';
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['qc-warning']);
});

test('an unrecognized delta-check status holds', () => {
  const request = baselineRequest();
  request.deltaCheckStatus = 'unknown-status';
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['delta-check-invalid']);
});

test('a blocked delta-check outcome holds', () => {
  const request = baselineRequest();
  request.deltaCheckStatus = 'block';
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['delta-check-blocked']);
});

test('a flagged delta-check outcome holds', () => {
  const request = baselineRequest();
  request.deltaCheckStatus = 'flag';
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['delta-check-flagged']);
});

test('an inverted measurement range holds', () => {
  const request = baselineRequest();
  request.measurementRange = { lowerBound: 500, upperBound: 0, unit: 'mg/L' };
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['measurement-range-invalid']);
});

test('a non-finite measurement range bound holds', () => {
  const request = baselineRequest();
  request.measurementRange = { lowerBound: 0, upperBound: Number.POSITIVE_INFINITY, unit: 'mg/L' };
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['measurement-range-invalid']);
});

test('a measurement range unit mismatched against the result unit holds, without guessing at range membership', () => {
  const request = baselineRequest();
  request.measurementRange = { lowerBound: 0, upperBound: 500, unit: 'g/L' };
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['measurement-range-unit-mismatch']);
});

test('a value outside the measurement range holds', () => {
  const request = baselineRequest();
  request.criticalLimits = { lower: -1000, upper: 1000, unit: 'mg/L' };
  request.result.value = 999;
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['value-outside-measurement-range']);
});

test('a value exactly at the measurement range bound is within range', () => {
  const request = baselineRequest();
  request.criticalLimits = { lower: -1000, upper: 1000, unit: 'mg/L' };
  request.result.value = 500;
  const outcome = evaluateAutoVerification(request);
  assert.equal(outcome.decision, 'AUTO_RELEASE');
});

test('critical limits with both bounds null hold', () => {
  const request = baselineRequest();
  request.criticalLimits = { lower: null, upper: null, unit: 'mg/L' };
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['critical-limits-invalid']);
});

test('critical limits with a non-finite bound hold', () => {
  const request = baselineRequest();
  request.criticalLimits = { lower: 'not-a-number', upper: 400, unit: 'mg/L' };
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['critical-limits-invalid']);
});

test('critical limits with lower >= upper hold as contradictory', () => {
  const request = baselineRequest();
  request.criticalLimits = { lower: 400, upper: 5, unit: 'mg/L' };
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['critical-limits-invalid']);
});

test('a critical limits unit mismatched against the result unit holds, without guessing at criticality', () => {
  const request = baselineRequest();
  request.criticalLimits = { lower: 5, upper: 400, unit: 'g/L' };
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['critical-limits-unit-mismatch']);
});

test('a value at or below the lower critical limit always holds', () => {
  const request = baselineRequest();
  request.result.value = 5;
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['value-critical']);
});

test('a value at or above the upper critical limit always holds', () => {
  const request = baselineRequest();
  request.result.value = 400;
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['value-critical']);
});

test('a critical value holds even with an otherwise fully clean request', () => {
  const request = baselineRequest();
  request.result.value = 1;
  request.criticalLimits = { lower: 5, upper: null, unit: 'mg/L' };
  const outcome = evaluateAutoVerification(request);
  assert.equal(outcome.decision, 'HOLD_FOR_REVIEW');
  assert.deepEqual(outcome.reasons, ['value-critical']);
});

test('a single lower-only critical limit is structurally valid', () => {
  const request = baselineRequest();
  request.criticalLimits = { lower: 5, upper: null, unit: 'mg/L' };
  const outcome = evaluateAutoVerification(request);
  assert.equal(outcome.decision, 'AUTO_RELEASE');
});

test('every fired reason is returned, sorted into the one fixed declared order', () => {
  const request = baselineRequest();
  request.result.analyteCode = '';
  request.result.value = Number.NaN;
  request.qcState = 'out-of-control';
  request.deltaCheckStatus = 'block';
  const outcome = evaluateAutoVerification(request);
  assert.deepEqual(outcome.reasons, ['analyte-code-invalid', 'value-invalid', 'qc-out-of-control', 'delta-check-blocked']);
});

test('reason order does not depend on which fields were mutated first', () => {
  const requestA = baselineRequest();
  requestA.qcState = 'warning';
  requestA.result.instrumentFlags = ['HEMOLYZED'];

  const requestB = baselineRequest();
  requestB.result.instrumentFlags = ['HEMOLYZED'];
  requestB.qcState = 'warning';

  const outcomeA = evaluateAutoVerification(requestA);
  const outcomeB = evaluateAutoVerification(requestB);
  assert.deepEqual(outcomeA.reasons, outcomeB.reasons);
  assert.deepEqual(outcomeA.reasons, ['instrument-flag-present', 'qc-warning']);
});

test('the returned outcome is frozen and cannot be mutated', () => {
  const outcome = evaluateAutoVerification(baselineRequest());
  assert.equal(Object.isFrozen(outcome), true);
  assert.equal(Object.isFrozen(outcome.reasons), true);
  (outcome as { decision: string }).decision = 'HOLD_FOR_REVIEW';
  assert.equal(outcome.decision, 'AUTO_RELEASE');
});

test('never throws on a completely malformed top-level request', () => {
  const malformedInputs: unknown[] = [null, undefined, 42, 'not-an-object', [], () => {}];
  for (const malformed of malformedInputs) {
    assert.doesNotThrow(() => evaluateAutoVerification(malformed));
    const outcome = evaluateAutoVerification(malformed);
    assert.equal(outcome.decision, 'HOLD_FOR_REVIEW');
    assert.ok(outcome.reasons.length > 0);
  }
});

test('never throws when nested groups are the wrong shape', () => {
  const malformed = {
    result: 'not-an-object',
    qcState: 'in-control',
    deltaCheckStatus: 'pass',
    measurementRange: null,
    criticalLimits: 42,
  };
  assert.doesNotThrow(() => evaluateAutoVerification(malformed));
  const outcome = evaluateAutoVerification(malformed);
  assert.equal(outcome.decision, 'HOLD_FOR_REVIEW');
  assert.ok(outcome.reasons.includes('analyte-code-invalid'));
  assert.ok(outcome.reasons.includes('value-invalid'));
  assert.ok(outcome.reasons.includes('unit-invalid'));
  assert.ok(outcome.reasons.includes('instrument-flags-invalid'));
  assert.ok(outcome.reasons.includes('measurement-range-invalid'));
  assert.ok(outcome.reasons.includes('critical-limits-invalid'));
});

test('a deep clone (JSON round-trip) of a clean request still auto-releases', () => {
  const outcome = evaluateAutoVerification(clone(baselineRequest()));
  assert.equal(outcome.decision, 'AUTO_RELEASE');
  assert.deepEqual(outcome.reasons, []);
});

test('reason messages never echo the submitted analyte code, value, or unit', () => {
  const request = baselineRequest();
  request.result.analyteCode = 'SUPER-SECRET-ANALYTE-CODE';
  request.result.value = 123456789;
  request.result.unit = 'ultra-rare-unit';
  request.result.instrumentFlags = ['SUPER-SECRET-ANALYTE-CODE'];
  const outcome = evaluateAutoVerification(request);
  for (const code of outcome.reasons) {
    const message = explainAutoVerificationReason(code);
    assert.equal(message.includes('SUPER-SECRET-ANALYTE-CODE'), false);
    assert.equal(message.includes('123456789'), false);
    assert.equal(message.includes('ultra-rare-unit'), false);
  }
});
