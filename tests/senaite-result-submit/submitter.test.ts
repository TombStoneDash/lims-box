import assert from 'node:assert/strict';
import test from 'node:test';
import recorded from '../senaite-read/fixtures/recorded/senaite-2.6.0-anonymous.json';
import { createSenaiteResultSubmitter } from '../../lib/senaite-result-submit';

// Acceptance suite against an in-memory senaite.jsonapi stand-in. Every record is
// synthetic. The stand-in applies only the query keys SENAITE indexes, so tests
// can also make it drop a filter the way the real catalog silently does. Its
// `update` refuses `submit` unless the analysis is unassigned/assigned, has a
// result, and its sample is received, like SENAITE's workflow guard, and it
// records the token's own user as the submitter, like SENAITE does.

const ROOT = 'https://senaite.test.invalid/senaite';
const API = '/senaite/@@API/senaite/v1/';
const TOKEN = 'synthetic-analyst-token';
const env = { SENAITE_BASE_URL: ROOT };
const CREDENTIALS = { analystToken: TOKEN };

const CLIENT = 'c'.repeat(32);
const OTHER_CLIENT = 'd'.repeat(32);
const SAMPLE_UID = '1'.repeat(32);
const TSH_UID = 'a'.repeat(32);
const FT4_UID = 'b'.repeat(32);

type Sample = { uid: string; id: string; getClientUID: string; review_state: string };
type Analysis = {
  uid: string; parent_uid: string; Keyword: string; review_state: string;
  Result?: string | null; DetectionLimitOperand?: string | null; getSubmittedBy?: string | null;
};

type Options = {
  /** Who the token signs in as. */
  username?: string;
  userId?: string;
  authenticated?: boolean;
  samples?: Sample[];
  analyses?: Analysis[];
  dropFilters?: string[];
  /** What happens on POST update. */
  write?: 'apply' | 'lose-answer' | 'http-error' | 'ignore' | 'apply-and-lose' | 'change-result'
    | 'someone-else-first' | 'record-other-submitter';
};

function senaite(options: Options = {}) {
  const samples = options.samples ?? [{ uid: SAMPLE_UID, id: 'WB-0001', getClientUID: CLIENT, review_state: 'sample_received' }];
  const analyses: Analysis[] = options.analyses ?? [
    // As the LIAISON XL import leaves it: a value, not yet submitted.
    { uid: TSH_UID, parent_uid: SAMPLE_UID, Keyword: 'TSH', review_state: 'unassigned', Result: '2.41', getSubmittedBy: '' },
    { uid: FT4_UID, parent_uid: SAMPLE_UID, Keyword: 'FT4', review_state: 'unassigned', Result: '' },
  ];
  const authenticated = options.authenticated ?? true;
  const username = authenticated ? options.username ?? 'analyst-a' : 'Anonymous User';
  const userId = authenticated ? options.userId ?? username : 'current';
  const calls: { method: string; path: string; query: Record<string, string>; body?: unknown; headers: Headers; init?: RequestInit }[] = [];
  const dropped = new Set(options.dropFilters ?? []);

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://senaite.test.invalid');
    const route = url.pathname.slice(API.length);
    const query = Object.fromEntries(url.searchParams);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method: init?.method ?? 'GET', path: route, query, body, headers: new Headers(init?.headers), init });

    if (route === 'users/current') {
      return json({ count: 1, items: [{ username, authenticated, api_url: `${ROOT}/@@API/senaite/v1/users/${userId}` }] });
    }
    const filter = <T extends Record<string, unknown>>(rows: T[], keys: Record<string, string>) =>
      rows.filter(row => Object.entries(keys).every(([k, field]) => !query[k] || dropped.has(k) || row[field] === query[k]));
    if (route === 'AnalysisRequest') {
      return json({ count: 0, items: filter(samples, { getId: 'id', getClientUID: 'getClientUID', UID: 'uid' }) });
    }
    if (route === 'Analysis') {
      return json({ count: 0, items: filter(analyses, { getRequestUID: 'parent_uid' }) });
    }
    if (route === 'update' && init?.method === 'POST') {
      const target = analyses.find(a => a.uid === body.uid);
      const sample = samples.find(s => s.uid === target?.parent_uid);
      const mode = options.write ?? 'apply';
      if (mode === 'lose-answer') throw new TypeError('socket hang up');
      if (mode === 'http-error') return json({ message: 'synthetic' }, 500);
      if (mode === 'someone-else-first' && target) {
        target.review_state = 'to_be_verified';
        target.getSubmittedBy = 'analyst-c';
      }
      if (!target || body.transition !== 'submit' || !['unassigned', 'assigned'].includes(target.review_state) ||
          !target.Result || sample?.review_state !== 'sample_received') {
        return json({ success: false, message: 'Transition submit not allowed' });
      }
      if (mode !== 'ignore') {
        target.review_state = 'to_be_verified';
        target.getSubmittedBy = mode === 'record-other-submitter' ? 'ohworks-import-svc' : userId;
        if (mode === 'change-result') target.Result = '9.99';
      }
      if (mode === 'apply-and-lose') throw new TypeError('socket hang up');
      return json({ count: 1, items: [{ uid: body.uid }] });
    }
    throw new Error(`unexpected route ${route}`);
  };
  return { fetchImpl, calls, samples, analyses, posts: () => calls.filter(c => c.method === 'POST') };
}

