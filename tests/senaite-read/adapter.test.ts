import assert from 'node:assert/strict';
import test from 'node:test';
import fixture from './fixtures/samples.json';
import { createSenaiteReadAdapter, type SenaiteReadEnvironment } from '../../lib/senaite-read';

const env = {
  SENAITE_READ_URL: 'https://lab.example.invalid/site/',
  SENAITE_READ_USER: 'fixture-reader',
  SENAITE_READ_PASSWORD: 'synthetic-password',
};

// Every adapter gets an in-memory transport; no test can contact a SENAITE server.
const forbiddenFetch: typeof fetch = async () => { assert.fail('Transport must not run'); };
const jsonFetch = (payload: unknown): typeof fetch => async () => Response.json(payload);

test('all partial configurations fail closed without a request', async () => {
  const keys = Object.keys(env) as (keyof SenaiteReadEnvironment)[];
  for (let mask = 0; mask < 7; mask++) {
    const partial: SenaiteReadEnvironment = {};
    keys.forEach((key, index) => { if (mask & (1 << index)) partial[key] = env[key]; });
    const adapter = createSenaiteReadAdapter(partial, forbiddenFetch);
    assert.equal(adapter.enabled, false);
    assert.deepEqual(await adapter.listSamples(), { status: 'disabled' });
  }
  for (const key of keys) {
    const adapter = createSenaiteReadAdapter({ ...env, [key]: '  ' }, forbiddenFetch);
    assert.equal(adapter.enabled, false);
    assert.deepEqual(await adapter.listSamples(), { status: 'disabled' });
  }
});

test('invalid or unsafe configuration is disabled', async () => {
  for (const url of ['not a url', 'http://lab.example.invalid', 'file:///lab',
    'https://user:password@lab.example.invalid', 'https://lab.example.invalid/?x=1', 'https://lab.example.invalid/#fragment']) {
    const adapter = createSenaiteReadAdapter({ ...env, SENAITE_READ_URL: url }, forbiddenFetch);
    assert.deepEqual(await adapter.listSamples(), { status: 'disabled' });
  }
  assert.equal(createSenaiteReadAdapter({ ...env, SENAITE_READ_USER: 'user:other' }, forbiddenFetch).enabled, false);
});

test('construction is inert and GET maps only supported fields', async () => {
  let calls = 0;
  const transport: typeof fetch = async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://lab.example.invalid');
    assert.equal(url.pathname, '/site/@@API/senaite/v1/AnalysisRequest');
    assert.equal(url.searchParams.get('getId'), 'SYN &/?#=001');
    assert.equal(url.searchParams.get('review_state'), 'sample_received');
    assert.equal(url.searchParams.get('limit'), '25');
    assert.equal(url.searchParams.size, 5);
    assert.equal(init?.method, 'GET');
    assert.equal(init?.body, undefined);
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.cache, 'no-store');
    assert.equal(init?.credentials, 'omit');
    assert.ok(init?.signal instanceof AbortSignal);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('accept'), 'application/json');
    assert.equal(headers.get('authorization'), `Basic ${Buffer.from('fixture-reader:synthetic-password').toString('base64')}`);
    return Response.json(fixture);
  };
  const adapter = createSenaiteReadAdapter(env, transport);
  assert.equal(adapter.enabled, true);
  assert.equal(calls, 0);
  assert.deepEqual(await adapter.listSamples({ sampleId: 'SYN &/?#=001', reviewState: 'sample_received' }), {
    status: 'ok', samples: [
      { uid: 'synthetic-uid-001', id: 'SYN-001', title: 'Synthetic water sample', reviewState: 'sample_received' },
      { uid: 'synthetic-uid-002', id: 'SYN-002', title: null, reviewState: null },
    ],
  });
  assert.equal(calls, 1);
  assert.deepEqual(Object.keys(adapter).sort(), ['enabled', 'listSamples']);
});

test('invalid queries never call transport', async () => {
  const adapter = createSenaiteReadAdapter(env, forbiddenFetch);
  for (const query of [{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: NaN },
    { sampleId: '' }, { reviewState: ' ' }, { sampleId: 'x'.repeat(201) }]) {
    assert.deepEqual(await adapter.listSamples(query), { status: 'error', code: 'invalid-query' });
  }
});

test('empty collection is valid; malformed payloads fail closed', async () => {
  assert.deepEqual(await createSenaiteReadAdapter(env, jsonFetch({ items: [] })).listSamples(), { status: 'ok', samples: [] });
  for (const payload of [null, {}, [], { items: {} }, { items: [null] }, { items: [{ id: 'SYN-001' }] },
    { items: [{ uid: 'u', id: '' }] }, { items: [{ uid: 'u', id: 'i', title: 1 }] },
    { items: [{ uid: 'u', id: 'i', review_state: {} }] }]) {
    assert.deepEqual(await createSenaiteReadAdapter(env, jsonFetch(payload)).listSamples(), { status: 'error', code: 'invalid-response' });
  }
  assert.deepEqual(await createSenaiteReadAdapter(env, jsonFetch(fixture)).listSamples({ limit: 1 }), { status: 'error', code: 'invalid-response' });
});

test('HTTP errors, redirects, transport failures and invalid JSON return safe errors without retries', async () => {
  for (const status of [301, 401, 403, 500]) {
    let calls = 0;
    const transport: typeof fetch = async () => { calls++; return new Response('private upstream body', { status }); };
    assert.deepEqual(await createSenaiteReadAdapter(env, transport).listSamples(), { status: 'error', code: 'request-failed' });
    assert.equal(calls, 1);
  }
  for (const error of [new Error('private credentials'), new DOMException('timeout', 'TimeoutError')]) {
    const transport: typeof fetch = async () => { throw error; };
    assert.deepEqual(await createSenaiteReadAdapter(env, transport).listSamples(), { status: 'error', code: 'request-failed' });
  }
  const invalidJson: typeof fetch = async () => new Response('not JSON');
  assert.deepEqual(await createSenaiteReadAdapter(env, invalidJson).listSamples(), { status: 'error', code: 'invalid-response' });
});
