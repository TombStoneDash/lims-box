import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { safeParam } from '../../lib/unsubscribe-params';
import UnsubscribePage from '../../app/unsubscribe/page';

// tsx compiles this repository's preserved JSX in classic mode.
Object.assign(globalThis, { React });

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

test('repeated identical array parameter resolves to the single value', () => {
  assert.equal(safeParam(['a@x.com', 'a@x.com'], ''), 'a@x.com');
});

test('repeated array parameter with incidental whitespace resolves to the trimmed value', () => {
  assert.equal(safeParam([' a@x.com ', 'a@x.com'], ''), 'a@x.com');
});

test('empty array entries are dropped before comparing', () => {
  assert.equal(safeParam(['', 'a@x.com'], ''), 'a@x.com');
});

test('conflicting array values fall back regardless of order', () => {
  assert.equal(safeParam(['a@x.com', 'b@y.com'], ''), '');
  assert.equal(safeParam(['b@y.com', 'a@x.com'], ''), '');
});

test('empty or all-blank arrays use the fallback', () => {
  assert.equal(safeParam([], 'newsletter'), 'newsletter');
  assert.equal(safeParam(['', '  '], 'newsletter'), 'newsletter');
});

test('conflicting list array values fall back to the default regardless of order', () => {
  assert.equal(safeParam(['all', 'newsletter'], 'newsletter'), 'newsletter');
  assert.equal(safeParam(['newsletter', 'all'], 'newsletter'), 'newsletter');
});

test('array entries are capped at 320 characters', () => {
  assert.equal(safeParam(['a'.repeat(321)], ''), 'a'.repeat(320));
});

test('long array values that differ only after 320 characters still conflict', () => {
  const shared = 'a'.repeat(320);
  assert.equal(safeParam([`${shared}b`, `${shared}c`], ''), '');
  assert.equal(safeParam([`${shared}c`, `${shared}b`], 'newsletter'), 'newsletter');
});

test('repeated identical params render the page without throwing and skip the email box', async () => {
  const markup = renderToStaticMarkup(
    await UnsubscribePage({
      searchParams: Promise.resolve({
        email: ['person@example.com', 'person@example.com'],
        list: ['all', 'all'],
      }),
    })
  );

  assert.ok(markup.includes('person@example.com'));
  assert.ok(markup.includes('all LIMS BOX emails'));
  assert.ok(!markup.includes('id="unsubscribe-email"'));
});

test('conflicting email params render the email entry box and neither address', async () => {
  const markup = renderToStaticMarkup(
    await UnsubscribePage({
      searchParams: Promise.resolve({ email: ['a@x.com', 'b@y.com'] }),
    })
  );

  assert.ok(markup.includes('id="unsubscribe-email"'));
  assert.ok(!markup.includes('a@x.com'));
  assert.ok(!markup.includes('b@y.com'));
});

test('conflicting list params render the default newsletter wording regardless of order', async () => {
  const first = renderToStaticMarkup(
    await UnsubscribePage({
      searchParams: Promise.resolve({ list: ['all', 'newsletter'] }),
    })
  );
  const second = renderToStaticMarkup(
    await UnsubscribePage({
      searchParams: Promise.resolve({ list: ['newsletter', 'all'] }),
    })
  );

  assert.ok(first.includes('the LIMS BOX newsletter'));
  assert.ok(second.includes('the LIMS BOX newsletter'));
});
