import assert from 'node:assert/strict';
import test from 'node:test';
import recorded from '../senaite-read/fixtures/recorded/senaite-2.6.0-anonymous.json';
import { createOHWorksSenaiteSample, type OHWorksSampleCreateRequest } from '../../lib/ohworks-senaite-create';
import {
  createSenaiteSampleCreateAdapter,
  SenaiteSampleCreateError,
  type SenaiteSampleCreateMapping,
} from '../../lib/senaite-sample-create';

const uid = (n: number) => n.toString(16).padStart(32, '0');
const CLIENT = uid(0xc1);
const OTHER_CLIENT = uid(0xc2);
const CONTACT = uid(0xc0);
const WATER = uid(0x51);
const SOIL = uid(0x52);
const LEAD = uid(0xa1);
const PH = uid(0xa2);

const mapping: SenaiteSampleCreateMapping = {
  tenants: { 'tenant-a': { clientUid: CLIENT, contactUid: CONTACT } },
  sampleTypes: { 'water-potable': WATER, soil: SOIL },
  services: { lead: LEAD, ph: PH },
};
const env = { SENAITE_BASE_URL: 'https://senaite.test.invalid/senaite', SENAITE_SAMPLE_CREATE_TOKEN: 'create-token' };
const API = '/senaite/@@API/senaite/v1/';

const request: OHWorksSampleCreateRequest = {
  requestId: 'req-1',
  tenantId: 'tenant-a',
  clientId: 'client-a',
  sampleId: 'OHW-0001',
  matrixCode: 'water-potable',
  dateSampled: '2026-10-20T08:00:00Z',
  dateReceived: '2026-10-20T10:00:00Z',
  analyses: ['lead', 'ph'],
};

type StoredSample = { uid: string; id: string; getClientUID: string; getClientSampleID: string; getSampleTypeUID: string; review_state: string };
type StoredAnalysis = { uid: string; parent_uid: string; getServiceUID: string };

/**
 * In-memory stand-in for the senaite.jsonapi routes the adapter uses. Like the
 * real API it answers HTTP 200 for Anonymous callers and drops query keys that
 * are not catalog indexes; `ignoreIndexes` simulates an index that is missing.
 */
function senaite(options: {
  authenticated?: boolean;
  ignoreIndexes?: string[];
  onCreate?: (body: Record<string, unknown>) => Partial<StoredSample> & { skipServices?: string[]; loseAnswer?: boolean; refuse?: boolean };
} = {}) {
  const samples: StoredSample[] = [];
  const analyses: StoredAnalysis[] = [];
  const calls: { method: string; path: string; query: Record<string, string>; body?: Record<string, unknown> }[] = [];
  let next = 0x1000;
  const ignored = new Set(options.ignoreIndexes ?? []);
  const listing = (items: unknown[]) => Response.json({ count: items.length, items, next: null, page: 1, pages: 1 });

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://senaite.test.invalid');
    assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer create-token');
    const route = url.pathname.slice(API.length);
    const query = Object.fromEntries(url.searchParams);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: init?.method ?? 'GET', path: route, query, ...(body ? { body } : {}) });
    const authenticated = options.authenticated ?? true;

    if (route === 'users/current') {
      return listing([{ username: authenticated ? 'importer' : 'Anonymous User', authenticated }]);
    }
    if (!authenticated) return listing([]);
    const filter = <T extends Record<string, unknown>>(rows: T[], keys: string[]) =>
      rows.filter(row => keys.every(key => ignored.has(key) || query[key] === undefined || row[key === 'UID' ? 'uid' : key] === query[key]));

    if (route === 'AnalysisRequest' && init?.method === 'GET') {
      return listing(filter(samples, ['getClientUID', 'getClientSampleID', 'UID']).slice(0, Number(query.limit)));
    }
    if (route === 'Analysis' && init?.method === 'GET') {
      return listing(filter(analyses.map(a => ({ ...a, getRequestUID: a.parent_uid })), ['getRequestUID']));
    }
    if (route === 'create' && init?.method === 'POST') {
      const quirk = options.onCreate?.(body) ?? {};
      if (quirk.refuse) return Response.json({ success: false, message: 'Contact is required' });
      const sample: StoredSample = {
        uid: uid(next++),
        id: `WP-${String(samples.length + 1).padStart(4, '0')}`,
        getClientUID: body.Client,
        getClientSampleID: body.ClientSampleID,
        getSampleTypeUID: body.SampleType,
        review_state: 'sample_due',
        ...quirk,
      };
      samples.push(sample);
      for (const service of body.Analyses as string[]) {
        if (!quirk.skipServices?.includes(service)) analyses.push({ uid: uid(next++), parent_uid: sample.uid, getServiceUID: service });
      }
      if (quirk.loseAnswer) throw new TypeError('socket hang up');
      return listing([{ uid: sample.uid, id: sample.id }]);
    }
    return Response.json({ success: false, message: '404 Not Found' });
  };
  return { fetchImpl, samples, analyses, calls };
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof SenaiteSampleCreateError);
    assert.doesNotMatch(error.message, /token|Contact is required|socket/);
    return error.code;
  }
  assert.fail('expected a SenaiteSampleCreateError');
}

