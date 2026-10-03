import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { QCAnalyte } from '../lib/demo-data';

// tsx uses the classic JSX runtime for this repository's preserved JSX.
Object.assign(globalThis, { React });

const require = createRequire(import.meta.url);
const dataPath = require.resolve('../lib/demo-data');
const pagePath = require.resolve('../app/senaite-demo/page');
const detailPath = require.resolve('../app/senaite-demo/qc/page');
const fixtures = require(dataPath);

function analyte(results: number[], overrides: Partial<QCAnalyte> = {}): QCAnalyte {
  return {
    name: 'Test analyte', unit: 'mg/L', mean: 10, sd: 1, controlLot: 'TEST',
    runs: results.map((result, index) => ({ date: `2026-01-${14 + index}`, result })),
    ...overrides,
  };
}

function checkCard(data: QCAnalyte[] | undefined, runs: number, flags: number, rate: string, color: string) {
  const originals = new Map([dataPath, pagePath, detailPath].map(path => [path, require.cache[path]]));
  try {
    if (data !== undefined) {
      require.cache[dataPath] = {
        ...originals.get(dataPath), exports: { ...fixtures, allQCData: data },
      } as NodeModule;
    }
    delete require.cache[pagePath];
    delete require.cache[detailPath];
    const Dashboard = require(pagePath).default;
    const Detail = require(detailPath).default;
    const markup = renderToStaticMarkup(<Dashboard />);
    const card = markup.match(/<a href="\/senaite-demo\/qc">[\s\S]*?<\/a>/)?.[0];
    assert.ok(card, 'render the linked QC card');
    assert.match(card, new RegExp(`text-3xl[^>]*>${runs}</p>`));
    assert.ok(card.includes(`${rate} pass rate — ${flags} out-of-range`));
    assert.ok(card.includes(`p-2 rounded-lg ${color}`));
    const detail = renderToStaticMarkup(<Detail />);
    assert.ok(detail.includes(`${runs} total QC runs — ${rate} pass rate — ${flags} out-of-range flags`),
      'dashboard counts and pass rate agree with the rendered detail page');
    if (rate === 'N/A') {
      assert.match(card, /QC data unavailable or invalid/);
      assert.doesNotMatch(card, /\d+(?:\.\d+)?% pass rate|bg-green-500|NaN|Infinity/);
    } else {
      assert.doesNotMatch(card, /unavailable|invalid/);
    }
  } finally {
    for (const [path, original] of originals) {
      if (original) require.cache[path] = original;
      else delete require.cache[path];
      assert.equal(require.cache[path], original, 'restore each module cache entry');
    }
  }
}

test('committed QC data renders a passing card matching the detail page', () => {
  checkCard(undefined, 360, 0, '100.0%', 'bg-green-500');
});

test('a failed run replaces the hard-coded passing claim', () => {
  checkCard([analyte([20])], 1, 1, '0.0%', 'bg-red-500');
});

test('mixed passing and failing results use run counts and detail-page rounding', () => {
  checkCard([analyte([10, 11]), analyte([13], { name: 'Threshold failure' })],
    3, 1, '66.7%', 'bg-red-500');
});

test('synthetic passing results use the current dataset count', () => {
  checkCard([analyte([10, 11])], 2, 0, '100.0%', 'bg-green-500');
});

test('empty datasets and empty runs show unavailable QC information', () => {
  checkCard([], 0, 0, 'N/A', 'bg-amber-500');
  checkCard([analyte([])], 0, 0, 'N/A', 'bg-amber-500');
});

test('invalid numeric inputs never display a passing percentage', () => {
  for (const invalid of [
    analyte([NaN]), analyte([Infinity]), analyte([-Infinity]),
    analyte([10], { mean: NaN }), analyte([10], { mean: Infinity }),
    analyte([10], { sd: NaN }), analyte([10], { sd: Infinity }),
    analyte([10], { sd: 0 }), analyte([10], { sd: -1 }),
  ]) {
    checkCard([invalid], 1, 0, 'N/A', 'bg-amber-500');
    checkCard([analyte([10, 20], { name: 'Valid' }), invalid], 3, 1, 'N/A', 'bg-amber-500');
  }
});

test('fixture mocks leave committed data intact', () => {
  checkCard(undefined, 360, 0, '100.0%', 'bg-green-500');
});
