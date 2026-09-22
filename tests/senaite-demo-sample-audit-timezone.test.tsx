import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SampleDetailPage from '../app/senaite-demo/samples/[id]/page';
import { featuredSample, sampleAuditTrail } from '../lib/demo-data';

// tsx uses the classic JSX runtime for this repository's preserved JSX.
Object.assign(globalThis, { React });

test('audit timestamps render in UTC regardless of the server timezone', async () => {
  const originalTimezone = process.env.TZ;

  try {
    const timestampsByTimezone: string[][] = [];
    for (const timezone of ['UTC', 'America/Los_Angeles']) {
      process.env.TZ = timezone;
      const page = await SampleDetailPage({ params: Promise.resolve({ id: featuredSample.id }) });
      const markup = renderToStaticMarkup(page);
      const auditTable = markup.match(/<table\b[^>]*>\s*<thead>\s*<tr\b[^>]*>\s*<th\b[^>]*>Timestamp<\/th>[\s\S]*?<\/table>/)?.[0];
      assert.ok(auditTable, 'audit table is rendered');
      const timestamps = Array.from(
        auditTable.matchAll(/<tr\b[^>]*>\s*<td\b[^>]*>([^<]*)<\/td>/g),
        match => match[1].trim(),
      );

      assert.equal(timestamps.length, sampleAuditTrail.length);
      assert.match(markup, /All timestamps UTC/);
      timestampsByTimezone.push(timestamps);
    }

    assert.deepEqual(timestampsByTimezone[1], timestampsByTimezone[0]);
    // The committed first audit entry is 2026-04-11T15:32:04Z.
    assert.match(timestampsByTimezone[0][0], /^Apr 11,?\s+03:32:04\s+PM$/);
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});
