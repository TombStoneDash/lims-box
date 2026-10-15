import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateMethodValidationGate, type MethodRecordInput } from '../../lib/ohworks-method-validation';

// Fabricated method and timestamps only; no real method or customer data.
function evaluate(validatedAt: string, runAt: string) {
  const entry: MethodRecordInput = {
    methodId: 'SYNTHETIC-CALENDAR-METHOD',
    validationState: 'validated',
    validatedAt,
    revalidationIntervalDays: 30,
    validatedMatrices: ['water'],
  };
  return evaluateMethodValidationGate({ [entry.methodId]: entry }, entry.methodId, runAt, 'water');
}

const invalidTimestamps = [
  '2026-02-30T00:00:00Z',
  '2026-04-31T00:00:00Z',
  '2026-02-29T00:00:00Z',
  '1900-02-29T00:00:00Z',
  '2100-02-29T00:00:00Z',
  '2026-00-01T00:00:00Z',
  '2026-13-01T00:00:00Z',
  '2026-03-00T00:00:00Z',
  '2026-03-32T00:00:00Z',
  '2026-03-02T24:00:00Z',
  '2026-03-02T25:00:00Z',
  '2026-03-02T00:60:00Z',
  '2026-03-02T00:00:60Z',
  '2026-02-30T00:00:00.123456Z',
  '2026-03-02T24:00:00.000Z',
  '2026-03-02T00:60:00.123Z',
  '2026-03-02T00:00:60.123Z',
  '2026-03-02Z',
  '2026-03-02 00:00:00Z',
  '2026-03-02T00:00:00.Z',
  '2026-03-02T00:00:00+00:00',
];

for (const timestamp of invalidTimestamps) {
  test(`invalid run timestamp is blocked: ${timestamp}`, () => {
    const result = evaluate('2026-02-28T00:00:00Z', timestamp);
    assert.equal(result.decision, 'blocked');
    assert.equal(result.reasonCode, 'run-timestamp-invalid');
  });

  test(`invalid validation timestamp is blocked: ${timestamp}`, () => {
    const result = evaluate(timestamp, '2026-03-03T00:00:00Z');
    assert.equal(result.decision, 'blocked');
    assert.equal(result.reasonCode, 'validation-timestamp-invalid');
  });
}

for (const year of ['2000', '2024', '2028']) {
  for (const fraction of ['', '.1', '.123', '.123456']) {
    const leapDay = `${year}-02-29T23:59:59${fraction}Z`;

    test(`valid leap-day run is reported: ${leapDay}`, () => {
      const result = evaluate(`${year}-02-28T00:00:00Z`, leapDay);
      assert.equal(result.decision, 'reported');
      assert.equal(result.reasonCode, 'method-validated-and-current');
    });

    test(`valid leap-day validation is reported: ${leapDay}`, () => {
      const result = evaluate(leapDay, `${year}-03-01T00:00:00Z`);
      assert.equal(result.decision, 'reported');
      assert.equal(result.reasonCode, 'method-validated-and-current');
    });
  }
}

test('invalid run takes precedence when both timestamps are impossible', () => {
  const result = evaluate('2026-02-30T00:00:00Z', '2026-04-31T00:00:00Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'run-timestamp-invalid');
});
