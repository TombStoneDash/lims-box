import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { POST as contactPost } from '../app/api/contact/route';
import { createWaitlistPostHandler } from '../lib/waitlistHandler';
import { createEarlyAccessPostHandler } from '../lib/earlyAccessHandler';

// Synthetic fixtures only; none of this corresponds to a real applicant.
const CONTACT_CANARY = {
  email: 'contact-recovery-canary@example.test',
  name: 'Carla Contact Canary',
  labName: 'Canary Diagnostics Contact Lab',
  phone: '555-010-9001',
  message: 'Please call me at 555-010-9001, ask for Carla.',
};

const WAITLIST_CANARY = {
  email: 'waitlist-recovery-canary@example.test',
  name: 'Wendy Waitlist Canary',
  labName: 'Canary Labs Waitlist LLC',
  // Free text impersonating a name + phone number, smuggled through `source`.
  source: 'Wendy Waitlist Canary 555-020-8002',
};

const EARLY_ACCESS_CANARY = {
  email: 'early-access-recovery-canary@example.test',
  contactName: 'Eve Early Access Canary',
  labName: 'Canary Diagnostics Early Lab',
  painPoint: 'Reach me at 555-030-7003, ask for Eve.',
};

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function captureConsoleError(run: () => Promise<unknown>): Promise<unknown[][]> {
  const logs: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { logs.push(args); };
  try {
    await run();
  } finally {
    console.error = original;
  }
  return logs;
}

function recoveryLogPayload(logs: unknown[][], tag: string): unknown {
  const recovery = logs.filter((args) => String(args[0]).includes(tag));
  assert.equal(recovery.length, 1, `expected exactly one ${tag} log entry`);
  return recovery[0][1];
}

function assertNoneLeaked(serialized: string, canaries: Record<string, string>) {
  for (const [field, value] of Object.entries(canaries)) {
    assert.ok(!serialized.includes(value), `recovery log leaked submitted ${field}: ${value}`);
  }
}

test('contact recovery log redacts name, lab name, phone, and free-text message when both sinks fail', async () => {
  // No Supabase/Resend credentials are configured in this environment, so both
  // durable sinks fail without any mocking — exercising the real LEAD-RECOVERY path.
  const logs = await captureConsoleError(() => contactPost(post('https://lims.bot/api/contact', {
    name: CONTACT_CANARY.name,
    labName: CONTACT_CANARY.labName,
    email: CONTACT_CANARY.email,
    phone: CONTACT_CANARY.phone,
    message: CONTACT_CANARY.message,
  })));

  const payload = recoveryLogPayload(logs, '[contact] LEAD-RECOVERY');
  const serialized = JSON.stringify(payload);
  assertNoneLeaked(serialized, {
    email: CONTACT_CANARY.email,
    name: CONTACT_CANARY.name,
    labName: CONTACT_CANARY.labName,
    phone: CONTACT_CANARY.phone,
    message: CONTACT_CANARY.message,
  });
});

test('waitlist recovery log redacts email, name, lab name, and a free-text source canary when both sinks fail', async () => {
  const handler = createWaitlistPostHandler({
    hasExistingSignup: async () => false,
    createProspect: async () => { throw new Error('synthetic db outage'); },
    sendSubmissionNotice: async () => { throw new Error('synthetic notify outage'); },
    sendApplicantConfirmation: async () => {},
    now: () => '2026-10-02T00:00:00.000Z',
  });

  const logs = await captureConsoleError(() => handler(post('https://lims.bot/api/waitlist', {
    email: WAITLIST_CANARY.email,
    name: WAITLIST_CANARY.name,
    labName: WAITLIST_CANARY.labName,
    source: WAITLIST_CANARY.source,
  })));

  const payload = recoveryLogPayload(logs, '[waitlist] LEAD-RECOVERY');
  const serialized = JSON.stringify(payload);
  assertNoneLeaked(serialized, {
    email: WAITLIST_CANARY.email,
    name: WAITLIST_CANARY.name,
    labName: WAITLIST_CANARY.labName,
    source: WAITLIST_CANARY.source,
  });
});

