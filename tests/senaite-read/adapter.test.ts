import assert from 'node:assert/strict';
import test from 'node:test';
import fixture from './fixtures/samples.json';
import { createSenaiteReadAdapter, type SenaiteReadEnvironment } from '../../lib/senaite-read';

const env = {
  SENAITE_BASE_URL: 'https://lab.example.invalid/site/',
  SENAITE_API_TOKEN: 'synthetic-token',
};

// Every adapter gets an in-memory transport; no test can contact a SENAITE server.
const forbiddenFetch: typeof fetch = async () => { assert.fail('Transport must not run'); };
// Shape of senaite.jsonapi users/current for a signed-in caller (synthetic values).
const signedIn = { items: [{ username: 'synthetic-reader', authenticated: true, roles: ['Authenticated'] }] };
const isIdentity = (input: unknown) => new URL(String(input)).pathname.endsWith('/@@API/senaite/v1/users/current');
// The identity check answers as signed in; the sample listing answers with `payload`.
const labFetch = (payload: unknown): typeof fetch =>
  async input => Response.json(isIdentity(input) ? signedIn : payload);

test('all partial configurations fail closed without a request', async () => {
  const keys = Object.keys(env) as (keyof SenaiteReadEnvironment)[];
  for (let mask = 0; mask < 3; mask++) {
    const partial: SenaiteReadEnvironment = {};
    keys.forEach((key, index) => { if (mask & (1 << index)) partial[key] = env[key]; });
    const adapter = createSenaiteReadAdapter(partial, forbiddenFetch);
    assert.equal(adapter.enabled, false);
    assert.deepEqual(await adapter.listSamples(), { status: 'not_configured' });
  }
  for (const key of keys) {
    const adapter = createSenaiteReadAdapter({ ...env, [key]: '  ' }, forbiddenFetch);
    assert.equal(adapter.enabled, false);
    assert.deepEqual(await adapter.listSamples(), { status: 'not_configured' });
  }
});

test('invalid or unsafe configuration is explicitly not configured', async () => {
  for (const url of ['not a url', 'http://lab.example.invalid', 'file:///lab',
    'https://user:password@lab.example.invalid', 'https://lab.example.invalid/?x=1', 'https://lab.example.invalid/#fragment']) {
    const adapter = createSenaiteReadAdapter({ ...env, SENAITE_BASE_URL: url }, forbiddenFetch);
    assert.deepEqual(await adapter.listSamples(), { status: 'not_configured' });
  }
  for (const token of ['token\nheader', 'token\rheader', 'token with spaces', 'token\x00']) {
    assert.equal(createSenaiteReadAdapter({ ...env, SENAITE_API_TOKEN: token }, forbiddenFetch).enabled, false);
  }
});

test('default environment is inert when unset and uses the generic token settings', async () => {
  const keys = ['SENAITE_BASE_URL', 'SENAITE_API_TOKEN'] as const;
  const previous = keys.map(key => process.env[key]);
  try {
    keys.forEach(key => { delete process.env[key]; });
    assert.deepEqual(await createSenaiteReadAdapter(undefined, forbiddenFetch).listSamples(), { status: 'not_configured' });
    process.env.SENAITE_BASE_URL = env.SENAITE_BASE_URL;
    assert.deepEqual(await createSenaiteReadAdapter(undefined, forbiddenFetch).listSamples(), { status: 'not_configured' });
    process.env.SENAITE_API_TOKEN = env.SENAITE_API_TOKEN;
    assert.deepEqual(await createSenaiteReadAdapter(undefined, labFetch({ items: [] })).listSamples(), { status: 'ok', samples: [] });
  } finally {
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
  }
});

test('construction is inert, the token is proven first, and GET maps only supported fields', async () => {
  let calls = 0;
  const transport: typeof fetch = async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://lab.example.invalid');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer synthetic-token');
    assert.equal(init?.redirect, 'error');
    if (calls === 1) {
      assert.equal(url.pathname, '/site/@@API/senaite/v1/users/current');
      assert.equal(url.search, '');
      return Response.json(signedIn);
    }
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
    assert.equal(headers.get('accept'), 'application/json');
    return Response.json({ ...fixture, items: [{ ...fixture.items[0], id: 'SYN &/?#=001' }] });
  };
  const adapter = createSenaiteReadAdapter(env, transport);
  assert.equal(adapter.enabled, true);
  assert.equal(calls, 0);
  assert.deepEqual(await adapter.listSamples({ sampleId: 'SYN &/?#=001', reviewState: 'sample_received' }), {
    status: 'ok', samples: [
      { uid: 'synthetic-uid-001', id: 'SYN &/?#=001', title: 'Synthetic water sample', reviewState: 'sample_received' },
    ],
  });
  assert.equal(calls, 2);
  assert.deepEqual(Object.keys(adapter).sort(), ['enabled', 'forClient', 'getSample', 'listSamples']);
});

