import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { createEarlyAccessPostHandler } from '../lib/earlyAccessHandler';
import { createWaitlistPostHandler } from '../lib/waitlistHandler';

// Synthetic fixtures only; no real applicant data.
const SYNTHETIC_CONTACT = {
  name: 'Synthetic Contact Person',
  email: 'synthetic.contact@example.test',
  labName: 'Synthetic Reference Lab',
  phone: '555-867-5309',
  message: 'Synthetic free-text note describing our current workflow pain points.',
};

const SYNTHETIC_EARLY_ACCESS = {
  labName: 'Synthetic Early Adopter Lab',
  contactName: 'Synthetic Early Adopter Person',
  email: 'synthetic.early-access@example.test',
  labType: 'Environmental / Water Testing',
  monthlyVolume: '100-500',
  painPoint: 'Synthetic free-text note describing our manual QC review backlog.',
  dataUseAccepted: true,
};

const SYNTHETIC_WAITLIST = {
  name: 'Synthetic Waitlist Person',
  email: 'synthetic.waitlist@example.test',
  labName: 'Synthetic Waitlist Lab',
  organization: 'Synthetic Waitlist Org',
};

function sinkFailure() {
  return new Error('synthetic sink outage');
}

function recoveryCall(calls: { arguments: unknown[] }[], tag: string) {
  return calls.find((call) => typeof call.arguments[0] === 'string' && call.arguments[0].includes('LEAD-RECOVERY') && call.arguments[0].includes(tag));
}

function assertNoRawFields(call: { arguments: unknown[] } | undefined, tag: string, fields: Record<string, string>) {
  assert.ok(call, `expected a LEAD-RECOVERY console.error call tagged "${tag}" when both sinks fail`);
  const serialized = JSON.stringify(call!.arguments);
  for (const [key, raw] of Object.entries(fields)) {
    assert.ok(!serialized.includes(raw), `${tag} LEAD-RECOVERY diagnostics leaked raw ${key} ("${raw}"): ${serialized}`);
  }
}

// ── Source-level: the LEAD-RECOVERY log must pass the result of calling ─────
// leadLogMeta(record), not the bare record identifier. This fails both if the
// redaction call is removed (reverting to a bare identifier or object) and if
// the import were kept but the call site never updated.
function assertRecoveryUsesLeadLogMetaCall(filePath: string, tag: string) {
  const text = readFileSync(filePath, 'utf8');
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
  let found = false;

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'console.error') {
      const [first, second] = node.arguments;
      if (first && ts.isStringLiteral(first) && first.text.includes('LEAD-RECOVERY') && first.text.includes(tag)) {
        found = true;
        assert.ok(second, `${filePath}: the LEAD-RECOVERY console.error call is missing a second argument`);
        assert.ok(
          second && ts.isCallExpression(second) && second.expression.getText(source) === 'leadLogMeta',
          `${filePath}: the LEAD-RECOVERY log must pass leadLogMeta(record), not "${second?.getText(source)}"`,
        );
        if (second && ts.isCallExpression(second)) {
          assert.equal(second.arguments.length, 1, `${filePath}: leadLogMeta(...) must be called with exactly one argument`);
          // Allow a trailing "as Record<string, unknown>" cast on the argument (needed when
          // the record's declared type lacks an index signature); the underlying expression
          // passed into leadLogMeta must still be the bare record identifier.
          let innerArg: ts.Expression = second.arguments[0];
          while (ts.isAsExpression(innerArg) || ts.isTypeAssertionExpression(innerArg)) {
            innerArg = innerArg.expression;
          }
          assert.equal(innerArg.getText(source), 'record', `${filePath}: leadLogMeta must be called with the record`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  assert.ok(found, `${filePath}: expected a LEAD-RECOVERY console.error call tagged "${tag}"`);
}

test('source: app/api/contact/route.ts routes the recovery log through leadLogMeta(record)', () => {
  assertRecoveryUsesLeadLogMetaCall('app/api/contact/route.ts', '[contact]');
});

test('source: lib/earlyAccessHandler.ts routes the recovery log through leadLogMeta(record)', () => {
  assertRecoveryUsesLeadLogMetaCall('lib/earlyAccessHandler.ts', '[early-access]');
});

test('source: lib/waitlistHandler.ts routes the recovery log through leadLogMeta(record)', () => {
  assertRecoveryUsesLeadLogMetaCall('lib/waitlistHandler.ts', '[waitlist]');
});

test('contact route: when both the DB save and the email notice fail, the recovery log carries no raw applicant PII', async (t) => {
  const envKeys = [
    'SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'RESEND_API_KEY',
  ] as const;
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    t.mock.restoreAll();
  });
  for (const key of envKeys) delete process.env[key];

  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected external call');
  });
  const errorMock = t.mock.method(console, 'error', () => {});

  const { POST } = await import('../app/api/contact/route');
  const response = await POST(new NextRequest('https://lims.bot/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(SYNTHETIC_CONTACT),
  }));

  assert.equal(response.status, 500);

  const calls = errorMock.mock.calls.map((call) => ({ arguments: call.arguments }));
  const recovery = recoveryCall(calls, '[contact]');
  assertNoRawFields(recovery, '[contact]', {
    email: SYNTHETIC_CONTACT.email,
    name: SYNTHETIC_CONTACT.name,
    labName: SYNTHETIC_CONTACT.labName,
    phone: SYNTHETIC_CONTACT.phone,
    message: SYNTHETIC_CONTACT.message,
  });
});

