import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SampleDetailPage from '../app/senaite-demo/samples/[id]/page';
import { featuredSample, sampleAuditTrail } from '../lib/demo-data';

// tsx uses the classic JSX runtime for this repository's preserved JSX.
Object.assign(globalThis, { React });

test('audit timestamp cells display UTC with seconds and retain the UTC label', async () => {
  const page = await SampleDetailPage({ params: Promise.resolve({ id: featuredSample.id }) });
  const markup = renderToStaticMarkup(page);
  const auditTable = [...markup.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/g)]
    .map(([table]) => table)
    .find(table => /<th\b[^>]*>Timestamp<\/th>/.test(table));
  assert.ok(auditTable, 'audit table is rendered');

  const timestampCells = [...auditTable.matchAll(/<tr\b[^>]*>\s*<td\b[^>]*>([^<]*)<\/td>/g)]
    .map(([, timestamp]) => timestamp.trim());
  const expectedTimestamps = sampleAuditTrail.map(entry =>
    new Date(entry.timestamp).toLocaleString('en-US', {
      timeZone: 'UTC',
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }),
  );

  assert.equal(timestampCells.length, sampleAuditTrail.length);
  assert.deepEqual(timestampCells, expectedTimestamps);
  for (const timestamp of timestampCells) {
    assert.match(timestamp, /\d{2}:\d{2}:\d{2} (AM|PM)$/);
  }
  assert.match(markup, /All timestamps UTC/);
});
