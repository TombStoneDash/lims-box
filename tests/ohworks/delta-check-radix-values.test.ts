import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateResultDelta, type DeltaCheckInput } from '../../lib/ohworks-delta-check';

function input(currentValue: unknown, priorValue: unknown = 16): DeltaCheckInput {
  return {
    current: {
      subjectId: 'synthetic-subject',
      analyteCode: 'SYNTHETIC-ANALYTE',
      value: currentValue,
      unit: 'mg/L',
      capturedAt: '2026-01-02T12:00:00Z',
    },
    prior: {
      subjectId: 'synthetic-subject',
      analyteCode: 'SYNTHETIC-ANALYTE',
      value: priorValue,
      unit: 'mg/L',
      capturedAt: '2026-01-01T12:00:00Z',
    },
    rules: [{
      windowMs: 24 * 60 * 60 * 1000,
      unit: 'mg/L',
      flag: { absolute: 5, percent: 20 },
      block: { absolute: 10, percent: 50 },
    }],
  };
}

for (const radixValue of ['0x10', '0b10000', '0o20']) {
  test(`radix current value ${radixValue} blocks with or without a prior`, () => {
    for (const prior of [input(radixValue).prior, null]) {
      const result = evaluateResultDelta({ ...input(radixValue), prior });
      assert.equal(result.status, 'block');
      assert.equal(result.reasonCode, 'current-value-invalid');
      assert.equal(result.delta, null);
      assert.equal(result.rule, null);
    }
  });

  test(`radix prior value ${radixValue} blocks`, () => {
    const result = evaluateResultDelta(input(16, radixValue));
    assert.equal(result.status, 'block');
    assert.equal(result.reasonCode, 'prior-value-invalid');
    assert.equal(result.delta, null);
    assert.equal(result.rule, null);
  });
}

for (const validValue of [16, '16', '  +16.0  ', '1.6e1', '1.6E+1', '.16e2', '16.']) {
  test(`decimal, scientific, and numeric value ${String(validValue)} remains comparable`, () => {
    for (const result of [
      evaluateResultDelta(input(validValue)),
      evaluateResultDelta(input(16, validValue)),
    ]) {
      assert.equal(result.status, 'pass');
      assert.equal(result.reasonCode, 'within-limits');
      assert.deepEqual(result.delta, { absolute: 0, percent: 0 });
    }
  });
}
