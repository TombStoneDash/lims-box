import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  sendApplicantConfirmation,
  sendSubmissionNotice,
  shouldDomainFallback,
} from '../../lib/notify';

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
  await assert.rejects(
    sendSubmissionNotice({ subject: 's', lines: [['a', 'b']] }),
    /Submission notice delivery failed \(422\)/,
  );
  assert.equal(calls.length, 1);
});

test('fallback failure rejects instead of reporting delivery', async () => {
  responses.push({ ok: false, status: 403, body: 'The lims.bot domain is not verified' });
  responses.push({ ok: false, status: 500, body: 'fallback unavailable' });

  await assert.rejects(
    sendSubmissionNotice({ subject: 's', lines: [['a', 'b']] }),
    /Submission notice fallback delivery failed \(500\)/,
  );
  assert.equal(calls.length, 2);
});

test('missing delivery configuration rejects instead of silently succeeding', async () => {
  const previous = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  try {
    await assert.rejects(
      sendSubmissionNotice({ subject: 's', lines: [['a', 'b']] }),
      /Submission notice delivery is not configured/,
    );
    assert.equal(calls.length, 0);
  } finally {
    process.env.RESEND_API_KEY = previous;
  }
});

test('applicant confirmation resolves only after a successful provider response', async () => {
  responses.push({ ok: true, status: 200, body: '{"id":"confirmation-ok"}' });

  await sendApplicantConfirmation('applicant@example.com', 'Test Applicant');

  assert.equal(calls.length, 1);
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body.to, ['applicant@example.com']);
  assert.doesNotMatch(body.html, /within 2 business days/i);
  assert.doesNotMatch(body.html, /usually same business day/i);
});

test('applicant confirmation rejects provider failures', async () => {
  responses.push({ ok: false, status: 422, body: 'Invalid recipient' });

  await assert.rejects(
    sendApplicantConfirmation('applicant@example.com', 'Test Applicant'),
    /Applicant confirmation delivery failed \(422\)/,
  );
  assert.equal(calls.length, 1);
});
