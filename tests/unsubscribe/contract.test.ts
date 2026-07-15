import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fingerprintEmail,
  persistUnsubscribe,
  readUnsubscribeInput,
  type UnsubscribeRecord,
  type UnsubscribeStore,
} from '../../lib/unsubscribe';

function makeStore(record: UnsubscribeRecord | null, updateError?: Error) {
  const updates: Array<{ id: string; at: string }> = [];
  const store: UnsubscribeStore = {
    async findByEmail() {
      return record;
    },
    async markUnsubscribed(id, unsubscribedAt) {
      if (updateError) throw updateError;
      updates.push({ id, at: unsubscribedAt });
    },
  };

  return { store, updates };
}

test('one-click GET reads and normalizes query input', async () => {
  const request = new Request(
    'https://lims.bot/api/unsubscribe?email=Hudson%2BTest%40Example.com&list=all'
  );

  assert.deepEqual(await readUnsubscribeInput(request), {
    email: 'hudson+test@example.com',
    list: 'all',
  });
});

test('interactive POST reads JSON body when query input is absent', async () => {
  const request = new Request('https://lims.bot/api/unsubscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ' Person@Example.com ', list: 'newsletter' }),
  });

  assert.deepEqual(await readUnsubscribeInput(request), {
    email: 'person@example.com',
    list: 'newsletter',
  });
});

test('RFC 8058 POST keeps issued URL input even with one-click form body', async () => {
  const request = new Request(
    'https://lims.bot/api/unsubscribe?email=person%40example.com&list=all',
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    }
  );

  assert.deepEqual(await readUnsubscribeInput(request), {
    email: 'person@example.com',
    list: 'all',
  });
});

test('form POST body is supported for interactive compatibility', async () => {
  const request = new Request('https://lims.bot/api/unsubscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'email=person%40example.com&list=all',
  });

  assert.deepEqual(await readUnsubscribeInput(request), {
    email: 'person@example.com',
    list: 'all',
  });
});

test('missing, invalid, and malformed input fails closed', async () => {
  assert.equal(
    await readUnsubscribeInput(new Request('https://lims.bot/api/unsubscribe')),
    null
  );

  assert.equal(
    await readUnsubscribeInput(
      new Request('https://lims.bot/api/unsubscribe?email=not-an-email')
    ),
    null
  );

  assert.equal(
    await readUnsubscribeInput(
      new Request('https://lims.bot/api/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{broken',
      })
    ),
    null
  );
});

test('unknown address returns the same internal success without a write', async () => {
  const { store, updates } = makeStore(null);
  const result = await persistUnsubscribe(
    { email: 'unknown@example.com', list: 'newsletter' },
    store
  );

  assert.deepEqual(result, { changed: false });
  assert.deepEqual(updates, []);
});

test('already-unsubscribed address is idempotent and does not write again', async () => {
  const { store, updates } = makeStore({ id: 'row-1', unsubscribed: true });
  const result = await persistUnsubscribe(
    { email: 'known@example.com', list: 'newsletter' },
    store
  );

  assert.deepEqual(result, { changed: false });
  assert.deepEqual(updates, []);
});

test('active address is updated exactly once through the shared helper', async () => {
  const { store, updates } = makeStore({ id: 'row-1', unsubscribed: false });
  const result = await persistUnsubscribe(
    { email: 'known@example.com', list: 'all' },
    store,
    () => '2026-07-15T16:00:00.000Z'
  );

  assert.deepEqual(result, { changed: true });
  assert.deepEqual(updates, [{ id: 'row-1', at: '2026-07-15T16:00:00.000Z' }]);
});

test('persistence errors propagate so the route cannot report false success', async () => {
  const { store } = makeStore(
    { id: 'row-1', unsubscribed: false },
    new Error('write failed')
  );

  await assert.rejects(
    persistUnsubscribe({ email: 'known@example.com', list: 'newsletter' }, store),
    /write failed/
  );
});

test('audit fingerprint is deterministic and never contains the raw address', () => {
  const email = 'person@example.com';
  const first = fingerprintEmail(email);
  const second = fingerprintEmail(email);

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{16}$/);
  assert.equal(first.includes(email), false);
});
