import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_OHWORKS_SYNTHETIC_CONFIG } from '../../lib/ohworks-senaite-setup-plan';
import { createSenaiteSetupApplier, type SenaiteSetupApplyOptions } from '../../lib/senaite-setup-apply';

// Opt-in: the OHWorks setup applier against a running synthetic-data SENAITE,
// with the same SENAITE_LIVE_ORIGIN / SENAITE_LIVE_SITE_PATH settings as
// live-contract.test.ts. The token is never printed.
//   SENAITE_LIVE_SETUP_TOKEN       setup credential (never the read-only token)
//   SENAITE_LIVE_SETUP_CONTAINERS  JSON `containers`, e.g. {"Client":"/senaite/clients",...}
//   SENAITE_LIVE_SETUP_DEFAULTS    optional JSON `defaults`
//   SENAITE_LIVE_SETUP_APPLY=yes   actually create; without it only the dry run runs
const origin = process.env.SENAITE_LIVE_ORIGIN?.trim();
const sitePath = (process.env.SENAITE_LIVE_SITE_PATH?.trim() || '/senaite').replace(/\/+$/, '');
const setupToken = process.env.SENAITE_LIVE_SETUP_TOKEN?.trim();
const skipLive = origin ? false : 'set SENAITE_LIVE_ORIGIN to run against a real SENAITE';
const skipSignedIn = skipLive || (setupToken && process.env.SENAITE_LIVE_SETUP_CONTAINERS
  ? false : 'set SENAITE_LIVE_SETUP_TOKEN and SENAITE_LIVE_SETUP_CONTAINERS to run the signed-in setup');

function options(apply: boolean): SenaiteSetupApplyOptions {
  return {
    containers: JSON.parse(process.env.SENAITE_LIVE_SETUP_CONTAINERS ?? '{}'),
    defaults: process.env.SENAITE_LIVE_SETUP_DEFAULTS ? JSON.parse(process.env.SENAITE_LIVE_SETUP_DEFAULTS) : undefined,
    apply,
  };
}

// The applier only accepts an HTTPS site root; forward its exact requests to the server.
const APPLIER_ROOT = 'https://senaite-live.invalid';
function forwarder() {
  const requests: { method: string; path: string }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, APPLIER_ROOT);
    requests.push({ method: init?.method ?? 'GET', path: url.pathname });
    return fetch(new URL(`${url.pathname}${url.search}`, origin), init);
  };
  return { requests, fetchImpl };
}

function applier(token: string | undefined, http: ReturnType<typeof forwarder>) {
  return createSenaiteSetupApplier({ SENAITE_BASE_URL: `${APPLIER_ROOT}${sitePath}`, SENAITE_SETUP_TOKEN: token }, http.fetchImpl);
}

test('an invalid token stops at sign-in and never writes', { skip: skipLive }, async () => {
  const http = forwarder();
  const result = await applier('live-invalid-token', http).applySetup(DEFAULT_OHWORKS_SYNTHETIC_CONFIG, {
    containers: { Client: `${sitePath}/clients` }, apply: true,
  });
  assert.equal(result.status, 'error');
  assert.deepEqual(http.requests, [{ method: 'GET', path: `${sitePath}/@@API/senaite/v1/users/current` }]);
});

test('the dry run on the real server lists the creates and sends no write', { skip: skipSignedIn }, async () => {
  const http = forwarder();
  const result = await applier(setupToken, http).applySetup(DEFAULT_OHWORKS_SYNTHETIC_CONFIG, options(false));
  assert.ok(http.requests.every(request => request.method === 'GET'));
  assert.equal(result.status, 'planned', JSON.stringify(result));
  if (result.status !== 'planned') return;
  console.log(JSON.stringify({
    ready: result.ready,
    creates: result.creates.map(({ order, portalType, body }) => ({ order, portalType, fields: Object.keys(body) })),
  }, null, 2));
});

test('apply creates the OHWorks setup, a fresh audit is ready, and a re-run writes nothing', {
  skip: skipSignedIn || (process.env.SENAITE_LIVE_SETUP_APPLY === 'yes' ? false : 'set SENAITE_LIVE_SETUP_APPLY=yes to create records'),
}, async () => {
  const first = await applier(setupToken, forwarder()).applySetup(DEFAULT_OHWORKS_SYNTHETIC_CONFIG, options(true));
  // The receipt for point 2: statuses and created record types only, no values or secrets.
  console.log(JSON.stringify(first.status === 'applied' || first.status === 'error' ? {
    status: first.status,
    ...(first.status === 'error' ? { code: first.code } : {}),
    created: first.created.map(({ order, portalType }) => ({ order, portalType })),
    items: first.items?.map(({ portalType, key, status, mismatches }) => ({ portalType, key, status, mismatches })),
  } : first, null, 2));
  assert.equal(first.status, 'applied');

  const http = forwarder();
  const again = await applier(setupToken, http).applySetup(DEFAULT_OHWORKS_SYNTHETIC_CONFIG, options(true));
  assert.equal(again.status, 'applied');
  assert.ok(http.requests.every(request => request.method === 'GET'), 're-running never writes');
});
