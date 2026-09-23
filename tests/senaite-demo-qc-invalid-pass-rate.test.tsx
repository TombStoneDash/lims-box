import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import QCChartsPage from '../app/senaite-demo/qc/page';
import { allQCData, type QCAnalyte } from '../lib/demo-data';

function analyte(name: string, results: number[], sd = 1): QCAnalyte {
  return {
    name,
    unit: 'mg/L',
    mean: 10,
    sd,
    controlLot: `TEST-${name}`,
    runs: results.map((result, index) => ({ date: `2026-01-${14 + index}`, result })),
  };
}

function renderWithData(data: QCAnalyte[]): string {
  const original = [...allQCData];
  try {
    allQCData.splice(0, allQCData.length, ...data);
    return renderToStaticMarkup(<QCChartsPage />);
  } finally {
    allQCData.splice(0, allQCData.length, ...original);
    assert.deepEqual(allQCData, original, 'restore the original fixtures after rendering');
  }
}

// Keep substitutions serial within this file; node:test isolates other test files.
test('overall pass rate reflects QC validity in the rendered page', { concurrency: false }, async t => {
  const cases = [
    { name: 'invalid-only data', data: [analyte('Invalid', [10], 0)], status: 'Needs review — invalid QC data', runs: 1, flags: 0, rate: 'N/A' },
    { name: 'mixed valid and invalid data', data: [analyte('Valid', [10, 14]), analyte('Invalid', [10], 0)], status: 'Needs review — invalid QC data', runs: 3, flags: 1, rate: 'N/A' },
    { name: 'empty data', data: [], status: 'Needs review — invalid QC data', runs: 0, flags: 0, rate: 'N/A' },
    { name: 'empty runs', data: [analyte('Empty', [])], status: 'Needs review — invalid QC data', runs: 0, flags: 0, rate: 'N/A' },
    { name: 'fully valid passing runs', data: [analyte('Passing', [10, 11])], status: 'All analytes within acceptable limits', runs: 2, flags: 0, rate: '100.0%' },
    { name: 'fully valid passing and failing runs', data: [analyte('Passing', [10, 11]), analyte('Failing', [14])], status: 'Out-of-range results detected', runs: 3, flags: 1, rate: '66.7%' },
    { name: 'fully valid failing runs', data: [analyte('Failing', [6, 14])], status: 'Out-of-range results detected', runs: 2, flags: 2, rate: '0.0%' },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const markup = renderWithData(scenario.data);
      assert.ok(markup.includes(`QC Status: ${scenario.status}`), 'retain the evaluated status banner');
      assert.ok(markup.includes(`${scenario.runs} total QC runs — ${scenario.rate} pass rate — ${scenario.flags} out-of-range flags`), 'display the expected pass rate and retain run/flag counts');
      if (scenario.rate === 'N/A') {
        assert.doesNotMatch(markup, /\d+(?:\.\d+)?% pass rate/);
      }
    });
  }
});
