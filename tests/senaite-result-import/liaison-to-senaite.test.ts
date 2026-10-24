import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLiaisonExport, type LiaisonResult } from '../../lib/ohworks-liaison-import';
import {
  createSenaiteResultImporter,
  MAX_IMPORT_RESULTS,
  type SenaiteResultImportEnvironment,
} from '../../lib/senaite-result-import';

const env = {
  SENAITE_BASE_URL: 'https://lab.example.invalid/site/',
  SENAITE_RESULT_IMPORT_TOKEN: 'synthetic-import-token',
};
const SERIAL = 'SYNTHETIC-LXL-001';
const API = '/site/@@API/senaite/v1/';
const uid = (n: number) => n.toString(16).padStart(32, '0');

type FakeAnalysis = { uid: string; parent: string; Keyword: string; Unit: string; Result: string; review_state: string };
type FakeSample = { uid: string; id: string; review_state: string };

/**
 * In-memory stand-in for senaite.jsonapi v1 with the behaviours that matter
 * here: an unknown token is Anonymous with HTTP 200, unknown catalog filters
 * are silently dropped, `update` sets fields, and errors can be HTTP-200
 * `success: false`. Nothing contacts a real SENAITE server.
 */
function fakeSenaite(options: {
  token?: string;
  ignore?: Set<string>;
  updateFails?: boolean;
  readBackStale?: boolean;
  failAnalysesFor?: string;
} = {}) {
  const samples: FakeSample[] = [
    { uid: uid(1), id: 'SYN-0001', review_state: 'sample_received' },
    { uid: uid(2), id: 'SYN-0002', review_state: 'sample_due' },
    { uid: uid(3), id: 'SYN-0003', review_state: 'sample_received' },
  ];
  const analyses: FakeAnalysis[] = [
    { uid: uid(101), parent: uid(1), Keyword: 'HSV1', Unit: 'index', Result: '', review_state: 'unassigned' },
    { uid: uid(102), parent: uid(1), Keyword: 'HSV2', Unit: 'index', Result: '', review_state: 'assigned' },
    { uid: uid(103), parent: uid(1), Keyword: 'HIV', Unit: 'S/CO', Result: '0.21', review_state: 'to_be_verified' },
    { uid: uid(104), parent: uid(1), Keyword: 'VZV', Unit: 'index', Result: '1.9', review_state: 'unassigned' },
    { uid: uid(105), parent: uid(1), Keyword: 'CMV', Unit: 'AU/mL', Result: '', review_state: 'unassigned' },
    // A retest: the retracted original sits beside the open retest.
    { uid: uid(106), parent: uid(3), Keyword: 'HSV1', Unit: 'index', Result: '4.2', review_state: 'retracted' },
    { uid: uid(107), parent: uid(3), Keyword: 'HSV1', Unit: 'index', Result: '', review_state: 'unassigned' },
  ];
  const requests: { method: string; path: string; params: URLSearchParams; body?: unknown; auth: string | null }[] = [];
  const token = options.token ?? env.SENAITE_RESULT_IMPORT_TOKEN;
  const view = (a: FakeAnalysis) => ({
    uid: a.uid, parent_uid: a.parent, Keyword: a.Keyword, Unit: a.Unit, Result: a.Result, review_state: a.review_state,
  });

  const fetch: typeof globalThis.fetch = async (input, init: RequestInit = {}) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://lab.example.invalid');
    assert.equal(init.redirect, 'error');
    const method = init.method ?? 'GET';
    const auth = new Headers(init.headers).get('Authorization');
    const body = init.body === undefined ? undefined : JSON.parse(String(init.body));
    assert.ok(url.pathname.startsWith(API));
    const route = url.pathname.slice(API.length);
    requests.push({ method, path: route, params: url.searchParams, body, auth });
    if (route === 'Analysis' && url.searchParams.get('getRequestUID') === options.failAnalysesFor) {
      return new Response('upstream down', { status: 502 });
    }
    const signedIn = auth === `Bearer ${token}`;
    const filter = (key: string) => options.ignore?.has(key) ? null : url.searchParams.get(key);

    if (route === 'users/current') {
      return Response.json({ items: [{ username: signedIn ? 'synthetic-importer' : 'Anonymous User', authenticated: signedIn }] });
    }
    if (!signedIn) return Response.json({ items: [], count: 0 });
    if (route === 'AnalysisRequest' && method === 'GET') {
      const id = filter('getId');
      return Response.json({ items: samples.filter(s => id === null || s.id === id).map(s => ({ ...s })) });
    }
    if (route === 'Analysis' && method === 'GET') {
      const parent = filter('getRequestUID');
      return Response.json({ items: analyses.filter(a => parent === null || a.parent === parent).map(view), next: null });
    }
    if (route.startsWith('Analysis/') && method === 'GET') {
      const found = analyses.find(a => a.uid === route.slice('Analysis/'.length));
      const item = found && view(found);
      return Response.json({ items: item ? [options.readBackStale ? { ...item, Result: '' } : item] : [] });
    }
    if (route === 'update' && method === 'POST') {
      if (options.updateFails) return Response.json({ success: false, message: 'synthetic failure' });
      const target = analyses.find(a => a.uid === (body as { uid: string }).uid);
      if (!target) return Response.json({ success: false, message: 'not found' });
      target.Result = (body as { Result: string }).Result;
      return Response.json({ items: [view(target)], count: 1 });
    }
    return new Response('not found', { status: 404 });
  };
  return { fetch, samples, analyses, requests, writes: () => requests.filter(r => r.method !== 'GET') };
}