test('early-access handler: when both the DB save and the submission notice fail, the recovery log carries no raw applicant PII', async (t) => {
  t.after(() => t.mock.restoreAll());
  const errorMock = t.mock.method(console, 'error', () => {});

  const handler = createEarlyAccessPostHandler({
    createProspect: async () => { throw sinkFailure(); },
    sendSubmissionNotice: async () => { throw sinkFailure(); },
    sendApplicantConfirmation: async () => {},
    now: () => '2026-10-02T00:00:00.000Z',
  });

  const response = await handler(new NextRequest('https://lims.bot/api/early-access', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(SYNTHETIC_EARLY_ACCESS),
  }));

  assert.equal(response.status, 500);

  const calls = errorMock.mock.calls.map((call) => ({ arguments: call.arguments }));
  const recovery = recoveryCall(calls, '[early-access]');
  assertNoRawFields(recovery, '[early-access]', {
    email: SYNTHETIC_EARLY_ACCESS.email,
    name: SYNTHETIC_EARLY_ACCESS.contactName,
    labName: SYNTHETIC_EARLY_ACCESS.labName,
    painPoint: SYNTHETIC_EARLY_ACCESS.painPoint,
  });
});

test('waitlist handler: when both the DB save and the submission notice fail, the recovery log carries no raw applicant PII', async (t) => {
  t.after(() => t.mock.restoreAll());
  const errorMock = t.mock.method(console, 'error', () => {});

  const handler = createWaitlistPostHandler({
    hasExistingSignup: async () => false,
    createProspect: async () => { throw sinkFailure(); },
    sendSubmissionNotice: async () => { throw sinkFailure(); },
    sendApplicantConfirmation: async () => {},
    now: () => '2026-10-02T00:00:00.000Z',
  });

  const response = await handler(new NextRequest('https://lims.bot/api/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(SYNTHETIC_WAITLIST),
  }));

  assert.equal(response.status, 500);

  const calls = errorMock.mock.calls.map((call) => ({ arguments: call.arguments }));
  const recovery = recoveryCall(calls, '[waitlist]');
  assertNoRawFields(recovery, '[waitlist]', {
    email: SYNTHETIC_WAITLIST.email,
    name: SYNTHETIC_WAITLIST.name,
    labName: SYNTHETIC_WAITLIST.labName,
  });
});
