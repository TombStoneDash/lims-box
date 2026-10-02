import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { createContactPostHandler } from '../lib/contactHandler';
import { createEarlyAccessPostHandler } from '../lib/earlyAccessHandler';
import { createWaitlistPostHandler } from '../lib/waitlistHandler';

// Unique, opaque canaries — if any of these literal strings survive into a
// captured console.error call, the applicant's submitted data leaked.
const CANARY = {
  email: 'lead-recovery-canary@example.com',
  name: 'Canary Applicant Zyx',
  labName: 'Canary Diagnostics Lab Qrx',
  phone: '+1-555-010-9999',
  message: 'CANARY-FREE-TEXT: patient callback re: results Jane Doe',
  // Free text that could itself be a name/phone — this is the R1 regression:
  // waitlistHandler.ts used to copy body.source verbatim into the record and
  // into the recovery log via leadLogMeta's permissive source regex.
  source: 'referred by Jane Doe 555-0100',
};

function failure(): Error {
  return new Error('synthetic sink failure');
}

async function captureConsoleError<T>(run: () => Promise<T>): Promise<{ result: T; logs: unknown[][] }> {
  const logs: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { logs.push(args); };
  try {
    const result = await run();
    return { result, logs };
  } finally {
    console.error = original;
  }
}

function recoveryCallsFor(logs: unknown[][], tag: string): unknown[][] {
  return logs.filter((args) => String(args[0]).includes(`[${tag}] LEAD-RECOVERY`));
}

function assertNoCanaries(logs: unknown[][]) {
  const serialized = JSON.stringify(logs);
  for (const [field, value] of Object.entries(CANARY)) {
    assert.ok(!serialized.includes(value), `recovery logs leaked submitted ${field}`);
  }
}

test('contact recovery log contains no applicant PII when both sinks fail', async () => {
  const handler = createContactPostHandler({
    saveLead: async () => { throw failure(); },
    sendSubmissionNotice: async () => { throw failure(); },
    firstContactDryRun: async () => {},
  });

  const { result: response, logs } = await captureConsoleError(() => handler(new NextRequest('https://lims.bot/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: CANARY.name,
      labName: CANARY.labName,
      email: CANARY.email,
      labSize: '100-500',
      currentSystem: 'LabWare',
      message: CANARY.message,
      phone: CANARY.phone,
      instruments: 'Autoclave',
      source: CANARY.source,
    }),
  })));

  assert.equal(response.status, 500);
  const recovery = recoveryCallsFor(logs, 'contact');
  assert.equal(recovery.length, 1);
  assertNoCanaries(logs);
});

const earlyAccessApplication = {
  labName: CANARY.labName,
  contactName: CANARY.name,
  email: CANARY.email,
  labType: 'Other',
  monthlyVolume: 'under-100',
  painPoint: CANARY.message,
  dataUseAccepted: true,
  source: CANARY.source,
  phone: CANARY.phone,
};

test('early-access recovery log contains no applicant PII when both sinks fail', async () => {
  const handler = createEarlyAccessPostHandler({
    createProspect: async () => { throw failure(); },
    sendSubmissionNotice: async () => { throw failure(); },
    sendApplicantConfirmation: async () => { throw failure(); },
  });

  const { result: response, logs } = await captureConsoleError(() => handler(new NextRequest('https://lims.bot/api/early-access', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(earlyAccessApplication),
  })));

  assert.equal(response.status, 500);
  const recovery = recoveryCallsFor(logs, 'early-access');
  assert.equal(recovery.length, 1);
  // Free-text source input is normalized to the fixed default upstream
  // (validateEarlyAccessApplication); the recovery log must only ever carry
  // that fixed token, never arbitrary submitted/attributed text.
  assert.equal((recovery[0][1] as Record<string, unknown>).source, 'lims.bot/early-adopter');
  assertNoCanaries(logs);
});

test('early-access recovery log redacts an attributed (non-default) source to a placeholder', async () => {
  const handler = createEarlyAccessPostHandler({
    createProspect: async () => { throw failure(); },
    sendSubmissionNotice: async () => { throw failure(); },
    sendApplicantConfirmation: async () => { throw failure(); },
  });

  const { result: response, logs } = await captureConsoleError(() => handler(new NextRequest('https://lims.bot/api/early-access', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...earlyAccessApplication, source: 'lims.bot/early-adopter;utm_source=newsletter' }),
  })));

  assert.equal(response.status, 500);
  const recovery = recoveryCallsFor(logs, 'early-access');
  assert.equal(recovery.length, 1);
  // A validly-attributed, non-default source is still caller-influenced text
  // and must never reach the recovery log raw — only the allowlisted fixed
  // default is logged, anything else becomes null.
  assert.equal((recovery[0][1] as Record<string, unknown>).source, null);
  assertNoCanaries(logs);
});

test('waitlist recovery log contains no applicant PII and no raw source when both sinks fail', async () => {
  const handler = createWaitlistPostHandler({
    hasExistingSignup: async () => false,
    createProspect: async () => { throw failure(); },
    sendSubmissionNotice: async () => { throw failure(); },
    sendApplicantConfirmation: async () => { throw failure(); },
  });

  const { result: response, logs } = await captureConsoleError(() => handler(new NextRequest('https://lims.bot/api/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: CANARY.email,
      name: CANARY.name,
      labName: CANARY.labName,
      source: CANARY.source,
      phone: CANARY.phone,
      message: CANARY.message,
    }),
  })));

  assert.equal(response.status, 500);
  const recovery = recoveryCallsFor(logs, 'waitlist');
  assert.equal(recovery.length, 1);
  assert.equal((recovery[0][1] as Record<string, unknown>).source, null);
  assertNoCanaries(logs);
});

// Source-level guard: each recovery call-site must actually invoke the
// leadLogMeta redactor on its logged argument — not merely import it
// elsewhere. This fails if the call is deleted while the import line stays,
// or if a bare unredacted record/submission identifier is logged instead.
test('every LEAD-RECOVERY console.error call redacts through leadLogMeta(...)', () => {
  for (const [path, tag] of [
    ['lib/contactHandler.ts', 'contact'],
    ['lib/waitlistHandler.ts', 'waitlist'],
    ['lib/earlyAccessHandler.ts', 'early-access'],
  ] as const) {
    const text = readFileSync(path, 'utf8');
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    let found = 0;
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && /^console\.(log|error|warn)$/.test(node.expression.getText(source))) {
        const [firstArg, secondArg] = node.arguments;
        if (firstArg && firstArg.getText(source).includes(`[${tag}] LEAD-RECOVERY`)) {
          assert.ok(secondArg, `${path}: LEAD-RECOVERY call is missing its diagnostics argument`);
          assert.ok(
            secondArg.getText(source).includes('leadLogMeta('),
            `${path}: LEAD-RECOVERY diagnostics must be produced by an actual leadLogMeta(...) call`,
          );
          found++;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.equal(found, 1, `${path}: expected exactly one LEAD-RECOVERY console call`);
  }
});
