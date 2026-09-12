import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import QCChartsPage from '../app/senaite-demo/qc/page';
import { allQCData } from '../lib/demo-data';
import { evaluateAnalyteQC } from '../lib/senaite-demo-qc';

test('every Levey-Jennings SVG has role=img plus a linked, unique title and desc', () => {
  const markup = renderToStaticMarkup(React.createElement(QCChartsPage));

  const svgBlocks = [...markup.matchAll(/<svg\b[^>]*role="img"[^>]*>[\s\S]*?<\/svg>/g)].map(m => m[0]);
  assert.equal(svgBlocks.length, allQCData.length, 'every analyte should render exactly one accessible chart SVG');

  const seenTitleIds = new Set<string>();
  const seenDescIds = new Set<string>();

  for (const analyte of allQCData) {
    const evaluation = evaluateAnalyteQC(analyte);
    const svg = svgBlocks.find(block => block.includes(`>${escapeXml(`Levey-Jennings control chart: ${analyte.name}`)}<`));
    assert.ok(svg, `expected an accessible chart for ${analyte.name}`);

    const labelledBy = svg!.match(/aria-labelledby="([^"]+)"/);
    assert.ok(labelledBy, `chart for ${analyte.name} must have aria-labelledby`);
    const [titleId, descId] = labelledBy![1].split(' ');
    assert.ok(titleId && descId, `chart for ${analyte.name} must reference both a title id and a desc id`);

    assert.ok(!seenTitleIds.has(titleId), `title id ${titleId} must be unique across charts`);
    assert.ok(!seenDescIds.has(descId), `desc id ${descId} must be unique across charts`);
    seenTitleIds.add(titleId);
    seenDescIds.add(descId);

    const titleMatch = svg!.match(new RegExp(`<title id="${titleId}">([^<]*)</title>`));
    const descMatch = svg!.match(new RegExp(`<desc id="${descId}">([^<]*)</desc>`));
    assert.ok(titleMatch, `chart for ${analyte.name} must render a <title> with the matching id`);
    assert.ok(descMatch, `chart for ${analyte.name} must render a <desc> with the matching id`);

    const desc = descMatch![1];
    assert.match(desc, new RegExp(escapeRegExp(analyte.name)), 'description must name the analyte');
    assert.match(desc, new RegExp(escapeRegExp(analyte.controlLot)), 'description must name the control lot');
    assert.match(desc, new RegExp(escapeRegExp(analyte.unit)), 'description must name the unit');
    assert.match(desc, new RegExp(`${analyte.runs.length} runs`), 'description must state the run count');

    if (evaluation.status === 'out-of-range') {
      assert.match(
        desc,
        new RegExp(`${evaluation.outOfRangeCount} of ${evaluation.totalRuns} out of range`),
        'description must state the data-derived out-of-range tally, not an invented result',
      );
    } else if (evaluation.status === 'in-range') {
      assert.match(desc, /All in range/, 'description must reflect the evaluated in-range status');
    } else {
      assert.match(desc, /Needs review/, 'description must reflect the evaluated invalid status');
    }
  }
});

test('the analyte filter select has an associated accessible label', () => {
  const markup = renderToStaticMarkup(React.createElement(QCChartsPage));

  const selectMatch = markup.match(/<select\b[^>]*\sid="([^"]+)"[^>]*>/);
  assert.ok(selectMatch, 'analyte filter <select> must have an id');
  const selectId = selectMatch![1];

  const labelMatch = markup.match(new RegExp(`<label\\b[^>]*\\sfor="${selectId}"[^>]*>([^<]*)</label>`));
  assert.ok(labelMatch, 'a <label> must reference the analyte filter select via htmlFor');
  assert.ok(labelMatch![1].trim().length > 0, 'the label must have non-empty accessible text');
});

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
