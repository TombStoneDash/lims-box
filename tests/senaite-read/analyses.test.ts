import assert from 'node:assert/strict';
import test from 'node:test';
import recorded from './fixtures/recorded/senaite-2.6.0-anonymous.json';
import { createSenaiteAnalysesReader, MAX_SAMPLE_ANALYSES } from '../../lib/senaite-read/analyses';

const env = {
  SENAITE_BASE_URL: 'https://lab.example.invalid/site/',
  SENAITE_API_TOKEN: 'synthetic-token',
};
const SAMPLE = 'a'.repeat(32);
const OTHER_SAMPLE = 'b'.repeat(32);

// Every reader gets an in-memory transport; no test can contact a SENAITE server.
const forbiddenFetch: typeof fetch = async () => { assert.fail('Transport must not run'); };
const signedIn = { items: [{ username: 'synthetic-reader', authenticated: true, roles: ['Authenticated'] }] };
const isIdentity = (input: unknown) => new URL(String(input)).pathname.endsWith('/@@API/senaite/v1/users/current');
function labFetch(payload: unknown, seen: URL[] = []): typeof fetch {
  return async input => {
    seen.push(new URL(String(input)));
    return Response.json(isIdentity(input) ? signedIn : payload);
  };
}

// Shape of a senaite.jsonapi `complete=yes` Analysis record (synthetic values).
const analysis = (overrides: Record<string, unknown> = {}) => ({
  uid: 'c'.repeat(32), parent_uid: SAMPLE, Keyword: 'pH', title: 'pH', review_state: 'verified',
  Unit: '', Result: '7.2', getClientUID: 'd'.repeat(32), Analyst: 'synthetic-analyst', ...overrides,
});

test('missing configuration or a malformed sample UID sends no request', async () => {
  assert.deepEqual(await createSenaiteAnalysesReader({}, forbiddenFetch).listSampleAnalyses(SAMPLE), { status: 'not_configured' });
  const reader = createSenaiteAnalysesReader(env, forbiddenFetch);
  for (const uid of ['', 'A'.repeat(32), 'a'.repeat(31), `${SAMPLE}&getKeyword=pH`, 'H2O-0001', 42, null]) {
    assert.deepEqual(await reader.listSampleAnalyses(uid as string), { status: 'error', code: 'invalid-query' });
  }
});

test('reads one sample with a scoped GET after proving sign-in', async () => {
  const seen: URL[] = [];
  const result = await createSenaiteAnalysesReader(env, labFetch({ items: [analysis()] }, seen)).listSampleAnalyses(SAMPLE);
  assert.deepEqual(result, {
    status: 'ok',
    analyses: [{ uid: 'c'.repeat(32), keyword: 'pH', title: 'pH', reviewState: 'verified', unit: null, reportableResult: '7.2' }],
  });
  assert.deepEqual(seen.map(url => url.pathname), ['/site/@@API/senaite/v1/users/current', '/site/@@API/senaite/v1/Analysis']);
  assert.deepEqual(Object.fromEntries(seen[1].searchParams), {
    getRequestUID: SAMPLE, complete: 'yes', limit: String(MAX_SAMPLE_ANALYSES), sort_on: 'sortable_title',
  });
});

test('a result is shown only after SENAITE verification', async () => {
  const states = ['unassigned', 'assigned', 'to_be_verified', 'retracted', 'rejected', 'cancelled', null, 'verified', 'published'];
  const items = states.map((review_state, i) => analysis({ uid: String(i).repeat(32), review_state, Result: '12.5', Unit: 'mg/L' }));
  const result = await createSenaiteAnalysesReader(env, labFetch({ items })).listSampleAnalyses(SAMPLE);
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.deepEqual(result.analyses.map(a => a.reportableResult), [null, null, null, null, null, null, null, '12.5', '12.5']);
  assert.ok(result.analyses.every(a => a.unit === 'mg/L'));
  // A verified analysis with a blank result is still not a reported value.
  const blank = await createSenaiteAnalysesReader(env, labFetch({ items: [analysis({ Result: '  ' })] })).listSampleAnalyses(SAMPLE);
  assert.equal(blank.status === 'ok' && blank.analyses[0].reportableResult, null);
});

test('only the public analysis shape leaves the reader', async () => {
  const result = await createSenaiteAnalysesReader(env, labFetch({ items: [analysis()] })).listSampleAnalyses(SAMPLE);
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.deepEqual(Object.keys(result.analyses[0]).sort(), ['keyword', 'reportableResult', 'reviewState', 'title', 'uid', 'unit']);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-analyst|dddd/);
});

test('an analysis stored in another sample fails the whole page', async () => {
  // What SENAITE returns if it silently drops the getRequestUID filter.
  for (const parent_uid of [OTHER_SAMPLE, undefined, null, SAMPLE.toUpperCase(), [SAMPLE], { uid: SAMPLE }]) {
    const items = [analysis(), analysis({ uid: 'e'.repeat(32), parent_uid })];
    assert.deepEqual(
      await createSenaiteAnalysesReader(env, labFetch({ items })).listSampleAnalyses(SAMPLE),
      { status: 'error', code: 'scope-mismatch' },
    );
  }
});

test('malformed or unbounded listings fail closed', async () => {
  const fullPage = { items: Array.from({ length: MAX_SAMPLE_ANALYSES }, () => analysis()) };
  for (const payload of [null, [], { items: null }, { items: [null] }, fullPage,
    { items: [analysis({ uid: '' })] }, { items: [analysis({ Keyword: undefined })] },
    { items: [analysis({ Result: 7.2 })] }, { items: [analysis({ review_state: ['verified'] })] },
    { items: [analysis({ Unit: { title: 'mg/L' } })] }, { success: false, message: 'synthetic error' }]) {
    assert.deepEqual(
      await createSenaiteAnalysesReader(env, labFetch(payload)).listSampleAnalyses(SAMPLE),
      { status: 'error', code: 'invalid-response' },
    );
  }
  assert.deepEqual(await createSenaiteAnalysesReader(env, labFetch({ items: [] })).listSampleAnalyses(SAMPLE), { status: 'ok', analyses: [] });
});

test('transport and HTTP failures return fixed codes without upstream detail', async () => {
  const cases: [typeof fetch, string][] = [
    [async () => { throw new Error('secret upstream detail'); }, 'request-failed'],
    [async () => new Response('secret upstream body', { status: 500 }), 'request-failed'],
    [async () => new Response('not json'), 'invalid-response'],
  ];
  for (const [fetchImpl, code] of cases) {
    const result = await createSenaiteAnalysesReader(env, fetchImpl).listSampleAnalyses(SAMPLE);
    assert.deepEqual(result, { status: 'error', code });
  }
});

test('the recorded real SENAITE 2.6.0 rejected-token answer never queries analyses', async () => {
  const { status, contentType, bodyText } = recorded.responses['users-current-invalid-bearer'];
  const seen: string[] = [];
  const fetchImpl: typeof fetch = async input => {
    seen.push(new URL(String(input)).pathname);
    return new Response(isIdentity(input) ? bodyText : '{"items": []}', { status, headers: { 'content-type': contentType } });
  };
  const result = await createSenaiteAnalysesReader(env, fetchImpl).listSampleAnalyses(SAMPLE);
  assert.deepEqual(result, { status: 'error', code: 'unauthenticated' });
  assert.deepEqual(seen, ['/site/@@API/senaite/v1/users/current']);
});
