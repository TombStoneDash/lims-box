import assert from 'node:assert/strict';
import test from 'node:test';
import recorded from '../senaite-read/fixtures/recorded/senaite-2.6.0-anonymous.json';
import { createSenaiteResultVerifier } from '../../lib/senaite-result-verify';

// Acceptance suite against an in-memory senaite.jsonapi stand-in. Every record is
// synthetic. The stand-in applies only the query keys SENAITE indexes, so tests
// can also make it drop a filter the way the real catalog silently does.

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
  Result?: string | null; getSubmittedBy?: string | null;
};

type Options = {
  username?: string;
  authenticated?: boolean;
  samples?: Sample[];
  analyses?: Analysis[];
  dropFilters?: string[];
  /** What happens on POST update. */
  write?: 'apply' | 'lose-answer' | 'refuse' | 'ignore' | 'apply-and-lose' | 'change-result';
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
      return json({ count: 1, items: [{ username: authenticated ? options.username ?? 'reviewer-b' : 'Anonymous User', authenticated }] });
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
      if (mode === 'refuse') return json({ success: false, message: 'synthetic refusal' });
      if (mode === 'lose-answer') throw new TypeError('socket hang up');
      if (target && body.transition === 'verify' && mode !== 'ignore') {
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

const REQUEST = { clientUid: CLIENT, sampleId: 'WB-0001', keyword: 'TSH' };

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
  const verifier = createSenaiteResultVerifier(env, server.fetchImpl);
  for (const request of [
    null,
    { ...REQUEST, clientUid: 'C'.repeat(32) },
    { ...REQUEST, sampleId: '../WB-0001' },
    { ...REQUEST, keyword: 'TSH&review_state=verified' },
    { clientUid: CLIENT, sampleId: 'WB-0001' },
  ]) {
    assert.deepEqual(await verifier.verify(request as never), { status: 'error', code: 'invalid-request' });
  }
  assert.equal(server.calls.length, 0);
});

