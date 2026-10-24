import assert from 'node:assert/strict';
import test from 'node:test';
import recorded from '../senaite-read/fixtures/recorded/senaite-2.6.0-anonymous.json';
import { createSenaiteResultVerifier } from '../../lib/senaite-result-verify';

// Acceptance suite against an in-memory senaite.jsonapi stand-in. Every record is
// synthetic. The stand-in applies only the query keys SENAITE indexes, so tests
// can also make it drop a filter the way the real catalog silently does. Its
// `update` refuses `verify` unless the analysis is `to_be_verified`, like
// SENAITE's workflow guard.

const ROOT = 'https://senaite.test.invalid/senaite';
const API = '/senaite/@@API/senaite/v1/';
const TOKEN = 'synthetic-verify-token';
const env = { SENAITE_BASE_URL: ROOT, SENAITE_RESULT_VERIFY_TOKEN: TOKEN };

const CLIENT = 'c'.repeat(32);
const OTHER_CLIENT = 'd'.repeat(32);
const SAMPLE_UID = '1'.repeat(32);
const TSH_UID = 'a'.repeat(32);
const FT4_UID = 'b'.repeat(32);

type Sample = { uid: string; id: string; getClientUID: string };
type Analysis = {
  uid: string; parent_uid: string; Keyword: string; review_state: string;
  Result?: string | null; DetectionLimitOperand?: string | null; getSubmittedBy?: string | null;
};

type Options = {
  /** The token's service account. */
  username?: string;
  userId?: string;
  authenticated?: boolean;
  samples?: Sample[];
  analyses?: Analysis[];
  dropFilters?: string[];
  /** What happens on POST update. */
  write?: 'apply' | 'lose-answer' | 'http-error' | 'ignore' | 'apply-and-lose' | 'change-result' | 'someone-else-first';
};

function senaite(options: Options = {}) {
  const samples = options.samples ?? [{ uid: SAMPLE_UID, id: 'WB-0001', getClientUID: CLIENT }];
  const analyses: Analysis[] = options.analyses ?? [
    { uid: TSH_UID, parent_uid: SAMPLE_UID, Keyword: 'TSH', review_state: 'to_be_verified', Result: '2.41', getSubmittedBy: 'analyst-a' },
    { uid: FT4_UID, parent_uid: SAMPLE_UID, Keyword: 'FT4', review_state: 'unassigned', Result: '' },
  ];
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
      const authenticated = options.authenticated ?? true;
      const username = authenticated ? options.username ?? 'ohworks-verify-svc' : 'Anonymous User';
      const userId = authenticated ? options.userId ?? username : 'current';
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
      const mode = options.write ?? 'apply';
      if (mode === 'lose-answer') throw new TypeError('socket hang up');
      if (mode === 'http-error') return json({ message: 'synthetic' }, 500);
      if (mode === 'someone-else-first' && target) target.review_state = 'verified';
      if (!target || body.transition !== 'verify' || target.review_state !== 'to_be_verified') {
        return json({ success: false, message: 'Transition verify not allowed' });
      }
      if (mode !== 'ignore') {
        target.review_state = 'verified';
        if (mode === 'change-result') target.Result = '9.99';
      }
      if (mode === 'apply-and-lose') throw new TypeError('socket hang up');
      return json({ count: 1, items: [{ uid: body.uid }] });
    }
    throw new Error(`unexpected route ${route}`);
  };
  return { fetchImpl, calls, analyses, posts: () => calls.filter(c => c.method === 'POST') };
}

const REQUEST = {
  clientUid: CLIENT, sampleId: 'WB-0001', analysisUid: TSH_UID, keyword: 'TSH',
  expectedResult: '2.41', reviewerUserId: 'reviewer-b',
};

const verify = (server: ReturnType<typeof senaite>, request: object = REQUEST) =>
  createSenaiteResultVerifier(env, server.fetchImpl).verify(request as typeof REQUEST);

