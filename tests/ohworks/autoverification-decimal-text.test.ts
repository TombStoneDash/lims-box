import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateAutoVerification,
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

const HEX_OCTAL_BINARY_VALUES = ['0x5F', '0b1011111', '0o137', '0X5f'];

for (const value of HEX_OCTAL_BINARY_VALUES) {
  test(`a hex/octal/binary text value "${value}" holds instead of being coerced`, () => {
    const request = baselineRequest();
    request.result.value = value;
    const outcome = evaluateAutoVerification(request);
    assert.equal(outcome.decision, 'HOLD_FOR_REVIEW');
    assert.ok(outcome.reasons.includes('value-invalid'));
  });
}

test('hex-text analytical measurement range bounds hold instead of being coerced', () => {
  const request = baselineRequest();
  request.result.value = 100;
  request.measurementRange = { lowerBound: '0x0', upperBound: '0x1F4', unit: 'mg/L' };
  const outcome = evaluateAutoVerification(request);
  assert.equal(outcome.decision, 'HOLD_FOR_REVIEW');
  assert.ok(outcome.reasons.includes('measurement-range-invalid'));
});

const STILL_VALID_DECIMAL_TEXT_VALUES = ['100', ' 95.5 ', '+12', '1e2', '2.5e2', '7.'];

for (const value of STILL_VALID_DECIMAL_TEXT_VALUES) {
  test(`a decimal text value "${value}" is still accepted like a number`, () => {
    const request = baselineRequest();
    request.result.value = value;
    const outcome = evaluateAutoVerification(request);
    assert.equal(outcome.decision, 'AUTO_RELEASE');
    assert.deepEqual(outcome.reasons, []);
  });
}
