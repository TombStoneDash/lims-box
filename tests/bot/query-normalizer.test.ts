import { test } from 'node:test';
import assert from 'node:assert/strict';
import { corpus } from '../../lib/bot/corpus';
import { correctToken, expandTokens, PHRASE_SYNONYMS, TOKEN_SYNONYMS } from '../../lib/bot/query-normalizer';

const VOCABULARY = new Set(corpus.flatMap((entry) => entry.keywords));

test('every TOKEN_SYNONYMS target is a real corpus keyword', () => {
  for (const [word, target] of Object.entries(TOKEN_SYNONYMS)) {
    assert.ok(VOCABULARY.has(target), `${word} -> ${target} is not a corpus keyword`);
  }
});

test('every PHRASE_SYNONYMS replacement word is a real corpus keyword', () => {
  for (const [pattern, replacement] of PHRASE_SYNONYMS) {
    for (const word of replacement.split(/\s+/)) {
      assert.ok(VOCABULARY.has(word), `${pattern} -> "${replacement}" word "${word}" is not a corpus keyword`);
    }
  }
});

test('correctToken fixes single-edit typos of corpus keywords', () => {
  const cases: Array<[string, string]> = [
    ['prcing', 'pricing'],
    ['ofline', 'offline'],
    ['instrment', 'instrument'],
    ['migarte', 'migrate'],
  ];
  for (const [typo, expected] of cases) {
    assert.equal(correctToken(typo, VOCABULARY), expected, typo);
  }
});

test('correctToken leaves tokens shorter than 6 characters unchanged', () => {
  for (const word of ['later', 'order', 'night', 'shift', 'today']) {
    assert.equal(correctToken(word, VOCABULARY), word);
  }
});

test('correctToken leaves digit-bearing tokens unchanged', () => {
  for (const word of ['200.8', 'cfr21', 'icp-ms2']) {
    assert.equal(correctToken(word, VOCABULARY), word);
  }
});

test('correctToken leaves stop-words unchanged', () => {
  for (const word of ['about', 'should', 'yours']) {
    assert.equal(correctToken(word, VOCABULARY), word);
  }
});

test('correctToken leaves exact vocabulary words unchanged', () => {
  for (const word of ['pricing', 'offline', 'instrument', 'migrate']) {
    assert.equal(correctToken(word, VOCABULARY), word);
  }
});

test('correctToken never returns a compliance word', () => {
  const COMPLIANCE_WORDS = new Set([
    'clia', 'hipaa', 'compliance', 'compliant', 'certified', 'regulatory', 'regulated', 'fda',
  ]);
  for (const word of ['complance', 'regultory', 'certifed', 'hippa', 'compliancy', 'reguated']) {
    const result = correctToken(word, VOCABULARY);
    assert.ok(!COMPLIANCE_WORDS.has(result), `${word} -> ${result} must not be a compliance word`);
  }
});

test('correctToken regression list: correctly spelled everyday words map to themselves', () => {
  const words = ['later', 'order', 'night', 'shift', 'people', 'thanks', 'today', 'really', 'another', 'minutes'];
  for (const word of words) {
    assert.equal(correctToken(word, VOCABULARY), word, word);
  }
});

test('correctToken leaves ambiguous and probe words used by other tests unchanged', () => {
  for (const word of ['anytime', 'dedicated', 'ruggedized']) {
    assert.equal(correctToken(word, VOCABULARY), word, word);
  }
});

test('correctToken is pure: same output twice, input/vocabulary untouched', () => {
  const vocabCopy = new Set(VOCABULARY);
  const first = correctToken('prcing', VOCABULARY);
  const second = correctToken('prcing', VOCABULARY);
  assert.equal(first, second);
  assert.deepEqual(VOCABULARY, vocabCopy);
});

test('expandTokens is pure and preserves length/order without mutating input', () => {
  const tokens = ['does', 'it', 'work', 'ofline', 'prcing'];
  const tokensCopy = [...tokens];
  const result = expandTokens(tokens, VOCABULARY);
  assert.deepEqual(tokens, tokensCopy, 'input array must not be mutated');
  assert.equal(result.length, tokens.length);
  assert.deepEqual(result, ['does', 'it', 'work', 'offline', 'pricing']);

  const second = expandTokens(tokens, VOCABULARY);
  assert.deepEqual(result, second);
});
