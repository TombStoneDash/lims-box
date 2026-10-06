import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '../../app/api/demo/assistant/route';
import { loadFounderFactIndex } from '../../lib/bot/founder-corpus';

test('the shipped archive answers its evidenced LIMS Administrator fact', async () => {
  const fact = loadFounderFactIndex().find((entry) => entry.text.includes('LIMS (Laboratory Information Management System) Administrator'));
  assert.ok(fact, 'the supplied material contains the Administrator role');
  const response = await POST(new NextRequest('https://lims.bot/api/demo/assistant', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: `Show founder fact ${fact.id}.` }),
  }));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result?.grounded, true);
  assert.equal(result.answer, `Founder archive (historical experience): ${fact.text}`);
  assert.ok(result.sources.length > 0);
  assert.ok(loadFounderFactIndex().some((fact) =>
    result.answer === `Founder archive (historical experience): ${fact.text}` &&
    result.sources.some((source: { path: string }) => source.path === fact.source)));
});
