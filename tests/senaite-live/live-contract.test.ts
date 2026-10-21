import assert from 'node:assert/strict';
import test from 'node:test';
import { createSenaiteReadAdapter } from '../../lib/senaite-read';

// Opt-in acceptance test against a running SENAITE server. Skipped unless
// SENAITE_LIVE_ORIGIN is set, for example to an SSH tunnel:
//   ssh -N -L 18099:127.0.0.1:<senaite port> <demo host>
//   SENAITE_LIVE_ORIGIN=http://127.0.0.1:18099 npm run test:senaite-live
// SENAITE_LIVE_SITE_PATH defaults to /senaite. SENAITE_LIVE_READ_TOKEN, if set,
// must be a read-only token for a synthetic-data server; it is never printed.
const origin = process.env.SENAITE_LIVE_ORIGIN?.trim();
const sitePath = (process.env.SENAITE_LIVE_SITE_PATH?.trim() || '/senaite').replace(/\/+$/, '');
const readToken = process.env.SENAITE_LIVE_READ_TOKEN?.trim();
const skipLive = origin ? false : 'set SENAITE_LIVE_ORIGIN to run against a real SENAITE';

// The adapter only accepts an HTTPS site root. The harness keeps that rule and
// forwards each exact adapter request (path, query, headers, options) to the server.
const ADAPTER_ROOT = 'https://senaite-live.invalid';
function forwarder() {
  const paths: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, ADAPTER_ROOT);
    paths.push(url.pathname);
    return fetch(new URL(`${url.pathname}${url.search}`, origin), init);
  };
  return { paths, fetchImpl };
}

async function apiGet(route: string, token: string) {
  const response = await fetch(new URL(`${sitePath}/@@API/senaite/v1/${route}`, origin), {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  return { status: response.status, body: response.ok ? await response.json() : null };
}

test('the server is a SENAITE 2.x JSON API', { skip: skipLive }, async () => {
  const { status, body } = await apiGet('version', 'live-invalid-token');
  assert.equal(status, 200);
  assert.match(String(body?.version), /^2\./);
});

test('an invalid token never reads as an empty lab against the real server', { skip: skipLive }, async () => {
  // Show what the server itself does with a bad token, then what the adapter reports.
  const identity = await apiGet('users/current', 'live-invalid-token');
  const listing = await apiGet('AnalysisRequest?limit=1', 'live-invalid-token');
  const http = forwarder();
  const result = await createSenaiteReadAdapter(
    { SENAITE_BASE_URL: `${ADAPTER_ROOT}${sitePath}`, SENAITE_API_TOKEN: 'live-invalid-token' }, http.fetchImpl,
  ).listSamples();
  if (identity.status === 200) {
    // SENAITE 2.6: 200 as Anonymous, and the sample list comes back empty.
    assert.equal(identity.body?.items?.[0]?.authenticated, false);
    assert.deepEqual(listing.body?.items, []);
    assert.deepEqual(result, { status: 'error', code: 'unauthenticated' });
  } else {
    assert.deepEqual(result, { status: 'error', code: 'request-failed' });
  }
  assert.deepEqual(http.paths, [`${sitePath}/@@API/senaite/v1/users/current`]);
});

test('a read-only token lists real sample summaries', {
  skip: skipLive || (readToken ? false : 'set SENAITE_LIVE_READ_TOKEN to run the signed-in read'),
}, async () => {
  const http = forwarder();
  const result = await createSenaiteReadAdapter(
    { SENAITE_BASE_URL: `${ADAPTER_ROOT}${sitePath}`, SENAITE_API_TOKEN: readToken }, http.fetchImpl,
  ).listSamples({ limit: 5 });
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  for (const sample of result.samples) {
    assert.deepEqual(Object.keys(sample).sort(), ['id', 'reviewState', 'title', 'uid']);
  }
  assert.deepEqual(http.paths, [
    `${sitePath}/@@API/senaite/v1/users/current`, `${sitePath}/@@API/senaite/v1/AnalysisRequest`,
  ]);
});
