import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_PROMPT_LENGTH, botHref, readBotPrompt } from '../../lib/bot/front-door';

test('readBotPrompt drops a dangling high surrogate left by the length cap', () => {
  const prompt = readBotPrompt(`?bot=${encodeURIComponent('a'.repeat(499) + '\u{1F600}')}`);
  assert.ok(prompt !== null);
  assert.equal(prompt, 'a'.repeat(499));
  assert.equal(prompt.length, 499);
  assert.equal(prompt.isWellFormed(), true);
});

test('readBotPrompt keeps an emoji that fits entirely inside the cap', () => {
  const prompt = readBotPrompt(`?bot=${encodeURIComponent('a'.repeat(498) + '\u{1F600}')}`);
  assert.ok(prompt !== null);
  assert.equal(prompt, 'a'.repeat(498) + '\u{1F600}');
  assert.equal(prompt.length, 500);
  assert.equal(prompt.isWellFormed(), true);
});

test('readBotPrompt still caps plain BMP text at exactly the limit', () => {
  const prompt = readBotPrompt(`?bot=${'x'.repeat(900)}`);
  assert.ok(prompt !== null);
  assert.equal(prompt.length, MAX_PROMPT_LENGTH);
  assert.equal(prompt, 'x'.repeat(MAX_PROMPT_LENGTH));
});

test('botHref round-trips a prompt truncated at a surrogate boundary', () => {
  const prompt = readBotPrompt(`?bot=${encodeURIComponent('a'.repeat(499) + '\u{1F600}')}`);
  assert.ok(prompt !== null);
  const href = botHref(prompt);
  const roundTripped = readBotPrompt(href.slice(href.indexOf('?')));
  assert.equal(roundTripped, prompt);
});
