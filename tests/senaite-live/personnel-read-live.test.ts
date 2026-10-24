import assert from 'node:assert/strict';
import test from 'node:test';
import { createSenaitePersonnelReader } from '../../lib/senaite-personnel-read';

// Opt-in acceptance test of the personnel roster against a running SENAITE.
// Skipped unless SENAITE_LIVE_ORIGIN is set (see live-contract.test.ts for the
// SSH tunnel). SENAITE_LIVE_READ_TOKEN, if set, must be a read-only token for a
// synthetic-data server; it is never printed.
const origin = process.env.SENAITE_LIVE_ORIGIN?.trim();
const sitePath = (process.env.SENAITE_LIVE_SITE_PATH?.trim() || '/senaite').replace(/\/+$/, '');
const readToken = process.env.SENAITE_LIVE_READ_TOKEN?.trim();
const skipLive = origin ? false : 'set SENAITE_LIVE_ORIGIN to run against a real SENAITE';

// The reader only accepts an HTTPS site root; forward its exact requests to the server.
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

test('an invalid token never reads as a lab with no staff against the real server', { skip: skipLive }, async () => {
  const identity = await apiGet('users/current', 'live-invalid-token');
  const http = forwarder();
  const result = await createSenaitePersonnelReader(
    { SENAITE_BASE_URL: `${ADAPTER_ROOT}${sitePath}`, SENAITE_API_TOKEN: 'live-invalid-token' }, http.fetchImpl,
  ).listLabContacts();
  if (identity.status === 200) {
    assert.equal(identity.body?.items?.[0]?.authenticated, false);
    assert.deepEqual(result, { status: 'error', code: 'unauthenticated' });
  } else {
    assert.deepEqual(result, { status: 'error', code: 'request-failed' });
  }
  // The roster is never requested with a token SENAITE did not accept.
  assert.deepEqual(http.paths, [`${sitePath}/@@API/senaite/v1/users/current`]);
});

test('a read-only token reads the synthetic roster, matching SENAITE record by record', {
  skip: skipLive || (readToken ? false : 'set SENAITE_LIVE_READ_TOKEN to run the signed-in read'),
}, async () => {
  const http = forwarder();
  const result = await createSenaitePersonnelReader(
    { SENAITE_BASE_URL: `${ADAPTER_ROOT}${sitePath}`, SENAITE_API_TOKEN: readToken }, http.fetchImpl,
  ).listLabContacts();
  // `non-synthetic-record` means a real name is stored on this server: fix the server, not the test.
  assert.equal(result.status, 'ok', JSON.stringify(result));
  if (result.status !== 'ok') return;
  assert.deepEqual(http.paths, [
    `${sitePath}/@@API/senaite/v1/users/current`, `${sitePath}/@@API/senaite/v1/LabContact`,
  ]);
  // Cross-check each contact against its own object, independent of the listing.
  for (const contact of result.contacts) {
    assert.deepEqual(Object.keys(contact).sort(), ['active', 'fullName', 'id', 'jobTitle', 'uid']);
    const { status, body } = await apiGet(`LabContact/${encodeURIComponent(contact.uid)}`, readToken!);
    assert.equal(status, 200);
    assert.equal(body?.items?.[0]?.portal_type, 'LabContact');
    assert.equal(body?.items?.[0]?.id, contact.id);
  }
});
