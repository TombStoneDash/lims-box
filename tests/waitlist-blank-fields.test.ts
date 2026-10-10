import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { createWaitlistPostHandler, type WaitlistRecord } from '../lib/waitlistHandler';

// Synthetic fixtures only; no real addresses or production data.
function setup() {
  let capturedRecord: WaitlistRecord | null = null;
  const handler = createWaitlistPostHandler({
    hasExistingSignup: async () => false,
    createProspect: async (record) => {
      capturedRecord = record;
    },
    sendSubmissionNotice: async () => {},
    sendApplicantConfirmation: async () => {},
    now: () => '2026-10-10T00:00:00.000Z',
  });
  return { handler, record: () => capturedRecord };
}

function post(body: unknown) {
  return new NextRequest('https://lims.bot/api/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('whitespace-only source and organization fall back to defaults instead of being stored blank', async () => {
  const { handler, record } = setup();

  const res = await handler(post({ email: 'A@B.co', source: '   ', organization: '  ' }));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, saved: true });
  assert.equal(record()?.source, 'lims.bot');
  assert.equal(record()?.labName, 'Waitlist');
});

test('real values are still trimmed and preserved', async () => {
  const { handler, record } = setup();

  const res = await handler(
    post({
      email: 'real-values@example.test',
      name: '  Real Name  ',
      labName: '  Real Lab  ',
      organization: '  Real Org  ',
      source: '  partner-referral  ',
    }),
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, saved: true });
  assert.equal(record()?.name, 'Real Name');
  assert.equal(record()?.labName, 'Real Lab');
  assert.equal(record()?.source, 'partner-referral');
});

test('whitespace-only labName falls back to a trimmed organization before the "Waitlist" default', async () => {
  const { handler, record } = setup();

  const res = await handler(
    post({ email: 'lab-fallback@example.test', labName: '   ', organization: '  Real Org  ' }),
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, saved: true });
  assert.equal(record()?.labName, 'Real Org');
});