test('unfiltered reads map every supported record, including missing title and state', async () => {
  assert.deepEqual(await createSenaiteReadAdapter(env, labFetch(fixture)).listSamples(), {
    status: 'ok', samples: [
      { uid: 'synthetic-uid-001', id: 'SYN-001', title: 'Synthetic water sample', reviewState: 'sample_received' },
      { uid: 'synthetic-uid-002', id: 'SYN-002', title: null, reviewState: null },
    ],
  });
});

test('a filter SENAITE ignored fails the whole page instead of returning other samples', async () => {
  // senaite.jsonapi drops query keys that are not catalog indexes and still
  // answers 200 with the newest samples; these replies model that.
  const received = (id: string, state: string | null = 'sample_received') =>
    ({ uid: `synthetic-uid-${id}`, id, review_state: state });
  for (const [query, items] of [
    [{ sampleId: 'SYN-404' }, fixture.items],
    [{ sampleId: 'SYN-001' }, fixture.items],
    [{ sampleId: 'syn-001' }, [received('SYN-001')]],
    [{ sampleId: 'SYN-001 ' }, [received('SYN-001')]],
    [{ reviewState: 'sample_received' }, fixture.items],
    [{ reviewState: 'verified' }, [received('SYN-001', 'verified'), received('SYN-002')]],
    [{ sampleId: 'SYN-001', reviewState: 'verified' }, [received('SYN-001')]],
  ] as const) {
    assert.deepEqual(await createSenaiteReadAdapter(env, labFetch({ items })).listSamples(query),
      { status: 'error', code: 'filter-mismatch' }, JSON.stringify(query));
  }
  assert.deepEqual(await createSenaiteReadAdapter(env, labFetch({ items: [received('SYN-001'), received('SYN-002')] }))
    .listSamples({ reviewState: 'sample_received' }), {
    status: 'ok', samples: [
      { uid: 'synthetic-uid-SYN-001', id: 'SYN-001', title: null, reviewState: 'sample_received' },
      { uid: 'synthetic-uid-SYN-002', id: 'SYN-002', title: null, reviewState: 'sample_received' },
    ],
  });
});

test('getSample returns exactly the requested sample', async () => {
  const urls: URL[] = [];
  const transport: typeof fetch = async input => {
    const url = new URL(String(input));
    urls.push(url);
    return Response.json(isIdentity(input) ? signedIn : { items: [fixture.items[0]] });
  };
  assert.deepEqual(await createSenaiteReadAdapter(env, transport).getSample('SYN-001'), {
    status: 'ok', sample: { uid: 'synthetic-uid-001', id: 'SYN-001', title: 'Synthetic water sample', reviewState: 'sample_received' },
  });
  assert.equal(urls.length, 2);
  assert.equal(urls[1].searchParams.get('getId'), 'SYN-001');
  assert.equal(urls[1].searchParams.get('limit'), '2');
  assert.equal(urls[1].searchParams.has('review_state'), false);
});

test('getSample reports not_found only for an empty answer after a proven sign-in', async () => {
  assert.deepEqual(await createSenaiteReadAdapter(env, labFetch({ items: [] })).getSample('SYN-404'), { status: 'not_found' });
  // The recorded hazard: a rejected token gets 200 and an empty list.
  const anonymous = { items: [{ username: 'Anonymous User', authenticated: false, roles: ['Anonymous'] }] };
  let listed = 0;
  const transport: typeof fetch = async input => {
    if (isIdentity(input)) return Response.json(anonymous);
    listed++;
    return Response.json({ items: [] });
  };
  assert.deepEqual(await createSenaiteReadAdapter(env, transport).getSample('SYN-001'), { status: 'error', code: 'unauthenticated' });
  assert.equal(listed, 0);
});

test('getSample never substitutes another sample or picks between duplicates', async () => {
  // Filter ignored: the newest samples come back and none, or not only, is the one asked for.
  assert.deepEqual(await createSenaiteReadAdapter(env, labFetch({ items: [fixture.items[1]] })).getSample('SYN-001'),
    { status: 'error', code: 'filter-mismatch' });
  assert.deepEqual(await createSenaiteReadAdapter(env, labFetch(fixture)).getSample('SYN-001'),
    { status: 'error', code: 'filter-mismatch' });
  const twin = { ...fixture.items[0], uid: 'synthetic-uid-001-copy' };
  assert.deepEqual(await createSenaiteReadAdapter(env, labFetch({ items: [fixture.items[0], twin] })).getSample('SYN-001'),
    { status: 'error', code: 'invalid-response' });
  // More than the two records asked for is an oversized page.
  assert.deepEqual(await createSenaiteReadAdapter(env, labFetch({ items: [fixture.items[0], twin, twin] })).getSample('SYN-001'),
    { status: 'error', code: 'invalid-response' });
});

