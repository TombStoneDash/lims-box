import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SampleDetailPage from '../app/senaite-demo/samples/[id]/page';
import { featuredSample, sampleAuditTrail } from '../lib/demo-data';

// tsx uses the classic JSX runtime for this repository's preserved JSX.
Object.assign(globalThis, { React });

async function assertAuditTimes(expected: string[]) {
  const originalTZ = process.env.TZ;
  const renderedTimes: string[][] = [];
  try {
    for (const timeZone of ['UTC', 'America/Los_Angeles']) {
      process.env.TZ = timeZone;
      const markup = renderToStaticMarkup(await SampleDetailPage({
        params: Promise.resolve({ id: featuredSample.id }),
      }));
      const auditMarkup = markup.slice(markup.indexOf('Audit Trail'));
      const timestamps = [...auditMarkup.matchAll(/<tr\b[^>]*>\s*<td\b[^>]*>([^<]+)<\/td>/g)]
        .map((match) => match[1]);

      assert.match(auditMarkup, /All timestamps UTC — IP addresses logged/);
      assert.deepEqual(timestamps, expected, `audit timestamps under ${timeZone}`);
      renderedTimes.push(timestamps);
    }
    assert.deepEqual(renderedTimes[0], renderedTimes[1]);
  } finally {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  }
}

test('sample audit timestamps match the UTC label in either host timezone', async () => {
  await assertAuditTimes([
    'Apr 11, 03:32:04 PM',
    'Apr 11, 03:33:21 PM',
    'Apr 11, 03:34:02 PM',
    'Apr 11, 03:36:10 PM',
    'Apr 11, 05:02:44 PM',
    'Apr 11, 05:03:11 PM',
  ]);
});

test('sample audit preserves the UTC day near midnight', async () => {
  const entry = sampleAuditTrail[0];
  const descriptor = Object.getOwnPropertyDescriptor(entry, 'timestamp')!;
  // Mock only this timestamp in memory, restoring the original property after rendering.
  Object.defineProperty(entry, 'timestamp', { configurable: true, get: () => '2026-04-11T00:22:00Z' });
  try {
    await assertAuditTimes([
      'Apr 11, 12:22:00 AM',
      'Apr 11, 03:33:21 PM',
      'Apr 11, 03:34:02 PM',
      'Apr 11, 03:36:10 PM',
      'Apr 11, 05:02:44 PM',
      'Apr 11, 05:03:11 PM',
    ]);
  } finally {
    Object.defineProperty(entry, 'timestamp', descriptor);
  }
});