const REQUEST = {
  clientUid: CLIENT, sampleId: 'WB-0001', analysisUid: TSH_UID, keyword: 'TSH',
  expectedResult: '2.41', analystUserId: 'analyst-a',
};

const submit = (server: ReturnType<typeof senaite>, request: object = REQUEST, credentials: object = CREDENTIALS) =>
  createSenaiteResultSubmitter(env, server.fetchImpl).submit(request as typeof REQUEST, credentials as typeof CREDENTIALS);

test('stays inert without a valid HTTPS site root, and no environment token enables it', async () => {
  const server = senaite();
  for (const config of [
    {},
    { SENAITE_BASE_URL: '  ' },
    { SENAITE_BASE_URL: 'http://senaite.test.invalid/senaite' },
    { SENAITE_BASE_URL: 'https://user:pw@senaite.test.invalid/senaite' },
    { SENAITE_BASE_URL: `${ROOT}?next=x` },
  ]) {
    const submitter = createSenaiteResultSubmitter(
      { ...config, SENAITE_API_TOKEN: TOKEN, SENAITE_RESULT_IMPORT_TOKEN: TOKEN, SENAITE_RESULT_VERIFY_TOKEN: TOKEN } as never,
      server.fetchImpl,
    );
    assert.equal(submitter.enabled, false);
    assert.deepEqual(await submitter.submit(REQUEST, CREDENTIALS), { status: 'not_configured' });
  }
  assert.equal(server.calls.length, 0);
});

test('malformed requests and missing analyst tokens are refused before any request', async () => {
  const server = senaite();
  for (const request of [
    null,
    { ...REQUEST, clientUid: 'C'.repeat(32) },
    { ...REQUEST, sampleId: '../WB-0001' },
    { ...REQUEST, analysisUid: 'not-a-uid' },
    { ...REQUEST, keyword: 'TSH&review_state=verified' },
    { ...REQUEST, expectedResult: '  ' },
    { ...REQUEST, expectedOperand: '<=' },
    { ...REQUEST, analystUserId: '' },
    { ...REQUEST, analystUserId: undefined },
  ]) {
    assert.deepEqual(await submit(server, request as never), { status: 'error', code: 'invalid-request' });
  }
  for (const credentials of [null, {}, { analystToken: '' }, { analystToken: 'two words' }, { analystToken: 'a\nb' }]) {
    assert.deepEqual(await submit(server, REQUEST, credentials as never), { status: 'error', code: 'invalid-request' });
  }
  assert.equal(server.calls.length, 0);
});

test('submits the seen result as the analyst, read back as to_be_verified, sending only the submit transition', async () => {
  const server = senaite();
  const result = await submit(server);
  assert.deepEqual(result, {
    status: 'submitted', analysis: { uid: TSH_UID, sampleId: 'WB-0001', keyword: 'TSH', result: '2.41' },
  });
  assert.deepEqual(server.calls.map(c => `${c.method} ${c.path}`), [
    'GET users/current', 'GET AnalysisRequest', 'GET Analysis', 'POST update', 'GET Analysis',
  ]);
  assert.deepEqual(server.posts().map(c => c.body), [{ uid: TSH_UID, transition: 'submit' }]);
  assert.deepEqual(server.calls[1].query, { getId: 'WB-0001', getClientUID: CLIENT, complete: 'yes', limit: '10' });
  assert.deepEqual(server.calls[2].query, { getRequestUID: SAMPLE_UID, complete: 'yes', limit: '100' });
  for (const call of server.calls) {
    assert.equal(call.headers.get('authorization'), `Bearer ${TOKEN}`);
    assert.equal(call.init?.redirect, 'error');
    assert.equal(call.init?.credentials, 'omit');
  }
  // SENAITE now names the person, which is what four-eyes verification compares against.
  assert.equal(server.analyses[0].review_state, 'to_be_verified');
  assert.equal(server.analyses[0].getSubmittedBy, 'analyst-a');
  assert.doesNotMatch(JSON.stringify(result), /analyst-a|synthetic-analyst-token/);
});

