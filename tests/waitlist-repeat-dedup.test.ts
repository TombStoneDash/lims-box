import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { createWaitlistPostHandler } from '../lib/waitlistHandler';

// Synthetic fixtures only; no real addresses or production data.
function setup(overrides: { hasExistingSignup: (email: string) => Promise<boolean> }) {
  let createProspectCalls = 0;
  const handler = createWaitlistPostHandler({
    hasExistingSignup: overrides.hasExistingSignup,
    createProspect: async () => {
      createProspectCalls += 1;
    },
    sendSubmissionNotice: async () => {},
    sendApplicantConfirmation: async () => {},
    now: () => '2026-10-02T00:00:00.000Z',
  });
  return { handler, calls: () => createProspectCalls };
}

function post(body: unknown) {
  return new NextRequest('https://lims.bot/api/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('a repeat submission of an already-listed email never calls createProspect, and the request still succeeds', async () => {
  const { handler, calls } = setup({
    hasExistingSignup: async () => true,
  });

  const res = await handler(post({ email: 'Repeat.Signup@Example.test', name: 'Repeat Signup' }));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, saved: true });
  assert.equal(calls(), 0, 'createProspect must not be called for an email already on the waitlist');
});

test('fail-open is preserved: when the existing-signup lookup itself fails, createProspect is still called', async () => {
  const { handler, calls } = setup({
    hasExistingSignup: async () => {
      throw new Error('synthetic lookup outage');
    },
  });

  const res = await handler(post({ email: 'lookup-outage@example.test' }));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, saved: true });
  assert.equal(calls(), 1, 'a failed lookup must fail open and still persist the signup');
});

test('a brand-new email still calls createProspect exactly once', async () => {
  const { handler, calls } = setup({
    hasExistingSignup: async () => false,
  });

  const res = await handler(post({ email: 'brand-new@example.test' }));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, saved: true });
  assert.equal(calls(), 1);
});

test('source: the createProspect(record) call expression is guarded by isNewSignup === false, not just present in the file', () => {
  const source = readFileSync(path.join(process.cwd(), 'lib/waitlistHandler.ts'), 'utf8');

  const guardMatch = source.match(
    /let dbSaved = false;\s*\n\s*if \(isNewSignup === false\) \{([\s\S]*?)\n\s*\} else \{([\s\S]*?)\n\s*\}/,
  );
  assert.ok(guardMatch, 'expected an "if (isNewSignup === false) { ... } else { ... }" guard around dbSaved');

  const [, skipBranch, createBranch] = guardMatch;
  assert.doesNotMatch(
    skipBranch,
    /dependencies\.createProspect\(record\)/,
    'the already-listed branch must not call dependencies.createProspect(record)',
  );
  assert.match(
    createBranch,
    /dependencies\.createProspect\(record\)/,
    'the non-duplicate branch must still call dependencies.createProspect(record)',
  );
});
