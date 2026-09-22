import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '../../app/api/newsletter/route';

test('unconfigured newsletter returns a retry error without saving or exposing the address', async (t) => {
  const originalApiKey = process.env.RESEND_API_KEY;
  t.after(() => {
    if (originalApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalApiKey;
    }
    t.mock.restoreAll();
  });
  delete process.env.RESEND_API_KEY;

  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected external call');
  });
  const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
    t.mock.method(console, method, () => {})
  );
  const email = 'newsletter-regression@example.com';
  const response = await POST(new NextRequest('http://localhost/api/newsletter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  }));
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(Object.hasOwn(body, 'deferred'), false);
  assert.deepEqual(body, {
    error: 'Email service temporarily unavailable. Please try again later.',
  });
  assert.doesNotMatch(JSON.stringify(body), /recorded|saved|queued|processed|automatically/i);
  assert.equal(fetchMock.mock.callCount(), 0);

  const logged = JSON.stringify(logs.flatMap((log) =>
    log.mock.calls.map((call) => call.arguments)
  ));
  assert.ok(!logged.includes(email));
  assert.doesNotMatch(logged, /recorded|saved|queued|processed|automatically/i);
});
