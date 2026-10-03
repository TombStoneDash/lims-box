import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEarlyAdopterSource, DEFAULT_EARLY_ADOPTER_SOURCE } from '../lib/leadAttribution';
import { parseAttributionSource, rollupByCampaign } from '../lib/campaign-attribution-rollup';

test('builder output round-trips with normalized, allowed attribution values', () => {
  const cases = [
    { input: {}, expected: {} },
    {
      input: { utm_campaign: ' COLA_FORUM_2026 ', utm_source: 'COLA2026' },
      expected: { utm_source: 'cola2026', utm_campaign: 'cola_forum_2026' },
    },
    {
      input: new URLSearchParams('utm_source=cola2026&utm_medium=QR&utm_campaign=forum&utm_content=booth-card.1&unknown=drop'),
      expected: { utm_source: 'cola2026', utm_medium: 'qr', utm_campaign: 'forum', utm_content: 'booth-card.1' },
    },
    {
      input: { utm_medium: ['bad value', 'CTA', 'qr'], utm_campaign: 'x'.repeat(49), utm_content: null },
      expected: { utm_medium: 'cta' },
    },
    {
      input: new URLSearchParams('utm_campaign=bad+value&utm_campaign=valid&utm_campaign=ignored'),
      expected: { utm_campaign: 'valid' },
    },
    {
      input: { utm_campaign: 'c'.repeat(48) },
      expected: { utm_campaign: 'c'.repeat(48) },
    },
  ];

  for (const { input, expected } of cases) {
    const source = buildEarlyAdopterSource(input);
    const parsed = parseAttributionSource(source);
    assert.deepEqual(parsed, { base: DEFAULT_EARLY_ADOPTER_SOURCE, utm: expected });
    assert.equal(buildEarlyAdopterSource(parsed.utm), source);
  }
});

test('bare sources preserve the entire base and have no attribution', () => {
  for (const source of [DEFAULT_EARLY_ADOPTER_SOURCE, 'legacy source', '', 'utm_campaign=bare']) {
    assert.deepEqual(parseAttributionSource(source), { base: source, utm: {} });
  }
});

test('malformed and truncated sources never throw and retain valid segments', () => {
  for (const source of [
    `${DEFAULT_EARLY_ADOPTER_SOURCE};`,
    `${DEFAULT_EARLY_ADOPTER_SOURCE};utm_campaign`,
    ';utm_campaign=;=missing-key;;unknown=value;utm_content=%E0%A4%A;utm_source=a=b',
  ]) {
    assert.doesNotThrow(() => parseAttributionSource(source));
    assert.deepEqual(parseAttributionSource(source).utm, {});
  }
  assert.deepEqual(
    parseAttributionSource('legacy;utm_campaign=;utm_campaign=valid;utm_campaign=ignored;utm_medium=qr;utm_content'),
    { base: 'legacy', utm: { utm_campaign: 'valid', utm_medium: 'qr' } },
  );
});

test('rollup groups campaign records across channels and includes direct traffic', () => {
  const sources = [
    buildEarlyAdopterSource({ utm_campaign: 'forum', utm_medium: 'qr' }),
    buildEarlyAdopterSource({ utm_campaign: 'forum', utm_medium: 'cta' }),
    buildEarlyAdopterSource({ utm_campaign: 'newsletter' }),
    DEFAULT_EARLY_ADOPTER_SOURCE,
    'legacy',
    buildEarlyAdopterSource({ utm_source: 'cola2026' }),
    `${DEFAULT_EARLY_ADOPTER_SOURCE};utm_campaign=`,
    buildEarlyAdopterSource({ utm_campaign: 'direct' }),
  ];
  const original = [...sources];
  assert.deepEqual(rollupByCampaign(sources), { forum: 2, newsletter: 1, direct: 5 });
  assert.deepEqual(sources, original);
  assert.deepEqual(rollupByCampaign([]), {});
});

test('campaign names that match object properties are counted normally', () => {
  assert.deepEqual(rollupByCampaign([
    buildEarlyAdopterSource({ utm_campaign: 'constructor' }),
    buildEarlyAdopterSource({ utm_campaign: 'constructor' }),
    buildEarlyAdopterSource({ utm_campaign: 'tostring' }),
  ]), { constructor: 2, tostring: 1 });
});
