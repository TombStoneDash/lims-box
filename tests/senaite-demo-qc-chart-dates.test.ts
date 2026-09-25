import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import QCChartsPage from '../app/senaite-demo/qc/page';
import { allQCData } from '../lib/demo-data';

function formatRunDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function withTimeZone<T>(timeZone: string, fn: () => T): T {
  const originalTZ = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return fn();
  } finally {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  }
}

test('generateRuns produces a full, unique, DST-safe 90-day series under America/Los_Angeles', () => {
  withTimeZone('America/Los_Angeles', () => {
    for (const analyte of allQCData) {
      assert.equal(analyte.runs.length, 90, `${analyte.name} should have 90 runs`);
      const dates = analyte.runs.map(r => r.date);
      assert.equal(new Set(dates).size, dates.length, `${analyte.name} run dates must be unique`);
      assert.equal(dates[0], '2026-01-14', `${analyte.name} should start on 2026-01-14`);
      assert.equal(dates[dates.length - 1], '2026-04-13', `${analyte.name} should end on 2026-04-13`);
    }
  });
});

test('the Period footer is derived from the data and matches the chart start/end', () => {
  withTimeZone('America/Los_Angeles', () => {
    const markup = renderToStaticMarkup(React.createElement(QCChartsPage));
    assert.match(markup, /Period: Jan 14 - Apr 13, 2026/);
    assert.doesNotMatch(markup, /Jan 13/);
  });
});

test('the subtitle is derived from the data, not a hardcoded day count', () => {
  withTimeZone('America/Los_Angeles', () => {
    const markup = renderToStaticMarkup(React.createElement(QCChartsPage));
    assert.doesNotMatch(markup, /90-day trending/);
    assert.match(markup, /90 runs per analyte/);
  });
});

test('axis tick labels are timezone-independent and match the run at their index', () => {
  withTimeZone('America/Los_Angeles', () => {
    const markup = renderToStaticMarkup(React.createElement(QCChartsPage));
    const allTexts = [...markup.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);
    const runs = allQCData[0].runs;
    const expectedLabels = runs.map((_, i) => i).filter(i => i % 15 === 0).map(i => formatRunDate(runs[i].date));

    assert.ok(expectedLabels.length >= 6, 'expected at least six tick labels per chart');
    for (const label of expectedLabels) {
      assert.ok(allTexts.includes(label), `expected a tick label "${label}" in the rendered markup`);
    }
  });
});

test('no NaN leaks into the rendered markup', () => {
  withTimeZone('America/Los_Angeles', () => {
    const markup = renderToStaticMarkup(React.createElement(QCChartsPage));
    assert.doesNotMatch(markup, /NaN/);
  });
});

test('every analyte still renders exactly one accessible chart SVG with a correct run count in its desc', () => {
  withTimeZone('America/Los_Angeles', () => {
    const markup = renderToStaticMarkup(React.createElement(QCChartsPage));
    const svgBlocks = [...markup.matchAll(/<svg\b[^>]*role="img"[^>]*>[\s\S]*?<\/svg>/g)].map(m => m[0]);
    assert.equal(svgBlocks.length, allQCData.length);

    for (const analyte of allQCData) {
      const descMatch = markup.match(new RegExp(`<desc id="lj-chart-[^"]*">([^<]*${analyte.runs.length} runs[^<]*)</desc>`));
      assert.ok(descMatch, `expected a <desc> stating ${analyte.runs.length} runs for ${analyte.name}`);
    }
  });
});
