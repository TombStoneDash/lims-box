import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import SamplesPage from '../../app/pilot/ohworks/samples/page';
import { explainAccessionBlock } from '../../lib/ohworks-accession-workflow';

// The page is compiled with the classic JSX runtime under tsx, so expose React globally.
(globalThis as { React?: typeof React }).React = React;

async function render(role: string): Promise<string> {
  const element = await SamplesPage({ searchParams: Promise.resolve({ role }) });
  return renderToStaticMarkup(element);
}

function queueRow(markup: string, sampleId: string): string {
  const start = markup.indexOf(`data-accession-sample="${sampleId}"`);
  assert.ok(start >= 0, `missing queue row for ${sampleId}`);
  return markup.slice(start, markup.indexOf('</tr>', start));
}

test('samples page imports the shared accession workflow primitive', () => {
  const source = readFileSync(new URL('../../app/pilot/ohworks/samples/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /from '@\/lib\/ohworks-accession-workflow'/);
  assert.match(source, /runAccessionWorkflow\(/);
  assert.match(source, /applyAccessionEvent\(/);
});

test('accession queue shows stable states and allowed next actions for an acting role', async () => {
  const markup = await render('reviewer');
  assert.match(markup, /Accession queue \(fabricated samples\)/);

  const received = queueRow(markup, 'sample-synthetic-queue-01');
  assert.match(received, />RECEIVED</);
  assert.match(received, /accession, hold, reject, cancel/);

  const held = queueRow(markup, 'sample-synthetic-queue-02');
  assert.match(held, />HOLD</);
  assert.match(held, /accession, reject, cancel/);
  assert.match(held, /On hold: missing-requisition/);

  const accessioned = queueRow(markup, 'sample-synthetic-queue-03');
  assert.match(accessioned, />ACCESSIONED</);
  assert.match(accessioned, /None \(terminal state\)/);
});

test('accession queue refuses an invalid transition and keeps the prior state', async () => {
  const markup = await render('reviewer');
  const rejected = queueRow(markup, 'sample-synthetic-queue-04');
  assert.match(rejected, />REJECTED</);
  assert.doesNotMatch(rejected, />ACCESSIONED</);
  assert.ok(rejected.includes(`Refused: ${explainAccessionBlock('terminal-state')}`));
});

test('employer view is read-only and hides hold and refusal reasons', async () => {
  const markup = await render('employer');
  for (const sampleId of ['sample-synthetic-queue-02', 'sample-synthetic-queue-04']) {
    const row = queueRow(markup, sampleId);
    assert.match(row, /Read-only for this role/);
    assert.match(row, /Hidden for this role/);
    assert.doesNotMatch(row, /missing-requisition|Refused:/);
  }
});

test('admin observer sees reasons but cannot act', async () => {
  const row = queueRow(await render('admin'), 'sample-synthetic-queue-02');
  assert.match(row, /Read-only for this role/);
  assert.match(row, /On hold: missing-requisition/);
});

test('accession queue keeps explicit synthetic labeling and claims no live write', async () => {
  const markup = await render('worker');
  assert.match(markup, /Synthetic samples only\./);
  assert.match(markup, /no SENAITE connection and performs no writes/);
  for (const sampleId of ['01', '02', '03', '04']) {
    assert.match(markup, new RegExp(`sample-synthetic-queue-${sampleId}`));
  }
});
