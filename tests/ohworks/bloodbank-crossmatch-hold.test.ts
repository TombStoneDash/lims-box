import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateCrossmatchHold, type CrossmatchHoldInput } from '../../lib/ohworks-bloodbank-crossmatch-hold';

/**
 * All fabricated: synthetic ABO/Rh types, antibody screen results, and
 * sample ages. None of this represents a real patient or specimen.
 */
function baselineInput(overrides: Partial<CrossmatchHoldInput> = {}): CrossmatchHoldInput {
  return {
    abo: 'O',
    rhD: 'negative',
    antibodyScreenResult: 'negative',
    priorAntibodyIdentified: [],
    requestedUnitCount: 2,
    sampleAgeHours: 10,
    maxSampleAgeHoursForType: 72,
    ...overrides,
  };
}

test('clear_to_crossmatch: negative screen, no antibody history, sample within age limit', () => {
  const decision = evaluateCrossmatchHold(baselineInput());
  assert.equal(decision.status, 'clear_to_crossmatch');
  assert.equal(decision.requiresExtendedCrossmatch, false);
  assert.ok(decision.reason.length > 0);
});

test('hold_sample_expired takes precedence over a negative screen', () => {
  const decision = evaluateCrossmatchHold(
    baselineInput({ sampleAgeHours: 100, maxSampleAgeHoursForType: 72, antibodyScreenResult: 'negative' }),
  );
  assert.equal(decision.status, 'hold_sample_expired');
  assert.equal(decision.requiresExtendedCrossmatch, false);
});

test('hold_sample_expired takes precedence over a pending screen', () => {
  const decision = evaluateCrossmatchHold(
    baselineInput({ sampleAgeHours: 100, maxSampleAgeHoursForType: 72, antibodyScreenResult: 'pending' }),
  );
  assert.equal(decision.status, 'hold_sample_expired');
});

test('hold_sample_expired takes precedence over a positive screen and antibody history', () => {
  const decision = evaluateCrossmatchHold(
    baselineInput({
      sampleAgeHours: 100,
      maxSampleAgeHoursForType: 72,
      antibodyScreenResult: 'positive',
      priorAntibodyIdentified: ['Anti-K'],
    }),
  );
  assert.equal(decision.status, 'hold_sample_expired');
});

test('hold_pending_screen when the antibody screen has not resulted, sample not expired', () => {
  const decision = evaluateCrossmatchHold(baselineInput({ antibodyScreenResult: 'pending' }));
  assert.equal(decision.status, 'hold_pending_screen');
  assert.equal(decision.requiresExtendedCrossmatch, false);
});

test('hold_antibody_workup on a current positive screen, requiresExtendedCrossmatch true', () => {
  const decision = evaluateCrossmatchHold(baselineInput({ antibodyScreenResult: 'positive' }));
  assert.equal(decision.status, 'hold_antibody_workup');
  assert.equal(decision.requiresExtendedCrossmatch, true);
});

test('hold_antibody_workup on antibody history alone, even with a negative current screen', () => {
  const decision = evaluateCrossmatchHold(
    baselineInput({ antibodyScreenResult: 'negative', priorAntibodyIdentified: ['Anti-K'] }),
  );
  assert.equal(decision.status, 'hold_antibody_workup');
  assert.equal(decision.requiresExtendedCrossmatch, true);
});

test('requiresExtendedCrossmatch is false for clear_to_crossmatch and true for hold_antibody_workup', () => {
  const clear = evaluateCrossmatchHold(baselineInput());
  const held = evaluateCrossmatchHold(baselineInput({ antibodyScreenResult: 'positive' }));
  assert.equal(clear.requiresExtendedCrossmatch, false);
  assert.equal(held.requiresExtendedCrossmatch, true);
});

test('sample age boundary: exactly at the limit is not expired', () => {
  const decision = evaluateCrossmatchHold(baselineInput({ sampleAgeHours: 72, maxSampleAgeHoursForType: 72 }));
  assert.equal(decision.status, 'clear_to_crossmatch');
});

test('sample age boundary: just under the limit is not expired', () => {
  const decision = evaluateCrossmatchHold(baselineInput({ sampleAgeHours: 71.9, maxSampleAgeHoursForType: 72 }));
  assert.equal(decision.status, 'clear_to_crossmatch');
});

test('sample age boundary: just over the limit is expired', () => {
  const decision = evaluateCrossmatchHold(baselineInput({ sampleAgeHours: 72.1, maxSampleAgeHoursForType: 72 }));
  assert.equal(decision.status, 'hold_sample_expired');
});

test('throws a descriptive error when requestedUnitCount is 0', () => {
  assert.throws(() => evaluateCrossmatchHold(baselineInput({ requestedUnitCount: 0 })), /requestedUnitCount/);
});

test('throws a descriptive error when requestedUnitCount is negative', () => {
  assert.throws(() => evaluateCrossmatchHold(baselineInput({ requestedUnitCount: -1 })), /requestedUnitCount/);
});