const result = (changes: Partial<LiaisonResult> = {}): LiaisonResult => ({
  sampleId: 'SYN-0001', keyword: 'HSV1', value: 2.75, unit: 'index', flag: '',
  capturedAtIso: '2026-10-22T09:00:00.000Z', instrument: SERIAL, ...changes,
});
const forbiddenFetch: typeof fetch = async () => { assert.fail('Transport must not run'); };

test('acceptance: a LIAISON XL export lands as unsubmitted SENAITE results and reads back', async () => {
  const exported = [
    'Sample ID,Assay Code,Result Value,Unit,Flag,Run Timestamp,Instrument Serial',
    `SYN-0001,HSV-1 IgG,2.75,index,,2026-10-22T09:00:00Z,${SERIAL}`,
    `SYN-0001,HSV-2 IgG,0.4,index,,2026-10-22T09:00:05Z,${SERIAL}`,
    `SYN-0003,HSV-1 IgG,6.1,index,H,2026-10-22T09:01:00Z,${SERIAL}`,
  ].join('\r\n');
  const parsed = parseLiaisonExport(exported, { serviceKeywordByAssayCode: { 'HSV-1 IgG': 'HSV1', 'HSV-2 IgG': 'HSV2' } });
  assert.deepEqual(parsed.rejected, []);

  const lab = fakeSenaite();
  const importer = createSenaiteResultImporter(env, lab.fetch);
  const plan = await importer.importResults(parsed.results, { instrumentSerial: SERIAL });
  assert.deepEqual(plan, { status: 'ok', applied: false, outcomes: [
    { sampleId: 'SYN-0001', keyword: 'HSV1', status: 'ready', result: '2.75' },
    { sampleId: 'SYN-0001', keyword: 'HSV2', status: 'ready', result: '0.4' },
    { sampleId: 'SYN-0003', keyword: 'HSV1', status: 'ready', result: '6.1' },
  ] });
  assert.deepEqual(lab.writes(), [], 'a plan sends GETs only');

  const applied = await importer.importResults(parsed.results, { instrumentSerial: SERIAL, apply: true });
  assert.deepEqual(applied, { status: 'ok', applied: true, outcomes: [
    { sampleId: 'SYN-0001', keyword: 'HSV1', status: 'written', result: '2.75' },
    { sampleId: 'SYN-0001', keyword: 'HSV2', status: 'written', result: '0.4' },
    { sampleId: 'SYN-0003', keyword: 'HSV1', status: 'written', result: '6.1' },
  ] });
  const byUid = new Map(lab.analyses.map(a => [a.uid, a]));
  assert.equal(byUid.get(uid(101))!.Result, '2.75');
  assert.equal(byUid.get(uid(102))!.Result, '0.4');
  assert.equal(byUid.get(uid(107))!.Result, '6.1', 'the open retest gets the value');
  assert.equal(byUid.get(uid(106))!.Result, '4.2', 'the retracted original is untouched');
  // Nothing is submitted: every analysis keeps its workflow state for analyst review.
  assert.deepEqual(lab.analyses.map(a => a.review_state),
    ['unassigned', 'assigned', 'to_be_verified', 'unassigned', 'unassigned', 'retracted', 'unassigned']);
  for (const write of lab.writes()) {
    assert.equal(write.path, 'update');
    assert.deepEqual(Object.keys(write.body as object).sort(), ['Result', 'uid']);
    assert.equal(write.auth, `Bearer ${env.SENAITE_RESULT_IMPORT_TOKEN}`);
  }
});

