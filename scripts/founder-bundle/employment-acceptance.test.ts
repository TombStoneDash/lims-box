// Separate acceptance gate: the supplied archive has no Developer passage.
// Run with node --import tsx --test scripts/founder-bundle/employment-acceptance.test.ts
// Do not mark this gate complete until an approved source supports the answer.
import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '../../app/api/demo/assistant/route';
import { loadFounderFactIndex } from '../../lib/bot/founder-corpus';

test('Where did Hudson Taylor work as Senior LIMS Developer?', async () => {
  const response = await POST(new NextRequest('https://lims.bot/api/demo/assistant', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'Where did Hudson Taylor work as Senior LIMS Developer?' }),
  }));
  const result = await response.json();
  assert.equal(result?.grounded, true, 'Required employment evidence is absent from the supplied ingest');
  assert.ok(result.sources.length > 0);
  assert.ok(loadFounderFactIndex().some((fact) =>
    result.answer === `Founder archive (historical experience): ${fact.text}` &&
    result.sources.some((source: { path: string }) => source.path === fact.source)));
});
