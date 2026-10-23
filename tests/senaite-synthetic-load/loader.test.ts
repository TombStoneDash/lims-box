import assert from 'node:assert/strict';
import test from 'node:test';
import type { SenaiteSampleAdapter } from '../../lib/ohworks-senaite-create';
import { generateOHWorksSyntheticSamples, type OHWorksSyntheticSample } from '../../lib/ohworks-synthetic-sample-batch';
import { createSenaiteSampleCreateAdapter, type SenaiteSampleCreateMapping } from '../../lib/senaite-sample-create';
import {
  loadSyntheticSamplesIntoSenaite,
  SyntheticLoadInputError,
} from '../../lib/senaite-synthetic-load';

const uid = (n: number) => n.toString(16).padStart(32, '0');
const TENANT = 'SYNTHETIC-TENANT-001';
const CLIENT = uid(0xc1);
const CONTACT = uid(0xc0);
const MATRICES = ['water-potable', 'water-waste', 'soil', 'air-ambient'] as const;

const mapping: SenaiteSampleCreateMapping = {
  tenants: { [TENANT]: { clientUid: CLIENT, contactUid: CONTACT } },
  sampleTypes: Object.fromEntries(MATRICES.map((matrix, index) => [matrix, uid(0x50 + index)])),
  services: Object.fromEntries([1, 2, 3, 4, 5].map(n => [`SYNTHETIC-ANALYSIS-${n}`, uid(0xa0 + n)])),
};
const env = { SENAITE_BASE_URL: 'https://senaite.test.invalid/senaite', SENAITE_SAMPLE_CREATE_TOKEN: 'create-token' };
const API = '/senaite/@@API/senaite/v1/';

/** The 60-sample synthetic OHWorks batch: four matrices, fabricated analysis codes. */
function batch(count = 60): OHWorksSyntheticSample[] {
  return generateOHWorksSyntheticSamples({
    seed: 'ohworks-point-3',
    count,
    receivedFromIso: '2026-10-20T08:00:00Z',
    profiles: [
      { matrixCode: 'water-potable', analyses: ['SYNTHETIC-ANALYSIS-1', 'SYNTHETIC-ANALYSIS-2'] },
      { matrixCode: 'water-waste', analyses: ['SYNTHETIC-ANALYSIS-3'] },
      { matrixCode: 'soil', analyses: ['SYNTHETIC-ANALYSIS-4', 'SYNTHETIC-ANALYSIS-1'] },
      { matrixCode: 'air-ambient', analyses: ['SYNTHETIC-ANALYSIS-5'] },
    ],
  });
}

type StoredSample = { uid: string; id: string; getClientUID: string; getClientSampleID: string; getSampleTypeUID: string; review_state: string };

/**
 * In-memory senaite.jsonapi stand-in, as in tests/senaite-sample-create: HTTP
 * 200 for Anonymous, unknown query keys dropped, `ignoreIndexes` for an index
 * the server lacks.
 */
function senaite(options: {
  authenticated?: boolean;
  ignoreIndexes?: string[];
  onCreate?: (body: Record<string, unknown>, nth: number) => { loseAnswer?: boolean; refuse?: boolean } | undefined;
} = {}) {
  const samples: StoredSample[] = [];
  const analyses: { uid: string; parent_uid: string; getServiceUID: string }[] = [];
  const calls: string[] = [];
  let next = 0x1000;
  let creates = 0;
  const ignored = new Set(options.ignoreIndexes ?? []);
  const listing = (items: unknown[]) => Response.json({ count: items.length, items, next: null, page: 1, pages: 1 });

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://senaite.test.invalid');
    const route = url.pathname.slice(API.length);
    const query = Object.fromEntries(url.searchParams);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push(`${init?.method ?? 'GET'} ${route}`);
    const authenticated = options.authenticated ?? true;

    if (route === 'users/current') return listing([{ username: authenticated ? 'loader' : 'Anonymous User', authenticated }]);
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
      const quirk = options.onCreate?.(body, ++creates) ?? {};
      if (quirk.refuse) return Response.json({ success: false, message: 'Contact is required' });
      const sample: StoredSample = {
        uid: uid(next++),
        id: `SYN-${String(samples.length + 1).padStart(4, '0')}`,
        getClientUID: body.Client,
        getClientSampleID: body.ClientSampleID,
        getSampleTypeUID: body.SampleType,
        review_state: 'sample_due',
      };
      samples.push(sample);
      for (const service of body.Analyses as string[]) analyses.push({ uid: uid(next++), parent_uid: sample.uid, getServiceUID: service });
      if (quirk.loseAnswer) throw new TypeError('socket hang up');
      return listing([{ uid: sample.uid, id: sample.id }]);
    }
    return Response.json({ success: false, message: '404 Not Found' });
  };
  return { fetchImpl, samples, analyses, calls, posts: () => calls.filter(call => call.startsWith('POST')).length };
}