test('stays inert without its own token; the read-only and import tokens never enable it', async () => {
  const server = senaite();
  for (const config of [
    {},
    { SENAITE_BASE_URL: ROOT },
    { SENAITE_BASE_URL: ROOT, SENAITE_API_TOKEN: TOKEN, SENAITE_RESULT_IMPORT_TOKEN: TOKEN },
    { SENAITE_BASE_URL: 'http://senaite.test.invalid/senaite', SENAITE_RESULT_VERIFY_TOKEN: TOKEN },
    { SENAITE_BASE_URL: 'https://user:pw@senaite.test.invalid/senaite', SENAITE_RESULT_VERIFY_TOKEN: TOKEN },
    { SENAITE_BASE_URL: ROOT, SENAITE_RESULT_VERIFY_TOKEN: 'two words' },
  ]) {
    const verifier = createSenaiteResultVerifier(config as never, server.fetchImpl);
    assert.equal(verifier.enabled, false);
    assert.deepEqual(await verifier.verify(REQUEST), { status: 'not_configured' });
  }
  assert.equal(server.calls.length, 0);
});

test('malformed requests are refused before any request', async () => {
  const server = senaite();
  for (const request of [
    null,
    { ...REQUEST, clientUid: 'C'.repeat(32) },
    { ...REQUEST, sampleId: '../WB-0001' },
    { ...REQUEST, analysisUid: 'not-a-uid' },
    { ...REQUEST, keyword: 'TSH&review_state=verified' },
    { ...REQUEST, expectedResult: '  ' },
    { ...REQUEST, expectedOperand: '<=' },
    { ...REQUEST, reviewerUserId: '' },
    { ...REQUEST, reviewerUserId: undefined },
  ]) {
    assert.deepEqual(await verify(server, request as never), { status: 'error', code: 'invalid-request' });
  }
  assert.equal(server.calls.length, 0);
});

test('verifies the reviewed result after a read-back, sending only the verify transition', async () => {
  const server = senaite();
  const result = await verify(server);
  assert.deepEqual(result, {
    status: 'verified', analysis: { uid: TSH_UID, sampleId: 'WB-0001', keyword: 'TSH', result: '2.41' },
  });
  assert.deepEqual(server.calls.map(c => `${c.method} ${c.path}`), [
    'GET users/current', 'GET AnalysisRequest', 'GET Analysis', 'POST update', 'GET Analysis',
  ]);
  assert.deepEqual(server.posts().map(c => c.body), [{ uid: TSH_UID, transition: 'verify' }]);
  assert.deepEqual(server.calls[1].query, { getId: 'WB-0001', getClientUID: CLIENT, complete: 'yes', limit: '10' });
  assert.deepEqual(server.calls[2].query, { getRequestUID: SAMPLE_UID, complete: 'yes', limit: '100' });
  for (const call of server.calls) {
    assert.equal(call.headers.get('authorization'), `Bearer ${TOKEN}`);
    assert.equal(call.init?.redirect, 'error');
    assert.equal(call.init?.credentials, 'omit');
  }
  // Submitter, reviewer and service-account names are compared, never returned.
  assert.doesNotMatch(JSON.stringify(result), /analyst-a|reviewer-b|ohworks-verify-svc|synthetic-verify-token/);
});

test('a result already verified makes no four-eyes claim and writes nothing', async () => {
  const server = senaite();
  server.analyses[0].review_state = 'verified';
  assert.deepEqual(await verify(server), {
    status: 'already_verified', analysis: { uid: TSH_UID, sampleId: 'WB-0001', keyword: 'TSH', result: '2.41' },
  });
  assert.equal(server.posts().length, 0);
});

test('four-eyes: the submitter can never approve their own result through the service token', async () => {
  for (const reviewerUserId of ['analyst-a', 'Analyst-A']) {
    const server = senaite();
    assert.deepEqual(await verify(server, { ...REQUEST, reviewerUserId }), { status: 'error', code: 'self-verification' });
    assert.equal(server.posts().length, 0);
  }
});

test('four-eyes: the token account is refused when it is the submitter, by login name or user id', async () => {
  for (const account of [{ username: 'analyst-a' }, { username: 'a.person@lab.example.invalid', userId: 'analyst-a' }]) {
    const server = senaite(account);
    assert.deepEqual(await verify(server), { status: 'error', code: 'self-verification' });
    assert.equal(server.posts().length, 0);
  }
});

