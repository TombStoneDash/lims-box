import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSenaitePersonnelReader, type SenaitePersonnelEnvironment,
} from '../../lib/senaite-personnel-read';

const env = {
  SENAITE_BASE_URL: 'https://lab.example.invalid/site/',
  SENAITE_API_TOKEN: 'synthetic-token',
};

// Every reader gets an in-memory transport; no test can contact a SENAITE server.
const forbiddenFetch: typeof fetch = async () => { assert.fail('Transport must not run'); };
// senaite.jsonapi users/current for a signed-in caller (synthetic values).
const signedIn = { items: [{ username: 'synthetic-reader', authenticated: true, roles: ['Authenticated'] }] };
// SENAITE 2.6.0 users/current for a rejected token: HTTP 200, Anonymous.
const anonymous = { items: [{ username: 'Anonymous User', authenticated: false, roles: ['Anonymous'] }] };
const isIdentity = (input: unknown) => new URL(String(input)).pathname.endsWith('/@@API/senaite/v1/users/current');

// Shape of a `complete=yes` LabContact item: the fields this reader keeps plus
// the personal ones it must drop (all values synthetic).
function labContact(n: number, overrides: Record<string, unknown> = {}) {
  return {
    uid: `${String(n).padStart(2, '0')}${'a'.repeat(30)}`,
    id: `labcontact-${n}`,
    title: `SYNTHETIC-Analyst ${n}`,
    portal_type: 'LabContact',
    review_state: 'active',
    JobTitle: 'SYNTHETIC-Biomedical Scientist',
    Firstname: 'SYNTHETIC-Analyst',
    Surname: String(n),
    EmailAddress: `analyst${n}@lab.example.invalid`,
    BusinessPhone: '+44 0000 000000',
    PhysicalAddress: { address: 'SYNTHETIC-1 Lab Street', city: 'London' },
    Signature: 'https://lab.example.invalid/site/bika_setup/bika_labcontacts/labcontact-1/Signature',
    getUsername: `synthetic-analyst-${n}`,
    Departments: [{ uid: 'f'.repeat(32), url: 'https://lab.example.invalid/x' }],
    ...overrides,
  };
}

function listing(items: unknown[], extra: Record<string, unknown> = {}) {
  return { count: items.length, pagesize: 100, items, page: 1, pages: 1, next: null, previous: null, ...extra };
}

function labFetch(payload: unknown, identity: unknown = signedIn) {
  const urls: URL[] = [];
  const inits: RequestInit[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    urls.push(new URL(String(input)));
    inits.push(init ?? {});
    return Response.json(isIdentity(input) ? identity : payload);
  };
  return { urls, inits, fetchImpl };
}

test('partial or unsafe configuration is not configured and sends nothing', async () => {
  const keys = Object.keys(env) as (keyof SenaitePersonnelEnvironment)[];
  const configs: SenaitePersonnelEnvironment[] = [
    {}, { SENAITE_BASE_URL: env.SENAITE_BASE_URL }, { SENAITE_API_TOKEN: env.SENAITE_API_TOKEN },
    ...keys.map(key => ({ ...env, [key]: '   ' })),
    { ...env, SENAITE_API_TOKEN: 'token with space' },
    ...['not a url', 'http://lab.example.invalid', 'https://user:pw@lab.example.invalid',
      'https://lab.example.invalid/?x=1', 'https://lab.example.invalid/#f']
      .map(url => ({ ...env, SENAITE_BASE_URL: url })),
  ];
  for (const config of configs) {
    const reader = createSenaitePersonnelReader(config, forbiddenFetch);
    assert.equal(reader.enabled, false);
    assert.deepEqual(await reader.listLabContacts(), { status: 'not_configured' });
  }
});

test('construction is inert', () => {
  const reader = createSenaitePersonnelReader(env, forbiddenFetch);
  assert.equal(reader.enabled, true);
});

