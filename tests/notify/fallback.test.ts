import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  NotificationDeliveryError,
  sendApplicantConfirmation,
  sendSubmissionNotice,
  shouldDomainFallback,
} from '../../lib/notify';

// RESEND_API_KEY is read inside sendSubmissionNotice at call time, so setting
// it after the static import (hoisted) is safe.
const originalApiKey = process.env.RESEND_API_KEY;

interface MockCall {
  url: string;
  init: { body?: string } & Record<string, unknown>;
}

let calls: MockCall[] = [];
let responses: Array<{ ok: boolean; status: number; body: string } | Error> = [];
let errors: unknown[][] = [];
let warnings: unknown[][] = [];
const originalError = console.error;
const originalWarn = console.warn;
const origFetch = globalThis.fetch;

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test-key';
  errors = [];
  warnings = [];
  console.error = (...args) => { errors.push(args); };
  console.warn = (...args) => { warnings.push(args); };
  calls = [];
  responses = [];
  (globalThis as unknown as { fetch: unknown }).fetch = async (
    url: unknown,
    init: MockCall['init'],
  ) => {
    calls.push({ url: String(url), init });
    const r = responses.shift();
    if (!r) throw new Error('Unexpected Resend request');
    if (r instanceof Error) throw r;
    return {
      ok: r.ok,
      status: r.status,
      text: async () => r.body,
      json: async () => JSON.parse(r.body || '{}'),
    };
  };
});

afterEach(() => {
  console.error = originalError;
  console.warn = originalWarn;
  if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalApiKey;
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
  const result = await sendSubmissionNotice({
    subject: 'New early-adopter application — Test Lab',
    lines: [['Lab name', 'Test Lab']],
  });
  assert.deepEqual(result, { status: 'sent_via_fallback' });
  assert.equal(errors.length, 0);
  assert.match(String(warnings[0][0]), /\[FALLBACK DELIVERY\]/);
  assert.equal(calls.length, 2, 'expected original + fallback call');
  const second = JSON.parse(String(calls[1].init.body));
  assert.match(second.from, /onboarding@resend\.dev/);
  assert.deepEqual(second.to, ['tombstonedash@gmail.com']);
  assert.match(second.subject, /^\[FALLBACK DELIVERY\] /);
});

test('no fallback when the primary send succeeds', async () => {
  responses.push({ ok: true, status: 200, body: '{"id":"ok"}' });
  assert.deepEqual(await sendSubmissionNotice({ subject: 's', lines: [['a', 'b']] }), { status: 'sent' });
  assert.equal(errors.length, 0);
  assert.equal(warnings.length, 0);
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

  assert.deepEqual(await sendApplicantConfirmation('applicant@example.com', 'Test Applicant'), { status: 'sent' });
  assert.equal(errors.length, 0);
  assert.equal(warnings.length, 0);

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

// The production Resend client is fetch-based. Every request is intercepted above;
// no SDK, provider account, DNS configuration, or real inbox is used by this suite.
const senders = [
  { kind: 'submission_notice', send: () => sendSubmissionNotice({ subject: 'Test', lines: [['Name', 'Private Name']] }) },
  { kind: 'applicant_confirmation', send: () => sendApplicantConfirmation('private@example.com', 'Private Name') },
] as const;

function expectFailure(kind: string, reason: string, stage: string, httpStatus?: number) {
  return (error: unknown) => {
    assert.ok(error instanceof NotificationDeliveryError);
    assert.equal(error.status, 'failed');
    assert.equal(error.kind, kind);
    assert.equal(error.reason, reason);
    assert.equal(error.stage, stage);
    assert.equal(error.httpStatus, httpStatus);
    assert.equal(errors.length, 1, 'each failure emits a single explicit flag');
    assert.equal(warnings.length, 0);
    assert.equal(errors[0][0], '[notify] [DELIVERY FAILED]');
    assert.deepEqual(errors[0][1], {
      kind, status: 'failed', reason, stage, httpStatus,
      ...(kind === 'applicant_confirmation' ? { fallbackAvailable: false } : {}),
    });
    assert.doesNotMatch(JSON.stringify({ error, logs: errors }), /private@example.com|Private Name|test-key/);
    return true;
  };
}

for (const { kind, send } of senders) {
  for (const status of [429, 500, 503]) {
    test(`${kind}: verified-domain transient HTTP ${status} rejects and flags without fallback`, async () => {
      responses.push({ ok: false, status, body: 'Transient error private@example.com Private Name test-key' });
      await assert.rejects(send(), expectFailure(kind, 'provider_error', 'primary', status));
      assert.equal(calls.length, 1);
    });
  }

  test(`${kind}: unrelated 403 never uses the domain fallback`, async () => {
    responses.push({ ok: false, status: 403, body: 'Forbidden' });
    await assert.rejects(send(), expectFailure(kind, 'provider_error', 'primary', 403));
    assert.equal(calls.length, 1);
  });

  test(`${kind}: network rejection is typed and visibly flagged`, async () => {
    responses.push(new Error('Socket error private@example.com Private Name test-key'));
    await assert.rejects(send(), expectFailure(kind, 'transport_error', 'primary'));
    assert.equal(calls.length, 1);
  });

  test(`${kind}: missing API key is typed and flagged without a request`, async () => {
    delete process.env.RESEND_API_KEY;
    await assert.rejects(send(), expectFailure(kind, 'not_configured', 'primary'));
    assert.equal(calls.length, 0);
  });
}

test('applicant domain-not-verified is a flagged terminal failure, never sent to the account owner', async () => {
  responses.push({ ok: false, status: 403, body: 'The lims.bot domain is not verified private@example.com' });
  await assert.rejects(senders[1].send(), expectFailure('applicant_confirmation', 'domain_not_verified', 'primary', 403));
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(String(calls[0].init.body)).to, ['private@example.com']);
});

for (const fallback of [
  { response: { ok: false, status: 503, body: 'Unavailable private@example.com' }, reason: 'provider_error', status: 503 },
  { response: { ok: false, status: 403, body: 'domain is not verified' }, reason: 'domain_not_verified', status: 403 },
  { response: new Error('Network private@example.com test-key'), reason: 'transport_error', status: undefined },
]) {
  test(`internal fallback ${fallback.reason}: typed terminal failure and no further retry`, async () => {
    responses.push({ ok: false, status: 403, body: 'domain is not verified' }, fallback.response);
    await assert.rejects(senders[0].send(), expectFailure('submission_notice', fallback.reason, 'fallback', fallback.status));
    assert.equal(calls.length, 2);
  });
}
