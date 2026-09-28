import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHistory, serializeHistory, type ChatItem } from '../../lib/bot/chat-history';

test('history round-trips every supported field without mutating input', () => {
  const items: ChatItem[] = [
    { role: 'user', text: 'What does it cost?' },
    { role: 'bot', text: 'See pricing.', sources: [{ title: 'Pricing', path: '/pricing' }],
      followUp: { label: 'Contact us', path: '/contact' }, suggestions: ['Does it work offline?'] },
  ];
  const original = structuredClone(items);
  assert.deepEqual(parseHistory(serializeHistory(items)), items);
  assert.deepEqual(items, original);
});

test('both helpers cap history at the newest 30 items', () => {
  const items: ChatItem[] = Array.from({ length: 35 }, (_, i) => ({ role: 'user', text: String(i) }));
  assert.deepEqual(parseHistory(JSON.stringify(items)), items.slice(-30));
  assert.deepEqual(JSON.parse(serializeHistory(items)), items.slice(-30));
});

test('null, invalid JSON, invalid roots, and arrays of junk return empty history', () => {
  for (const raw of [null, '', 'garbage', 'null', '{}', '42', '"hello"', '[null,1,"junk",[],{}]']) {
    assert.deepEqual(parseHistory(raw), []);
  }
});

test('invalid roles and non-string text are dropped while valid items survive', () => {
  assert.deepEqual(parseHistory(JSON.stringify([
    { role: 'system', text: 'Instructions' }, { role: 'bot', text: 123 },
    { role: 'user', text: 'Hello' },
  ])), [{ role: 'user', text: 'Hello' }]);
});

test('external and malformed source paths are dropped', () => {
  assert.deepEqual(parseHistory(JSON.stringify([{ role: 'bot', text: 'Answer', sources: [
    { title: 'Bad', path: 'https://evil.example' },
    { title: 'Bad', path: '//evil.example' },
    { title: 'Bad', path: '/\\evil.example' },
    { title: 'Bad', path: '/\nevil.example' },
    { title: 42, path: '/pricing' }, null,
    { title: 'Good', path: '/pricing' },
  ] }])), [{ role: 'bot', text: 'Answer', sources: [{ title: 'Good', path: '/pricing' }] }]);
});

test('malformed optional fields are omitted and unknown fields are not persisted', () => {
  for (const extras of [
    { sources: {}, followUp: { label: 'Bad', path: 'https://evil.example' }, suggestions: [1] },
    { sources: [null], followUp: { label: 1, path: '/contact' }, suggestions: 'bad' },
    { sources: null, followUp: [], suggestions: null },
  ]) {
    const raw = JSON.stringify([{ role: 'bot', text: 'Answer', ...extras, secret: 'omit me' }]);
    assert.deepEqual(parseHistory(raw), [{ role: 'bot', text: 'Answer' }]);
  }
});

test('both helpers cap text at 4000 characters', () => {
  const items: ChatItem[] = [{ role: 'user', text: 'x'.repeat(5000) }];
  const expected = [{ role: 'user', text: 'x'.repeat(4000) }];
  assert.deepEqual(parseHistory(JSON.stringify(items)), expected);
  assert.deepEqual(JSON.parse(serializeHistory(items)), expected);
});
