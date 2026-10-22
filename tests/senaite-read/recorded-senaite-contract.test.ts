import assert from 'node:assert/strict';
import test from 'node:test';
import recorded from './fixtures/recorded/senaite-2.6.0-anonymous.json';
import { createSenaiteReadAdapter } from '../../lib/senaite-read';

// Replays responses recorded from a real SENAITE 2.6.0 server (see fixtures/README.md).
// No test here reaches the network; every request is answered from the recording.
type Recording = keyof typeof recorded.responses;

const env = {
  SENAITE_BASE_URL: 'https://senaite.recorded.invalid/senaite',
  SENAITE_API_TOKEN: 'recorded-invalid-token',
};

function replay(byPath: Record<string, Recording>) {
  const paths: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://senaite.recorded.invalid');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer recorded-invalid-token');
    paths.push(url.pathname);
    const name = byPath[url.pathname];
    assert.ok(name, `no recording for ${url.pathname}`);
    const { status, contentType, bodyText } = recorded.responses[name];
    return new Response(bodyText, { status, headers: { 'content-type': contentType } });
  };
  return { paths, fetchImpl };
}

const IDENTITY = '/senaite/@@API/senaite/v1/users/current';
const SAMPLES = '/senaite/@@API/senaite/v1/AnalysisRequest';

test('the recording comes from SENAITE 2.6.0 and was made without credentials', () => {
  assert.equal(recorded.credentialsUsed, false);
  assert.equal(JSON.parse(recorded.responses.version.bodyText).version, '2.6.0');
  for (const response of Object.values(recorded.responses)) {
    assert.equal(response.status, 200);
    assert.equal(response.contentType, 'application/json');
    assert.doesNotMatch(response.bodyText, /127\.0\.0\.1|password/i);
  }
});

test('real SENAITE answers an invalid token with 200 and an empty list, the hazard this guards', () => {
  const listing = JSON.parse(recorded.responses['analysisrequest-invalid-bearer'].bodyText);
  assert.deepEqual([listing.count, listing.items], [0, []]);
  const identity = JSON.parse(recorded.responses['users-current-invalid-bearer'].bodyText);
  assert.deepEqual(identity.items.map((item: { authenticated: unknown }) => item.authenticated), [false]);
});

test('an invalid token is reported as unauthenticated, never as a lab with no samples', async () => {
  const http = replay({ [IDENTITY]: 'users-current-invalid-bearer', [SAMPLES]: 'analysisrequest-invalid-bearer' });
  assert.deepEqual(await createSenaiteReadAdapter(env, http.fetchImpl).listSamples(), {
    status: 'error', code: 'unauthenticated',
  });
  assert.deepEqual(http.paths, [IDENTITY], 'the sample query is not sent');
});

test('a single-sample lookup with an invalid token is unauthenticated, never not_found', async () => {
  const http = replay({ [IDENTITY]: 'users-current-invalid-bearer', [SAMPLES]: 'analysisrequest-invalid-bearer' });
  assert.deepEqual(await createSenaiteReadAdapter(env, http.fetchImpl).getSample('SYN-001'), {
    status: 'error', code: 'unauthenticated',
  });
  assert.deepEqual(http.paths, [IDENTITY], 'the sample query is not sent');
});

test('the same holds for the anonymous identity answer recorded without any header', async () => {
  const http = replay({ [IDENTITY]: 'users-current-no-auth' });
  assert.deepEqual(await createSenaiteReadAdapter(env, http.fetchImpl).listSamples({ reviewState: 'sample_received' }), {
    status: 'error', code: 'unauthenticated',
  });
  assert.deepEqual(http.paths, [IDENTITY]);
});

test('SENAITE errors sent with HTTP 200 and success:false fail closed', async () => {
  const http = replay({ [IDENTITY]: 'analysisrequest-unknown-path-no-auth' });
  assert.deepEqual(await createSenaiteReadAdapter(env, http.fetchImpl).listSamples(), {
    status: 'error', code: 'invalid-response',
  });
  assert.deepEqual(http.paths, [IDENTITY]);
});
