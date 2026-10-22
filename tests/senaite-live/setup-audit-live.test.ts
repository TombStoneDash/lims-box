import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_OHWORKS_SYNTHETIC_CONFIG } from '../../lib/ohworks-senaite-setup-plan';
import { createSenaiteSetupAuditor } from '../../lib/senaite-setup-audit';

// Opt-in: the OHWorks setup audit against a running SENAITE, with the same
// SENAITE_LIVE_ORIGIN / SENAITE_LIVE_SITE_PATH / SENAITE_LIVE_READ_TOKEN
// settings as live-contract.test.ts. Only GETs are sent; the token is never printed.
const origin = process.env.SENAITE_LIVE_ORIGIN?.trim();
const sitePath = (process.env.SENAITE_LIVE_SITE_PATH?.trim() || '/senaite').replace(/\/+$/, '');
const readToken = process.env.SENAITE_LIVE_READ_TOKEN?.trim();
const skipLive = origin ? false : 'set SENAITE_LIVE_ORIGIN to run against a real SENAITE';

// The auditor only accepts an HTTPS site root; forward its exact requests to the server.
const AUDITOR_ROOT = 'https://senaite-live.invalid';
function forwarder() {
  const requests: { method: string; path: string }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, AUDITOR_ROOT);
    requests.push({ method: init?.method ?? 'GET', path: url.pathname });
    return fetch(new URL(`${url.pathname}${url.search}`, origin), init);
  };
  return { requests, fetchImpl };
}

test('an invalid token never reads as an empty lab that needs the whole setup', { skip: skipLive }, async () => {
  const http = forwarder();
  const result = await createSenaiteSetupAuditor(
    { SENAITE_BASE_URL: `${AUDITOR_ROOT}${sitePath}`, SENAITE_API_TOKEN: 'live-invalid-token' }, http.fetchImpl,
  ).audit(DEFAULT_OHWORKS_SYNTHETIC_CONFIG);
  assert.equal(result.status, 'error');
  assert.deepEqual(http.requests, [{ method: 'GET', path: `${sitePath}/@@API/senaite/v1/users/current` }]);
});

test('a read-only token audits the OHWorks setup on the real server', {
  skip: skipLive || (readToken ? false : 'set SENAITE_LIVE_READ_TOKEN to run the signed-in audit'),
}, async () => {
  const http = forwarder();
  const result = await createSenaiteSetupAuditor(
    { SENAITE_BASE_URL: `${AUDITOR_ROOT}${sitePath}`, SENAITE_API_TOKEN: readToken }, http.fetchImpl,
  ).audit(DEFAULT_OHWORKS_SYNTHETIC_CONFIG);
  assert.equal(result.status, 'ok');
  assert.ok(http.requests.every(request => request.method === 'GET'));
  if (result.status !== 'ok') return;
  // The receipt for point 2: which planned records exist, and which are still to create.
  console.log(JSON.stringify({
    ready: result.ready,
    items: result.items.map(({ portalType, key, status, mismatches }) => ({ portalType, key, status, mismatches })),
    remaining: result.remaining.length,
  }, null, 2));
});
