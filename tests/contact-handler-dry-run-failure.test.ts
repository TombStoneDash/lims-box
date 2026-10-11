import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { createContactPostHandler } from '../lib/contactHandler';

// Synthetic fixtures only; no real addresses, credentials, or network/DB calls.
const EMAIL = 'dry-run-failure-canary@example.test';

function post(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function silenceConsole() {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};
  return {
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

test('contact: a throwing dry run must not affect the signup response', async () => {
  const { restore } = silenceConsole();
  try {
    let saveLeadCalls = 0;
    let noticeCalls = 0;

    const handler = createContactPostHandler({
      saveLead: async () => {
        saveLeadCalls += 1;
        return true;
      },
      sendSubmissionNotice: async () => {
        noticeCalls += 1;
      },
      logRecovery: () => {},
      firstContactDryRun: async () => {
        throw new Error('lookup down');
      },
    });

    const response = await handler(post('https://lims.bot/api/contact', {
      name: 'Canary Name Person',
      labName: 'Canary Lab Name Inc',
      email: EMAIL,
    }));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.equal(saveLeadCalls, 1);
    assert.equal(noticeCalls, 1);
  } finally {
    restore();
  }
});

test('contact: a normal dry run is still invoked with the submitted email', async () => {
  const { restore } = silenceConsole();
  try {
    let dryRunEmail: string | undefined;

    const handler = createContactPostHandler({
      saveLead: async () => true,
      sendSubmissionNotice: async () => {},
      logRecovery: () => {},
      firstContactDryRun: async (input) => {
        dryRunEmail = input.email;
      },
    });

    const response = await handler(post('https://lims.bot/api/contact', {
      name: 'Canary Name Person',
      labName: 'Canary Lab Name Inc',
      email: EMAIL,
    }));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.equal(dryRunEmail, EMAIL);
  } finally {
    restore();
  }
});