test('never overwrites, never touches reviewed work, and never rescales units', async () => {
  const lab = fakeSenaite();
  const importer = createSenaiteResultImporter(env, lab.fetch);
  const outcome = await importer.importResults([
    result({ keyword: 'VZV' }),
    result({ keyword: 'HIV', unit: 'S/CO' }),
    result({ keyword: 'CMV', unit: 'IU/mL' }),
    result({ keyword: 'EBV' }),
    result({ instrument: 'SYNTHETIC-OTHER-ANALYZER' }),
    result({ sampleId: 'SYN-0002' }),
    result({ sampleId: 'SYN-9999' }),
  ], { instrumentSerial: SERIAL, apply: true });
  assert.deepEqual(outcome, { status: 'ok', applied: true, outcomes: [
    { sampleId: 'SYN-0001', keyword: 'VZV', status: 'skipped', reason: 'existing-result' },
    { sampleId: 'SYN-0001', keyword: 'HIV', status: 'skipped', reason: 'analysis-not-editable' },
    { sampleId: 'SYN-0001', keyword: 'CMV', status: 'skipped', reason: 'unit-mismatch' },
    { sampleId: 'SYN-0001', keyword: 'EBV', status: 'skipped', reason: 'no-analysis' },
    { sampleId: 'SYN-0001', keyword: 'HSV1', status: 'skipped', reason: 'unexpected-instrument' },
    { sampleId: 'SYN-0002', keyword: 'HSV1', status: 'skipped', reason: 'sample-not-received' },
    { sampleId: 'SYN-9999', keyword: 'HSV1', status: 'skipped', reason: 'sample-not-found' },
  ] });
  assert.deepEqual(lab.writes(), []);
});

test('two open analyses for one keyword are ambiguous, not guessed', async () => {
  const lab = fakeSenaite();
  lab.analyses.push({ uid: uid(108), parent: uid(1), Keyword: 'HSV1', Unit: 'index', Result: '', review_state: 'unassigned' });
  const outcome = await createSenaiteResultImporter(env, lab.fetch)
    .importResults([result()], { instrumentSerial: SERIAL, apply: true });
  assert.deepEqual(outcome, { status: 'ok', applied: true, outcomes: [
    { sampleId: 'SYN-0001', keyword: 'HSV1', status: 'skipped', reason: 'ambiguous-analysis' },
  ] });
  assert.deepEqual(lab.writes(), []);
});

test('a rejected token is unauthenticated and nothing else is requested', async () => {
  const lab = fakeSenaite({ token: 'a-different-token' });
  const outcome = await createSenaiteResultImporter(env, lab.fetch)
    .importResults([result()], { instrumentSerial: SERIAL, apply: true });
  assert.deepEqual(outcome, { status: 'error', code: 'unauthenticated' });
  assert.deepEqual(lab.requests.map(r => r.path), ['users/current']);
});

test('an ignored sample-scope filter fails the whole import closed', async () => {
  const lab = fakeSenaite({ ignore: new Set(['getRequestUID']) });
  const outcome = await createSenaiteResultImporter(env, lab.fetch)
    .importResults([result()], { instrumentSerial: SERIAL, apply: true });
  assert.deepEqual(outcome, { status: 'error', code: 'scope-mismatch' });
  assert.deepEqual(lab.writes(), []);
});

test('an ignored sample-ID filter still matches only the exact sample', async () => {
  const lab = fakeSenaite({ ignore: new Set(['getId']) });
  const outcome = await createSenaiteResultImporter(env, lab.fetch)
    .importResults([result({ sampleId: 'SYN-9999' }), result({ sampleId: 'SYN-0003' })], { instrumentSerial: SERIAL });
  assert.deepEqual(outcome, { status: 'ok', applied: false, outcomes: [
    { sampleId: 'SYN-9999', keyword: 'HSV1', status: 'skipped', reason: 'sample-not-found' },
    { sampleId: 'SYN-0003', keyword: 'HSV1', status: 'ready', result: '2.75' },
  ] });
});

test('a read failure part-way through the plan writes nothing', async () => {
  // The first sample plans cleanly; the second sample's analyses read fails.
  const lab = fakeSenaite({ failAnalysesFor: uid(3) });
  const outcome = await createSenaiteResultImporter(env, lab.fetch)
    .importResults([result(), result({ sampleId: 'SYN-0003' })], { instrumentSerial: SERIAL, apply: true });
  assert.deepEqual(outcome, { status: 'error', code: 'request-failed' });
  assert.deepEqual(lab.writes(), []);
  assert.equal(lab.analyses.find(a => a.uid === uid(101))!.Result, '');
});

