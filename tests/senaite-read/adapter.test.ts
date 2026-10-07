import assert from 'node:assert/strict';
// CI uses Node 22.15+; the repository still pins Node 20 type declarations.
// @ts-expect-error registerHooks was added in Node 22.15.
import { registerHooks } from 'node:module';
import { before, test } from 'node:test';
import fixture from './fixtures/samples.json';
import type { SenaiteReadEnvironment, SenaiteFetch } from '../../lib/senaite-read';

let createSenaiteReadAdapter: typeof import('../../lib/senaite-read').createSenaiteReadAdapter;
before(async () => {
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'server-only') return {
        url: new URL('../ohworks/server-only-marker.cjs', import.meta.url).href, shortCircuit: true,
      };
      return nextResolve(specifier, context);
    },
  });
  try { ({ createSenaiteReadAdapter } = await import('../../lib/senaite-read')); }
  finally { hooks.deregister(); }
});

const env = {
  SENAITE_BASE_URL: 'https://lab.example.invalid/site/',
  SENAITE_API_TOKEN: 'synthetic-token',
};
const notConfigured = {
  status: 'unavailable', reason: 'not_configured',
  detail: 'SENAITE_BASE_URL and SENAITE_API_TOKEN must both be set to valid values',
};
const forbiddenFetch: SenaiteFetch = async () => { assert.fail('Transport must not run'); };
const jsonFetch = (payload: unknown): SenaiteFetch => async () => Response.json(payload);

test('every missing or blank configuration fails closed without IO', async () => {
  const keys = Object.keys(env) as (keyof SenaiteReadEnvironment)[];
  for (let mask = 0; mask < 3; mask++) {
    const partial: SenaiteReadEnvironment = {};
    keys.forEach((key, index) => { if (mask & (1 << index)) partial[key] = env[key]; });
    const adapter = createSenaiteReadAdapter(partial, forbiddenFetch);
    assert.equal(adapter.enabled, false);
    assert.deepEqual(await adapter.listSamples(), notConfigured);
  }
  for (const key of keys) {
    assert.deepEqual(await createSenaiteReadAdapter({ ...env, [key]: '  ' }, forbiddenFetch).listSamples(), notConfigured);
  }
});

test('unsafe URL and header configurations make no requests', async () => {
  for (const url of ['not a url', 'http://lab.example.invalid', 'file:///lab',
    'https://user:password@lab.example.invalid', 'https://lab.example.invalid/?x=1', 'https://lab.example.invalid/#fragment']) {
    assert.deepEqual(await createSenaiteReadAdapter({ ...env, SENAITE_BASE_URL: url }, forbiddenFetch).listSamples(), notConfigured);
  }
  assert.deepEqual(await createSenaiteReadAdapter({ ...env, SENAITE_API_TOKEN: 'token\r\ninjected' }, forbiddenFetch).listSamples(), notConfigured);
});

test('recorded fixture maps only summary fields and sends one bounded bearer GET', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const adapter = createSenaiteReadAdapter(env, async (url, init) => {
    calls.push({ url, init });
    return Response.json(fixture);
  });
  assert.equal(adapter.enabled, true);
  assert.equal(calls.length, 0);
  const result = await adapter.listSamples({ sampleId: 'SYN &/?#=001', reviewState: 'sample_received' });
  assert.deepEqual(result, {
    status: 'ok', source: 'real_senaite', samples: [
      { source: 'real_senaite', id: 'SYN-001', reviewState: 'sample_received', sampleType: 'Water', clientId: 'SYN-CLIENT', dateReceived: '2026-09-18T10:00:00Z' },
      { source: 'real_senaite', id: 'SYN-002', reviewState: 'verified', sampleType: 'Serum', clientId: 'SYN-CLIENT-2', dateReceived: null },
      { source: 'real_senaite', id: 'SYN-003', reviewState: 'sample_received', sampleType: 'Unknown', clientId: null, dateReceived: null },
    ],
  });
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, 'https://lab.example.invalid/site/@@API/senaite/v1/AnalysisRequest?review_state=sample_received&sort_on=created&sort_order=descending&limit=25&getId=SYN%20%26%2F%3F%23%3D001');
  assert.ok(init.signal instanceof AbortSignal);
  assert.deepEqual(init, {
    method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit',
    headers: { Accept: 'application/json', Authorization: 'Bearer synthetic-token' }, signal: init.signal,
  });
  assert.deepEqual(Object.keys(adapter).sort(), ['enabled', 'listSamples']);
});

