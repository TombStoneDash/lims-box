import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createSenaiteReadAdapter } from '../../lib/senaite-read';
import { evaluateQCWestgardMultirule } from '../../lib/ohworks-qc-westgard';
import { evaluateAutoVerification } from '../../lib/ohworks-autoverification';
import fixture from '../senaite-read/fixtures/samples.json';

let unexpectedFetches = 0;
const originalFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = async () => {
    unexpectedFetches++;
    throw new Error('Network forbidden: inject the synthetic HTTP transport');
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  assert.equal(unexpectedFetches, 0);
});

const env = Object.freeze({
  SENAITE_BASE_URL: 'https://synthetic-ohworks.invalid/senaite/',
  SENAITE_API_TOKEN: 'SYNTHETIC-NOT-A-REAL-TOKEN',
});

function syntheticSample(index, state = 'sample_received') {
  return {
    ...fixture.items[0], uid: `synthetic-uid-${index}`, id: `SYNTHETIC-OHWORKS-${index}`,
    review_state: state,
    Analyses: [{ uid: `SYNTHETIC-ANALYSIS-${index}`, Result: 'SYNTHETIC-NOT-CLINICAL' }],
  };
}
function expectedSample(index, state = 'sample_received') {
  return {
    uid: `synthetic-uid-${index}`, id: `SYNTHETIC-OHWORKS-${index}`,
    title: 'Synthetic water sample', reviewState: state,
  };
}

// Assert requests outside the adapter catch block, including failure cases.
function transport(respond: () => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return respond();
  };
  return {
    calls, fetchImpl,
    assertRequest(state = 'sample_received', limit = 25) {
      assert.equal(calls.length, 1);
      const { url, init } = calls[0];
      const expected = new URL('https://synthetic-ohworks.invalid/senaite/@@API/senaite/v1/AnalysisRequest');
      expected.search = new URLSearchParams({ limit: String(limit), sort_on: 'created', sort_order: 'descending', review_state: state }).toString();
      assert.equal(url, expected.href);
      assert.ok(init.signal instanceof AbortSignal);
      assert.equal(init.signal.aborted, false);
      assert.deepEqual(init, {
        method: 'GET', headers: { Accept: 'application/json', Authorization: 'Bearer SYNTHETIC-NOT-A-REAL-TOKEN' },
        redirect: 'error', cache: 'no-store', credentials: 'omit', signal: init.signal,
      });
    },
  };
}

test('synthetic HTTP summaries flow through the adapter on successive reads', async () => {
  let index = 1;
  const http = transport(() => Response.json({ items: [syntheticSample(index)] }));
  const adapter = createSenaiteReadAdapter(env, http.fetchImpl);
  for (index = 1; index <= 2; index++) {
    assert.deepEqual(await adapter.listSamples({ reviewState: 'sample_received' }), {
      status: 'ok', samples: [expectedSample(index)],
    });
  }
  assert.equal(http.calls.length, 2);
});

test('custom search encodes state and preserves all 60 summaries in order', async () => {
  const state = 'synthetic state&other=value';
  const http = transport(() => Response.json({ items: Array.from({ length: 60 }, (_, i) => syntheticSample(i, state)) }));
  assert.deepEqual(await createSenaiteReadAdapter(env, http.fetchImpl).listSamples({ reviewState: state, limit: 60 }), {
    status: 'ok', samples: Array.from({ length: 60 }, (_, i) => expectedSample(i, state)),
  });
  http.assertRequest(state, 60);
});

test('recorded summary fields normalize without exposing client or analysis data', async () => {
  const http = transport(() => Response.json(fixture));
  assert.deepEqual(await createSenaiteReadAdapter(env, http.fetchImpl).listSamples({ reviewState: 'sample_received' }), {
    status: 'ok', samples: [
      { uid: 'synthetic-uid-001', id: 'SYN-001', title: 'Synthetic water sample', reviewState: 'sample_received' },
      { uid: 'synthetic-uid-002', id: 'SYN-002', title: null, reviewState: null },
    ],
  });
  http.assertRequest();
});