test('a refused write and an unconfirmed read-back are reported, not claimed as written', async () => {
  const refused = fakeSenaite({ updateFails: true });
  assert.deepEqual(await createSenaiteResultImporter(env, refused.fetch)
    .importResults([result()], { instrumentSerial: SERIAL, apply: true }),
  { status: 'ok', applied: true, outcomes: [{ sampleId: 'SYN-0001', keyword: 'HSV1', status: 'failed', reason: 'write-failed' }] });

  const stale = fakeSenaite({ readBackStale: true });
  assert.deepEqual(await createSenaiteResultImporter(env, stale.fetch)
    .importResults([result()], { instrumentSerial: SERIAL, apply: true }),
  { status: 'ok', applied: true, outcomes: [{ sampleId: 'SYN-0001', keyword: 'HSV1', status: 'failed', reason: 'write-unconfirmed' }] });
});

test('values are written as plain decimal text', async () => {
  const lab = fakeSenaite();
  const outcome = await createSenaiteResultImporter(env, lab.fetch)
    .importResults([result({ value: 1e-7 }), result({ keyword: 'HSV2', value: 0 })], { instrumentSerial: SERIAL, apply: true });
  assert.equal(outcome.status, 'ok');
  assert.deepEqual(lab.writes().map(w => (w.body as { Result: string }).Result), ['0.0000001', '0']);
});

test('configuration and input fail closed without a request', async () => {
  for (const partial of [{}, { SENAITE_BASE_URL: env.SENAITE_BASE_URL },
    { SENAITE_RESULT_IMPORT_TOKEN: env.SENAITE_RESULT_IMPORT_TOKEN },
    { ...env, SENAITE_BASE_URL: 'http://lab.example.invalid/site' },
    { ...env, SENAITE_BASE_URL: 'https://user:pw@lab.example.invalid/site' },
    { ...env, SENAITE_RESULT_IMPORT_TOKEN: 'token with spaces' },
    // The read-only token never enables writes.
    { SENAITE_BASE_URL: env.SENAITE_BASE_URL, SENAITE_API_TOKEN: 'read-only' }] as SenaiteResultImportEnvironment[]) {
    const importer = createSenaiteResultImporter(partial, forbiddenFetch);
    assert.equal(importer.enabled, false);
    assert.deepEqual(await importer.importResults([result()], { instrumentSerial: SERIAL }), { status: 'not_configured' });
  }
  const importer = createSenaiteResultImporter(env, forbiddenFetch);
  const tooMany = Array.from({ length: MAX_IMPORT_RESULTS + 1 }, (_, i) => result({ sampleId: `SYN-${i}` }));
  for (const [results, options] of [
    [[result(), result()], { instrumentSerial: SERIAL }],
    [tooMany, { instrumentSerial: SERIAL }],
    [[result({ value: Number.NaN })], { instrumentSerial: SERIAL }],
    [[result()], { instrumentSerial: ' ' }],
    [[result()], { instrumentSerial: SERIAL, apply: 'yes' }],
    ['not a list', { instrumentSerial: SERIAL }],
  ] as const) {
    assert.deepEqual(await importer.importResults(results as never, options as never), { status: 'error', code: 'invalid-input' });
  }
});

test('replayed real SENAITE 2.6.0: a rejected import token is caught before any lookup or write', async () => {
  // Recorded from a real SENAITE 2.6.0 server (tests/senaite-read/fixtures/README.md).
  const { default: recorded } = await import('../senaite-read/fixtures/recorded/senaite-2.6.0-anonymous.json');
  const { status, contentType, bodyText } = recorded.responses['users-current-invalid-bearer'];
  const paths: string[] = [];
  const replay: typeof fetch = async input => {
    paths.push(new URL(String(input)).pathname);
    return new Response(bodyText, { status, headers: { 'content-type': contentType } });
  };
  const importer = createSenaiteResultImporter({
    SENAITE_BASE_URL: 'https://senaite.recorded.invalid/senaite',
    SENAITE_RESULT_IMPORT_TOKEN: 'recorded-invalid-token',
  }, replay);
  assert.deepEqual(await importer.importResults([result()], { instrumentSerial: SERIAL, apply: true }),
    { status: 'error', code: 'unauthenticated' });
  assert.deepEqual(paths, ['/senaite/@@API/senaite/v1/users/current']);
});