test('four-eyes: a result with no recorded submitter is never verified', async () => {
  for (const getSubmittedBy of [undefined, null, '', '  ']) {
    const server = senaite();
    server.analyses[0].getSubmittedBy = getSubmittedBy;
    assert.deepEqual(await verify(server), { status: 'error', code: 'submitter-unknown' });
    assert.equal(server.posts().length, 0);
  }
});

test('only the exact result the reviewer saw is verified', async () => {
  const changed = senaite();
  changed.analyses[0].Result = '7.0';
  assert.deepEqual(await verify(changed), { status: 'error', code: 'result-mismatch' });

  const belowLimit = senaite();
  belowLimit.analyses[0].DetectionLimitOperand = '<';
  assert.deepEqual(await verify(belowLimit), { status: 'error', code: 'result-mismatch' });
  assert.equal(changed.posts().length + belowLimit.posts().length, 0);

  assert.equal((await verify(belowLimit, { ...REQUEST, expectedOperand: '<' })).status, 'verified');
});

test('a retest is a different analysis: the reviewed original is never swapped for it', async () => {
  const server = senaite();
  server.analyses[0].review_state = 'retracted';
  server.analyses.push({
    uid: '9'.repeat(32), parent_uid: SAMPLE_UID, Keyword: 'TSH', review_state: 'to_be_verified',
    Result: '7.0', getSubmittedBy: 'analyst-c',
  });
  assert.deepEqual(await verify(server), { status: 'error', code: 'not-verifiable', reviewState: 'retracted' });
  assert.equal(server.posts().length, 0);
});

test('an unsubmitted result is not verifiable', async () => {
  const server = senaite();
  server.analyses[1].Result = '1.1';
  assert.deepEqual(
    await verify(server, { ...REQUEST, analysisUid: FT4_UID, keyword: 'FT4', expectedResult: '1.1' }),
    { status: 'error', code: 'not-verifiable', reviewState: 'unassigned' },
  );
  assert.equal(server.posts().length, 0);
});

test('the real SENAITE 2.6.0 rejected-token answer stops before any sample query', async () => {
  const { bodyText } = recorded.responses['users-current-invalid-bearer'];
  const paths: string[] = [];
  const fetchImpl: typeof fetch = async input => {
    paths.push(new URL(String(input)).pathname);
    return new Response(bodyText, { status: 200, headers: { 'content-type': 'application/json' } });
  };
  assert.deepEqual(await createSenaiteResultVerifier(env, fetchImpl).verify(REQUEST),
    { status: 'error', code: 'unauthenticated' });
  assert.deepEqual(paths, [`${API}users/current`]);
});

test('a dropped client filter that lists a foreign sample fails closed before any write', async () => {
  const server = senaite({
    dropFilters: ['getClientUID'],
    samples: [{ uid: SAMPLE_UID, id: 'WB-0001', getClientUID: OTHER_CLIENT }],
  });
  assert.deepEqual(await verify(server), { status: 'error', code: 'scope-mismatch' });
  assert.equal(server.posts().length, 0);
});

test('a dropped sample filter that lists foreign analyses fails closed before any write', async () => {
  const server = senaite({ dropFilters: ['getRequestUID'] });
  server.analyses.push({
    uid: 'e'.repeat(32), parent_uid: '2'.repeat(32), Keyword: 'TSH', review_state: 'to_be_verified',
    Result: '7.0', getSubmittedBy: 'analyst-c',
  });
  assert.deepEqual(await verify(server), { status: 'error', code: 'scope-mismatch' });
  assert.equal(server.posts().length, 0);
});

test('an analysis from another sample, or under a different keyword, is refused', async () => {
  const elsewhere = senaite();
  assert.deepEqual(await verify(elsewhere, { ...REQUEST, analysisUid: 'e'.repeat(32) }),
    { status: 'error', code: 'analysis-not-found' });
  const relabelled = senaite();
  assert.deepEqual(await verify(relabelled, { ...REQUEST, keyword: 'FT4' }), { status: 'error', code: 'scope-mismatch' });
  assert.equal(elsewhere.posts().length + relabelled.posts().length, 0);
});

