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

const FIXED_MESSAGE =
  'Add-on eligibility requires a valid, calendar-correct collection timestamp and evaluation timestamp, with the evaluation timestamp not preceding collection.';

function assertRejectsWithFixedMessage(input: AddOnEligibilityInput): void {
  assert.throws(
    () => evaluateAddOnEligibility(input),
    (error: unknown) => {
      assert.ok(error instanceof RangeError);
      assert.equal((error as RangeError).message, FIXED_MESSAGE);
      return true;
    },
  );
}

test('malformed collectedAt throws a fixed RangeError', () => {
  assertRejectsWithFixedMessage({ ...baselineInput(), collectedAt: 'garbage' });
});

test('malformed now throws a fixed RangeError', () => {
  assertRejectsWithFixedMessage({ ...baselineInput(), now: 'garbage' });
});

test('both timestamps malformed throws a fixed RangeError', () => {
  assertRejectsWithFixedMessage({ ...baselineInput(), collectedAt: 'garbage', now: 'also garbage' });
});

test('timezone-less timestamp (no Z or offset) is rejected as malformed', () => {
  assertRejectsWithFixedMessage({
    ...baselineInput(),
    collectedAt: '2026-01-01T08:00:00',
    now: '2026-01-01T10:00:00',
  });
});

test('empty-string timestamps are rejected as malformed', () => {
  assertRejectsWithFixedMessage({ ...baselineInput(), collectedAt: '', now: '' });
});

test('February 30 in collectedAt throws a fixed RangeError', () => {
  assertRejectsWithFixedMessage({ ...baselineInput(), collectedAt: '2026-02-30T00:00:00Z' });
});

test('February 30 in now throws a fixed RangeError', () => {
  assertRejectsWithFixedMessage({
    ...baselineInput(),
    collectedAt: '2026-02-01T00:00:00Z',
    now: '2026-02-30T00:00:00Z',
  });
});

test('future collection (now precedes collectedAt) throws a fixed RangeError', () => {
  assertRejectsWithFixedMessage({
    ...baselineInput(),
    collectedAt: '2026-01-02T00:00:00Z',
    now: '2026-01-01T00:00:00Z',
  });
});

test('a valid leap day collection is accepted and yields a correct eligible outcome', () => {
  const outcome = evaluateAddOnEligibility({
    ...baselineInput(),
    collectedAt: '2024-02-29T00:00:00Z',
    now: '2024-03-01T00:00:00Z',
    stabilityHoursForAnalyte: 48,
  });
  assert.equal(outcome.status, 'eligible');
  assert.equal(outcome.eligible, true);
  assert.equal(outcome.hoursSinceCollection, 24);
});

test('equivalent offset instants produce the same elapsed hours as their Z equivalents', () => {
  const zForm = evaluateAddOnEligibility({
    ...baselineInput(),
    collectedAt: '2026-01-01T08:00:00Z',
    now: '2026-01-01T10:00:00Z',
  });
  const offsetForm = evaluateAddOnEligibility({
    ...baselineInput(),
    collectedAt: '2026-01-01T03:00:00-05:00',
    now: '2026-01-01T05:00:00-05:00',
  });
  const mixedOffsetForm = evaluateAddOnEligibility({
    ...baselineInput(),
    collectedAt: '2026-01-01T08:00:00+00:00',
    now: '2026-01-01T12:30:00+02:30',
  });
  assert.equal(offsetForm.hoursSinceCollection, zForm.hoursSinceCollection);
  assert.equal(mixedOffsetForm.hoursSinceCollection, zForm.hoursSinceCollection);
  assert.equal(offsetForm.status, zForm.status);
  assert.equal(mixedOffsetForm.status, zForm.status);
});

test('exact stability boundary holds when expressed with an explicit offset', () => {
  const outcome = evaluateAddOnEligibility({
    ...baselineInput(),
    collectedAt: '2026-01-01T00:00:00+00:00',
    now: '2026-01-02T05:00:00+05:00',
    stabilityHoursForAnalyte: 24,
  });
  assert.notEqual(outcome.status, 'stability_expired');
  assert.equal(outcome.hoursSinceCollection, 24);
});

test('one second past the exact stability boundary is expired, with offset timestamps', () => {
  const outcome = evaluateAddOnEligibility({
    ...baselineInput(),
    collectedAt: '2026-01-01T00:00:00+00:00',
    now: '2026-01-02T05:00:01+05:00',
    stabilityHoursForAnalyte: 24,
  });
  assert.equal(outcome.status, 'stability_expired');
});

test('an invalid available specimen never yields an eligible outcome', () => {
  const invalidInputs: AddOnEligibilityInput[] = [
    { ...baselineInput(), collectedAt: 'garbage' },
    { ...baselineInput(), now: 'garbage' },
    { ...baselineInput(), collectedAt: '2026-02-30T00:00:00Z' },
    { ...baselineInput(), collectedAt: '2026-01-02T00:00:00Z', now: '2026-01-01T00:00:00Z' },
  ];
  for (const invalidInput of invalidInputs) {
    assert.throws(() => evaluateAddOnEligibility(invalidInput), RangeError);
  }
});

test('discarded specimen with malformed timestamps still short-circuits without throwing', () => {
  const outcome = evaluateAddOnEligibility({
    ...baselineInput(),
    specimenStatus: 'discarded',
    collectedAt: 'garbage',
    now: 'garbage',
  });
  assert.equal(outcome.status, 'specimen_unavailable');
  assert.equal(outcome.eligible, false);
});

test('fully consumed specimen with February 30 timestamps still short-circuits without throwing', () => {
  const outcome = evaluateAddOnEligibility({
    ...baselineInput(),
    specimenStatus: 'fully_consumed',
    collectedAt: '2026-02-30T00:00:00Z',
  });
  assert.equal(outcome.status, 'specimen_unavailable');
  assert.equal(outcome.eligible, false);
});

test('the reproduced defect no longer silently yields eligible for an unparseable collectedAt', () => {
  assertRejectsWithFixedMessage({
    specimenStatus: 'available',
    collectedAt: 'garbage',
    now: '2026-01-01T10:00:00.000Z',
    stabilityHoursForAnalyte: 24,
    remainingVolumeMicroliters: 500,
    requiredVolumeMicroliters: 100,
    requiresMinimumBufferMicroliters: 50,
  });
});
