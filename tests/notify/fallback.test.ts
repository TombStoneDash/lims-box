import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { shouldDomainFallback, sendSubmissionNotice } from '../../lib/notify';

// RESEND_API_KEY is read inside sendSubmissionNotice at call time, so setting
// it after the static import (hoisted) is safe.
process.env.RESEND_API_KEY = 'test-key';

interface MockCall {
  url: string;
  init: { body?: string } & Record<string, unknown>;
}

let calls: MockCall[] = [];
let responses: Array<{ ok: boolean; status: number; body: string }> = [];
const origFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  responses = [];
  (globalThis as unknown as { fetch: unknown }).fetch = async (
    url: unknown,
    init: MockCall['init'],
  ) => {
    calls.push({ url: String(url), init });
    const r = responses.shift() ?? { ok: true, status: 200, body: '{}' };
    return {
      ok: r.ok,
      status: r.status,
      text: async () => r.body,
      json: async () => JSON.parse(r.body || '{}'),
    };
  };
});

afterEach(() => {
  (globalThis as unknown as { fetch: unknown }).fetch = origFetch;
});

test('shouldDomainFallback matches only 403 domain-not-verified', () => {
  assert.equal(shouldDomainFallback(403, 'The lims.bot domain is not verified'), true);
  assert.equal(shouldDomainFallback(422, 'Invalid from field'), false);
  assert.equal(shouldDomainFallback(403, 'forbidden for another reason'), false);
  assert.equal(shouldDomainFallback(200, 'domain is not verified'), false);
});

test('submission notice retries via onboarding@resend.dev on domain-not-verified', async () => {
  responses.push({ ok: false, status: 403, body: 'The lims.bot domain is not verified' });
  responses.push({ ok: true, status: 200, body: '{"id":"fallback-ok"}' });
  await sendSubmissionNotice({
    subject: 'New early-adopter application — Test Lab',
    lines: [['Lab name', 'Test Lab']],
  });
  assert.equal(calls.length, 2, 'expected original + fallback call');
  const second = JSON.parse(String(calls[1].init.body));
  assert.match(second.from, /onboarding@resend\.dev/);
  assert.deepEqual(second.to, ['tombstonedash@gmail.com']);
  assert.match(second.subject, /^\[FALLBACK DELIVERY\] /);
});

test('no fallback when the primary send succeeds', async () => {
  responses.push({ ok: true, status: 200, body: '{"id":"ok"}' });
  await sendSubmissionNotice({ subject: 's', lines: [['a', 'b']] });
  assert.equal(calls.length, 1);
});

test('no fallback on non-domain errors (e.g. 422)', async () => {
  responses.push({ ok: false, status: 422, body: 'Invalid from field' });
  await sendSubmissionNotice({ subject: 's', lines: [['a', 'b']] });
  assert.equal(calls.length, 1);
});
