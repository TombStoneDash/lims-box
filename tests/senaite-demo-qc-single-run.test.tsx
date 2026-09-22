import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import QCChartsPage from '../app/senaite-demo/qc/page';
import { allQCData, type QCAnalyte } from '../lib/demo-data';

function chartSvgs() {
  const markup = renderToStaticMarkup(<QCChartsPage />);
  return [...markup.matchAll(/<svg\b[^>]*role="img"[^>]*>[\s\S]*?<\/svg>/g)].map(match => match[0]);
}

function coordinate(element: string, attribute: string) {
  const match = element.match(new RegExp(`\\b${attribute}="([^"]+)"`));
  assert.ok(match, `missing ${attribute} in ${element}`);
  const value = Number(match[1]);
  assert.ok(Number.isFinite(value), `${attribute} must be finite`);
  return value;
}

test('a single QC run centers its point, path and date label and preserves its result', () => {
  const original = allQCData[0];
  const synthetic: QCAnalyte = {
    name: 'Singleton control', unit: 'mg/L', controlLot: 'SINGLE-LOT', mean: 10, sd: 2,
    runs: [{ date: '2026-02-10T12:00:00', result: 12 }],
  };

  try {
    allQCData[0] = synthetic;
    const svg = chartSvgs()[0];
    assert.ok(svg);
    const points = [...svg.matchAll(/<circle\b[^>]*>/g)];
    assert.equal(points.length, 1);
    const pointX = coordinate(points[0][0], 'cx');
    const pointY = coordinate(points[0][0], 'cy');
    assert.equal(pointX, 470, 'midpoint of the plot from x=60 to x=880');
    assert.ok(Math.abs(pointY - (20 + (17 - 12) / 14 * 170)) < 1e-9,
      'vertical position must represent the original result of 12');

    const path = svg.match(/<path\b[^>]*\bd="([^"]+)"/);
    assert.ok(path);
    const [command, ...coordinates] = path[1].split(' ');
    assert.equal(command, 'M');
    assert.equal(coordinates.length, 2);
    assert.ok(coordinates.every(value => Number.isFinite(Number(value))));
    assert.equal(Number(coordinates[0]), pointX);
    assert.equal(Number(coordinates[1]), Number(pointY.toFixed(1)));

    const dateLabel = svg.match(/<text\b[^>]*>Feb 10<\/text>/);
    assert.ok(dateLabel, 'the date label must show the synthetic run date');
    assert.equal(coordinate(dateLabel[0], 'x'), pointX);
    assert.equal(coordinate(dateLabel[0], 'y'), 215);
    assert.match(svg, /Levey-Jennings control chart for Singleton control, control lot SINGLE-LOT, unit mg\/L, 1 runs\. QC status: All in range\./);
    assert.equal(synthetic.runs[0].result, 12);
  } finally {
    allQCData[0] = original;
  }
});

test('multi-run QC charts retain their original evenly spaced positions', () => {
  const svg = chartSvgs()[0];
  const points = [...svg.matchAll(/<circle\b[^>]*>/g)];
  assert.ok(points.length > 1);
  assert.equal(points.length, allQCData[0].runs.length);
  points.forEach((point, index) => {
    assert.equal(coordinate(point[0], 'cx'), 60 + index / (points.length - 1) * 820);
  });
  assert.equal(coordinate(points[0][0], 'cx'), 60);
  assert.equal(coordinate(points[points.length - 1][0], 'cx'), 880);
});
