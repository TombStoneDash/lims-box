import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { createContactPostHandler } from '../lib/contactHandler';
import { createEarlyAccessPostHandler } from '../lib/earlyAccessHandler';
import { createWaitlistPostHandler } from '../lib/waitlistHandler';

// Synthetic fixtures only; no real addresses, credentials, or network/DB calls.
const EMAIL = 'lead-recovery-canary@example.test';
const CANARIES = {
  name: 'Canary Name Person',
  labName: 'Canary Lab Name Inc',
  phone: '555-867-5309',
  message: 'Canary free-text message body',
  painPoint: 'Canary pain point free text',
  // Free text an attacker could put in the waitlist's unvalidated `source` field.
  source: 'Canary Source Jane Doe 555-867-5309',
};

function captureConsoleError() {
  const calls: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };
  return {
    calls,
    restore: () => {
      console.error = original;
    },
  };
}

function serialize(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v) => (v instanceof Error ? { name: v.name, message: v.message } : v));
  } catch {
    return String(value);
  }
}

function post(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function assertRecoveryIsClean(calls: unknown[][]) {
  const serializedCalls = calls.map((args) => args.map(serialize));

  for (const value of Object.values(CANARIES)) {
    for (const args of serializedCalls) {
      for (const arg of args) {
        assert.ok(!arg.includes(value), `canary leaked into a console.error argument: ${value}`);
      }
    }
  }

  const recoveryCalls = calls.filter(
    (args) => typeof args[0] === 'string' && args[0].includes('LEAD-RECOVERY'),
  );
  assert.equal(recoveryCalls.length, 1, 'expected exactly one LEAD-RECOVERY recovery log');

  const [, record] = recoveryCalls[0] as [string, Record<string, unknown>];
  assert.equal(record.email, EMAIL, 'recovery record must keep the raw submitted email');

  for (const [key, value] of Object.entries(record)) {
    if (key === 'email') continue;
    assert.ok(!serialize(value).includes(EMAIL), `recovery record field "${key}" must not also carry the raw email`);
  }

  for (const args of calls) {
    if (args === recoveryCalls[0]) continue;
    for (const arg of args) {
      assert.ok(!serialize(arg).includes(EMAIL), 'the raw email leaked outside the recovery record');
    }
  }
}

test('contact: both sinks failing logs only redacted metadata plus the raw email', async () => {
  const { calls, restore } = captureConsoleError();
  try {
    const handler = createContactPostHandler({
      saveLead: async () => false,
      sendSubmissionNotice: async () => {
        throw new Error(`synthetic notify outage ${CANARIES.name} ${EMAIL}`);
      },
      logRecovery: (record) => console.error('[contact] LEAD-RECOVERY (both sinks failed):', record),
    });

    const response = await handler(post('https://lims.bot/api/contact', {
      name: CANARIES.name,
      labName: CANARIES.labName,
      email: EMAIL,
      phone: CANARIES.phone,
      message: CANARIES.message,
    }));

    assert.equal(response.status, 500);
    assertRecoveryIsClean(calls);
  } finally {
    restore();
  }
});

test('early-access: both sinks failing logs only redacted metadata plus the raw email', async () => {
  const { calls, restore } = captureConsoleError();
  try {
    const handler = createEarlyAccessPostHandler({
      createProspect: async () => {
        throw new Error(`synthetic db outage ${CANARIES.name} ${EMAIL}`);
      },
      sendSubmissionNotice: async () => {
        throw new Error(`synthetic notify outage ${CANARIES.name} ${EMAIL}`);
      },
      sendApplicantConfirmation: async () => {},
    });

    const response = await handler(post('https://lims.bot/api/early-access', {
      labName: CANARIES.labName,
      labType: 'Environmental / Water Testing',
      contactName: CANARIES.name,
      email: EMAIL,
      monthlyVolume: '100-500',
      painPoint: CANARIES.painPoint,
      dataUseAccepted: true,
      source: CANARIES.source,
    }));

    assert.equal(response.status, 500);
    assertRecoveryIsClean(calls);
  } finally {
    restore();
  }
});

test('waitlist: both sinks failing logs only redacted metadata plus the raw email, and never the raw source', async () => {
  const { calls, restore } = captureConsoleError();
  try {
    const handler = createWaitlistPostHandler({
      hasExistingSignup: async () => false,
      createProspect: async () => {
        throw new Error(`synthetic db outage ${CANARIES.name} ${EMAIL}`);
      },
      sendSubmissionNotice: async () => {
        throw new Error(`synthetic notify outage ${CANARIES.name} ${EMAIL}`);
      },
      sendApplicantConfirmation: async () => {},
    });

    const response = await handler(post('https://lims.bot/api/waitlist', {
      email: EMAIL,
      name: CANARIES.name,
      labName: CANARIES.labName,
      source: CANARIES.source,
    }));

    assert.equal(response.status, 500);
    assertRecoveryIsClean(calls);
  } finally {
    restore();
  }
});

// Source-level guard against a mutation that keeps the `leadLogMeta`/dependency
// import but deletes the call that actually uses it: each check below asserts
// a real call expression (not merely an identifier reference), so it fails if
// the recovery call is deleted while its import is left behind.
test('each recovery path still contains its LEAD-RECOVERY call expression', () => {
  for (const path of ['app/api/contact/route.ts', 'lib/earlyAccessHandler.ts', 'lib/waitlistHandler.ts']) {
    const text = readFileSync(path, 'utf8');
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    let found = false;
    function visit(node: ts.Node) {
      if (
        ts.isCallExpression(node)
        && node.expression.getText(source) === 'console.error'
        && node.arguments.some((arg) => ts.isStringLiteral(arg) && arg.text.includes('LEAD-RECOVERY'))
      ) {
        found = true;
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(found, `${path}: expected a console.error(...) call expression whose string argument contains 'LEAD-RECOVERY'`);
  }
});

test('contactHandler builds and forwards the recovery record via a real call expression', () => {
  const path = 'lib/contactHandler.ts';
  const text = readFileSync(path, 'utf8');
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  let callsLogRecovery = false;
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node)
      && node.expression.getText(source) === 'dependencies.logRecovery'
    ) {
      callsLogRecovery = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(callsLogRecovery, `${path}: expected a dependencies.logRecovery(...) call expression`);
  assert.doesNotMatch(
    text,
    /console\.(log|error|warn)\([^)]*record\b/,
    `${path}: must not call console directly with a record`,
  );
});
