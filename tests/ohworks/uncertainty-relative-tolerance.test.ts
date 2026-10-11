import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateMeasurementUncertainty } from '../../lib/ohworks-measurement-uncertainty';

function evaluate(points: number[], patient: number, limit: number, scale = 1) {
  return evaluateMeasurementUncertainty(
    {
      levelId: 'synthetic-level',
      unit: 'mg/L',
      minimumPointCount: 2,
      coverageFactor: 2,
      points: points.map((value) => ({ value: value * scale, unit: 'mg/L' })),
    },
    { value: patient * scale, unit: 'mg/L' },
    { value: limit * scale, unit: 'mg/L' },
  );
}

test('a small decision limit outside a zero-width interval does not cross', () => {
  const result = evaluate([1e-10, 1e-10], 1e-10, 5e-10);
  assert.deepEqual(
    [result.patientInterval?.lowerBound, result.patientInterval?.upperBound],
    [1e-10, 1e-10],
  );
  assert.equal(result.decisionLimitCrossing?.crossesInterval, false);
});

test('exact lower and upper endpoints cross', () => {
  const initial = evaluate([1e-10, 2e-10], 1.5e-10, 1.5e-10);
  const interval = initial.patientInterval!;
  assert.equal(evaluate([1e-10, 2e-10], 1.5e-10, interval.lowerBound).decisionLimitCrossing?.crossesInterval, true);
  assert.equal(evaluate([1e-10, 2e-10], 1.5e-10, interval.upperBound).decisionLimitCrossing?.crossesInterval, true);
});

test('a common scale preserves inside and outside decisions', () => {
  for (const scale of [1e-12, 1e-9, 1, 1e3, 1e6]) {
    assert.equal(evaluate([1e-10, 1e-10], 1e-10, 5e-10, scale).decisionLimitCrossing?.crossesInterval, false);
    assert.equal(evaluate([1e-10, 1e-10], 1e-10, 1e-10, scale).decisionLimitCrossing?.crossesInterval, true);
    assert.equal(evaluate([1e-10, 2e-10], 1.5e-10, 1.5e-10, scale).decisionLimitCrossing?.crossesInterval, true);
    assert.equal(evaluate([1e-10, 2e-10], 1.5e-10, 5e-10, scale).decisionLimitCrossing?.crossesInterval, false);
  }
});

test('ordinary decimal roundoff at a boundary is still accepted', () => {
  assert.equal(evaluate([1, 1], 0.1 + 0.2, 0.3).decisionLimitCrossing?.crossesInterval, true);
  assert.equal(evaluate([1, 1], 0.3, 0.1 + 0.2).decisionLimitCrossing?.crossesInterval, true);
  assert.equal(evaluate([1, 1], 0.3, 0.3 + 1e-8).decisionLimitCrossing?.crossesInterval, false);
});

test('zero has no fixed allowance around it', () => {
  assert.equal(evaluate([1, 1], 0, 0).decisionLimitCrossing?.crossesInterval, true);
  assert.equal(evaluate([1, 1], 0, 1e-20).decisionLimitCrossing?.crossesInterval, false);
});
