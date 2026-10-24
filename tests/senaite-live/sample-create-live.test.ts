import assert from 'node:assert/strict';
import test from 'node:test';
import { createOHWorksSenaiteSample, type OHWorksSampleCreateRequest } from '../../lib/ohworks-senaite-create';
import { createSenaiteSampleCreateAdapter, SenaiteSampleCreateError } from '../../lib/senaite-sample-create';

// Opt-in acceptance test for sample creation against a running SENAITE server.
// Skipped unless SENAITE_LIVE_ORIGIN is set (see live-contract.test.ts for the
// tunnel). With only the origin, it checks that a rejected token stops before
// any write. The create itself also needs all of:
//   SENAITE_LIVE_CREATE_TOKEN    write-capable token for a synthetic sandbox site; never printed
//   SENAITE_LIVE_CREATE_MAPPING  JSON {"clientUid","contactUid","sampleTypeUid","serviceUids":[...]}
//   SENAITE_LIVE_CREATE_CONFIRM=synthetic-sandbox
// It creates one sample with a LIMSBOX-LIVE-* client sample ID and leaves it in
// sample_due; nothing is received, submitted or verified.
const origin = process.env.SENAITE_LIVE_ORIGIN?.trim();
const sitePath = (process.env.SENAITE_LIVE_SITE_PATH?.trim() || '/senaite').replace(/\/+$/, '');
const createToken = process.env.SENAITE_LIVE_CREATE_TOKEN?.trim();
const rawMapping = process.env.SENAITE_LIVE_CREATE_MAPPING?.trim();
const confirmed = process.env.SENAITE_LIVE_CREATE_CONFIRM === 'synthetic-sandbox';
const skipLive = origin ? false : 'set SENAITE_LIVE_ORIGIN to run against a real SENAITE';
const skipCreate = skipLive || (createToken && rawMapping && confirmed ? false
  : 'set SENAITE_LIVE_CREATE_TOKEN, SENAITE_LIVE_CREATE_MAPPING and SENAITE_LIVE_CREATE_CONFIRM=synthetic-sandbox');

// The adapter only accepts an HTTPS site root; requests are forwarded unchanged.
const ADAPTER_ROOT = 'https://senaite-live.invalid';
function forwarder() {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, ADAPTER_ROOT);
    calls.push(`${init?.method ?? 'GET'} ${url.pathname.slice(`${sitePath}/@@API/senaite/v1/`.length)}`);
    return fetch(new URL(`${url.pathname}${url.search}`, origin), init);
  };
  return { calls, fetchImpl };
}

const placeholder = (n: number) => n.toString(16).padStart(32, '0');

function liveSetup(token: string, mapping: { clientUid: string; contactUid: string; sampleTypeUid: string; serviceUids: string[] }) {
  const http = forwarder();
  const adapter = createSenaiteSampleCreateAdapter({
    tenants: { 'live-tenant': { clientUid: mapping.clientUid, contactUid: mapping.contactUid } },
    sampleTypes: { 'water-potable': mapping.sampleTypeUid },
    services: Object.fromEntries(mapping.serviceUids.map((uid, index) => [`service-${index}`, uid])),
  }, { SENAITE_BASE_URL: `${ADAPTER_ROOT}${sitePath}`, SENAITE_SAMPLE_CREATE_TOKEN: token }, http.fetchImpl);
  return { http, adapter };
}

function liveRequest(serviceCount: number): OHWorksSampleCreateRequest {
  const now = new Date();
  return {
    requestId: `live-${now.getTime()}`,
    tenantId: 'live-tenant',
    clientId: 'live-client',
    sampleId: `LIMSBOX-LIVE-${now.getTime()}`,
    matrixCode: 'water-potable',
    dateSampled: now.toISOString(),
    dateReceived: now.toISOString(),
    analyses: Array.from({ length: serviceCount }, (_, index) => `service-${index}`),
  };
}

test('a rejected token stops before any write on the real server', { skip: skipLive }, async () => {
  const { http, adapter } = liveSetup('live-invalid-token', {
    clientUid: placeholder(1), contactUid: placeholder(2), sampleTypeUid: placeholder(3), serviceUids: [placeholder(4)],
  });
  await assert.rejects(adapter.createSample(liveRequest(1)),
    (error: unknown) => error instanceof SenaiteSampleCreateError && ['unauthenticated', 'request-failed'].includes(error.code));
  assert.deepEqual(http.calls, ['GET users/current']);
});

test('a synthetic sample is created once, read back, and found again on retry', { skip: skipCreate }, async () => {
  const mapping = JSON.parse(rawMapping!);
  const { http, adapter } = liveSetup(createToken!, mapping);
  const request = liveRequest(mapping.serviceUids.length);

  const first = await createOHWorksSenaiteSample(request, { tenantId: 'live-tenant' }, adapter);
  // A rejection here names the guard: run adapter.createSample directly to see its fixed code.
  assert.equal(first.status, 'CREATED', JSON.stringify(first));
  const retry = await createOHWorksSenaiteSample(request, { tenantId: 'live-tenant' }, adapter);
  assert.deepEqual(retry, first);
  assert.equal(http.calls.filter(call => call.startsWith('POST')).length, 1);

  // Cross-check outside the adapter: the stored object sits in the mapped Client folder.
  const response = await fetch(new URL(
    `${sitePath}/@@API/senaite/v1/AnalysisRequest?getClientSampleID=${encodeURIComponent(request.sampleId)}`, origin), {
    headers: { Accept: 'application/json', Authorization: `Bearer ${createToken}` },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  assert.deepEqual(body.items.map((item: { id: string; parent_uid: string }) => [item.id, item.parent_uid]),
    [[first.senaiteSampleId, mapping.clientUid]]);
});
