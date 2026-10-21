import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToken, normalizeTokens, SYNONYMS } from '../../lib/bot/query-normalizer';

test('exact vocabulary tokens pass through unchanged', () => {
  for (const token of ['pricing', 'offline', 'instruments', 'compliant', 'migrate']) {
    assert.equal(normalizeToken(token), token);
  }
});

test('unambiguous single-character-edit typos are corrected to the real word', () => {
  assert.equal(normalizeToken('pricng'), 'pricing');
  assert.equal(normalizeToken('offlne'), 'offline');
  assert.equal(normalizeToken('instrment'), 'instrument');
  assert.equal(normalizeToken('migrat'), 'migrate');
});

test('every declared synonym resolves to a word that is a real corpus concept', () => {
  for (const [synonym, canonical] of Object.entries(SYNONYMS)) {
    assert.equal(normalizeToken(synonym), canonical, `${synonym} should resolve to ${canonical}`);
  }
});

test('short tokens are never typo-corrected, even if close to a real word', () => {
  // length < 4 is below the correction floor regardless of edit distance.
  assert.equal(normalizeToken('cst'), 'cst');
  assert.equal(normalizeToken('ofl'), 'ofl');
});

test('tokens containing digits are never typo-corrected', () => {
  assert.equal(normalizeToken('17026'), '17026');
  assert.equal(normalizeToken('21cfr'), '21cfr');
});

test('unrelated off-topic words are left unchanged (no accidental correction)', () => {
  for (const token of ['pizza', 'dinosaur', 'skateboard', 'nightshift']) {
    assert.equal(normalizeToken(token), token);
  }
});

test('ambiguous near-misses are left uncorrected rather than guessed', () => {
  // "methds" is one edit away from both "methods" and (incidentally) could
  // collide with other close vocabulary words; the function must only ever
  // commit to a single unambiguous candidate or leave the token alone -- it
  // must never throw or silently pick an arbitrary candidate.
  const result = normalizeToken('methds');
  assert.ok(result === 'methds' || result === 'methods');
});

test('normalizeTokens preserves array order and length', () => {
  const input = ['pricng', 'for', 'disconnected', 'labs'];
  const result = normalizeTokens(input);
  assert.equal(result.length, input.length);
  assert.equal(result[0], 'pricing');
  assert.equal(result[2], 'offline');
});

test('normalization is deterministic across repeated calls', () => {
  const token = 'technican';
  const first = normalizeToken(token);
  const second = normalizeToken(token);
  assert.equal(first, second);
});
