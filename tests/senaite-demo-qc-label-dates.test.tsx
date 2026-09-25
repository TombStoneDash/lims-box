import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import QCChartsPage from '../app/senaite-demo/qc/page';
import { allQCData } from '../lib/demo-data';

test('QC chart axis labels preserve the stored calendar dates', () => {
  const markup = renderToStaticMarkup(React.createElement(QCChartsPage));
  const charts = [...markup.matchAll(/<svg\b[^>]*role="img"[^>]*>[\s\S]*?<\/svg>/g)];
  assert.equal(charts.length, allQCData.length);

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (const [index, analyte] of allQCData.entries()) {
    const labels = [...charts[index][0].matchAll(/<text\b[^>]*text-anchor="middle"[^>]*>([^<]*)<\/text>/g)]
      .map(match => match[1]);
    const labelledRuns = analyte.runs.filter((_, runIndex) => runIndex % 15 === 0);
    const expected = labelledRuns.map(run => {
      const [, month, day] = run.date.split('-').map(Number);
      return `${months[month - 1]} ${day}`;
    });

    assert.deepEqual(labels, expected, `${analyte.name}: every sampled run keeps its calendar day`);
    assert.equal(labels[0], 'Jan 14', `${analyte.name}: first label agrees with the period caption`);
    assert.equal(labels[2], 'Feb 13', `${analyte.name}: later-month label keeps its calendar day`);
  }
});