test('getSample validates input and configuration before any request', async () => {
  assert.deepEqual(await createSenaiteReadAdapter({}, forbiddenFetch).getSample('SYN-001'), { status: 'not_configured' });
  const adapter = createSenaiteReadAdapter(env, forbiddenFetch);
  for (const id of ['', '  ', 'x'.repeat(201), undefined, null, 7, ['SYN-001']]) {
    assert.deepEqual(await adapter.getSample(id as string), { status: 'error', code: 'invalid-query' });
  }
});

test('invalid queries never call transport', async () => {
  const adapter = createSenaiteReadAdapter(env, forbiddenFetch);
  for (const query of [{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: NaN },
    { sampleId: '' }, { reviewState: ' ' }, { sampleId: 'x'.repeat(201) }]) {
    assert.deepEqual(await adapter.listSamples(query), { status: 'error', code: 'invalid-query' });
  }
});

test('empty collection is valid; malformed payloads fail closed', async () => {
  assert.deepEqual(await createSenaiteReadAdapter(env, labFetch({ items: [] })).listSamples(), { status: 'ok', samples: [] });
  for (const payload of [null, {}, [], { items: {} }, { items: [null] }, { items: [{ id: 'SYN-001' }] },
    { items: [{ uid: 'u', id: '' }] }, { items: [{ uid: 'u', id: 'i', title: 1 }] },
    { items: [{ uid: 'u', id: 'i', review_state: {} }] }]) {
    assert.deepEqual(await createSenaiteReadAdapter(env, labFetch(payload)).listSamples(), { status: 'error', code: 'invalid-response' });
  }
  assert.deepEqual(await createSenaiteReadAdapter(env, labFetch(fixture)).listSamples({ limit: 1 }), { status: 'error', code: 'invalid-response' });
});

test('a token SENAITE does not accept is unauthenticated, never an empty lab', async () => {
  const anonymous = { items: [{ username: 'Anonymous User', authenticated: false, roles: ['Anonymous'] }] };
  let listed = 0;
  const transport: typeof fetch = async input => {
    if (isIdentity(input)) return Response.json(anonymous);
    listed++;
    return Response.json({ items: [] });
  };
  assert.deepEqual(await createSenaiteReadAdapter(env, transport).listSamples(), { status: 'error', code: 'unauthenticated' });
  assert.equal(listed, 0, 'the sample query is never sent without a proven sign-in');
});

test('a malformed identity answer fails closed before any sample query', async () => {
  for (const identity of [null, {}, [], { items: [] }, { items: {} }, { items: [null] }, { items: [{}] },
    { items: [{ authenticated: 'true' }] }, { items: [{ authenticated: 1 }] },
    { items: [{ authenticated: true }, { authenticated: true }] },
    { success: false, message: '404 Not Found' }]) {
    let listed = 0;
    const transport: typeof fetch = async input => {
      if (isIdentity(input)) return Response.json(identity);
      listed++;
      return Response.json(fixture);
    };
    assert.deepEqual(await createSenaiteReadAdapter(env, transport).listSamples(), { status: 'error', code: 'invalid-response' });
    assert.equal(listed, 0);
  }
});

