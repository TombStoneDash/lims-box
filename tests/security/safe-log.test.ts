import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { safeErrorMeta, maskEmail, leadLogMeta } from '../../lib/safeLog';
import { NotificationDeliveryError } from '../../lib/notify';
import { createEarlyAccessPostHandler } from '../../lib/earlyAccessHandler';

const canaries = ['canary.person@example.com', 'SECRET-CANARY-123'];
function failure() {
  const error = new Error(canaries.join(' '));
  error.stack = canaries.join('\n');
  return Object.assign(error, { code: 'P2002', httpStatus: 503, cause: canaries });
}
function assertNoCanaries(value: unknown) {
  for (const canary of canaries) assert.ok(!JSON.stringify(value).includes(canary));
}

test('safe errors expose only allowed metadata, never message, stack or cause', () => {
  assert.deepEqual(safeErrorMeta(failure()), { errorName: 'Error', errorCode: 'P2002', httpStatus: 503 });
  assertNoCanaries(safeErrorMeta(failure()));
  for (const code of ['', 'x'.repeat(41), 'has spaces', 'person@example.com', 42]) {
    assert.deepEqual(safeErrorMeta({ code }), { errorName: 'object' });
  }
  for (const httpStatus of [99, 600, 200.5, '200', NaN, Infinity]) {
    assert.deepEqual(safeErrorMeta({ httpStatus }), { errorName: 'object' });
  }
  for (const httpStatus of [100, 599]) assert.equal(safeErrorMeta({ httpStatus }).httpStatus, httpStatus);
  for (const value of [null, undefined, 'private text', 42, false]) {
    assert.deepEqual(safeErrorMeta(value), { errorName: typeof value });
  }
  assert.deepEqual(safeErrorMeta({ get name() { throw failure(); } }), { errorName: 'object' });
  assert.deepEqual(safeErrorMeta(new NotificationDeliveryError('submission_notice', 'provider_error', 'fallback', 502)), {
    errorName: 'NotificationDeliveryError', httpStatus: 502, reason: 'provider_error', stage: 'fallback',
  });
  assert.deepEqual(safeErrorMeta({ name: 'CustomError', reason: 'private', stage: 'private' }), { errorName: 'CustomError' });
});

test('email masking rejects malformed input', () => {
  assert.equal(maskEmail('jane@example.com'), 'j***@example.com');
  assert.equal(maskEmail('j@example.co.uk'), 'j***@example.co.uk');
  for (const value of [null, undefined, 12, '', 'bad', 'a@@example.com', 'a@localhost', 'a b@example.com', 'a@example.com\n', '.a@example.com', 'a@-example.com']) {
    assert.equal(maskEmail(value), '[redacted]');
  }
});

test('lead metadata contains only the allowlist and no raw contact fields', () => {
  const record = { email: canaries[0], name: 'Private Person', labName: 'Private Lab', phone: '555-123-4567', message: canaries[1], instruments: 'Private Instrument', source: 'lims.bot/contact', timestamp: '2026-09-19T00:00:00.000Z' };
  const meta = leadLogMeta(record);
  assert.deepEqual(meta, { emailMasked: 'c***@example.com', hasName: true, hasLabName: true, hasMessage: true, hasPhone: true, source: record.source, timestamp: record.timestamp });
  for (const key of ['email', 'name', 'labName', 'phone', 'message', 'instruments']) assert.ok(!JSON.stringify(meta).includes(record[key]));
  for (const source of ['', 'x'.repeat(61), 'bad@email', 42]) assert.equal(leadLogMeta({ source }).source, null);
  assert.deepEqual(leadLogMeta({}), { emailMasked: '[redacted]', hasName: false, hasLabName: false, hasMessage: false, hasPhone: false, source: null, timestamp: null });
  assert.equal(leadLogMeta({ timestamp: canaries[1] }).timestamp, null);
});

test('route console arguments never contain bare errors or records outside recovery', () => {
  for (const path of ['app/api/contact/route.ts', 'lib/waitlistHandler.ts', 'lib/earlyAccessHandler.ts']) {
    const text = readFileSync(path, 'utf8');
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    let recoveries = 0;
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && /^console\.(log|error|warn)$/.test(node.expression.getText(source))) {
        for (const arg of node.arguments) {
          if (ts.isIdentifier(arg)) {
            assert.ok(!/^(err|dbErr|dbError|notifyErr|emailErr|error)$/.test(arg.text), `${path}: raw error`);
            if (arg.text === 'record') {
              const line = source.getLineAndCharacterOfPosition(arg.getStart(source)).line;
              assert.match(text.split('\n')[line], /LEAD-RECOVERY/);
              recoveries++;
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.equal(recoveries, 1, path);
  }
});

const application = {
  labName: 'Synthetic Lab', labType: 'Environmental / Water Testing', contactName: 'Synthetic Person',
  email: 'synthetic@example.com', monthlyVolume: '100-500', painPoint: 'Synthetic workflow',
  dataUseAccepted: true, source: 'lims.bot/early-adopter',
};

test('early-access failures preserve baseline response bytes and send ordering without error canaries', async () => {
  for (const [dbFails, noticeFails] of [[false, false], [true, false], [false, true], [true, true]]) {
    const calls: string[] = [];
    const logs: unknown[][] = [];
    const handler = createEarlyAccessPostHandler({
      createProspect: async () => { calls.push('db'); if (dbFails) throw failure(); },
      sendSubmissionNotice: async () => { calls.push('notice'); if (noticeFails) throw failure(); },
      sendApplicantConfirmation: async () => { calls.push('confirmation'); throw failure(); },
      now: () => '2026-09-19T00:00:00.000Z',
    });
    const original = console.error;
    console.error = (...args) => { logs.push(args); };
    try {
      const response = await handler(new NextRequest('https://lims.bot/api/early-access', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(application) }));
      const bothFailed = dbFails && noticeFails;
      assert.equal(response.status, bothFailed ? 500 : 200);
      assert.equal(await response.text(), bothFailed ? '{"error":"Failed to process application"}' : `{"success":true,"saved":${!dbFails}}`);
      assert.deepEqual(calls, bothFailed ? ['db', 'notice'] : ['db', 'notice', 'confirmation']);
      assertNoCanaries(logs);
      const recovery = logs.filter(args => String(args[0]).includes('LEAD-RECOVERY'));
      assert.equal(recovery.length, bothFailed ? 1 : 0);
      if (bothFailed) assert.equal((recovery[0][1] as Record<string, unknown>).email, application.email);
    } finally {
      console.error = original;
    }
  }
});
