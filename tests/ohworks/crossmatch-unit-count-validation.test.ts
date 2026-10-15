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

const invalidUnitCounts: Array<[string, unknown]> = [
  ['NaN', NaN],
  ['Infinity', Infinity],
  ['-Infinity', -Infinity],
  ['1.5', 1.5],
  ['0.5', 0.5],
  ['undefined', undefined],
  ["'2' (string)", '2'],
];

for (const [label, value] of invalidUnitCounts) {
  test(`throws a descriptive error when requestedUnitCount is ${label}`, () => {
    assert.throws(
      () => evaluateCrossmatchHold(baselineInput({ requestedUnitCount: value as unknown as number })),
      /requestedUnitCount/,
    );
  });
}

test('clear_to_crossmatch when requestedUnitCount is 1', () => {
  const decision = evaluateCrossmatchHold(baselineInput({ requestedUnitCount: 1 }));
  assert.equal(decision.status, 'clear_to_crossmatch');
});

test('clear_to_crossmatch when requestedUnitCount is 3', () => {
  const decision = evaluateCrossmatchHold(baselineInput({ requestedUnitCount: 3 }));
  assert.equal(decision.status, 'clear_to_crossmatch');
});