test('an assigned analysis and a below-limit result submit too', async () => {
  const server = senaite();
  server.analyses[0].review_state = 'assigned';
  server.analyses[0].DetectionLimitOperand = '<';
  assert.deepEqual(await submit(server), { status: 'error', code: 'result-mismatch' });
  assert.equal((await submit(server, { ...REQUEST, expectedOperand: '<' })).status, 'submitted');
});

test('the analyst is matched by login name or user id, case-insensitively', async () => {
  const byId = senaite({ username: 'a.person@lab.example.invalid', userId: 'analyst-a' });
  assert.equal((await submit(byId)).status, 'submitted');
  assert.equal(byId.analyses[0].getSubmittedBy, 'analyst-a');
  const byCase = senaite({ username: 'Analyst-A' });
  assert.equal((await submit(byCase)).status, 'submitted');
});

test('a token that signs in as anyone but the analyst never submits, service accounts included', async () => {
  for (const account of [{ username: 'ohworks-import-svc' }, { username: 'analyst-c' }]) {
    const server = senaite(account);
    assert.deepEqual(await submit(server), { status: 'error', code: 'analyst-mismatch' });
    assert.deepEqual(server.calls.map(c => c.path), ['users/current']);
  }
});

test('only the exact result the analyst saw is submitted', async () => {
  const changed = senaite();
  changed.analyses[0].Result = '7.0';
  assert.deepEqual(await submit(changed), { status: 'error', code: 'result-mismatch' });
  const empty = senaite();
  assert.deepEqual(await submit(empty, { ...REQUEST, analysisUid: FT4_UID, keyword: 'FT4', expectedResult: '1.1' }),
    { status: 'error', code: 'result-mismatch' });
  assert.equal(changed.posts().length + empty.posts().length, 0);
});

test('a result already submitted or verified writes nothing and claims no submitter', async () => {
  for (const reviewState of ['to_be_verified', 'verified', 'published']) {
    const server = senaite();
    server.analyses[0].review_state = reviewState;
    server.analyses[0].getSubmittedBy = 'analyst-c';
    assert.deepEqual(await submit(server), {
      status: 'already_submitted', reviewState,
      analysis: { uid: TSH_UID, sampleId: 'WB-0001', keyword: 'TSH', result: '2.41' },
    });
    assert.equal(server.posts().length, 0);
  }
});

test('retracted, rejected and cancelled analyses are not submittable; a retest is never swapped in', async () => {
  for (const reviewState of ['retracted', 'rejected', 'cancelled']) {
    const server = senaite();
    server.analyses[0].review_state = reviewState;
    server.analyses.push({
      uid: '9'.repeat(32), parent_uid: SAMPLE_UID, Keyword: 'TSH', review_state: 'unassigned', Result: '2.41',
    });
    assert.deepEqual(await submit(server), { status: 'error', code: 'not-submittable', reviewState });
    assert.equal(server.posts().length, 0);
  }
});

test('a sample that is not received is refused before any write', async () => {
  const server = senaite({
    samples: [{ uid: SAMPLE_UID, id: 'WB-0001', getClientUID: CLIENT, review_state: 'sample_due' }],
  });
  assert.deepEqual(await submit(server), { status: 'error', code: 'sample-not-received', reviewState: 'sample_due' });
  assert.equal(server.posts().length, 0);
});

test('the real SENAITE 2.6.0 rejected-token answer stops before any sample query', async () => {
  const { bodyText } = recorded.responses['users-current-invalid-bearer'];
  const paths: string[] = [];
  const fetchImpl: typeof fetch = async input => {
    paths.push(new URL(String(input)).pathname);
    return new Response(bodyText, { status: 200, headers: { 'content-type': 'application/json' } });
  };
  assert.deepEqual(await createSenaiteResultSubmitter(env, fetchImpl).submit(REQUEST, CREDENTIALS),
    { status: 'error', code: 'unauthenticated' });
  assert.deepEqual(paths, [`${API}users/current`]);
});

test('a dropped client filter that lists a foreign sample fails closed before any write', async () => {
  const server = senaite({
    dropFilters: ['getClientUID'],
    samples: [{ uid: SAMPLE_UID, id: 'WB-0001', getClientUID: OTHER_CLIENT, review_state: 'sample_received' }],
  });
  assert.deepEqual(await submit(server), { status: 'error', code: 'scope-mismatch' });
  assert.equal(server.posts().length, 0);
});

test('a dropped sample filter that lists foreign analyses fails closed before any write', async () => {
  const server = senaite({ dropFilters: ['getRequestUID'] });
  server.analyses.push({
    uid: 'e'.repeat(32), parent_uid: '2'.repeat(32), Keyword: 'TSH', review_state: 'unassigned', Result: '7.0',
  });
  assert.deepEqual(await submit(server), { status: 'error', code: 'scope-mismatch' });
  assert.equal(server.posts().length, 0);
});

