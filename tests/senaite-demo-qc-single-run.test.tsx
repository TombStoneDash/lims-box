import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import QCChartsPage from '../app/senaite-demo/qc/page';
import { allQCData, type QCAnalyte, type QCRun } from '../lib/demo-data';

function renderChart(runs: QCRun[]) {
  const original = [...allQCData];
  const analyte: QCAnalyte = {
    name: 'Synthetic control', unit: 'mg/L', mean: 10, sd: 1,
    controlLot: 'SYNTHETIC-LOT', runs,
  };
  try {
    allQCData.splice(0, allQCData.length, analyte);
    const markup = renderToStaticMarkup(<QCChartsPage />);
    const chart = markup.match(/<svg\b[^>]*role="img"[^>]*>[\s\S]*?<\/svg>/)?.[0];
    assert.ok(chart, 'the synthetic analyte has a chart');
    assert.doesNotMatch(chart, /NaN|Infinity/, 'chart geometry must be finite');
    return { chart, markup };
  } finally {
    allQCData.splice(0, allQCData.length, ...original);
  }
}

function coordinates(tag: string, names: string[]) {
  return names.map(name => {
    const value = tag.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1];
    assert.ok(value, `expected ${name} coordinate`);
    assert.ok(Number.isFinite(Number(value)), `${name} must be finite`);
    return Number(value);
  });
}

test('one run has a finite, centered path, point, and date label', () => {
  const { chart } = renderChart([{ date: '2026-01-14', result: 10 }]);
  assert.match(chart, /<path d="M 470\.0 105\.0"/);
  const points = [...chart.matchAll(/<circle\b[^>]*>/g)];
  assert.equal(points.length, 1);
  assert.deepEqual(coordinates(points[0][0], ['cx', 'cy']), [470, 105]);
  const labels = [...chart.matchAll(/<text\b[^>]*text-anchor="middle"[^>]*>/g)];
  assert.equal(labels.length, 1);
  assert.deepEqual(coordinates(labels[0][0], ['x', 'y']), [470, 215]);
});

test('two runs retain the left and right plot endpoints', () => {
  const { chart } = renderChart([
    { date: '2026-01-14', result: 10 },
    { date: '2026-01-15', result: 10 },
  ]);
  assert.match(chart, /<path d="M 60\.0 105\.0 L 880\.0 105\.0"/);
  const points = [...chart.matchAll(/<circle\b[^>]*>/g)];
  assert.equal(points.length, 2);
  assert.deepEqual(points.map(point => coordinates(point[0], ['cx', 'cy'])), [[60, 105], [880, 105]]);
  const labels = [...chart.matchAll(/<text\b[^>]*text-anchor="middle"[^>]*>/g)];
  assert.equal(labels.length, 1, 'date labels retain their existing interval');
  assert.deepEqual(coordinates(labels[0][0], ['x', 'y']), [60, 215]);
});

test('empty runs render no data geometry and retain the needs-review summary', () => {
  const { chart, markup } = renderChart([]);
  assert.match(chart, /<path d=""/);
  assert.doesNotMatch(chart, /<circle\b|<text\b[^>]*text-anchor="middle"/);
  assert.match(chart, /0 runs\. QC status: Needs review/);
  assert.match(markup, /QC Status: Needs review — invalid QC data/);
  assert.match(markup, /0 total QC runs — N\/A pass rate/);
});
