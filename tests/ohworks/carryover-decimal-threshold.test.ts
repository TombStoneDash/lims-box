import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateCarryoverRisk, type CarryoverRun } from '../../lib/ohworks-carryover';

function syntheticRun(sourceValue: number, repeatThreshold: number, washBefore = false): CarryoverRun {
  return {
    rules: [{
      analyteCode: 'SYNTHETIC-A',
      highThreshold: sourceValue,
      carryoverFactor: 0.1,
      repeatThreshold,
    }],
    results: [
      { resultId: 'synthetic-source', position: 1, analyteCode: 'SYNTHETIC-A', value: sourceValue, washBefore: false },
      { resultId: 'synthetic-next', position: 2, analyteCode: 'SYNTHETIC-A', value: 0.001, washBefore },
    ],
  };
}

test('decimal roundoff at the inclusive repeat threshold remains at risk with raw contribution evidence', () => {
  const [source, next] = evaluateCarryoverRisk(syntheticRun(0.1, 0.01));
  assert.equal(source.status, 'clear');
  assert.equal(next.status, 'at_risk');
  assert.equal(next.reasonCode, 'contribution-within-threshold');
  assert.equal(next.contribution, 0.1 * 0.1);
  assert.equal(next.contribution, 0.010000000000000002);
  assert.equal(next.sourcePosition, 1);
});

test('a meaningful excess over the repeat threshold still requires repeat', () => {
  for (const [sourceValue, repeatThreshold] of [[0.11, 0.01], [1.1e-8, 1e-9]]) {
    const [, next] = evaluateCarryoverRisk(syntheticRun(sourceValue, repeatThreshold));
    assert.equal(next.status, 'must_repeat');
    assert.equal(next.reasonCode, 'contribution-exceeds-threshold');
    assert.equal(next.contribution, sourceValue * 0.1);
    assert.equal(next.sourcePosition, 1);
  }
});

test('a wash still resets a pending decimal-boundary source', () => {
  const [, next] = evaluateCarryoverRisk(syntheticRun(0.1, 0.01, true));
  assert.equal(next.status, 'clear');
  assert.equal(next.reasonCode, 'reset-by-wash');
  assert.equal(next.contribution, null);
  assert.equal(next.sourcePosition, null);
});
