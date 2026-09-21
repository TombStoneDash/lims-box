import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SampleDetailPage from '../app/senaite-demo/samples/[id]/page';
import { featuredSample, sampleAuditTrail, sampleResults } from '../lib/demo-data';

// tsx uses the classic JSX runtime for this repository's jsx: preserve setting.
Object.assign(globalThis, { React });

test('supported sample ID renders its synthetic detail and dashboard breadcrumb', async () => {
  const page = await SampleDetailPage({ params: Promise.resolve({ id: featuredSample.id }) });
  const markup = renderToStaticMarkup(page);

  assert.ok(markup.includes(`Sample ${featuredSample.id}`));
  assert.ok(markup.includes(featuredSample.clientName));
  assert.ok(markup.includes(featuredSample.status));
  assert.match(markup, /href="\/senaite-demo"/);
  assert.match(markup, /Dashboard/);
  for (const result of sampleResults) {
    assert.ok(markup.includes(result.analyte));
    assert.ok(markup.includes(`${result.result} ${result.unit}`));
  }
  for (const entry of sampleAuditTrail) {
    assert.ok(markup.includes(entry.action));
    assert.ok(markup.includes(entry.userName));
    assert.ok(markup.includes(entry.reason));
  }
});

for (const id of ['SA-2026-0848', 'unknown-sample']) {
  test(`unsupported sample ID ${id} throws Next's not-found signal`, async () => {
    await assert.rejects(
      SampleDetailPage({ params: Promise.resolve({ id }) }),
      { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' },
    );
  });
}
