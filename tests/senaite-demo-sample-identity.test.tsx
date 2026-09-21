import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SampleDetailPage from '../app/senaite-demo/samples/[id]/page';
import { featuredSample, sampleResults } from '../lib/demo-data';

// tsx uses the classic JSX runtime for this repository's preserved JSX.
Object.assign(globalThis, { React });

test('supported sample renders its identity, evidence, and dashboard breadcrumb', async () => {
  const page = await SampleDetailPage({ params: Promise.resolve({ id: featuredSample.id }) });
  const markup = renderToStaticMarkup(page);

  assert.ok(markup.includes(`Sample ${featuredSample.id}`));
  assert.ok(markup.includes(featuredSample.clientName));
  assert.match(markup, /href="\/senaite-demo"/);
  assert.match(markup, /Dashboard/);
  for (const result of sampleResults) {
    assert.ok(markup.includes(result.analyte));
    assert.ok(markup.includes(`${result.result} ${result.unit}`));
  }
  assert.match(markup, /Audit Trail/);
  assert.match(markup, /Chain of Custody/);
});

test('unknown sample takes the Next.js not-found path before rendering evidence', async () => {
  await assert.rejects(
    async () => renderToStaticMarkup(await SampleDetailPage({
      params: Promise.resolve({ id: 'not-a-sample' }),
    })),
    { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' },
  );
});
