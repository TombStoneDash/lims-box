import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WalkthroughPage from '../../app/demo/walkthrough/page';
import type { WalkthroughPlayerState } from '../../lib/walkthrough-player';

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}

function selectStep(t: TestContext, label: string) {
  let state: WalkthroughPlayerState;
  const reducerHook = t.mock.method(React, 'useReducer', (reducer, initial) => {
    state ??= initial;
    return [state, (action: unknown) => { state = reducer(state, action); }];
  });
  const effectHook = t.mock.method(React, 'useEffect', () => {});
  try {
    const button = elements(WalkthroughPage()).find(element =>
      element.type === 'button' && element.props['aria-label'] === label);
    assert.ok(button, `step control ${label} must exist`);
    button.props.onClick();
    return WalkthroughPage();
  } finally {
    reducerHook.mock.restore();
    effectHook.mock.restore();
  }
}

test('walkthrough QC charts have unique resolved names, descriptions and ordered measurements', t => {
  const markup = renderToStaticMarkup(selectStep(t, 'Step 3: QC Dashboard'));
  const charts = [...markup.matchAll(/<svg\b[^>]*role="img"[^>]*>[\s\S]*?<\/svg>/g)].map(match => match[0]);
  assert.equal(charts.length, 2);
  const expected = [
    { name: 'Glucose', mean: 100, sd: 3.5, values: [99.2, 101.5, 97.8, 103.1, 100.4, 98.7, 101.9, 99.5, 102.3, 100.1, 98.5, 101.2] },
    { name: 'HbA1c', mean: 5.7, sd: 0.2, values: [5.65, 5.72, 5.58, 5.81, 5.69, 5.74, 5.63, 5.77, 5.68, 5.71, 5.66, 5.73] },
  ];
  const seenIds = new Set<string>();
  for (const [index, analyte] of expected.entries()) {
    const chart = charts[index];
    assert.doesNotMatch(chart, /aria-hidden="true"/);
    const text: Record<string, string> = {};
    for (const [attribute, tag] of [['aria-labelledby', 'title'], ['aria-describedby', 'desc']]) {
      const id = chart.match(new RegExp(`${attribute}="([^"]+)"`))?.[1];
      assert.ok(id, `${analyte.name} must reference its ${tag}`);
      assert.ok(!seenIds.has(id), `${id} must be unique across both charts`);
      seenIds.add(id);
      assert.equal([...markup.matchAll(/\bid="([^"]+)"/g)].filter(match => match[1] === id).length, 1);
      const target = [...chart.matchAll(/<(title|desc) id="([^"]+)">([^<]*)<\/(?:title|desc)>/g)]
        .find(match => match[1] === tag && match[2] === id);
      assert.ok(target, `${id} must resolve to a ${tag} within the chart`);
      text[tag] = target[3];
    }
    assert.equal(text.title, `${analyte.name} QC chart`);
    assert.ok(text.desc.includes(`${analyte.name} walkthrough QC series of 12 measurements.`));
    assert.ok(text.desc.includes(`Mean: ${analyte.mean}. Standard deviation: ${analyte.sd}.`));
    const values = text.desc.match(/Measured values in plot order: (.+)\.$/);
    assert.ok(values, 'the accessible description must include the ordered series');
    assert.deepEqual(values[1].split(', ').map(Number), analyte.values);
    assert.equal([...chart.matchAll(/<circle\b/g)].length, analyte.values.length);
  }
});

test('all other walkthrough steps still render their content', t => {
  for (const [label, content] of [
    ['Step 1: Sample Intake', 'Sample WS-2026-0421 logged successfully'],
    ['Step 2: Audit Trail', 'Sample Registered'],
    ['Step 4: Compliance Reporting', 'Analytical Report — RPT-2026-0421'],
    ['Step 5: LIMS BOT Query', 'What samples are pending verification?'],
  ]) {
    const markup = renderToStaticMarkup(selectStep(t, label));
    assert.ok(markup.includes(content), `${label} must render its screen`);
    assert.doesNotMatch(markup, /walkthrough-qc-/);
  }
});