test('early-access recovery log redacts name, lab name, and free-text pain point when both sinks fail', async () => {
  const handler = createEarlyAccessPostHandler({
    createProspect: async () => { throw new Error('synthetic db outage'); },
    sendSubmissionNotice: async () => { throw new Error('synthetic notify outage'); },
    sendApplicantConfirmation: async () => {},
    now: () => '2026-10-02T00:00:00.000Z',
  });

  const logs = await captureConsoleError(() => handler(post('https://lims.bot/api/early-access', {
    labName: EARLY_ACCESS_CANARY.labName,
    labType: 'Research / Academic',
    contactName: EARLY_ACCESS_CANARY.contactName,
    email: EARLY_ACCESS_CANARY.email,
    monthlyVolume: 'under-100',
    painPoint: EARLY_ACCESS_CANARY.painPoint,
    dataUseAccepted: true,
  })));

  const payload = recoveryLogPayload(logs, '[early-access] LEAD-RECOVERY');
  const serialized = JSON.stringify(payload);
  // The raw email is intentionally retained here (not masked) so the lead can still
  // be reached manually — tests/security/safe-log.test.ts pins this exact behavior.
  // Only the name, lab name, and free-text pain point must be absent.
  assertNoneLeaked(serialized, {
    name: EARLY_ACCESS_CANARY.contactName,
    labName: EARLY_ACCESS_CANARY.labName,
    painPoint: EARLY_ACCESS_CANARY.painPoint,
  });
});

// Static check: a handler could satisfy the runtime assertions above by coincidence
// (e.g. if a canary happens not to collide with any field) while still logging the
// raw record. Pin the actual source shape so reverting the redaction call — even
// while leaving the `leadLogMeta` import in place — fails this test.
test('every LEAD-RECOVERY console call is fed by an actual leadLogMeta(...) call, not just the raw record', () => {
  for (const path of ['app/api/contact/route.ts', 'lib/waitlistHandler.ts', 'lib/earlyAccessHandler.ts']) {
    const text = readFileSync(path, 'utf8');
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);

    // identifier -> { calls made directly in its initializer, identifier its initializer just aliases (if any) }
    const declarations = new Map<string, { calls: ts.CallExpression[]; alias?: string }>();
    const recoveryArgIdentifiers: string[] = [];

    function collectCallExpressions(node: ts.Node, out: ts.CallExpression[]) {
      if (ts.isCallExpression(node)) out.push(node);
      ts.forEachChild(node, (child) => collectCallExpressions(child, out));
    }

    function visit(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const calls: ts.CallExpression[] = [];
        collectCallExpressions(node.initializer, calls);
        const alias = ts.isIdentifier(node.initializer) ? node.initializer.text : undefined;
        declarations.set(node.name.text, { calls, alias });
      }
      if (ts.isCallExpression(node) && /^console\.(log|error|warn)$/.test(node.expression.getText(source))) {
        const firstArg = node.arguments[0];
        const tagged = firstArg !== undefined && /LEAD-RECOVERY/.test(firstArg.getText(source));
        if (tagged) {
          const second = node.arguments[1];
          if (second && ts.isIdentifier(second)) {
            recoveryArgIdentifiers.push(second.text);
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);

    assert.equal(recoveryArgIdentifiers.length, 1, `${path}: expected exactly one bare-identifier LEAD-RECOVERY log argument`);
    const [identifier] = recoveryArgIdentifiers;

    // Follow any chain of `const x = y;` aliasing (e.g. a block-scoped shadow of `record`
    // reassigned from a redaction result computed just above it) back to its source calls.
    function resolveCalls(name: string, seen: Set<string>): ts.CallExpression[] {
      if (seen.has(name)) return [];
      seen.add(name);
      const entry = declarations.get(name);
      if (!entry) return [];
      return entry.alias ? [...entry.calls, ...resolveCalls(entry.alias, seen)] : entry.calls;
    }
    const calls = resolveCalls(identifier, new Set());
    const callsLeadLogMeta = calls.some((call) => /(^|\.)leadLogMeta$/.test(call.expression.getText(source)));
    assert.ok(
      callsLeadLogMeta,
      `${path}: '${identifier}' passed to the LEAD-RECOVERY log must be produced by calling leadLogMeta(...), not merely importing it`,
    );
  }
});
