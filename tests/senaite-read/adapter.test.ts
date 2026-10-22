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
// senaite.jsonapi listing envelope: `count` is every match, `next` is null on the last page.
const listing = (items: unknown[], count = items.length, next: string | null = count > items.length ? 'https://lab.example.invalid/next' : null) =>
  ({ count, pagesize: 25, page: 1, pages: Math.max(1, Math.ceil(count / 25)), next, previous: null, items });
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
    assert.deepEqual(await createSenaiteReadAdapter(undefined, labFetch(listing([]))).listSamples(), { status: 'ok', samples: [], total: 0, hasMore: false });
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
    total: 27, hasMore: true,
  });
  assert.equal(calls, 2);
  assert.deepEqual(Object.keys(adapter).sort(), ['enabled', 'forClient', 'listSamples']);
});

test('invalid queries never call transport', async () => {
  const adapter = createSenaiteReadAdapter(env, forbiddenFetch);
  for (const query of [{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: NaN },
    { sampleId: '' }, { reviewState: ' ' }, { sampleId: 'x'.repeat(201) }]) {
    assert.deepEqual(await adapter.listSamples(query), { status: 'error', code: 'invalid-query' });
  }
});

test('empty collection is valid; malformed payloads fail closed', async () => {
  assert.deepEqual(await createSenaiteReadAdapter(env, labFetch(listing([]))).listSamples(), { status: 'ok', samples: [], total: 0, hasMore: false });
  for (const payload of [null, {}, [], { items: {} }, listing([null]), listing([{ id: 'SYN-001' }]),
    listing([{ uid: 'u', id: '' }]), listing([{ uid: 'u', id: 'i', title: 1 }]),
    listing([{ uid: 'u', id: 'i', review_state: {} }])]) {
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
    return Response.json(listing([]));
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

test('a partial page says so: total and hasMore come from SENAITE count and next', async () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ uid: `uid-${i}`, id: `SYN-${i}` }));
  const result = await createSenaiteReadAdapter(env, labFetch(listing(items, 300))).listSamples();
  assert.equal(result.status, 'ok');
  assert.equal(result.status === 'ok' && result.samples.length, 25);
  assert.deepEqual(result.status === 'ok' && { total: result.total, hasMore: result.hasMore }, { total: 300, hasMore: true });
  // The last page: count equals what was received and next is null.
  assert.deepEqual(await createSenaiteReadAdapter(env, labFetch(listing(items.slice(0, 3)))).listSamples({ limit: 3 }), {
    status: 'ok', samples: items.slice(0, 3).map(({ uid, id }) => ({ uid, id, title: null, reviewState: null })),
    total: 3, hasMore: false,
  });
});

test('a listing without a trustworthy count or next fails closed instead of guessing', async () => {
  const one = [{ uid: 'u', id: 'SYN-1' }];
  const { count: _count, ...noCount } = listing(one);
  const { next: _next, ...noNext } = listing(one);
  for (const payload of [{ items: [] }, { items: one }, noCount, noNext,
    // count must be a whole number no smaller than the page
    listing(one, 0), listing(one, -1), listing(one, 1.5), listing(one, Number.MAX_SAFE_INTEGER + 1),
    { ...listing(one), count: '1' }, { ...listing(one), count: null },
    // next must agree with count: more pages iff next is set
    listing(one, 1, 'https://lab.example.invalid/next'), listing(one, 2, null),
    { ...listing(one, 2), next: '' }, { ...listing(one, 2), next: { href: 'x' } }]) {
    assert.deepEqual(await createSenaiteReadAdapter(env, labFetch(payload)).listSamples(), {
      status: 'error', code: 'invalid-response',
    });
  }
});

test('next is checked but never followed', async () => {
  let listed = 0;
  const transport: typeof fetch = async input => {
    if (isIdentity(input)) return Response.json(signedIn);
    listed++;
    return Response.json(listing([{ uid: 'u', id: 'SYN-1' }], 2, 'https://untrusted.example.invalid/page-2'));
  };
  const result = await createSenaiteReadAdapter(env, transport).listSamples({ limit: 1 });
  assert.deepEqual(result, { status: 'ok', samples: [{ uid: 'u', id: 'SYN-1', title: null, reviewState: null }], total: 2, hasMore: true });
  assert.equal(listed, 1);
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
    return Response.json(isIdentity(input) ? signedIn : listing([tenantSample('SYN-101'), tenantSample('SYN-102')]));
  };
  assert.deepEqual(await createSenaiteReadAdapter(env, transport).listSamples({ clientUid: TENANT, limit: 2 }), {
    status: 'ok', samples: [
      { uid: 'uid-SYN-101', id: 'SYN-101', title: null, reviewState: 'sample_received' },
      { uid: 'uid-SYN-102', id: 'SYN-102', title: null, reviewState: 'sample_received' },
    ],
    total: 2, hasMore: false,
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
    const payload = listing([tenantSample('SYN-201'), foreign]);
    assert.deepEqual(await createSenaiteReadAdapter(env, labFetch(payload)).listSamples({ clientUid: TENANT }), {
      status: 'error', code: 'tenant-mismatch',
    });
  }
  // A malformed record is still invalid-response, whatever its client.
  assert.deepEqual(await createSenaiteReadAdapter(env, labFetch(listing([{ id: 'SYN-203', getClientUID: TENANT }])))
    .listSamples({ clientUid: TENANT }), { status: 'error', code: 'invalid-response' });
  // Unscoped (lab-staff) reads do not require client fields.
  assert.deepEqual(await createSenaiteReadAdapter(env, labFetch(listing([tenantSample('SYN-204', OTHER_TENANT)]))).listSamples(), {
    status: 'ok', samples: [{ uid: 'uid-SYN-204', id: 'SYN-204', title: null, reviewState: 'sample_received' }],
    total: 1, hasMore: false,
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
    return Response.json(listing([tenantSample('SYN-301')]));
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

test('a tenant page reports its count only when every counted sample was checked', async () => {
  // Complete tenant page: every counted record carried the bound client.
  assert.deepEqual(await createSenaiteReadAdapter(env, labFetch(listing([tenantSample('SYN-401')]))).forClient(TENANT).listSamples(), {
    status: 'ok', samples: [{ uid: 'uid-SYN-401', id: 'SYN-401', title: null, reviewState: 'sample_received' }],
    total: 1, hasMore: false,
  });
  // More pages: if SENAITE had dropped the client filter, count would be the
  // whole lab's, so the uncheckable number is withheld; hasMore still shows.
  assert.deepEqual(await createSenaiteReadAdapter(env, labFetch(listing([tenantSample('SYN-402')], 9000)))
    .forClient(TENANT).listSamples({ limit: 1 }), {
    status: 'ok', samples: [{ uid: 'uid-SYN-402', id: 'SYN-402', title: null, reviewState: 'sample_received' }],
    total: null, hasMore: true,
  });
});

test('a tenant read with a token SENAITE does not accept never sends the sample query', async () => {
  const anonymous = { items: [{ username: 'Anonymous User', authenticated: false, roles: ['Anonymous'] }] };
  let listed = 0;
  const transport: typeof fetch = async input => {
    if (isIdentity(input)) return Response.json(anonymous);
    listed++;
    return Response.json(listing([]));
  };
  assert.deepEqual(await createSenaiteReadAdapter(env, transport).forClient(TENANT).listSamples(), {
    status: 'error', code: 'unauthenticated',
  });
  assert.equal(listed, 0);
});
