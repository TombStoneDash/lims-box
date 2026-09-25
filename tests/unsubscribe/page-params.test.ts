import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeParam } from '../../lib/unsubscribe-params';

test('already-decoded literal percent is preserved without throwing', () => {
  assert.equal(safeParam('a%b@x.com', ''), 'a%b@x.com');
});

test('undefined uses the fallback', () => {
  assert.equal(safeParam(undefined, 'newsletter'), 'newsletter');
});

test('surrounding whitespace is trimmed', () => {
  assert.equal(safeParam(' \t person@example.com \n', ''), 'person@example.com');
});

test('over-long input is capped at 320 characters', () => {
  assert.equal(safeParam('a'.repeat(321), ''), 'a'.repeat(320));
});

test('page does not decode search parameters a second time', () => {
  const page = readFileSync('app/unsubscribe/page.tsx', 'utf8');
  assert.doesNotMatch(page, /decodeURIComponent/);
});

test('client offers email entry and announces error and success', () => {
  const client = readFileSync('app/unsubscribe/UnsubscribeClient.tsx', 'utf8');
  assert.match(client, /role="alert"/);
  assert.match(client, /role="status"/);
  assert.match(client, /type="email"/);
});