test('an empty HTTP response never falls back to demo samples', async () => {
  const http = transport(() => Response.json({ items: [] }));
  assert.deepEqual(await createSenaiteReadAdapter(env, http.fetchImpl).listSamples({ reviewState: 'sample_received' }), { status: 'ok', samples: [] });
  http.assertRequest();
});

for (const [label, body] of [
  ['missing envelope', {}], ['wrong items type', { items: {} }],
  ['mixed valid and malformed records', { items: [syntheticSample(1), { id: 'SYNTHETIC-BAD' }] }],
] as const) {
  test(`${label} fails closed without partial or fixture data`, async () => {
    const http = transport(() => Response.json(body));
    assert.deepEqual(await createSenaiteReadAdapter(env, http.fetchImpl).listSamples({ reviewState: 'sample_received' }), { status: 'error', code: 'invalid-response' });
    http.assertRequest();
  });
}

for (const [label, respond] of [
  ['HTTP failure', () => Response.json({ items: [syntheticSample(1)] }, { status: 503 })],
  ['transport rejection', () => { throw new Error('private URL or token'); }],
  ['abort rejection', () => { throw new DOMException('private URL or token', 'AbortError'); }],
] as const) {
  test(`${label} returns a safe result without throwing into a page`, async () => {
    const http = transport(respond);
    assert.deepEqual(await createSenaiteReadAdapter(env, http.fetchImpl).listSamples({ reviewState: 'sample_received' }), { status: 'error', code: 'request-failed' });
    http.assertRequest();
  });
}

test('missing configuration performs no HTTP request', async () => {
  const http = transport(() => Response.json(fixture));
  assert.deepEqual(await createSenaiteReadAdapter({}, http.fetchImpl).listSamples(), { status: 'not_configured' });
  assert.deepEqual(http.calls, []);
});

test('a received specimen with a Westgard 1_3s failure is held before automatic result release', async () => {
  const http = transport(() => Response.json({ items: [syntheticSample('QC-FAILURE')] }));
  const received = await createSenaiteReadAdapter(env, http.fetchImpl).listSamples({ reviewState: 'sample_received' });
  http.assertRequest();
  assert.equal(received.status, 'ok');
  if (received.status !== 'ok') assert.fail('Expected sample summaries');
  assert.deepEqual(received.samples, [expectedSample('QC-FAILURE')]);
  // Fabricated result/run data; the adapter has no analysis or transition API.
  const specimen = {
    sampleId: received.samples[0].id, runId: 'SYNTHETIC-QC-FAILURE-RUN',
    result: { analyteCode: 'SYNTHETIC-ANALYTE', value: 100, unit: 'mg/L', instrumentFlags: [] },
  };
  const qc = evaluateQCWestgardMultirule({
    levels: [{ levelId: 'SYNTHETIC-LEVEL', mean: 100, sd: 5 }],
    results: [{ levelId: 'SYNTHETIC-LEVEL', runId: specimen.runId, value: 120, timestamp: '2026-09-18T10:05:00Z' }],
  });
  assert.equal(qc.points[0].sdi, 4);
  const run = qc.runs.find(({ runId }) => runId === specimen.runId);
  assert.ok(run);
  assert.equal(run.status, 'rejected');
  assert.deepEqual(run.violatedRules.filter(({ severity }) => severity === 'reject'), [
    { rule: '1_3s', severity: 'reject', position: 0, levelId: 'SYNTHETIC-LEVEL' },
  ]);
  const qcStates = { accepted: 'in-control', warning: 'warning', rejected: 'out-of-control' } as const;
  const request = {
    result: specimen.result, qcState: qcStates[run.status], deltaCheckStatus: 'pass' as const,
    measurementRange: { lowerBound: 0, upperBound: 500, unit: 'mg/L' }, criticalLimits: { lower: 5, upper: 400, unit: 'mg/L' },
  };
  assert.deepEqual({ sampleId: specimen.sampleId, ...evaluateAutoVerification(request) }, {
    sampleId: 'SYNTHETIC-OHWORKS-QC-FAILURE', decision: 'HOLD_FOR_REVIEW', reasons: ['qc-out-of-control'],
  });
  assert.deepEqual(evaluateAutoVerification({ ...request, qcState: 'in-control' }), { decision: 'AUTO_RELEASE', reasons: [] });
});
