import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateCrossmatchHold, type CrossmatchHoldInput } from '../../lib/ohworks-bloodbank-crossmatch-hold';

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

const invalidCases: { field: 'sampleAgeHours' | 'maxSampleAgeHoursForType'; values: unknown[]; message: string }[] = [
  {
    field: 'sampleAgeHours',
    values: [NaN, Infinity, -Infinity, -1, -0.1, undefined, null, '10'],
    message: 'sampleAgeHours must be a finite non-negative number',
  },
  {
    field: 'maxSampleAgeHoursForType',
    values: [NaN, Infinity, -Infinity, 0, -1, -0.1, undefined, null, '72'],
    message: 'maxSampleAgeHoursForType must be a finite positive number',
  },
];

for (const { field, values, message } of invalidCases) {
  for (const value of values) {
    test(`${field} rejects ${String(value)} with a fixed field-specific error`, () => {
      // Deliberately bypass the static type to exercise runtime validation.
      const input = { ...baselineInput(), [field]: value } as CrossmatchHoldInput;
      assert.throws(() => evaluateCrossmatchHold(input), { name: 'Error', message });
    });
  }
}

test('age validation runs before expired, pending, or antibody workup dispositions', () => {
  const scenarios: Partial<CrossmatchHoldInput>[] = [
    { sampleAgeHours: 100 },
    { antibodyScreenResult: 'pending', priorAntibodyIdentified: ['Anti-K'] },
    { antibodyScreenResult: 'positive', priorAntibodyIdentified: ['Anti-K'] },
  ];
  for (const scenario of scenarios) {
    for (const { field, message } of invalidCases) {
      assert.throws(
        () => evaluateCrossmatchHold(baselineInput({ ...scenario, [field]: NaN })),
        { name: 'Error', message },
      );
    }
  }
});

test('zero sample age and exact-limit sample age remain eligible', () => {
  for (const sampleAgeHours of [0, 72]) {
    const decision = evaluateCrossmatchHold(baselineInput({ sampleAgeHours }));
    assert.equal(decision.status, 'clear_to_crossmatch');
    assert.equal(decision.requiresExtendedCrossmatch, false);
  }
});

test('positive fractional limits preserve the strict greater-than expiry boundary', () => {
  assert.equal(evaluateCrossmatchHold(baselineInput({
    sampleAgeHours: 0.5, maxSampleAgeHoursForType: 0.5,
  })).status, 'clear_to_crossmatch');
  assert.equal(evaluateCrossmatchHold(baselineInput({
    sampleAgeHours: 0.6, maxSampleAgeHoursForType: 0.5,
  })).status, 'hold_sample_expired');
});

test('pending screens still take precedence over antibody history for valid ages', () => {
  assert.equal(evaluateCrossmatchHold(baselineInput({
    antibodyScreenResult: 'pending', priorAntibodyIdentified: ['Anti-K'],
  })).status, 'hold_pending_screen');
});
