import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateCalibratorLotTraceability } from '../../lib/ohworks-calibrator-traceability';

// Fabricated reference lot and certificate data only.
const lotId = 'calibrator-synthetic-calendar-reference';

function evaluate(certificateExpiresAt: string, runAt: string) {
  return evaluateCalibratorLotTraceability({
    [lotId]: {
      lotId,
      isDeclaredReference: true,
      certificateExpiresAt,
      assignedValue: 100,
      assignedValueUncertainty: 0.5,
    },
  }, lotId, runAt);
}

for (const date of ['2026-02-30', '2026-02-29', '2026-04-31', '2100-02-29']) {
  for (const fraction of ['', '.000']) {
    const timestamp = `${date}T08:00:00${fraction}Z`;

    test(`invalid certificate calendar date ${timestamp} cannot establish traceability`, () => {
      const result = evaluate(timestamp, '2026-02-20T08:00:00.000Z');
      assert.equal(result.decision, 'not_traceable');
      assert.equal(result.reasonCode, 'certificate-timestamp-invalid');
      assert.deepEqual(result.chain, [lotId]);
      assert.equal(result.referenceLotId, null);
      assert.equal(result.combinedUncertainty, null);
    });

    test(`invalid run calendar date ${timestamp} fails before traversal`, () => {
      const result = evaluate('2101-01-01T00:00:00.000Z', timestamp);
      assert.equal(result.decision, 'not_traceable');
      assert.equal(result.reasonCode, 'run-timestamp-invalid');
      assert.deepEqual(result.chain, []);
      assert.equal(result.referenceLotId, null);
      assert.equal(result.combinedUncertainty, null);
    });
  }
}

for (const year of ['2028', '2000']) {
  for (const fraction of ['', '.1', '.123', '.123456']) {
    test(`valid leap day in ${year} with fraction '${fraction}' stays traceable`, () => {
      const result = evaluate(`${year}-02-29T08:00:00${fraction}Z`, `${year}-02-29T07:00:00${fraction}Z`);
      assert.equal(result.decision, 'traceable');
      assert.equal(result.reasonCode, 'chain-traceable');
      assert.deepEqual(result.chain, [lotId]);
      assert.equal(result.referenceLotId, lotId);
      assert.equal(result.combinedUncertainty, 0.5);
    });
  }
}

test('valid leap-day expiry retains its exclusive boundary across timestamp formats', () => {
  const certificateExpiresAt = '2028-02-29T08:00:00Z';
  assert.equal(evaluate(certificateExpiresAt, '2028-02-29T07:59:59.999Z').decision, 'traceable');
  for (const runAt of ['2028-02-29T08:00:00.000Z', '2028-02-29T08:00:00.001Z']) {
    const result = evaluate(certificateExpiresAt, runAt);
    assert.equal(result.decision, 'not_traceable');
    assert.equal(result.reasonCode, 'certificate-expired');
  }
});
