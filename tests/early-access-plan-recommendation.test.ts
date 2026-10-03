import assert from 'node:assert/strict';
import test from 'node:test';
import { EARLY_ACCESS_VOLUME_OPTIONS } from '../lib/earlyAccessApplication';
import {
  describeAllTiers,
  recommendMessagingTier,
} from '../lib/early-access-plan-recommendation';

const expectedTiers = [
  ['under-100', 'starter'],
  ['100-500', 'starter'],
  ['500-1000', 'growth'],
  ['1000-5000', 'growth'],
  ['over-5000', 'enterprise'],
] as const;

for (const [value, tier] of expectedTiers) {
  test(`${value} maps to the ${tier} internal messaging tier`, () => {
    const recommendation = recommendMessagingTier(value);
    assert.equal(recommendation.tier, tier);
    assert.match(recommendation.label, /internal sales triage/i);
  });
}

for (const value of ['', 'unrecognized', 'UNDER-100', ' under-100 ', '100', 'toString', '__proto__']) {
  test(`unrecognized value ${JSON.stringify(value)} never gets a guessed tier`, () => {
    const recommendation = recommendMessagingTier(value);
    assert.equal(recommendation.tier, 'unknown');
    assert.match(recommendation.label, /not recognized/i);
  });
}

test('describeAllTiers covers every volume option exactly once', () => {
  const descriptions = describeAllTiers();
  const values = EARLY_ACCESS_VOLUME_OPTIONS.map(({ value }) => value);

  assert.deepEqual(values, expectedTiers.map(([value]) => value));
  assert.deepEqual(descriptions.map(({ value }) => value), values);
  assert.equal(new Set(descriptions.map(({ value }) => value)).size, values.length);
  for (const [value, tier] of expectedTiers) {
    assert.deepEqual(descriptions.find((entry) => entry.value === value), {
      value,
      tier,
      label: recommendMessagingTier(value).label,
    });
  }
});
