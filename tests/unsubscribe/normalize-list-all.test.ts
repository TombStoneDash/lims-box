import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeList } from '../../lib/unsubscribe';

test('case-insensitive "all" variants normalize to "all"', () => {
  assert.equal(normalizeList('ALL'), 'all');
  assert.equal(normalizeList('All'), 'all');
  assert.equal(normalizeList(' all '), 'all');
});

test('non-"all" values remain unchanged', () => {
  assert.equal(normalizeList('newsletter'), 'newsletter');
  assert.equal(normalizeList(undefined), 'newsletter');
});
