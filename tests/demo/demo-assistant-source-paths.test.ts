import test from 'node:test';
import assert from 'node:assert/strict';
import { replyText } from '../../lib/demo-assistant-chat';

test('drops javascript:, data:, protocol-relative, absolute, backslash, and whitespace paths', () => {
  for (const path of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '//evil.example/x',
    'https://evil.example/',
    '/\\evil',
    '/demo assistant',
  ]) {
    assert.deepEqual(replyText(true, { answer: 'A', sources: [{ title: 'T', path }] }), {
      text: 'A', sources: [],
    });
  }
});

test('keeps a same-site path', () => {
  const source = { title: 'Synthetic sample', path: '/demo/assistant#synthetic-sample-syn-26041-0001' };
  assert.deepEqual(replyText(true, { answer: 'A', sources: [source] }), {
    text: 'A', sources: [source],
  });
});

test('keeps only valid entries from a mixed list, in order', () => {
  const first = { title: 'First', path: '/demo/assistant#one' };
  const second = { title: 'Second', path: '/demo/assistant#two' };
  assert.deepEqual(replyText(true, {
    answer: 'A',
    sources: [
      { title: 'Bad', path: 'javascript:alert(1)' },
      first,
      { title: 'Bad2', path: '//evil.example/x' },
      second,
      { title: 'Bad3', path: 'https://evil.example/' },
    ],
  }), { text: 'A', sources: [first, second] });
});
