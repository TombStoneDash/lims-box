import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildConversionCounts } from '../../lib/admin/conversionReport';

test('aggregates approved campaign dimensions without exposing raw records', () => {
  const result = buildConversionCounts([
    {
      source: 'lims.bot/early-adopter;utm_source=cola2026;utm_medium=qr;utm_campaign=cola_forum_2026',
      applications: 3,
    },
    {
      source: 'lims.bot/early-adopter;utm_source=cola2026;utm_medium=qr;utm_campaign=cola_forum_2026',
      applications: 2,
    },
    { source: 'contact_form', applications: 4 },
  ]);

  assert.deepEqual(result, [
    {
      source: 'cola2026',
      campaign: 'cola_forum_2026',
      medium: 'qr',
      content: null,
      applications: 5,
    },
    {
      source: 'contact_form',
      campaign: null,
      medium: null,
      content: null,
      applications: 4,
    },
  ]);
});

test('redacts unknown, malformed, or potentially identifying source values', () => {
  const result = buildConversionCounts([
    { source: 'name@example.com', applications: 2 },
    { source: 'custom customer name', applications: 3 },
    { source: 'webinar:private-session-id', applications: 1 },
    { source: null, applications: 4 },
  ]);

  assert.deepEqual(result, [
    {
      source: 'other',
      campaign: null,
      medium: null,
      content: null,
      applications: 5,
    },
    {
      source: 'unattributed',
      campaign: null,
      medium: null,
      content: null,
      applications: 4,
    },
    {
      source: 'webinar',
      campaign: null,
      medium: null,
      content: null,
      applications: 1,
    },
  ]);
  assert.equal(JSON.stringify(result).includes('@'), false);
  assert.equal(JSON.stringify(result).includes('private-session-id'), false);
});

test('ignores invalid counts instead of corrupting aggregate proof', () => {
  const result = buildConversionCounts([
    { source: 'contact_form', applications: -1 },
    { source: 'contact_form', applications: Number.NaN },
    { source: 'contact_form', applications: 2 },
  ]);

  assert.equal(result[0]?.applications, 2);
});

test('route is admin-gated and returns aggregate fields only', async () => {
  const [route, middleware] = await Promise.all([
    readFile('app/api/admin/conversion-report/route.ts', 'utf8'),
    readFile('middleware.ts', 'utf8'),
  ]);

  assert.match(route, /prisma\.prospect\.groupBy/);
  assert.match(route, /by:\s*\['source'\]/);
  assert.doesNotMatch(route, /\b(name|email|labName|painPoint)\s*:/);
  assert.match(route, /Cache-Control': 'private, no-store'/);
  assert.match(route, /runtime_logs_only/);
  assert.match(middleware, /pathname\.startsWith\('\/api\/admin'\)/);
  assert.match(middleware, /matcher:[\s\S]*'\/api\/admin\/:path\*'/);
});