test('acceptance: an OHWorks request becomes one SENAITE sample, confirmed by read-back', async () => {
  const server = senaite();
  const adapter = createSenaiteSampleCreateAdapter(mapping, env, server.fetchImpl);
  const result = await createOHWorksSenaiteSample(request, { tenantId: 'tenant-a' }, adapter);

  assert.deepEqual(result, { requestId: 'req-1', sampleId: 'OHW-0001', status: 'CREATED', reasons: [], senaiteSampleId: 'WP-0001' });
  assert.deepEqual(server.samples.map(({ id, getClientUID, getClientSampleID, getSampleTypeUID, review_state }) =>
    ({ id, getClientUID, getClientSampleID, getSampleTypeUID, review_state })),
  [{ id: 'WP-0001', getClientUID: CLIENT, getClientSampleID: 'OHW-0001', getSampleTypeUID: WATER, review_state: 'sample_due' }]);
  assert.deepEqual(server.analyses.map(a => a.getServiceUID).sort(), [LEAD, PH]);

  assert.deepEqual(server.calls.map(c => `${c.method} ${c.path}`),
    ['GET users/current', 'GET AnalysisRequest', 'POST create', 'GET AnalysisRequest', 'GET Analysis']);
  assert.deepEqual(server.calls[1].query, { limit: '2', getClientUID: CLIENT, getClientSampleID: 'OHW-0001' });
  assert.deepEqual(server.calls[2].body, {
    portal_type: 'AnalysisRequest', parent_uid: CLIENT, Client: CLIENT, Contact: CONTACT, SampleType: WATER,
    DateSampled: '2026-10-20T08:00:00Z', ClientSampleID: 'OHW-0001', Analyses: [LEAD, PH],
  });
  assert.deepEqual(server.calls[3].query, { limit: '2', UID: server.samples[0].uid });
  assert.deepEqual(server.calls[4].query, { limit: '51', getRequestUID: server.samples[0].uid });
});

test('a retry after a lost create answer finds the sample instead of creating a second one', async () => {
  let lose = true;
  const server = senaite({ onCreate: () => ({ loseAnswer: lose }) });
  const adapter = createSenaiteSampleCreateAdapter(mapping, env, server.fetchImpl);

  assert.equal(await codeOf(adapter.createSample(request)), 'write-unconfirmed');
  lose = false;
  const first = await createOHWorksSenaiteSample(request, { tenantId: 'tenant-a' }, adapter);

  assert.equal(first.status, 'CREATED');
  assert.equal(first.senaiteSampleId, 'WP-0001');
  assert.equal(server.samples.length, 1);
  assert.equal(server.calls.filter(c => c.method === 'POST').length, 1);
});