test('a signed-in read returns the roster with personal fields dropped, sorted by name', async () => {
  const http = labFetch(listing([labContact(2), labContact(1, { JobTitle: '  ' }), labContact(3, { review_state: 'inactive' })]));
  const result = await createSenaitePersonnelReader(env, http.fetchImpl).listLabContacts();
  assert.deepEqual(result, {
    status: 'ok',
    contacts: [
      { uid: labContact(1).uid, id: 'labcontact-1', fullName: 'SYNTHETIC-Analyst 1', jobTitle: null, active: true },
      { uid: labContact(2).uid, id: 'labcontact-2', fullName: 'SYNTHETIC-Analyst 2',
        jobTitle: 'SYNTHETIC-Biomedical Scientist', active: true },
      { uid: labContact(3).uid, id: 'labcontact-3', fullName: 'SYNTHETIC-Analyst 3',
        jobTitle: 'SYNTHETIC-Biomedical Scientist', active: false },
    ],
  });
  const serialized = JSON.stringify(result);
  for (const leaked of ['@lab.example.invalid', '+44', 'Lab Street', 'Signature', 'synthetic-analyst-', 'Departments']) {
    assert.equal(serialized.includes(leaked), false, `${leaked} must not leave the reader`);
  }
});

test('requests are two bounded, uncached, credential-scoped GETs in order', async () => {
  const http = labFetch(listing([labContact(1)]));
  await createSenaitePersonnelReader(env, http.fetchImpl).listLabContacts();
  assert.deepEqual(http.urls.map(url => url.pathname), [
    '/site/@@API/senaite/v1/users/current',
    '/site/@@API/senaite/v1/LabContact',
  ]);
  assert.equal(http.urls[1].search, '?complete=yes&limit=100');
  for (const init of http.inits) {
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.credentials, 'omit');
    assert.ok(init.signal);
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer synthetic-token');
  }
});

test('a rejected token is unauthenticated and the roster is never requested', async () => {
  // Real SENAITE 2.6 also answers the listing with an empty list here; it must not look like "no staff".
  const http = labFetch(listing([]), anonymous);
  const result = await createSenaitePersonnelReader(env, http.fetchImpl).listLabContacts();
  assert.deepEqual(result, { status: 'error', code: 'unauthenticated' });
  assert.equal(http.urls.length, 1);
});

test('an empty roster is ok only after a proven sign-in', async () => {
  const http = labFetch(listing([]));
  assert.deepEqual(await createSenaitePersonnelReader(env, http.fetchImpl).listLabContacts(),
    { status: 'ok', contacts: [] });
});

test('malformed identity answers fail closed before the roster read', async () => {
  for (const identity of [null, {}, { items: [] }, { items: [{}] }, { items: [signedIn.items[0], signedIn.items[0]] },
    { items: [{ authenticated: 'true' }] }]) {
    const http = labFetch(listing([labContact(1)]), identity);
    assert.deepEqual(await createSenaitePersonnelReader(env, http.fetchImpl).listLabContacts(),
      { status: 'error', code: 'invalid-response' });
    assert.equal(http.urls.length, 1);
  }
});

test('a roster with more pages is incomplete, never truncated', async () => {
  for (const extra of [{ next: 'https://lab.example.invalid/site/@@API/senaite/v1/LabContact?b_start=100' }, { count: 2 }]) {
    const http = labFetch(listing([labContact(1)], extra));
    assert.deepEqual(await createSenaitePersonnelReader(env, http.fetchImpl).listLabContacts(),
      { status: 'error', code: 'incomplete-listing' });
  }
});

test('malformed listings and records fail the whole roster', async () => {
  const bad: unknown[] = [
    null, [], {}, { items: {} }, { success: false, message: 'synthetic error', items: [] },
    listing([labContact(1)], { count: '1' }),
    { items: Array.from({ length: 101 }, (_, i) => labContact(i)) },
    listing([labContact(1), null]),
    listing([labContact(1, { uid: '' })]),
    listing([labContact(1, { id: 7 })]),
    listing([labContact(1, { title: '   ' })]),
    listing([labContact(1, { portal_type: 'Contact' })]),
    listing([labContact(1, { portal_type: 'AnalysisRequest' })]),
    listing([labContact(1, { JobTitle: ['x'] })]),
    listing([labContact(1, { review_state: 'published' })]),
    listing([labContact(1), labContact(1, { id: 'labcontact-dupe' })]),
  ];
  for (const payload of bad) {
    const http = labFetch(payload);
    assert.deepEqual(await createSenaitePersonnelReader(env, http.fetchImpl).listLabContacts(),
      { status: 'error', code: 'invalid-response' }, JSON.stringify(payload)?.slice(0, 80));
  }
});

