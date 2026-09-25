import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePersonnelPackSelection,
  resolvePersonnelPackAsset,
  type PersonnelPackAssetMap,
} from '../../lib/personnelPackAssets';

const TEST_ASSETS: PersonnelPackAssetMap = {
  iso15189: {
    key: 'iso15189',
    label: 'ISO 15189 Personnel Pack v1.5',
    url: '/personnel-pack-assets/iso-15189-demo-fixture.pdf',
  },
};

test('a supported selection resolves to its injected asset metadata', () => {
  const result = resolvePersonnelPackAsset('iso15189', TEST_ASSETS);
  assert.deepEqual(result, { ok: true, asset: TEST_ASSETS.iso15189 });
});

test('a supported selection with surrounding whitespace and mixed case still resolves', () => {
  const result = resolvePersonnelPackAsset('  ISO15189  ', TEST_ASSETS);
  assert.deepEqual(result, { ok: true, asset: TEST_ASSETS.iso15189 });
});

test('a missing selection is reported without echoing the input', () => {
  assert.deepEqual(resolvePersonnelPackAsset(undefined, TEST_ASSETS), {
    ok: false,
    reason: 'missing_selection',
  });
  assert.deepEqual(resolvePersonnelPackAsset(null, TEST_ASSETS), {
    ok: false,
    reason: 'missing_selection',
  });
  assert.deepEqual(resolvePersonnelPackAsset('', TEST_ASSETS), {
    ok: false,
    reason: 'missing_selection',
  });
  assert.deepEqual(resolvePersonnelPackAsset('   ', TEST_ASSETS), {
    ok: false,
    reason: 'missing_selection',
  });
});

test('a malformed selection is reported without echoing the raw value', () => {
  const malformedInputs: unknown[] = [
    'not a token!',
    'has spaces inside',
    '<script>alert(1)</script>',
    '-leading-dash',
    'a'.repeat(65),
    42,
    { key: 'iso15189' },
    ['iso15189'],
  ];

  for (const input of malformedInputs) {
    const result = resolvePersonnelPackAsset(input, TEST_ASSETS);
    assert.equal(result.ok, false, `expected ${JSON.stringify(input)} to fail`);
    if (!result.ok) {
      assert.equal(result.reason, 'malformed_selection');
      assert.equal(JSON.stringify(result).includes('script'), false);
    }
  }
});

test('a well-formed but unsupported selection is reported as unknown, not malformed', () => {
  const result = resolvePersonnelPackAsset('cola', TEST_ASSETS);
  assert.deepEqual(result, { ok: false, reason: 'unknown_selection' });
});

test('an empty asset map treats every well-formed selection as unknown', () => {
  const result = resolvePersonnelPackAsset('iso15189', {});
  assert.deepEqual(result, { ok: false, reason: 'unknown_selection' });
});

test('failure results never carry a "selection" or "input" field that could leak raw text', () => {
  const result = resolvePersonnelPackAsset('<img src=x onerror=alert(1)>', TEST_ASSETS);
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result), ['ok', 'reason']);
});

test('normalizePersonnelPackSelection normalizes valid tokens and rejects everything else', () => {
  assert.equal(normalizePersonnelPackSelection('iso15189'), 'iso15189');
  assert.equal(normalizePersonnelPackSelection('  ISO15189  '), 'iso15189');
  assert.equal(normalizePersonnelPackSelection(''), null);
  assert.equal(normalizePersonnelPackSelection(null), null);
  assert.equal(normalizePersonnelPackSelection(undefined), null);
  assert.equal(normalizePersonnelPackSelection(123), null);
  assert.equal(normalizePersonnelPackSelection('bad token'), null);
  assert.equal(normalizePersonnelPackSelection('a'.repeat(65)), null);
});
