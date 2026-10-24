import assert from 'node:assert/strict';
import test from 'node:test';
import { createSenaiteResultSubmitter } from '../../lib/senaite-result-submit';

// Opt-in acceptance test against a running, synthetic-data SENAITE. Skipped unless
// SENAITE_LIVE_ORIGIN is set (see live-contract.test.ts for the SSH tunnel).
// The write test also needs SENAITE_LIVE_ANALYST_TOKEN (a synthetic analyst's own
// token, never printed), SENAITE_LIVE_ANALYST_ID (that analyst's SENAITE user id),
// SENAITE_LIVE_CLIENT_UID, and SENAITE_LIVE_SUBMIT_SAMPLE_ID,
// SENAITE_LIVE_SUBMIT_ANALYSIS_UID, SENAITE_LIVE_SUBMIT_KEYWORD and
// SENAITE_LIVE_SUBMIT_RESULT naming an unsubmitted synthetic result on a received sample.
const origin = process.env.SENAITE_LIVE_ORIGIN?.trim();
const sitePath = (process.env.SENAITE_LIVE_SITE_PATH?.trim() || '/senaite').replace(/\/+$/, '');
const analystToken = process.env.SENAITE_LIVE_ANALYST_TOKEN?.trim();
const analystUserId = process.env.SENAITE_LIVE_ANALYST_ID?.trim();
const clientUid = process.env.SENAITE_LIVE_CLIENT_UID?.trim();
const sampleId = process.env.SENAITE_LIVE_SUBMIT_SAMPLE_ID?.trim();
const analysisUid = process.env.SENAITE_LIVE_SUBMIT_ANALYSIS_UID?.trim();
const keyword = process.env.SENAITE_LIVE_SUBMIT_KEYWORD?.trim();
const expectedResult = process.env.SENAITE_LIVE_SUBMIT_RESULT?.trim();
const skipLive = origin ? false : 'set SENAITE_LIVE_ORIGIN to run against a real SENAITE';
const skipWrite = skipLive ||
  (analystToken && analystUserId && clientUid && sampleId && analysisUid && keyword && expectedResult ? false
    : 'set SENAITE_LIVE_ANALYST_TOKEN, SENAITE_LIVE_ANALYST_ID, SENAITE_LIVE_CLIENT_UID and the SENAITE_LIVE_SUBMIT_* variables');

// The submitter only accepts an HTTPS site root; forward its exact requests to the server.
const ROOT = 'https://senaite-live.invalid';
const forward: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  assert.equal(url.origin, ROOT);
  return fetch(new URL(`${url.pathname}${url.search}`, origin), init);
};

test('a rejected token never submits anything on the real server', { skip: skipLive }, async () => {
  const result = await createSenaiteResultSubmitter({ SENAITE_BASE_URL: `${ROOT}${sitePath}` }, forward).submit({
    clientUid: '0'.repeat(32), sampleId: 'WB-0001', analysisUid: '0'.repeat(32), keyword: 'TSH',
    expectedResult: '1', analystUserId: 'live-analyst',
  }, { analystToken: 'live-invalid-token' });
  assert.deepEqual(result, { status: 'error', code: 'unauthenticated' });
});

test('an unsubmitted synthetic result is submitted as the analyst and read back', { skip: skipWrite }, async () => {
  const submitter = createSenaiteResultSubmitter({ SENAITE_BASE_URL: `${ROOT}${sitePath}` }, forward);
  const request = {
    clientUid: clientUid!, sampleId: sampleId!, analysisUid: analysisUid!, keyword: keyword!,
    expectedResult: expectedResult!, analystUserId: analystUserId!,
  };
  const first = await submitter.submit(request, { analystToken: analystToken! });
  assert.equal(first.status, 'submitted', JSON.stringify(first));
  // Re-running is safe: SENAITE already has it submitted, so nothing is written.
  assert.equal((await submitter.submit(request, { analystToken: analystToken! })).status, 'already_submitted');
});