const adapterFor = (server: ReturnType<typeof senaite>) => createSenaiteSampleCreateAdapter(mapping, env, server.fetchImpl);

test('acceptance: 60 synthetic OHWorks samples become 60 SENAITE samples, each read back', async () => {
  const server = senaite();
  const samples = batch();
  const result = await loadSyntheticSamplesIntoSenaite(samples, { tenantId: TENANT }, adapterFor(server));

  assert.equal(result.status, 'loaded');
  assert.deepEqual([result.requested, result.created, result.rejected, result.skipped], [60, 60, 0, 0]);
  assert.deepEqual(result.createdByMatrix, { 'water-potable': 15, 'water-waste': 15, soil: 15, 'air-ambient': 15 });

  // What SENAITE now holds: one sample per OHWorks ID, under the synthetic client, with its analyses.
  assert.equal(server.samples.length, 60);
  assert.deepEqual(server.samples.map(s => s.getClientSampleID), samples.map(s => s.sampleId));
  assert.ok(server.samples.every(s => s.getClientUID === CLIENT && s.review_state === 'sample_due'));
  const expectedAnalyses = samples.reduce((sum, s) => sum + new Set(s.analyses).size, 0);
  assert.equal(server.analyses.length, expectedAnalyses);
  assert.deepEqual(result.samples.map(s => s.senaiteSampleId), server.samples.map(s => s.id));
  // Each sample: sign-in proof, lookup, create, sample read-back, analyses read-back.
  assert.equal(server.calls.length, 60 * 5);
  assert.equal(server.posts(), 60);
});

test('re-running the same batch creates nothing new and still reports all 60 loaded', async () => {
  const server = senaite();
  const samples = batch();
  await loadSyntheticSamplesIntoSenaite(samples, { tenantId: TENANT }, adapterFor(server));
  const before = server.posts();

  const again = await loadSyntheticSamplesIntoSenaite(samples, { tenantId: TENANT }, adapterFor(server));
  assert.equal(again.status, 'loaded');
  assert.equal(again.created, 60);
  assert.equal(server.posts(), before);
  assert.equal(server.samples.length, 60);
});

test('a lost create answer is reported, not guessed; the re-run finishes without a duplicate', async () => {
  const server = senaite({ onCreate: (_body, nth) => (nth === 10 ? { loseAnswer: true } : undefined) });
  const samples = batch();
  const first = await loadSyntheticSamplesIntoSenaite(samples, { tenantId: TENANT }, adapterFor(server));

  assert.equal(first.status, 'partial');
  assert.equal(first.created, 59);
  assert.deepEqual(first.samples[9], { sampleId: samples[9].sampleId, status: 'REJECTED', reasons: ['adapter-error'], adapterCode: 'write-unconfirmed' });

  const second = await loadSyntheticSamplesIntoSenaite(samples, { tenantId: TENANT }, adapterFor(server));
  assert.equal(second.status, 'loaded');
  assert.equal(server.samples.length, 60);
  assert.equal(new Set(server.samples.map(s => s.getClientSampleID)).size, 60);
});

test('a rejected SENAITE sign-in halts the batch after one request and writes nothing', async () => {
  const server = senaite({ authenticated: false });
  const result = await loadSyntheticSamplesIntoSenaite(batch(), { tenantId: TENANT }, adapterFor(server));

  assert.equal(result.status, 'halted');
  assert.deepEqual(result.haltedOn, { sampleId: result.samples[0].sampleId, code: 'unauthenticated' });
  assert.deepEqual([result.created, result.rejected, result.skipped], [0, 1, 59]);
  assert.deepEqual(server.calls, ['GET users/current']);
});

