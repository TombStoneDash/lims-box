import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SampleDetailPage from '../app/senaite-demo/samples/[id]/page';
import { featuredSample, sampleAuditTrail } from '../lib/demo-data';

// tsx uses the classic JSX runtime for this repository's preserved JSX.
Object.assign(globalThis, { React });

test('audit timestamps and UTC explanation are identical across host timezones', async () => {
  const originalTZ = process.env.TZ;
  try {
    const timestampsByZone: string[][] = [];
    for (const timeZone of ['UTC', 'America/Los_Angeles']) {
      process.env.TZ = timeZone;
      assert.equal(new Date('2026-04-11T15:32:04Z').getHours(), timeZone === 'UTC' ? 15 : 8);

      const page = await SampleDetailPage({ params: Promise.resolve({ id: featuredSample.id }) });
      const markup = renderToStaticMarkup(page);
      assert.ok(markup.includes('All timestamps UTC — IP addresses logged'));

      const auditMarkup = markup.split('Audit Trail')[1];
      assert.ok(auditMarkup, 'the actual page renders its audit trail');
      const timestamps = Array.from(
        auditMarkup.matchAll(/<tr\b[^>]*>\s*<td\b[^>]*>([^<]+)<\/td>/g),
        match => match[1].trim(),
      );
      assert.equal(timestamps.length, sampleAuditTrail.length);
      timestampsByZone.push(timestamps);
    }

    assert.deepEqual(timestampsByZone[1], timestampsByZone[0]);
    const fixtureIndex = sampleAuditTrail.findIndex(entry => entry.timestamp === '2026-04-11T15:32:04Z');
    assert.notEqual(fixtureIndex, -1);
    // The existing en-US 12-hour display of 15:32:04 UTC retains seconds.
    assert.equal(timestampsByZone[0][fixtureIndex], 'Apr 11, 03:32:04 PM');
  } finally {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  }
});
