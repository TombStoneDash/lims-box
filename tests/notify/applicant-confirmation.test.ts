import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  sendApplicantConfirmation,
  sendApplicantConfirmationOutcome,
} from '../../lib/notify';

// RESEND_API_KEY is read inside sendApplicantConfirmationOutcome at call
// time, so setting it after the static import (hoisted) is safe.
process.env.RESEND_API_KEY = 'test-key';

interface MockCall {
  url: string;
  init: { body?: string } & Record<string, unknown>;
}

let calls: MockCall[] = [];
let responses: Array<{ ok: boolean; status: number; body: string }> = [];
const origFetch = globalThis.fetch;

const APPLICANT_EMAIL = 'someone-secret@example.com';

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

test('outcome is sent after a successful provider response', async () => {
  responses.push({ ok: true, status: 200, body: '{"id":"confirmation-ok"}' });

  const outcome = await sendApplicantConfirmationOutcome(APPLICANT_EMAIL, 'Test Applicant');

  assert.deepEqual(outcome, { status: 'sent' });
  assert.equal(calls.length, 1);
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body.to, [APPLICANT_EMAIL]);
});

test('outcome is not_configured without a provider call when RESEND_API_KEY is missing', async () => {
  const previous = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  try {
    const outcome = await sendApplicantConfirmationOutcome(APPLICANT_EMAIL, 'Test Applicant');
    assert.equal(outcome.status, 'not_configured');
    assert.equal(outcome.reason, 'Applicant confirmation delivery is not configured');
    assert.equal(calls.length, 0);
  } finally {
    process.env.RESEND_API_KEY = previous;
  }
});

test('outcome is blocked_domain_unverified on a 403 domain-not-verified response', async () => {
  responses.push({ ok: false, status: 403, body: 'The lims.bot domain is not verified' });

  const outcome = await sendApplicantConfirmationOutcome(APPLICANT_EMAIL, 'Test Applicant');

  assert.equal(outcome.status, 'blocked_domain_unverified');
  assert.equal(outcome.httpStatus, 403);
  assert.equal(calls.length, 1, 'applicant mail has no fallback path — only the original attempt');
});

test('outcome is failed with httpStatus on other provider errors', async () => {
  responses.push({ ok: false, status: 422, body: 'Invalid recipient' });

  const outcome = await sendApplicantConfirmationOutcome(APPLICANT_EMAIL, 'Test Applicant');

  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.httpStatus, 422);
  assert.equal(calls.length, 1);
});

test('outcome is failed without throwing when fetch itself rejects', async () => {
  (globalThis as unknown as { fetch: unknown }).fetch = async () => {
    throw new Error('network down');
  };

  const outcome = await sendApplicantConfirmationOutcome(APPLICANT_EMAIL, 'Test Applicant');

  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.reason, 'Applicant confirmation delivery failed (unexpected error)');
});

test('a secret in a thrown provider error never reaches the outcome, the wrapper rejection, or logs', async () => {
  const CANARY = 'SECRET-CANARY-9f3a1c7e';
  (globalThis as unknown as { fetch: unknown }).fetch = async () => {
    throw new Error(`connection reset: leaked-credential=${CANARY}`);
  };

  const origLog = console.log;
  const origError = console.error;
  const logged: string[] = [];
  console.log = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };
  console.error = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };

  let outcome: Awaited<ReturnType<typeof sendApplicantConfirmationOutcome>>;
  try {
    outcome = await sendApplicantConfirmationOutcome(APPLICANT_EMAIL, 'Test Applicant');

    assert.equal(outcome.status, 'failed');
    assert.equal(outcome.reason, 'Applicant confirmation delivery failed (unexpected error)');
    assert.equal(JSON.stringify(outcome).includes(CANARY), false, 'canary leaked into outcome');

    await assert.rejects(
      sendApplicantConfirmation(APPLICANT_EMAIL, 'Test Applicant'),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message.includes(CANARY), false, 'canary leaked into thrown wrapper error');
        return true;
      },
    );
  } finally {
    console.log = origLog;
    console.error = origError;
  }

  for (const line of logged) {
    assert.equal(line.includes(CANARY), false, `canary leaked into logs: ${line}`);
  }
});

test('outcome never logs the full applicant address', async () => {
  responses.push({ ok: false, status: 422, body: 'Invalid recipient' });
  const origLog = console.log;
  const origError = console.error;
  const logged: string[] = [];
  console.log = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };
  console.error = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };
  try {
    await sendApplicantConfirmationOutcome(APPLICANT_EMAIL, 'Test Applicant');
  } finally {
    console.log = origLog;
    console.error = origError;
  }
  for (const line of logged) {
    assert.equal(line.includes(APPLICANT_EMAIL), false, `log line leaked full address: ${line}`);
  }
});

test('sendApplicantConfirmation resolves when the outcome is sent', async () => {
  responses.push({ ok: true, status: 200, body: '{"id":"confirmation-ok"}' });
  await sendApplicantConfirmation(APPLICANT_EMAIL, 'Test Applicant');
  assert.equal(calls.length, 1);
});

test('sendApplicantConfirmation rejects when the outcome is not sent', async () => {
  responses.push({ ok: false, status: 422, body: 'Invalid recipient' });
  await assert.rejects(
    sendApplicantConfirmation(APPLICANT_EMAIL, 'Test Applicant'),
    /Applicant confirmation delivery failed \(422\)/,
  );
});

test('sendApplicantConfirmation rejects with the not_configured reason', async () => {
  const previous = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  try {
    await assert.rejects(
      sendApplicantConfirmation(APPLICANT_EMAIL, 'Test Applicant'),
      /Applicant confirmation delivery is not configured/,
    );
    assert.equal(calls.length, 0);
  } finally {
    process.env.RESEND_API_KEY = previous;
  }
});