test('missing and duplicate samples are refused', async () => {
  assert.deepEqual(await verify(senaite({ samples: [] })), { status: 'error', code: 'sample-not-found' });
  assert.deepEqual(await verify(senaite({ samples: [
    { uid: SAMPLE_UID, id: 'WB-0001', getClientUID: CLIENT },
    { uid: '3'.repeat(32), id: 'WB-0001', getClientUID: CLIENT },
  ] })), { status: 'error', code: 'ambiguous-sample' });
});

test('a paged analysis listing is not trusted as the whole sample', async () => {
  const server = senaite();
  const paged: typeof fetch = async (input, init) => {
    const response = await server.fetchImpl(input, init);
    if (!String(input).includes('/Analysis?')) return response;
    return new Response(JSON.stringify({ ...(await response.json()), next: `${ROOT}/@@API/senaite/v1/Analysis?b_start=100` }));
  };
  assert.deepEqual(await createSenaiteResultVerifier(env, paged).verify(REQUEST),
    { status: 'error', code: 'invalid-response' });
  assert.equal(server.posts().length, 0);
});

test('an oversized analysis listing is not trusted', async () => {
  const server = senaite();
  for (let i = 0; i < 100; i += 1) {
    server.analyses.push({
      uid: i.toString(16).padStart(32, 'f'), parent_uid: SAMPLE_UID, Keyword: `K${i}`, review_state: 'unassigned',
    });
  }
  assert.deepEqual(await verify(server), { status: 'error', code: 'invalid-response' });
  assert.equal(server.posts().length, 0);
});

test('without an accepted write answer a verified read-back is never claimed', async () => {
  // The write landed but its answer was lost: unconfirmed now, already_verified on retry.
  const lostButApplied = senaite({ write: 'apply-and-lose' });
  assert.deepEqual(await verify(lostButApplied), { status: 'error', code: 'write-unconfirmed' });
  assert.equal((await verify(lostButApplied)).status, 'already_verified');

  // Someone else verified first; SENAITE refuses ours. That verify is not ours to report.
  const raced = senaite({ write: 'someone-else-first' });
  assert.deepEqual(await verify(raced), { status: 'error', code: 'write-unconfirmed' });

  for (const write of ['lose-answer', 'ignore'] as const) {
    assert.deepEqual(await verify(senaite({ write })), { status: 'error', code: 'write-unconfirmed' });
  }
});

test('an explicit refusal that left the result unverified is write-failed', async () => {
  const http = senaite({ write: 'http-error' });
  assert.deepEqual(await verify(http), { status: 'error', code: 'write-failed' });
  assert.equal(http.analyses[0].review_state, 'to_be_verified');
});

test('a verified read-back with a different result is not reported as the reviewed result', async () => {
  assert.deepEqual(await verify(senaite({ write: 'change-result' })), { status: 'error', code: 'write-unconfirmed' });
});

test('transport, HTTP and JSON failures return fixed codes without upstream bodies', async () => {
  const failing = (response: () => Promise<Response>): typeof fetch => async () => response();
  assert.deepEqual(
    await createSenaiteResultVerifier(env, failing(async () => { throw new Error(`boom ${TOKEN}`); })).verify(REQUEST),
    { status: 'error', code: 'request-failed' });
  assert.deepEqual(
    await createSenaiteResultVerifier(env, failing(async () => new Response('secret stack', { status: 500 }))).verify(REQUEST),
    { status: 'error', code: 'request-failed' });
  assert.deepEqual(
    await createSenaiteResultVerifier(env, failing(async () => new Response('<html>', { status: 200 }))).verify(REQUEST),
    { status: 'error', code: 'invalid-response' });
  assert.deepEqual(
    await createSenaiteResultVerifier(env, failing(async () => new Response(JSON.stringify({ success: false, message: 'x' })))).verify(REQUEST),
    { status: 'error', code: 'invalid-response' });
});