test('verifies a submitted result after a read-back, sending only the verify transition', async () => {
  const server = senaite();
  const result = await createSenaiteResultVerifier(env, server.fetchImpl).verify(REQUEST);
  assert.deepEqual(result, {
    status: 'verified', transitioned: true,
    analysis: { uid: TSH_UID, sampleId: 'WB-0001', keyword: 'TSH', result: '2.41' },
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
  // The verifier's and submitter's usernames are compared, never returned.
  assert.doesNotMatch(JSON.stringify(result), /analyst-a|reviewer-b|synthetic-verify-token/);
});

test('a result already verified is reported without writing again', async () => {
  const server = senaite();
  server.analyses[0].review_state = 'verified';
  const result = await createSenaiteResultVerifier(env, server.fetchImpl).verify(REQUEST);
  assert.equal(result.status, 'verified');
  assert.equal(result.status === 'verified' && result.transitioned, false);
  assert.equal(server.posts().length, 0);
});

test('four-eyes: the submitter can never verify their own result', async () => {
  const server = senaite({ username: 'analyst-a' });
  assert.deepEqual(await createSenaiteResultVerifier(env, server.fetchImpl).verify(REQUEST),
    { status: 'error', code: 'self-verification' });
  assert.equal(server.posts().length, 0);
});

test('four-eyes: a submitter id differing only in case is still the same person', async () => {
  const server = senaite({ username: 'Analyst-A' });
  assert.deepEqual(await createSenaiteResultVerifier(env, server.fetchImpl).verify(REQUEST),
    { status: 'error', code: 'self-verification' });
  assert.equal(server.posts().length, 0);
});

test('four-eyes: an email login cannot be compared with a submitter id, so nothing is verified', async () => {
  const server = senaite({ username: 'reviewer@lab.example.invalid' });
  assert.deepEqual(await createSenaiteResultVerifier(env, server.fetchImpl).verify(REQUEST),
    { status: 'error', code: 'verifier-unknown' });
  assert.equal(server.posts().length, 0);
});

test('four-eyes: a result with no recorded submitter is never verified', async () => {
  for (const getSubmittedBy of [undefined, null, '', '  ']) {
    const server = senaite();
    server.analyses[0].getSubmittedBy = getSubmittedBy;
    assert.deepEqual(await createSenaiteResultVerifier(env, server.fetchImpl).verify(REQUEST),
      { status: 'error', code: 'submitter-unknown' });
    assert.equal(server.posts().length, 0);
  }
});

test('an unsubmitted or empty result is not verifiable', async () => {
  const unsubmitted = senaite();
  assert.deepEqual(
    await createSenaiteResultVerifier(env, unsubmitted.fetchImpl).verify({ ...REQUEST, keyword: 'FT4' }),
    { status: 'error', code: 'not-verifiable', reviewState: 'unassigned' },
  );
  const empty = senaite();
  empty.analyses[0].Result = '';
  assert.deepEqual(await createSenaiteResultVerifier(env, empty.fetchImpl).verify(REQUEST),
    { status: 'error', code: 'no-result' });
  assert.equal(unsubmitted.posts().length + empty.posts().length, 0);
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
  assert.deepEqual(await createSenaiteResultVerifier(env, server.fetchImpl).verify(REQUEST),
    { status: 'error', code: 'scope-mismatch' });
  assert.equal(server.posts().length, 0);
});

test('a dropped sample filter that lists foreign analyses fails closed before any write', async () => {
  const server = senaite({ dropFilters: ['getRequestUID'] });
  server.analyses.push({
    uid: 'e'.repeat(32), parent_uid: '2'.repeat(32), Keyword: 'TSH', review_state: 'to_be_verified',
    Result: '7.0', getSubmittedBy: 'analyst-c',
  });
  assert.deepEqual(await createSenaiteResultVerifier(env, server.fetchImpl).verify(REQUEST),
    { status: 'error', code: 'scope-mismatch' });
  assert.equal(server.posts().length, 0);
});

test('missing and duplicate samples or analyses are refused', async () => {
  const missing = senaite({ samples: [] });
  assert.deepEqual(await createSenaiteResultVerifier(env, missing.fetchImpl).verify(REQUEST),
    { status: 'error', code: 'sample-not-found' });
  const twoSamples = senaite({ samples: [
    { uid: SAMPLE_UID, id: 'WB-0001', getClientUID: CLIENT },
    { uid: '3'.repeat(32), id: 'WB-0001', getClientUID: CLIENT },
  ] });
  assert.deepEqual(await createSenaiteResultVerifier(env, twoSamples.fetchImpl).verify(REQUEST),
    { status: 'error', code: 'ambiguous-sample' });
  const noAnalysis = senaite();
  assert.deepEqual(
    await createSenaiteResultVerifier(env, noAnalysis.fetchImpl).verify({ ...REQUEST, keyword: 'HCG' }),
    { status: 'error', code: 'analysis-not-found' });
  const twoAnalyses = senaite();
  twoAnalyses.analyses.push({ ...twoAnalyses.analyses[0], uid: 'f'.repeat(32) });
  assert.deepEqual(await createSenaiteResultVerifier(env, twoAnalyses.fetchImpl).verify(REQUEST),
    { status: 'error', code: 'ambiguous-analysis' });
});

test('a retest is verified, not the retracted original with the same keyword', async () => {
  const retestUid = '9'.repeat(32);
  const server = senaite();
  server.analyses[0].review_state = 'retracted';
  server.analyses.push({
    uid: retestUid, parent_uid: SAMPLE_UID, Keyword: 'TSH', review_state: 'to_be_verified',
    Result: '2.38', getSubmittedBy: 'analyst-a',
  });
  const result = await createSenaiteResultVerifier(env, server.fetchImpl).verify(REQUEST);
  assert.equal(result.status === 'verified' && result.analysis.uid, retestUid);
  assert.deepEqual(server.posts().map(c => c.body), [{ uid: retestUid, transition: 'verify' }]);
});

test('a paged or oversized analysis listing is not trusted as the whole sample', async () => {
  const server = senaite();
  const original = server.fetchImpl;
  const paged: typeof fetch = async (input, init) => {
    const response = await original(input, init);
    if (!String(input).includes('/Analysis?')) return response;
    return new Response(JSON.stringify({ ...(await response.json()), next: `${ROOT}/@@API/senaite/v1/Analysis?b_start=100` }));
  };
  assert.deepEqual(await createSenaiteResultVerifier(env, paged).verify(REQUEST),
    { status: 'error', code: 'invalid-response' });
  assert.equal(server.posts().length, 0);
});

test('the read-back decides: a lost answer that verified succeeds, one that did not is unconfirmed', async () => {
  const lostButApplied = senaite({ write: 'apply-and-lose' });
  const applied = await createSenaiteResultVerifier(env, lostButApplied.fetchImpl).verify(REQUEST);
  assert.equal(applied.status === 'verified' && applied.transitioned, true);

  const lost = senaite({ write: 'lose-answer' });
  assert.deepEqual(await createSenaiteResultVerifier(env, lost.fetchImpl).verify(REQUEST),
    { status: 'error', code: 'write-unconfirmed' });
  const ignored = senaite({ write: 'ignore' });
  assert.deepEqual(await createSenaiteResultVerifier(env, ignored.fetchImpl).verify(REQUEST),
    { status: 'error', code: 'write-unconfirmed' });
});

test('an explicit refusal that left the result unverified is write-failed', async () => {
  const server = senaite({ write: 'refuse' });
  assert.deepEqual(await createSenaiteResultVerifier(env, server.fetchImpl).verify(REQUEST),
    { status: 'error', code: 'write-failed' });
  assert.equal(server.analyses[0].review_state, 'to_be_verified');
});

test('a verified read-back with a different result is not reported as the reviewed result', async () => {
  const server = senaite({ write: 'change-result' });
  assert.deepEqual(await createSenaiteResultVerifier(env, server.fetchImpl).verify(REQUEST),
    { status: 'error', code: 'write-unconfirmed' });
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