test('failures on the sample query after a proven sign-in stay safe', async () => {
  for (const status of [401, 500]) {
    const transport: typeof fetch = async input =>
      isIdentity(input) ? Response.json(signedIn) : new Response('private upstream body', { status });
    assert.deepEqual(await createSenaiteReadAdapter(env, transport).listSamples(), { status: 'error', code: 'request-failed' });
  }
  const invalidJson: typeof fetch = async input => isIdentity(input) ? Response.json(signedIn) : new Response('not JSON');
  assert.deepEqual(await createSenaiteReadAdapter(env, invalidJson).listSamples(), { status: 'error', code: 'invalid-response' });
  const rejects: typeof fetch = async input => {
    if (isIdentity(input)) return Response.json(signedIn);
    throw new Error('private credentials');
  };
  assert.deepEqual(await createSenaiteReadAdapter(env, rejects).listSamples(), { status: 'error', code: 'request-failed' });
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

// Synthetic SENAITE Client UIDs (32 lowercase hex, the Plone UID format).
const TENANT = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const OTHER_TENANT = '0f9e8d7c6b5a49382716f5e4d3c2b1a0';
const tenantSample = (id: string, client: unknown = TENANT) =>
  ({ uid: `uid-${id}`, id, title: null, review_state: 'sample_received', getClientUID: client, getClientTitle: 'Synthetic client' });

test('a client-scoped read filters by getClientUID and keeps the public shape', async () => {
  const urls: URL[] = [];
  const transport: typeof fetch = async input => {
    const url = new URL(String(input));
    urls.push(url);
    return Response.json(isIdentity(input) ? signedIn : { items: [tenantSample('SYN-101'), tenantSample('SYN-102')] });
  };
  assert.deepEqual(await createSenaiteReadAdapter(env, transport).listSamples({ clientUid: TENANT, limit: 2 }), {
    status: 'ok', samples: [
      { uid: 'uid-SYN-101', id: 'SYN-101', title: null, reviewState: 'sample_received' },
      { uid: 'uid-SYN-102', id: 'SYN-102', title: null, reviewState: 'sample_received' },
    ],
  });
  assert.equal(urls.length, 2);
  assert.equal(urls[1].searchParams.get('getClientUID'), TENANT);
  assert.equal(urls[1].searchParams.get('limit'), '2');
});

test('one sample from another client, or with no client, fails the whole tenant page', async () => {
  // senaite.jsonapi drops a query key that is not a catalog index, so a dropped
  // filter returns every client's samples with HTTP 200. That must never render.
  const { getClientUID: _omitted, ...clientless } = tenantSample('SYN-202');
  for (const foreign of [clientless, ...[OTHER_TENANT, null, '', TENANT.toUpperCase(), [TENANT], { uid: TENANT }]
    .map(client => tenantSample('SYN-202', client))]) {
    const payload = { items: [tenantSample('SYN-201'), foreign] };
    assert.deepEqual(await createSenaiteReadAdapter(env, labFetch(payload)).listSamples({ clientUid: TENANT }), {
      status: 'error', code: 'tenant-mismatch',
    });
  }
  // A malformed record is still invalid-response, whatever its client.
  assert.deepEqual(await createSenaiteReadAdapter(env, labFetch({ items: [{ id: 'SYN-203', getClientUID: TENANT }] }))
    .listSamples({ clientUid: TENANT }), { status: 'error', code: 'invalid-response' });
  // Unscoped (lab-staff) reads do not require client fields.
  assert.deepEqual(await createSenaiteReadAdapter(env, labFetch({ items: [tenantSample('SYN-204', OTHER_TENANT)] })).listSamples(), {
    status: 'ok', samples: [{ uid: 'uid-SYN-204', id: 'SYN-204', title: null, reviewState: 'sample_received' }],
  });
});

test('client UIDs that are not Plone UIDs are invalid queries and send nothing', async () => {
  const adapter = createSenaiteReadAdapter(env, forbiddenFetch);
  for (const clientUid of ['', ' ', 'client-1', TENANT.toUpperCase(), `${TENANT}0`, TENANT.slice(1),
    `${TENANT.slice(0, 31)}g`, `${TENANT}\n`, 42, null, ['x']]) {
    assert.deepEqual(await adapter.listSamples({ clientUid } as never), { status: 'error', code: 'invalid-query' });
    assert.deepEqual(await adapter.forClient(clientUid as never).listSamples(), { status: 'error', code: 'invalid-query' });
  }
});

test('forClient binds the tenant: callers cannot widen, replace or drop it', async () => {
  const sent: (string | null)[] = [];
  const transport: typeof fetch = async input => {
    if (isIdentity(input)) return Response.json(signedIn);
    sent.push(new URL(String(input)).searchParams.get('getClientUID'));
    return Response.json({ items: [tenantSample('SYN-301')] });
  };
  const reader = createSenaiteReadAdapter(env, transport).forClient(TENANT);
  assert.equal(reader.enabled, true);
  assert.deepEqual(Object.keys(reader).sort(), ['enabled', 'listSamples']);
  for (const query of [undefined, {}, { reviewState: 'sample_received' }, { clientUid: OTHER_TENANT } as never,
    { clientUid: undefined } as never]) {
    assert.equal((await reader.listSamples(query)).status, 'ok');
  }
  assert.deepEqual(sent, [TENANT, TENANT, TENANT, TENANT, TENANT]);
  assert.deepEqual(await reader.listSamples(null as never), { status: 'error', code: 'invalid-query' });
  const unconfigured = createSenaiteReadAdapter({}, forbiddenFetch).forClient(TENANT);
  assert.equal(unconfigured.enabled, false);
  assert.deepEqual(await unconfigured.listSamples(), { status: 'not_configured' });
});

test('a tenant read with a token SENAITE does not accept never sends the sample query', async () => {
  const anonymous = { items: [{ username: 'Anonymous User', authenticated: false, roles: ['Anonymous'] }] };
  let listed = 0;
  const transport: typeof fetch = async input => {
    if (isIdentity(input)) return Response.json(anonymous);
    listed++;
    return Response.json({ items: [] });
  };
  assert.deepEqual(await createSenaiteReadAdapter(env, transport).forClient(TENANT).listSamples(), {
    status: 'error', code: 'unauthenticated',
  });
  assert.equal(listed, 0);
});