test('invalid queries never call transport', async () => {
  const adapter = createSenaiteReadAdapter(env, forbiddenFetch);
  for (const query of [{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: NaN },
    { sampleId: '' }, { reviewState: ' ' }, { sampleId: 'x'.repeat(201) }]) {
    assert.deepEqual(await adapter.listSamples(query), { status: 'invalid', detail: 'Invalid SENAITE sample query' });
  }
});

test('empty, malformed, partial, and oversized responses never produce fallback data', async () => {
  assert.deepEqual(await createSenaiteReadAdapter(env, jsonFetch({ items: [] })).listSamples(), { status: 'empty', source: 'real_senaite' });
  for (const payload of [null, {}, [], { items: {} }, { items: [null] }, { items: [{ id: 'SYN-001' }] },
    { items: [fixture.items[0], { getId: '', review_state: 'sample_received' }] }]) {
    const result = await createSenaiteReadAdapter(env, jsonFetch(payload)).listSamples();
    assert.equal(result.status, 'invalid');
    assert.equal('samples' in result, false);
  }
  assert.deepEqual(await createSenaiteReadAdapter(env, jsonFetch(fixture)).listSamples({ limit: 1 }), {
    status: 'invalid', detail: 'SENAITE response exceeded the requested limit',
  });
});

test('HTTP errors, redirects, invalid JSON and exceptions resolve without secrets or retries', async () => {
  for (const status of [301, 401, 403, 500]) {
    let calls = 0;
    const transport: SenaiteFetch = async () => { calls++; return new Response('private upstream body', { status }); };
    assert.deepEqual(await createSenaiteReadAdapter(env, transport).listSamples(), {
      status: 'unavailable', reason: 'http_error', detail: `SENAITE responded with HTTP ${status}`,
    });
    assert.equal(calls, 1);
  }
  for (const error of [new Error('private credentials'), 'private token']) {
    const transport: SenaiteFetch = async () => { throw error; };
    assert.deepEqual(await createSenaiteReadAdapter(env, transport).listSamples(), {
      status: 'unavailable', reason: 'network_error', detail: 'SENAITE request failed',
    });
  }
  const result = await createSenaiteReadAdapter(env, async () => new Response('private invalid JSON')).listSamples();
  assert.equal(result.status, 'unavailable');
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('the ten-second deadline actually aborts a pending transport', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | undefined;
  const adapter = createSenaiteReadAdapter(env, async (_url, init) => {
    signal = init.signal!;
    return new Promise<Response>((_resolve, reject) => {
      signal!.addEventListener('abort', () => reject(new DOMException('private timeout', 'AbortError')), { once: true });
    });
  });
  const result = adapter.listSamples();
  assert.equal(signal?.aborted, false);
  t.mock.timers.tick(10_000);
  assert.equal(signal?.aborted, true);
  assert.deepEqual(await result, { status: 'unavailable', reason: 'timeout', detail: 'SENAITE request timed out' });
});

test('configuration is read from the server environment by default', async () => {
  const previous = { base: process.env.SENAITE_BASE_URL, token: process.env.SENAITE_API_TOKEN };
  try {
    delete process.env.SENAITE_BASE_URL;
    delete process.env.SENAITE_API_TOKEN;
    assert.deepEqual(await createSenaiteReadAdapter(undefined, forbiddenFetch).listSamples(), notConfigured);
    Object.assign(process.env, env);
    assert.deepEqual(await createSenaiteReadAdapter(undefined, jsonFetch({ items: [] })).listSamples(), { status: 'empty', source: 'real_senaite' });
  } finally {
    if (previous.base === undefined) delete process.env.SENAITE_BASE_URL;
    else process.env.SENAITE_BASE_URL = previous.base;
    if (previous.token === undefined) delete process.env.SENAITE_API_TOKEN;
    else process.env.SENAITE_API_TOKEN = previous.token;
  }
});
