import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  ALLOWED_UTM_KEYS,
  DEFAULT_EARLY_ADOPTER_SOURCE,
  MAX_EARLY_ADOPTER_SOURCE_LENGTH,
  buildEarlyAdopterSource,
  normalizeAttributionToken,
  normalizeSubmittedEarlyAdopterSource,
  resolveEarlyAdopterSource,
  withCampaignAttribution,
} from '../../lib/leadAttribution';

test('direct early-adopter traffic keeps the stable default source', () => {
  assert.equal(buildEarlyAdopterSource(new URLSearchParams()), DEFAULT_EARLY_ADOPTER_SOURCE);
  assert.equal(
    resolveEarlyAdopterSource(undefined, null, 'https://lims.bot'),
    DEFAULT_EARLY_ADOPTER_SOURCE,
  );
});

test('COLA CTA and QR attribution are deterministic and queryable', () => {
  const cta = buildEarlyAdopterSource(new URLSearchParams(
    'utm_campaign=COLA_FORUM_2026&utm_medium=CTA&utm_source=COLA2026',
  ));
  const qr = buildEarlyAdopterSource(new URLSearchParams(
    'utm_source=cola2026&utm_medium=qr&utm_campaign=cola_forum_2026',
  ));

  assert.equal(
    cta,
    'lims.bot/early-adopter;utm_source=cola2026;utm_medium=cta;utm_campaign=cola_forum_2026',
  );
  assert.equal(
    qr,
    'lims.bot/early-adopter;utm_source=cola2026;utm_medium=qr;utm_campaign=cola_forum_2026',
  );
  assert.notEqual(cta, qr);
});

test('only approved UTM keys and safe bounded tokens survive', () => {
  const params = new URLSearchParams();
  params.set('utm_source', 'COLA2026');
  params.set('utm_medium', 'qr');
  params.set('utm_campaign', 'cola_forum_2026');
  params.set('utm_content', 'booth-card.1');
  params.set('email', 'private@example.com');
  params.set('redirect', 'https://evil.invalid');

  const source = buildEarlyAdopterSource(params);
  assert.equal(
    source,
    'lims.bot/early-adopter;utm_source=cola2026;utm_medium=qr;utm_campaign=cola_forum_2026;utm_content=booth-card.1',
  );
  assert.equal(source.includes('email'), false);
  assert.equal(source.includes('evil'), false);
  assert.deepEqual(ALLOWED_UTM_KEYS, ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']);
});

test('malformed, empty, and oversized tokens are dropped rather than sanitized into storage', () => {
  assert.equal(normalizeAttributionToken(' hello world '), null);
  assert.equal(normalizeAttributionToken('name@example.com'), null);
  assert.equal(normalizeAttributionToken('https://example.com'), null);
  assert.equal(normalizeAttributionToken('x'.repeat(49)), null);
  assert.equal(normalizeAttributionToken('  COLA_2026  '), 'cola_2026');

  const source = buildEarlyAdopterSource(new URLSearchParams(
    `utm_source=${encodeURIComponent('name@example.com')}&utm_campaign=${'x'.repeat(49)}`,
  ));
  assert.equal(source, DEFAULT_EARLY_ADOPTER_SOURCE);
});

test('duplicate query parameters choose the first valid value in canonical key order', () => {
  const params = new URLSearchParams();
  params.append('utm_medium', 'bad value');
  params.append('utm_medium', 'QR');
  params.append('utm_source', 'COLA2026');
  params.append('utm_source', 'ignored_second_value');

  assert.equal(
    buildEarlyAdopterSource(params),
    'lims.bot/early-adopter;utm_source=cola2026;utm_medium=qr',
  );
});

test('submitted source strings are canonicalized and arbitrary source text is rejected', () => {
  assert.equal(
    normalizeSubmittedEarlyAdopterSource(
      'lims.bot/early-adopter;utm_medium=QR;utm_source=COLA2026;unknown=drop;utm_content=bad value',
    ),
    'lims.bot/early-adopter;utm_source=cola2026;utm_medium=qr',
  );
  assert.equal(
    normalizeSubmittedEarlyAdopterSource('custom-crm-source;email=private@example.com'),
    DEFAULT_EARLY_ADOPTER_SOURCE,
  );
});

test('same-origin Referer attribution takes precedence over generic submitted source', () => {
  assert.equal(
    resolveEarlyAdopterSource(
      'custom-untrusted-source',
      'https://lims.bot/early-adopter?utm_source=cola2026&utm_medium=qr&utm_campaign=cola_forum_2026',
      'https://lims.bot',
    ),
    'lims.bot/early-adopter;utm_source=cola2026;utm_medium=qr;utm_campaign=cola_forum_2026',
  );
});

test('cross-origin or invalid Referer attribution is ignored', () => {
  assert.equal(
    resolveEarlyAdopterSource(
      'custom-untrusted-source',
      'https://external.invalid/early-adopter?utm_source=spoofed&utm_medium=qr',
      'https://lims.bot',
    ),
    DEFAULT_EARLY_ADOPTER_SOURCE,
  );
  assert.equal(
    resolveEarlyAdopterSource(
      'custom-untrusted-source',
      'not a valid URL',
      'https://lims.bot',
    ),
    DEFAULT_EARLY_ADOPTER_SOURCE,
  );
});

test('campaign URLs preserve existing query parameters and add only normalized UTM values', () => {
  assert.equal(
    withCampaignAttribution('/early-adopter', {
      utm_source: 'COLA2026',
      utm_medium: 'CTA',
      utm_campaign: 'COLA_FORUM_2026',
    }),
    '/early-adopter?utm_source=cola2026&utm_medium=cta&utm_campaign=cola_forum_2026',
  );

  assert.equal(
    withCampaignAttribution('https://calendly.com/hudtaylor/cola-nashville?month=2026-05', {
      utm_source: 'cola2026',
      utm_medium: 'calendar',
      utm_campaign: 'cola_forum_2026',
    }),
    'https://calendly.com/hudtaylor/cola-nashville?month=2026-05&utm_source=cola2026&utm_medium=calendar&utm_campaign=cola_forum_2026',
  );
});

test('source output remains bounded', () => {
  const source = buildEarlyAdopterSource(new URLSearchParams({
    utm_source: 's'.repeat(48),
    utm_medium: 'm'.repeat(48),
    utm_campaign: 'c'.repeat(48),
    utm_content: 'x'.repeat(48),
  }));
  assert.ok(source.length <= MAX_EARLY_ADOPTER_SOURCE_LENGTH);
});

test('route and COLA page are wired to the shared helper without raw source passthrough', () => {
  const route = fs.readFileSync(path.join(process.cwd(), 'app/api/early-access/route.ts'), 'utf8');
  const handler = fs.readFileSync(path.join(process.cwd(), 'lib/earlyAccessHandler.ts'), 'utf8');
  const cola = fs.readFileSync(path.join(process.cwd(), 'app/cola/page.tsx'), 'utf8');

  assert.match(
    handler,
    /resolveEarlyAdopterSource\([\s\S]*request\.headers\.get\('referer'\)[\s\S]*request\.nextUrl\.origin/,
  );
  assert.match(route, /createEarlyAccessPostHandler/);
  assert.doesNotMatch(handler, /source:\s*source\s*\?/);
  assert.match(cola, /utm_medium:\s*'cta'/);
  assert.match(cola, /utm_medium:\s*'qr'/);
  assert.match(cola, /EARLY_ADOPTER_CTA_URL/);
  assert.match(cola, /EARLY_ADOPTER_QR_URL/);
});