test('a record without a review state reports active as unknown', async () => {
  const contact = labContact(1);
  delete (contact as Partial<typeof contact>).review_state;
  delete (contact as Partial<typeof contact>).portal_type;
  const http = labFetch(listing([contact]));
  const result = await createSenaitePersonnelReader(env, http.fetchImpl).listLabContacts();
  assert.equal(result.status, 'ok');
  assert.equal(result.status === 'ok' && result.contacts[0].active, null);
});

test('by default one non-synthetic name fails the roster without leaking it', async () => {
  for (const title of ['Jane Realname', 'SYNTHETIC-', 'synthetic-lowercase', ' Jane SYNTHETIC-']) {
    const http = labFetch(listing([labContact(1), labContact(2, { title })]));
    const result = await createSenaitePersonnelReader(env, http.fetchImpl).listLabContacts();
    assert.deepEqual(result, { status: 'error', code: 'non-synthetic-record' }, title);
    assert.equal(JSON.stringify(result).includes('Jane'), false);
  }
});

test('a lab that opts out of the synthetic guard can show its real roster', async () => {
  const http = labFetch(listing([labContact(1, { title: 'Jane Example' })]));
  const result = await createSenaitePersonnelReader(env, http.fetchImpl, { syntheticOnly: false }).listLabContacts();
  assert.equal(result.status, 'ok');
  assert.equal(result.status === 'ok' && result.contacts[0].fullName, 'Jane Example');
});

test('HTTP, transport and JSON failures return fixed codes without upstream detail', async () => {
  const cases: [typeof fetch, string][] = [
    [async () => new Response('secret upstream body', { status: 500 }), 'request-failed'],
    [async () => new Response('secret upstream body', { status: 401 }), 'request-failed'],
    [async () => { throw new Error('connect ECONNREFUSED secret-host'); }, 'request-failed'],
    [async () => new Response('<html>not json</html>', { status: 200 }), 'invalid-response'],
  ];
  for (const [fetchImpl, code] of cases) {
    const result = await createSenaitePersonnelReader(env, fetchImpl).listLabContacts();
    assert.deepEqual(result, { status: 'error', code });
  }
  // Failure on the roster read after a good sign-in.
  const rosterDown: typeof fetch = async input =>
    isIdentity(input) ? Response.json(signedIn) : new Response('secret', { status: 503 });
  assert.deepEqual(await createSenaitePersonnelReader(env, rosterDown).listLabContacts(),
    { status: 'error', code: 'request-failed' });
});

test('replayed real SENAITE 2.6.0 rejected-token identity answer is unauthenticated', async () => {
  // Recorded from a real server (tests/senaite-read/fixtures/README.md); the roster must not be read.
  const { default: recorded } = await import('../senaite-read/fixtures/recorded/senaite-2.6.0-anonymous.json');
  const paths: string[] = [];
  const fetchImpl: typeof fetch = async input => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    assert.ok(isIdentity(input), `no recording for ${url.pathname}`);
    const { status, contentType, bodyText } = recorded.responses['users-current-invalid-bearer'];
    return new Response(bodyText, { status, headers: { 'content-type': contentType } });
  };
  const result = await createSenaitePersonnelReader(
    { SENAITE_BASE_URL: 'https://senaite.recorded.invalid/senaite', SENAITE_API_TOKEN: 'recorded-invalid-token' },
    fetchImpl,
  ).listLabContacts();
  assert.deepEqual(result, { status: 'error', code: 'unauthenticated' });
  assert.deepEqual(paths, ['/senaite/@@API/senaite/v1/users/current']);
});
