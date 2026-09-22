import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DemoEvidenceLibrary } from '../../app/demo/assistant/demo-evidence-library';
import catalog from '../../data/synthetic/tests.json';

function testCard(markup: string, code: string) {
  const card = [...markup.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)]
    .map(([html]) => html)
    .filter((html) => html.includes(`id="synthetic-test-${code.toLowerCase()}"`));
  assert.equal(card.length, 1, `Expected one evidence card for ${code}`);
  return card[0];
}

test('each catalog card renders its own per-matrix container evidence and existing details', () => {
  const markup = renderToStaticMarkup(<DemoEvidenceLibrary />);
  assert.match(markup, /fixtures, not patient, client, or production data/);

  for (const entry of catalog) {
    const card = testCard(markup, entry.code);
    const details = renderToStaticMarkup(<p>
      {entry.name} · {entry.discipline} · matrices {entry.valid_matrices.join(', ')} · turnaround {entry.turnaround_hours} hours
    </p>).replace(/^<p>|<\/p>$/g, '');
    assert.ok(card.includes(details), `${entry.code}: existing catalog details`);
    const rows = [...card.matchAll(/<li>(.*?)<\/li>/g)].map(([, text]) => text);
    assert.deepEqual(rows, entry.containers_per_test.map(({ matrix, quantity, type }) =>
      `${matrix}: ${quantity} × ${type}`), entry.code);
  }

  assert.ok(testCard(markup, 'CHEM-ALT').includes('serum: 1 × SST'));
  const multiMatrixCard = testCard(markup, 'CHEM-GLU');
  for (const row of ['serum: 1 × SST', 'plasma: 1 × EDTA', 'urine: 1 × STERILE_CUP']) {
    assert.ok(multiMatrixCard.includes(row), row);
  }
});

test('an isolated empty-requirements fixture shows missing evidence without inventing containers', () => {
  const require = createRequire(import.meta.url);
  const catalogPath = require.resolve('../../data/synthetic/tests.json');
  const componentPath = require.resolve('../../app/demo/assistant/demo-evidence-library');
  const originalCatalog = require.cache[catalogPath]!;
  const originalComponent = require.cache[componentPath];
  const emptyEntry = { ...catalog.find((entry) => entry.code === 'CHEM-ALT')!, containers_per_test: [] };

  try {
    // Replace only the module export; never mutate the shared committed fixture.
    require.cache[catalogPath] = { ...originalCatalog, exports: [emptyEntry] };
    delete require.cache[componentPath];
    const { DemoEvidenceLibrary: MockedLibrary } = require(componentPath);
    const card = testCard(renderToStaticMarkup(<MockedLibrary />), emptyEntry.code);
    assert.match(card, /No container requirement evidence recorded in the synthetic catalog\./);
    assert.doesNotMatch(card, /<li>|SST|EDTA|×/);
  } finally {
    require.cache[catalogPath] = originalCatalog;
    if (originalComponent) require.cache[componentPath] = originalComponent;
    else delete require.cache[componentPath];
  }

  assert.ok(testCard(renderToStaticMarkup(<DemoEvidenceLibrary />), 'CHEM-ALT').includes('serum: 1 × SST'));
});
