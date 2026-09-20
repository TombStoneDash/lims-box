import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askBot } from '../../lib/bot/engine';
import { corpus } from '../../lib/bot/corpus';

function title(id: string): string {
  const entry = corpus.find((candidate) => candidate.id === id);
  assert.ok(entry, `Missing fixture entry: ${id}`);
  return entry.title;
}

const defaults = ['what-is-lims-box', 'pricing', 'pilot-program'].map(title);
const offCorpusQuestions = [
  'zzqxvbl', 'pizza', 'astronomy', 'unicorn', 'penguin',
  'volcano', 'origami', 'chess', 'galaxy', 'ruggedized',
];

test('gibberish gets exactly the three default corpus titles', () => {
  const response = askBot('zzqxvbl');
  assert.equal(response.grounded, false);
  assert.deepEqual(response.suggestions, defaults);
});

test('non-string, empty, and all-stopword inputs get defaults', () => {
  for (const input of [null, undefined, 42, {}, [], '', '   ', 'the and or lims box']) {
    assert.deepEqual(askBot(input).suggestions, defaults);
  }
});

test('a weak text match ranks before defaults', () => {
  const response = askBot('ruggedized');
  assert.equal(response.grounded, false);
  assert.deepEqual(response.suggestions, [title('offline'), ...defaults.slice(0, 2)]);
});

test('a weak title match outranks text matches, with ties in corpus order', () => {
  const response = askBot('dedicated');
  assert.equal(response.grounded, false);
  assert.deepEqual(response.suggestions, [
    title('it-staff'), title('pilot-program'), title('support'),
  ]);
});

test('grounded answers never include suggestions', () => {
  for (const entry of corpus) {
    const response = askBot(entry.title);
    if (response.grounded) assert.equal(response.suggestions, undefined);
  }
  assert.equal(askBot(defaults[0]).grounded, true);
});

test('suggestions exclude compliance positioning even for partial matches', () => {
  for (const question of [...offCorpusQuestions, 'positioning', 'human-controlled']) {
    assert.ok(!askBot(question).suggestions?.includes(title('compliance-positioning')));
  }
});

test('ten off-corpus questions get unique, bounded, verbatim titles that round-trip', () => {
  for (const question of offCorpusQuestions) {
    const response = askBot(question);
    assert.equal(response.grounded, false, question);
    const suggestions = response.suggestions;
    assert.ok(suggestions && suggestions.length > 0 && suggestions.length <= 3, question);
    assert.equal(new Set(suggestions).size, suggestions.length, question);
    for (const suggestion of suggestions) {
      assert.ok(corpus.some((entry) => entry.title === suggestion));
      assert.equal(askBot(suggestion).grounded, true, suggestion);
    }
  }
});

test('script and long input cannot be interpolated into suggestions', () => {
  for (const question of ['<script>zzqxvbl</script>', 'zzqxvbl'.repeat(1000)]) {
    const response = askBot(question);
    assert.equal(response.grounded, false);
    assert.deepEqual(response.suggestions, defaults);
    for (const suggestion of response.suggestions ?? []) {
      assert.ok(!suggestion.includes(question));
      assert.ok(!suggestion.includes('<script>'));
      assert.ok(!suggestion.includes('zzqxvbl'));
    }
  }
});

test('default padding does not repeat a partial match', () => {
  const response = askBot('anytime');
  assert.equal(response.grounded, false);
  assert.deepEqual(response.suggestions, [defaults[1], defaults[0], defaults[2]]);
});
