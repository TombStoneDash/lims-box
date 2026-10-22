import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyHardcodedSynonyms, HARDCODED_SYNONYMS } from '../lib/bot/query-normalizer';

test('every hard-coded single-word synonym resolves to its canonical form', () => {
  assert.equal(applyHardcodedSynonyms('price'), 'pricing');
  assert.equal(applyHardcodedSynonyms('cost'), 'pricing');
  assert.equal(applyHardcodedSynonyms('LIS'), 'lims');
});

test('the hard-coded phrase synonym rewrites "sign up" to "signup" in context', () => {
  assert.equal(
    applyHardcodedSynonyms('How do I sign up for LIMS BOX?'),
    'How do I signup for LIMS BOX?',
  );
});

test('a single-character typo of a hard-coded synonym key still resolves', () => {
  // "pricng" is "pricing" missing one letter -- within edit distance 1 of
  // the "price"/"cost" target "pricing" itself.
  assert.equal(applyHardcodedSynonyms('pricng'), 'pricing');
});

test('an unrelated word of the same length is not falsely corrected', () => {
  // "signal" is not within edit distance 1 of any synonym key or value
  // (closest is "signup", which differs by 2 edits), so it must pass
  // through unchanged.
  assert.equal(applyHardcodedSynonyms('signal'), 'signal');
  assert.equal(applyHardcodedSynonyms('dinosaur'), 'dinosaur');
});

test('sanity: the declared table only contains the expected entries', () => {
  assert.deepEqual(HARDCODED_SYNONYMS, {
    price: 'pricing',
    prices: 'pricing',
    cost: 'pricing',
    costs: 'pricing',
    'sign up': 'signup',
    lis: 'lims',
  });
});