test('the contract reports a lost create answer as a rejected adapter error, without upstream text', async () => {
  const server = senaite({ onCreate: () => ({ loseAnswer: true }) });
  const result = await createOHWorksSenaiteSample(request, { tenantId: 'tenant-a' },
    createSenaiteSampleCreateAdapter(mapping, env, server.fetchImpl));
  assert.deepEqual(result, { requestId: 'req-1', sampleId: 'OHW-0001', status: 'REJECTED', reasons: [{ code: 'adapter-error' }] });
});

test('an unmapped tenant, matrix or analysis sends no request', async () => {
  for (const change of [{ tenantId: 'tenant-b' }, { matrixCode: 'air-ambient' }, { analyses: ['lead', 'mercury'] },
    { analyses: ['constructor'] }, { tenantId: 'toString' }]) {
    const server = senaite();
    const adapter = createSenaiteSampleCreateAdapter(mapping, env, server.fetchImpl);
    assert.equal(await codeOf(adapter.createSample({ ...request, ...change })), 'unmapped', JSON.stringify(change));
    assert.deepEqual(server.calls, []);
  }
});

test('only a separate create token over HTTPS with UID mappings enables writes', async () => {
  const server = senaite();
  const disabled = [
    createSenaiteSampleCreateAdapter(mapping, { SENAITE_BASE_URL: env.SENAITE_BASE_URL, SENAITE_API_TOKEN: 'read-token' } as never, server.fetchImpl),
    createSenaiteSampleCreateAdapter(mapping, { ...env, SENAITE_BASE_URL: 'http://senaite.test.invalid/senaite' }, server.fetchImpl),
    createSenaiteSampleCreateAdapter(mapping, { ...env, SENAITE_BASE_URL: 'https://u:p@senaite.test.invalid/senaite' }, server.fetchImpl),
    createSenaiteSampleCreateAdapter(mapping, { ...env, SENAITE_SAMPLE_CREATE_TOKEN: 'two words' }, server.fetchImpl),
    createSenaiteSampleCreateAdapter({ ...mapping, sampleTypes: { soil: 'Soil' } }, env, server.fetchImpl),
    createSenaiteSampleCreateAdapter({ ...mapping, tenants: { t: { clientUid: CLIENT, contactUid: '' } } }, env, server.fetchImpl),
  ];
  for (const adapter of disabled) {
    assert.equal(adapter.enabled, false);
    assert.equal(await codeOf(adapter.createSample(request)), 'not-configured');
  }
  assert.deepEqual(server.calls, []);
  assert.equal(createSenaiteSampleCreateAdapter(mapping, env, server.fetchImpl).enabled, true);
});

test('a rejected token stops after users/current, in the stand-in and in the recorded real SENAITE 2.6.0 answer', async () => {
  const server = senaite({ authenticated: false });
  assert.equal(await codeOf(createSenaiteSampleCreateAdapter(mapping, env, server.fetchImpl).createSample(request)), 'unauthenticated');
  assert.deepEqual(server.calls.map(c => c.path), ['users/current']);

  const paths: string[] = [];
  const replay: typeof fetch = async (input) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    const { status, contentType, bodyText } = recorded.responses['users-current-invalid-bearer'];
    return new Response(bodyText.replaceAll('senaite.recorded.invalid', 'senaite.test.invalid'),
      { status, headers: { 'content-type': contentType } });
  };
  assert.equal(await codeOf(createSenaiteSampleCreateAdapter(mapping, env, replay).createSample(request)), 'unauthenticated');
  assert.deepEqual(paths, [`${API}users/current`]);
});

test('an ignored lookup filter fails closed before any write', async () => {
  // Each planted sample is excluded only by the index that is being dropped.
  for (const [index, client, clientSampleId] of [['getClientSampleID', CLIENT, 'OHW-0999'], ['getClientUID', OTHER_CLIENT, 'OHW-0001']]) {
    const server = senaite({ ignoreIndexes: [index] });
    server.samples.push({ uid: uid(0xee), id: 'WP-0900', getClientUID: client, getClientSampleID: clientSampleId, getSampleTypeUID: SOIL, review_state: 'sample_due' });
    assert.equal(await codeOf(createSenaiteSampleCreateAdapter(mapping, env, server.fetchImpl).createSample(request)), 'scope-mismatch', index);
    assert.equal(server.calls.filter(c => c.method === 'POST').length, 0);
  }
});

