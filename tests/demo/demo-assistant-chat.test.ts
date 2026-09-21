import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replyText } from '../../lib/demo-assistant-chat';

const fallback = { text: 'The local demo could not answer. Try again.', sources: [] };

test('returns a good answer and its sources', () => {
  const sources = [{ title: 'Synthetic sample', path: '/demo/assistant#sample' }];
  assert.deepEqual(replyText(true, { answer: 'Sample received.', sources }), {
    text: 'Sample received.', sources,
  });
});

test('returns server errors without sources', () => {
  for (const ok of [true, false]) {
    assert.deepEqual(replyText(ok, { error: 'Please try later.', answer: 'Ignored' }), {
      text: 'Please try later.', sources: [],
    });
  }
});

test('falls back for unsuccessful responses including junk and answer-shaped bodies', () => {
  for (const body of ['junk', {}, { answer: 'Do not use this answer' }]) {
    assert.deepEqual(replyText(false, body), fallback);
  }
});

test('falls back for null, missing, malformed, and empty replies', () => {
  for (const body of [null, undefined, [], 42, {}, { answer: 42 }, { answer: '' }, { answer: ' ' }, { error: '' }]) {
    assert.deepEqual(replyText(true, body), fallback);
  }
});

test('drops sources with missing, malformed, or empty fields', () => {
  const valid = { title: 'Sample', path: '/demo/assistant#sample' };
  assert.deepEqual(replyText(true, {
    answer: 'Answer',
    sources: [null, 'junk', {}, { title: 'Missing path' }, { path: '/missing-title' },
      { title: 42, path: '/sample' }, { title: 'Sample', path: false },
      { title: ' ', path: '/sample' }, { title: 'Sample', path: '' }, valid],
  }), { text: 'Answer', sources: [valid] });
  for (const sources of [undefined, null, 'junk', {}]) {
    assert.deepEqual(replyText(true, { answer: 'Answer', sources }), { text: 'Answer', sources: [] });
  }
});

test('chat labels its input and speakers, announces replies, and keeps suggestions available', () => {
  const source = readFileSync(new URL('../../app/demo/assistant/demo-assistant-chat.tsx', import.meta.url), 'utf8');
  assert.match(source, /role="log"/);
  assert.match(source, /aria-busy=\{busy\}/);
  assert.match(source, /htmlFor=\{inputId\}/);
  assert.match(source, /id=\{inputId\}/);
  assert.match(source, /You asked: /);
  assert.match(source, /Demo assistant answered: /);
  assert.doesNotMatch(source, /items\.length\s*===\s*0/);
  assert.match(source, /disabled=\{busy\}/);
  assert.match(source, /inputRef\.current\?\.focus\(\)/);
});