test('an analysis from another sample, or under a different keyword, is refused', async () => {
  const elsewhere = senaite();
  assert.deepEqual(await submit(elsewhere, { ...REQUEST, analysisUid: 'e'.repeat(32) }),
    { status: 'error', code: 'analysis-not-found' });
  const relabelled = senaite();
  assert.deepEqual(await submit(relabelled, { ...REQUEST, keyword: 'FT4' }), { status: 'error', code: 'scope-mismatch' });
  assert.equal(elsewhere.posts().length + relabelled.posts().length, 0);
});

test('missing and duplicate samples are refused', async () => {
  assert.deepEqual(await submit(senaite({ samples: [] })), { status: 'error', code: 'sample-not-found' });
  assert.deepEqual(await submit(senaite({ samples: [
    { uid: SAMPLE_UID, id: 'WB-0001', getClientUID: CLIENT, review_state: 'sample_received' },
    { uid: '3'.repeat(32), id: 'WB-0001', getClientUID: CLIENT, review_state: 'sample_received' },
  ] })), { status: 'error', code: 'ambiguous-sample' });
});

test('paged or oversized analysis listings are not trusted as the whole sample', async () => {
  const server = senaite();
  const paged: typeof fetch = async (input, init) => {
    const response = await server.fetchImpl(input, init);
    if (!String(input).includes('/Analysis?')) return response;
    return new Response(JSON.stringify({ ...(await response.json()), next: `${ROOT}/@@API/senaite/v1/Analysis?b_start=100` }));
  };
  assert.deepEqual(await createSenaiteResultSubmitter(env, paged).submit(REQUEST, CREDENTIALS),
    { status: 'error', code: 'invalid-response' });

  const big = senaite();
  for (let i = 0; i < 100; i += 1) {
    big.analyses.push({
      uid: i.toString(16).padStart(32, 'f'), parent_uid: SAMPLE_UID, Keyword: `K${i}`, review_state: 'unassigned',
    });
  }
  assert.deepEqual(await submit(big), { status: 'error', code: 'invalid-response' });
  assert.equal(server.posts().length + big.posts().length, 0);
});

test('without an accepted write answer a submitted read-back is never claimed', async () => {
  // The write landed but its answer was lost: unconfirmed now, already_submitted on retry.
  const lostButApplied = senaite({ write: 'apply-and-lose' });
  assert.deepEqual(await submit(lostButApplied), { status: 'error', code: 'write-unconfirmed' });
  assert.equal((await submit(lostButApplied)).status, 'already_submitted');

  // Someone else submitted first; SENAITE refuses ours. That submit is not ours to report.
  const raced = senaite({ write: 'someone-else-first' });
  assert.deepEqual(await submit(raced), { status: 'error', code: 'write-unconfirmed' });

  for (const write of ['lose-answer', 'ignore'] as const) {
    assert.deepEqual(await submit(senaite({ write })), { status: 'error', code: 'write-unconfirmed' });
  }
});

test('an explicit refusal that left the result unsubmitted is write-failed', async () => {
  const http = senaite({ write: 'http-error' });
  assert.deepEqual(await submit(http), { status: 'error', code: 'write-failed' });
  assert.equal(http.analyses[0].review_state, 'unassigned');
});

test('a submitted read-back with a different result is not reported as the seen result', async () => {
  assert.deepEqual(await submit(senaite({ write: 'change-result' })), { status: 'error', code: 'write-unconfirmed' });
});

test('a submit SENAITE attributes to someone else is reported, never claimed as the analyst', async () => {
  const server = senaite({ write: 'record-other-submitter' });
  assert.deepEqual(await submit(server), { status: 'error', code: 'submitter-unattributed' });
});

test('transport, HTTP and JSON failures return fixed codes without upstream bodies', async () => {
  const failing = (response: () => Promise<Response>): typeof fetch => async () => response();
  const run = (impl: typeof fetch) => createSenaiteResultSubmitter(env, impl).submit(REQUEST, CREDENTIALS);
  assert.deepEqual(await run(failing(async () => { throw new Error(`boom ${TOKEN}`); })),
    { status: 'error', code: 'request-failed' });
  assert.deepEqual(await run(failing(async () => new Response('secret stack', { status: 500 }))),
    { status: 'error', code: 'request-failed' });
  assert.deepEqual(await run(failing(async () => new Response('<html>', { status: 200 }))),
    { status: 'error', code: 'invalid-response' });
  assert.deepEqual(await run(failing(async () => new Response(JSON.stringify({ success: false, message: 'x' })))),
    { status: 'error', code: 'invalid-response' });
  const badId = senaite({ userId: '%E0%A4%A' });
  assert.deepEqual(await submit(badId), { status: 'error', code: 'invalid-response' });
});
