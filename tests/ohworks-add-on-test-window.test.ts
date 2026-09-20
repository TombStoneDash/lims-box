import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateAddOnEligibility,
  type AddOnEligibilityInput,
} from '../lib/ohworks-add-on-test-window';

/**
 * All fabricated: synthetic timestamps and volumes only. No real specimen,
 * patient, or customer data, no network call, and no SENAITE instance is
 * ever touched by this test.
 */
function baselineInput(): AddOnEligibilityInput {
  return {
    specimenStatus: 'available',
    collectedAt: '2026-01-01T08:00:00.000Z',
    now: '2026-01-01T10:00:00.000Z',
    stabilityHoursForAnalyte: 24,
    remainingVolumeMicroliters: 500,
    requiredVolumeMicroliters: 100,
    requiresMinimumBufferMicroliters: 50,
  };
}

test('discarded specimen short-circuits to specimen_unavailable', () => {
  const outcome = evaluateAddOnEligibility({ ...baselineInput(), specimenStatus: 'discarded' });
  assert.equal(outcome.status, 'specimen_unavailable');
  assert.equal(outcome.eligible, false);
  assert.equal(outcome.issues.length, 1);
});

test('fully consumed specimen short-circuits to specimen_unavailable', () => {
  const outcome = evaluateAddOnEligibility({ ...baselineInput(), specimenStatus: 'fully_consumed' });
  assert.equal(outcome.status, 'specimen_unavailable');
  assert.equal(outcome.eligible, false);
  assert.equal(outcome.issues.length, 1);
});

test('stability expired just over the boundary', () => {
  const outcome = evaluateAddOnEligibility({
    ...baselineInput(),
    collectedAt: '2026-01-01T00:00:00.000Z',
    now: '2026-01-02T00:00:01.000Z',
    stabilityHoursForAnalyte: 24,
  });
  assert.equal(outcome.status, 'stability_expired');
  assert.equal(outcome.eligible, false);
  assert.ok(outcome.hoursSinceCollection > 24);
});

test('stability holds exactly at the boundary', () => {
  const outcome = evaluateAddOnEligibility({
    ...baselineInput(),
    collectedAt: '2026-01-01T00:00:00.000Z',
    now: '2026-01-02T00:00:00.000Z',
    stabilityHoursForAnalyte: 24,
  });
  assert.notEqual(outcome.status, 'stability_expired');
  assert.equal(outcome.hoursSinceCollection, 24);
});

test('stability holds just under the boundary', () => {
  const outcome = evaluateAddOnEligibility({
    ...baselineInput(),
    collectedAt: '2026-01-01T00:00:00.000Z',
    now: '2026-01-01T23:59:59.000Z',
    stabilityHoursForAnalyte: 24,
  });
  assert.notEqual(outcome.status, 'stability_expired');
  assert.ok(outcome.hoursSinceCollection < 24);
});

test('insufficient volume when remaining is less than required', () => {
  const outcome = evaluateAddOnEligibility({
    ...baselineInput(),
    remainingVolumeMicroliters: 80,
    requiredVolumeMicroliters: 100,
  });
  assert.equal(outcome.status, 'insufficient_volume');
  assert.equal(outcome.eligible, false);
  assert.equal(outcome.issues.length, 1);
});

test('buffer warning boundary: exactly at requiresMinimumBufferMicroliters is plain eligible', () => {
  const outcome = evaluateAddOnEligibility({
    ...baselineInput(),
    remainingVolumeMicroliters: 150,
    requiredVolumeMicroliters: 100,
    requiresMinimumBufferMicroliters: 50,
  });
  assert.equal(outcome.status, 'eligible');
  assert.equal(outcome.eligible, true);
  assert.deepEqual(outcome.issues, []);
});

test('buffer warning boundary: one under requiresMinimumBufferMicroliters triggers the warning', () => {
  const outcome = evaluateAddOnEligibility({
    ...baselineInput(),
    remainingVolumeMicroliters: 149,
    requiredVolumeMicroliters: 100,
    requiresMinimumBufferMicroliters: 50,
  });
  assert.equal(outcome.status, 'eligible_with_buffer_warning');
  assert.equal(outcome.eligible, true);
  assert.equal(outcome.issues.length, 1);
});

test('clean fully-eligible case', () => {
  const outcome = evaluateAddOnEligibility(baselineInput());
  assert.equal(outcome.status, 'eligible');
  assert.equal(outcome.eligible, true);
  assert.deepEqual(outcome.issues, []);
  assert.equal(outcome.hoursSinceCollection, 2);
});