test('a missing ClientSampleID index halts before it can create duplicates', async () => {
  // Without the index every lookup returns the whole client; the second
  // sample's lookup sees the first sample and refuses to trust it.
  const server = senaite({ ignoreIndexes: ['getClientSampleID'] });
  const result = await loadSyntheticSamplesIntoSenaite(batch(), { tenantId: TENANT }, adapterFor(server));

  assert.equal(result.status, 'halted');
  assert.equal(result.haltedOn?.code, 'scope-mismatch');
  assert.equal(result.created, 1);
  assert.equal(result.skipped, 58);
  assert.equal(server.samples.length, 1);
});

test('three refused creates in a row stop the batch instead of hammering SENAITE', async () => {
  const server = senaite({ onCreate: () => ({ refuse: true }) });
  const result = await loadSyntheticSamplesIntoSenaite(batch(), { tenantId: TENANT }, adapterFor(server));

  assert.equal(result.status, 'halted');
  assert.equal(result.haltedOn?.code, 'repeated-failures');
  assert.deepEqual([result.created, result.rejected, result.skipped], [0, 3, 57]);
  assert.equal(server.posts(), 3);
  assert.ok(result.samples.slice(0, 3).every(s => s.adapterCode === 'write-failed'));
});

test('one isolated refusal does not stop the rest of the batch', async () => {
  const server = senaite({ onCreate: (_body, nth) => (nth === 5 ? { refuse: true } : undefined) });
  const result = await loadSyntheticSamplesIntoSenaite(batch(), { tenantId: TENANT }, adapterFor(server));

  assert.equal(result.status, 'partial');
  assert.deepEqual([result.created, result.rejected, result.skipped], [59, 1, 0]);
  assert.equal(result.samples[4].adapterCode, 'write-failed');
});

test('two OHWorks samples resolving to one SENAITE sample are never both reported loaded', async () => {
  const adapter: SenaiteSampleAdapter = {
    async createSample(request) {
      return [{ senaiteSampleId: 'SYN-0001', tenantId: request.tenantId, matrixCode: request.matrixCode }];
    },
  };
  const result = await loadSyntheticSamplesIntoSenaite(batch(2), { tenantId: TENANT }, adapter);

  assert.equal(result.status, 'partial');
  assert.equal(result.created, 1);
  assert.deepEqual(result.samples[1].reasons, ['senaite-id-reused']);
  assert.equal(result.samples[1].senaiteSampleId, undefined);
});

test('anything that is not synthetic is refused before the first request', async () => {
  const server = senaite();
  const adapter = adapterFor(server);
  const good = batch(3);
  const refused = async (samples: unknown, tenantId = TENANT) => {
    try {
      await loadSyntheticSamplesIntoSenaite(samples as OHWorksSyntheticSample[], { tenantId }, adapter);
    } catch (error) {
      assert.ok(error instanceof SyntheticLoadInputError);
      return error.code;
    }
    assert.fail('expected a SyntheticLoadInputError');
  };

  assert.equal(await refused([{ ...good[0], sampleId: 'OHW-2026-0001' }, ...good.slice(1)]), 'not-synthetic');
  assert.equal(await refused([{ ...good[0], clientId: 'Acme Water Co' }]), 'not-synthetic');
  assert.equal(await refused([{ ...good[0], analyses: ['LEAD-ICP-MS'] }]), 'not-synthetic');
  assert.equal(await refused([{ ...good[0], analyses: [] }]), 'not-synthetic');
  assert.equal(await refused([null]), 'not-synthetic');
  assert.equal(await refused(good, 'tenant-a'), 'invalid-context');
  assert.equal(await refused(good.map(s => ({ ...s, tenantId: 'SYNTHETIC-TENANT-002' }))), 'tenant-mismatch');
  assert.equal(await refused([good[0], good[0]]), 'duplicate-sample-id');
  assert.equal(await refused([]), 'batch-size');
  assert.equal(await refused(batch(101)), 'batch-size');
  assert.equal(await refused('not a batch'), 'batch-size');
  assert.deepEqual(server.calls, []);
});

test('a contract rejection (bad dates) is per-sample and never reaches SENAITE', async () => {
  const server = senaite();
  const samples = batch(4);
  samples[1] = { ...samples[1], dateReceived: '2020-01-01T00:00:00Z' };
  const result = await loadSyntheticSamplesIntoSenaite(samples, { tenantId: TENANT }, adapterFor(server));

  assert.equal(result.status, 'partial');
  assert.deepEqual(result.samples[1], { sampleId: samples[1].sampleId, status: 'REJECTED', reasons: ['date-received-before-sampled'] });
  assert.equal(server.posts(), 3);
});
