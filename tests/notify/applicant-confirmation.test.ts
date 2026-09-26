import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { sendApplicantConfirmation } from '../../lib/notify';
import { createWaitlistPostHandler, type WaitlistRecord } from '../../lib/waitlistHandler';

// Mocked email transport: every Resend call is captured here and nothing leaves
// the process. All addresses are synthetic (example.com / example.test).
interface Sent { to: string[]; subject: string; from: string }
let sent: Sent[] = [];
let responses: Array<{ ok: boolean; status: number; body: string }> = [];
const origFetch = globalThis.fetch;
const origKey = process.env.RESEND_API_KEY;

beforeEach(() => {
  sent = [];
  responses = [];
  process.env.RESEND_API_KEY = 'synthetic-test-key';
  (globalThis as unknown as { fetch: unknown }).fetch = async (url: unknown, init: { body?: string }) => {
    assert.equal(String(url), 'https://api.resend.com/emails');
    sent.push(JSON.parse(init.body ?? '{}'));
    const r = responses.shift() ?? { ok: true, status: 200, body: '{}' };
    return { ok: r.ok, status: r.status, text: async () => r.body };
  };
});

afterEach(() => {
  globalThis.fetch = origFetch;
  if (origKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = origKey;
});

const APPLICANT_SUBJECT = 'We got your LIMS Box application';

function setup(existing: string[] = [], overrides: { lookupFails?: boolean; saveFails?: boolean } = {}) {
  const list = new Set(existing);
  const records: WaitlistRecord[] = [];
  let noticeLines: Array<[string, string | null | undefined]> = [];
  const handler = createWaitlistPostHandler({
    hasExistingSignup: async (email) => {
      if (overrides.lookupFails) throw new Error('synthetic lookup outage');
      return list.has(email);
    },
    createProspect: async (record) => {
      if (overrides.saveFails) throw new Error('synthetic save outage');
      records.push(record);
      list.add(record.email);
    },
    sendSubmissionNotice: async (notice) => { noticeLines = notice.lines; },
    sendApplicantConfirmation,
    now: () => '2026-09-25T00:00:00.000Z',
  });
  const confirmationLine = () => noticeLines.find(([label]) => label === 'Applicant confirmation')?.[1];
  return { handler, records, confirmationLine };
}

function post(body: unknown) {
  return new NextRequest('https://lims.bot/api/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const applicantMail = () => sent.filter((m) => m.subject === APPLICANT_SUBJECT);

test('a new signup gets exactly one confirmation, addressed only to that applicant', async () => {
  const { handler, records, confirmationLine } = setup(['existing-1@example.com', 'existing-2@example.com']);
  const res = await handler(post({ email: 'New.Person@Example.test', name: 'Synthetic Person' }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, saved: true });
  assert.equal(records.length, 1);
  assert.equal(applicantMail().length, 1);
  assert.deepEqual(applicantMail()[0].to, ['new.person@example.test']);
  assert.equal(confirmationLine(), 'sent');
});

test('no backfill: existing list members are never emailed', async () => {
  const existing = ['existing-1@example.com', 'existing-2@example.com', 'existing-3@example.com'];
  const { handler } = setup(existing);
  await handler(post({ email: 'brand-new@example.test' }));
  const recipients = applicantMail().flatMap((m) => m.to);
  for (const address of existing) assert.ok(!recipients.includes(address), address);
  assert.deepEqual(recipients, ['brand-new@example.test']);
});

test('a repeat signup from an address already on the list sends no confirmation', async () => {
  const { handler, confirmationLine } = setup(['existing-1@example.com']);
  const res = await handler(post({ email: 'EXISTING-1@example.com' }));
  assert.equal(res.status, 200);
  assert.equal(applicantMail().length, 0);
  assert.equal(confirmationLine(), 'skipped (already on the list)');
});

test('submitting twice emails the applicant once', async () => {
  const { handler } = setup();
  await handler(post({ email: 'twice@example.test' }));
  await handler(post({ email: 'twice@example.test' }));
  assert.equal(applicantMail().length, 1);
});

test('if the list cannot be checked, nothing is sent to the applicant', async () => {
  const { handler, confirmationLine } = setup([], { lookupFails: true });
  const res = await handler(post({ email: 'unknown@example.test' }));
  assert.equal(res.status, 200);
  assert.equal(applicantMail().length, 0);
  assert.equal(confirmationLine(), 'skipped (could not check the list)');
});

test('if the signup is not saved, nothing is sent to the applicant', async () => {
  const { handler, confirmationLine } = setup([], { saveFails: true });
  const res = await handler(post({ email: 'unsaved@example.test' }));
  assert.equal(res.status, 200);
  assert.equal(applicantMail().length, 0);
  assert.equal(confirmationLine(), 'skipped (signup not saved)');
});

test('an invalid email sends nothing at all', async () => {
  const { handler } = setup();
  const res = await handler(post({ email: 'not-an-email' }));
  assert.equal(res.status, 400);
  assert.equal(sent.length, 0);
});

test('delivery failures are reported to Hudson and never fail the signup', async () => {
  const cases: Array<[{ ok: boolean; status: number; body: string } | 'no-key', string]> = [
    [{ ok: false, status: 403, body: 'The lims.bot domain is not verified' }, 'blocked (domain not verified)'],
    [{ ok: false, status: 422, body: 'provider detail that must not leak' }, 'failed (422)'],
    ['no-key', 'not configured'],
  ];
  for (const [response, expected] of cases) {
    const { handler, confirmationLine } = setup();
    if (response === 'no-key') delete process.env.RESEND_API_KEY;
    else responses.push(response);
    const res = await handler(post({ email: `case-${expected.length}@example.test` }));
    assert.equal(res.status, 200, expected);
    const body = await res.json();
    assert.deepEqual(body, { success: true, saved: true }, 'no delivery detail is returned to the browser');
    assert.equal(confirmationLine(), expected);
    process.env.RESEND_API_KEY = 'synthetic-test-key';
  }
});

test('applicant mail never uses the shared fallback sender', async () => {
  const { handler } = setup();
  responses.push({ ok: false, status: 403, body: 'domain is not verified' });
  await handler(post({ email: 'fallback-check@example.test' }));
  assert.ok(sent.every((m) => !m.from.includes('onboarding@resend.dev') || m.subject !== APPLICANT_SUBJECT));
  assert.equal(applicantMail().length, 1, 'one attempt, no retry to another address');
});

test('no bulk path: the waitlist code never reads the whole prospect list', () => {
  for (const file of ['lib/waitlistHandler.ts', 'app/api/waitlist/route.ts']) {
    const source = readFileSync(path.join(process.cwd(), file), 'utf8');
    assert.doesNotMatch(source, /findMany|\$queryRaw|\$executeRaw/, file);
  }
});
