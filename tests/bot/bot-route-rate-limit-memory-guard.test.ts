import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '../../app/api/bot/route';

function requestFrom(ip: string) {
  return new NextRequest('http://localhost/api/bot', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ question: 'What is LIMS BOX?' }),
  });
}

test('a limited address stays limited after 10,000 other addresses are seen, but a fresh address and an expired window are still allowed', async (t) => {
  t.mock.method(console, 'info', () => {});
  t.mock.method(console, 'warn', () => {});

  const limitedIp = '203.0.113.7';

  let lastStatus = 0;
  for (let i = 0; i < 21; i += 1) {
    const response = await POST(requestFrom(limitedIp));
    lastStatus = response.status;
  }
  assert.equal(lastStatus, 429, 'the 21st request from the same address should be rate limited');

  for (let i = 0; i < 10_000; i += 1) {
    const response = await POST(requestFrom(`198.51.100.${i}`));
    assert.equal(response.status, 200, `address #${i} should not be rate limited`);
  }

  const stillLimited = await POST(requestFrom(limitedIp));
  assert.equal(
    stillLimited.status,
    429,
    'the originally limited address must remain limited despite the memory guard running for 10,000 other addresses',
  );

  const freshIp = '198.51.100.99999';
  const freshResponse = await POST(requestFrom(freshIp));
  assert.equal(freshResponse.status, 200, 'a brand new address should still be allowed');

  const expiringIp = '203.0.113.200';
  const realDateNow = Date.now;
  const dateNowMock = t.mock.method(Date, 'now', () => realDateNow());

  for (let i = 0; i < 21; i += 1) {
    await POST(requestFrom(expiringIp));
  }
  const blocked = await POST(requestFrom(expiringIp));
  assert.equal(blocked.status, 429, 'the expiring address should be limited before its window elapses');

  const afterWindow = realDateNow() + 60_001;
  dateNowMock.mock.mockImplementation(() => afterWindow);

  const allowedAgain = await POST(requestFrom(expiringIp));
  assert.equal(
    allowedAgain.status,
    200,
    'once the 60s window has elapsed, the same address should be allowed again',
  );
});
