import assert from 'node:assert/strict';
import test from 'node:test';
import { createSenaiteResultVerifier } from '../../lib/senaite-result-verify';

// Opt-in acceptance test against a running, synthetic-data SENAITE. Skipped unless
// SENAITE_LIVE_ORIGIN is set (see live-contract.test.ts for the SSH tunnel).
// The write test also needs SENAITE_LIVE_VERIFY_TOKEN (an account allowed to run
// `verify`, never printed), SENAITE_LIVE_CLIENT_UID, SENAITE_LIVE_VERIFY_SAMPLE_ID
// SENAITE_LIVE_VERIFY_ANALYSIS_UID, SENAITE_LIVE_VERIFY_KEYWORD and
// SENAITE_LIVE_VERIFY_RESULT naming a synthetic result another user already
// submitted, and SENAITE_LIVE_REVIEWER_ID (a SENAITE user id other than the submitter).
const origin = process.env.SENAITE_LIVE_ORIGIN?.trim();
const sitePath = (process.env.SENAITE_LIVE_SITE_PATH?.trim() || '/senaite').replace(/\/+$/, '');
const token = process.env.SENAITE_LIVE_VERIFY_TOKEN?.trim();
const clientUid = process.env.SENAITE_LIVE_CLIENT_UID?.trim();
const sampleId = process.env.SENAITE_LIVE_VERIFY_SAMPLE_ID?.trim();
const keyword = process.env.SENAITE_LIVE_VERIFY_KEYWORD?.trim();
const analysisUid = process.env.SENAITE_LIVE_VERIFY_ANALYSIS_UID?.trim();
const expectedResult = process.env.SENAITE_LIVE_VERIFY_RESULT?.trim();
const reviewerUserId = process.env.SENAITE_LIVE_REVIEWER_ID?.trim();
const skipLive = origin ? false : 'set SENAITE_LIVE_ORIGIN to run against a real SENAITE';
const skipWrite = skipLive ||
  (token && clientUid && sampleId && keyword && analysisUid && expectedResult && reviewerUserId ? false
    : 'set the SENAITE_LIVE_VERIFY_* variables, SENAITE_LIVE_CLIENT_UID and SENAITE_LIVE_REVIEWER_ID');

// The verifier only accepts an HTTPS site root; forward its exact requests to the server.
const ROOT = 'https://senaite-live.invalid';
const forward: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  assert.equal(url.origin, ROOT);
  return fetch(new URL(`${url.pathname}${url.search}`, origin), init);
};

test('a rejected token never verifies anything on the real server', { skip: skipLive }, async () => {
  const result = await createSenaiteResultVerifier(
    { SENAITE_BASE_URL: `${ROOT}${sitePath}`, SENAITE_RESULT_VERIFY_TOKEN: 'live-invalid-token' }, forward,
  ).verify({
    clientUid: '0'.repeat(32), sampleId: 'WB-0001', analysisUid: '0'.repeat(32), keyword: 'TSH',
    expectedResult: '1', reviewerUserId: 'live-reviewer',
  });
  assert.deepEqual(result, { status: 'error', code: 'unauthenticated' });
});

test('a submitted synthetic result is verified and read back from the real server', { skip: skipWrite }, async () => {
  const verifier = createSenaiteResultVerifier(
    { SENAITE_BASE_URL: `${ROOT}${sitePath}`, SENAITE_RESULT_VERIFY_TOKEN: token }, forward,
  );
  const request = {
    clientUid: clientUid!, sampleId: sampleId!, analysisUid: analysisUid!, keyword: keyword!,
    expectedResult: expectedResult!, reviewerUserId: reviewerUserId!,
  };
  const first = await verifier.verify(request);
  assert.equal(first.status, 'verified', JSON.stringify(first));
  // Re-running is safe: SENAITE already has it verified, so nothing is written.
  assert.equal((await verifier.verify(request)).status, 'already_verified');
});
