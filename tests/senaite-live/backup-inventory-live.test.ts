import assert from 'node:assert/strict';
import test from 'node:test';
import { compareSenaiteInventories, createSenaiteInventoryReader } from '../../lib/senaite-backup-inventory';

// Opt-in, like live-contract.test.ts. Skipped unless SENAITE_LIVE_ORIGIN is set:
//   ssh -N -L 18099:127.0.0.1:<senaite port> <demo host>
//   SENAITE_LIVE_ORIGIN=http://127.0.0.1:18099 npm run test:senaite-live
// SENAITE_LIVE_READ_TOKEN, if set, must be a read-only token for a
// synthetic-data server; it is never printed. Only GETs are sent.
const origin = process.env.SENAITE_LIVE_ORIGIN?.trim();
const sitePath = (process.env.SENAITE_LIVE_SITE_PATH?.trim() || '/senaite').replace(/\/+$/, '');
const readToken = process.env.SENAITE_LIVE_READ_TOKEN?.trim();
const skipLive = origin ? false : 'set SENAITE_LIVE_ORIGIN to run against a real SENAITE';
const skipSignedIn = skipLive || (readToken ? false : 'set SENAITE_LIVE_READ_TOKEN for the signed-in inventory');

// The reader only accepts an HTTPS site root; forward its exact requests to the server.
const ADAPTER_ROOT = 'https://senaite-live.invalid';
function forwarder() {
  const methods: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, ADAPTER_ROOT);
    methods.push(init?.method ?? 'GET');
    return fetch(new URL(`${url.pathname}${url.search}`, origin), init);
  };
  return { methods, fetchImpl };
}

const reader = (token: string, fetchImpl: typeof fetch) =>
  createSenaiteInventoryReader({ SENAITE_BASE_URL: `${ADAPTER_ROOT}${sitePath}`, SENAITE_API_TOKEN: token }, fetchImpl);

test('an invalid token never inventories the real server as a wiped lab', { skip: skipLive }, async () => {
  const http = forwarder();
  const result = await reader('live-invalid-token', http.fetchImpl).read();
  assert.equal(result.status, 'error');
  assert.ok(['unauthenticated', 'request-failed'].includes((result as { code: string }).code));
  assert.ok(http.methods.length <= 1);
});

test('two signed-in inventories of an unchanged server compare equal', { skip: skipSignedIn }, async () => {
  const http = forwarder();
  const first = await reader(readToken!, http.fetchImpl).read();
  const second = await reader(readToken!, http.fetchImpl).read();
  assert.equal(first.status, 'ok', JSON.stringify(first));
  assert.equal(second.status, 'ok', JSON.stringify(second));
  const comparison = compareSenaiteInventories(
    (first as { inventory: unknown }).inventory, (second as { inventory: unknown }).inventory);
  // Counts per portal type are the point-8 receipt for this server.
  console.log(JSON.stringify((first as { inventory: { counts: unknown } }).inventory.counts));
  assert.deepEqual(comparison.differences, []);
  assert.ok(http.methods.every(method => method === 'GET'));
});