test('two existing samples with the same OHWorks ID are never guessed between', async () => {
  const server = senaite();
  for (const n of [1, 2]) {
    server.samples.push({ uid: uid(0xe0 + n), id: `WP-090${n}`, getClientUID: CLIENT, getClientSampleID: 'OHW-0001', getSampleTypeUID: WATER, review_state: 'sample_due' });
  }
  assert.equal(await codeOf(createSenaiteSampleCreateAdapter(mapping, env, server.fetchImpl).createSample(request)), 'duplicate-existing');
  assert.equal(server.calls.filter(c => c.method === 'POST').length, 0);
});

test('an existing sample that differs from the request is a conflict, not a success', async () => {
  const server = senaite();
  server.samples.push({ uid: uid(0xe1), id: 'WP-0901', getClientUID: CLIENT, getClientSampleID: 'OHW-0001', getSampleTypeUID: SOIL, review_state: 'sample_due' });
  assert.equal(await codeOf(createSenaiteSampleCreateAdapter(mapping, env, server.fetchImpl).createSample(request)), 'existing-conflict');
  assert.equal(server.calls.filter(c => c.method === 'POST').length, 0);
});

test('SENAITE storing something other than what was asked is unconfirmed, not created', async () => {
  const quirks = [
    { getSampleTypeUID: SOIL },
    { getClientSampleID: '' },
    { review_state: 'invalid' },
    { skipServices: [PH] },
  ];
  for (const quirk of quirks) {
    const server = senaite({ onCreate: () => quirk });
    const adapter = createSenaiteSampleCreateAdapter(mapping, env, server.fetchImpl);
    assert.equal(await codeOf(adapter.createSample(request)), 'write-unconfirmed', JSON.stringify(quirk));
    const result = await createOHWorksSenaiteSample({ ...request, sampleId: 'OHW-0002' }, { tenantId: 'tenant-a' }, adapter);
    assert.equal(result.status, 'REJECTED');
  }

  const foreign = senaite({ onCreate: () => ({ getClientUID: OTHER_CLIENT }) });
  assert.equal(await codeOf(createSenaiteSampleCreateAdapter(mapping, env, foreign.fetchImpl).createSample(request)), 'scope-mismatch');
});

test('an ignored analysis filter that returns another sample\'s analyses fails closed', async () => {
  const server = senaite({ ignoreIndexes: ['getRequestUID'] });
  server.analyses.push({ uid: uid(0xdd), parent_uid: uid(0xee), getServiceUID: LEAD });
  assert.equal(await codeOf(createSenaiteSampleCreateAdapter(mapping, env, server.fetchImpl).createSample(request)), 'scope-mismatch');
});

test('a refused or failed create is write-failed; read failures are request-failed', async () => {
  const refused = senaite({ onCreate: () => ({ refuse: true }) });
  assert.equal(await codeOf(createSenaiteSampleCreateAdapter(mapping, env, refused.fetchImpl).createSample(request)), 'write-failed');
  assert.equal(refused.samples.length, 0);

  const failing = (failOn: string, status: number): typeof fetch => {
    const server = senaite();
    return async (input, init) => (new URL(String(input)).pathname.endsWith(failOn)
      ? new Response('Internal error with secrets', { status })
      : server.fetchImpl(input, init));
  };
  assert.equal(await codeOf(createSenaiteSampleCreateAdapter(mapping, env, failing('/create', 500)).createSample(request)), 'write-failed');
  assert.equal(await codeOf(createSenaiteSampleCreateAdapter(mapping, env, failing('/users/current', 503)).createSample(request)), 'request-failed');
  assert.equal(await codeOf(createSenaiteSampleCreateAdapter(mapping, env, failing('/AnalysisRequest', 502)).createSample(request)), 'request-failed');
});
