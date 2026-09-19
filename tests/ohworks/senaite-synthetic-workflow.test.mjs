import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { before, after, test } from 'node:test';

// Deliberately fails if the upstream adapter is absent. Never skip, copy its
// implementation into tests, or substitute the supervised-demo fixture path.
let readSenaiteSamples;
let resolveOHWorksSenaiteMode;
let unexpectedFetches = 0;
const originalFetch = globalThis.fetch;
before(async () => {
  globalThis.fetch = async () => {
    unexpectedFetches += 1;
    throw new Error('Network forbidden: inject the synthetic HTTP transport');
  };
  // Synchronous hooks also cover tsx's CommonJS loading of this repository's
  // TypeScript. Only the bundler marker is replaced, never adapter logic.
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'server-only') {
        return { url: new URL('./server-only-marker.cjs', import.meta.url).href, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
  try {
    ({ readSenaiteSamples, resolveOHWorksSenaiteMode } = await import('../../lib/ohworks-senaite.ts'));
  } finally {
    hooks.deregister();
  }
});
after(() => {
  globalThis.fetch = originalFetch;
  assert.equal(unexpectedFetches, 0, 'adapter must use only the injected HTTP transport');
});

// These are public test literals, never process.env or stored credentials.
const env = Object.freeze({
  OHWORKS_SENAITE_MODE: 'real',
  OHWORKS_SENAITE_BASE_URL: 'https://synthetic-ohworks.invalid/senaite/',
  OHWORKS_SENAITE_USERNAME: 'SYNTHETIC-NOT-A-REAL-USER',
  OHWORKS_SENAITE_PASSWORD: 'SYNTHETIC-NOT-A-REAL-PASSWORD',
});

function syntheticSample(index, state = 'sample_received') {
  return {
    getId: `SYNTHETIC-OHWORKS-${index}`,
    review_state: state,
    SampleType: 'SYNTHETIC-Serum',
    getClientID: 'SYNTHETIC-OHWORKS-CLIENT',
    getDateReceived: '2026-09-18T10:00:00Z',
    // The read adapter does not expose analyses/results. Assert that these
    // deliberately synthetic upstream fields never become invented outputs.
    Analyses: [{ uid: `SYNTHETIC-ANALYSIS-${index}`, Result: 'SYNTHETIC-NOT-CLINICAL' }],
  };
}

function expectedSample(index, state = 'sample_received') {
  return {
    source: 'real_senaite', id: `SYNTHETIC-OHWORKS-${index}`,
    sampleType: 'SYNTHETIC-Serum', reviewState: state,
    clientId: 'SYNTHETIC-OHWORKS-CLIENT', dateReceived: '2026-09-18T10:00:00Z',
  };
}

// Capture independently of adapter error handling: assertions thrown inside
// fetch would be swallowed and could falsely satisfy a network-error test.
function transport(respond) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return respond();
    },
    assertRequest(state = 'sample_received', limit = 25) {
      assert.equal(calls.length, 1);
      const { url, init } = calls[0];
      assert.equal(url, 'https://synthetic-ohworks.invalid/senaite/@@API/senaite/v1/AnalysisRequest'
        + `?review_state=${encodeURIComponent(state)}&sort_on=created&sort_order=descending&limit=${limit}`);
      assert.ok(init.signal instanceof AbortSignal);
      assert.equal(init.signal.aborted, false);
      assert.deepEqual(init, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${Buffer.from('SYNTHETIC-NOT-A-REAL-USER:SYNTHETIC-NOT-A-REAL-PASSWORD').toString('base64')}`,
          Accept: 'application/json',
        },
        signal: init.signal,
      });
    },
  };
}

test('synthetic HTTP sample summaries flow through the real adapter on successive reads', async () => {
  assert.equal(resolveOHWorksSenaiteMode(env), 'real');
  // Change upstream responses between reads to catch caching/fixture fallback.
  // This supplies HTTP states; it does not simulate an unimplemented transition.
  for (const [index, state] of [[1, 'sample_received'], [2, 'verified']]) {
    const http = transport(() => Response.json({ items: [syntheticSample(index, state)] }));
    assert.deepEqual(await readSenaiteSamples({ env, fetchImpl: http.fetchImpl, reviewState: state }), {
      status: 'ok', source: 'real_senaite', samples: [expectedSample(index, state)],
    });
    http.assertRequest(state);
  }
});

test('custom search encodes the review state and preserves all 60 synthetic summaries in order', async () => {
  const state = 'synthetic state&other=value';
  const http = transport(() => Response.json({
    items: Array.from({ length: 60 }, (_, i) => syntheticSample(i, state)),
  }));
  assert.deepEqual(await readSenaiteSamples({ env, fetchImpl: http.fetchImpl, reviewState: state, limit: 60 }), {
    status: 'ok', source: 'real_senaite',
    samples: Array.from({ length: 60 }, (_, i) => expectedSample(i, state)),
  });
  http.assertRequest(state, 60);
});

test('supported wire aliases and absent optional fields normalize to the exact public shape', async () => {
  const http = transport(() => Response.json({ items: [
    { id: 'SYNTHETIC-ALIAS', review_state: 'sample_received', getSampleTypeTitle: 'SYNTHETIC-Serum', Client: 'SYNTHETIC-CLIENT' },
    { getId: 'SYNTHETIC-MINIMAL', review_state: 'sample_received' },
  ] }));
  assert.deepEqual(await readSenaiteSamples({ env, fetchImpl: http.fetchImpl }), {
    status: 'ok', source: 'real_senaite', samples: [
      { source: 'real_senaite', id: 'SYNTHETIC-ALIAS', reviewState: 'sample_received', sampleType: 'SYNTHETIC-Serum', clientId: 'SYNTHETIC-CLIENT', dateReceived: null },
      { source: 'real_senaite', id: 'SYNTHETIC-MINIMAL', reviewState: 'sample_received', sampleType: 'Unknown', clientId: null, dateReceived: null },
    ],
  });
  http.assertRequest();
});

test('an empty HTTP response never falls back to demo samples', async () => {
  const http = transport(() => Response.json({ items: [] }));
  assert.deepEqual(await readSenaiteSamples({ env, fetchImpl: http.fetchImpl }), { status: 'empty', source: 'real_senaite' });
  http.assertRequest();
});

for (const [label, body, detail] of [
  ['missing envelope', {}, 'SENAITE response missing an items array'],
  ['wrong items type', { items: {} }, 'SENAITE response missing an items array'],
  ['mixed valid and malformed records', { items: [syntheticSample(1), { getId: 'SYNTHETIC-BAD' }] }, 'SENAITE response contained a malformed sample record'],
]) {
  test(`${label} fails closed without partial or fixture data`, async () => {
    const http = transport(() => Response.json(body));
    assert.deepEqual(await readSenaiteSamples({ env, fetchImpl: http.fetchImpl }), { status: 'invalid', detail });
    http.assertRequest();
  });
}

for (const [label, respond, expected] of [
  ['HTTP failure', () => Response.json({ items: [syntheticSample(1)] }, { status: 503 }), { status: 'unavailable', reason: 'http_error', detail: 'SENAITE responded with HTTP 503' }],
  ['transport rejection', () => { throw new Error('SYNTHETIC-OFFLINE'); }, { status: 'unavailable', reason: 'network_error', detail: 'SYNTHETIC-OFFLINE' }],
  ['abort rejection', () => { throw new DOMException('SYNTHETIC-ABORT', 'AbortError'); }, { status: 'unavailable', reason: 'timeout', detail: 'SENAITE request timed out' }],
]) {
  test(`${label} has the complete unavailable shape`, async () => {
    const http = transport(respond);
    assert.deepEqual(await readSenaiteSamples({ env, fetchImpl: http.fetchImpl }), expected);
    http.assertRequest();
  });
}

test('missing explicit test configuration performs no HTTP request', async () => {
  const http = transport(() => Response.json({ items: [syntheticSample(1)] }));
  assert.deepEqual(await readSenaiteSamples({ env: {}, fetchImpl: http.fetchImpl }), {
    status: 'unavailable', reason: 'not_configured',
    detail: 'OHWORKS_SENAITE_BASE_URL, OHWORKS_SENAITE_USERNAME, and OHWORKS_SENAITE_PASSWORD must all be set',
  });
  assert.deepEqual(http.calls, []);
});
