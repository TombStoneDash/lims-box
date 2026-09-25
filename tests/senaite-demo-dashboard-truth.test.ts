import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DemoDashboard from '../app/senaite-demo/page';
import { allQCData, instruments, sampleCounts } from '../lib/demo-data';
import { evaluateEquipmentStatus } from '../lib/senaite-demo-equipment';
import { evaluateQCSummary } from '../lib/senaite-demo-qc';

const markup = renderToStaticMarkup(React.createElement(DemoDashboard));
const equipment = evaluateEquipmentStatus(instruments);
const qc = evaluateQCSummary(allQCData);

test('calibration action item is derived from the real equipment evaluator', () => {
  assert.equal(equipment.nextCalibrationDue, '2026-04-20');
  assert.equal(equipment.nextDueInstrumentName, 'pH Meter Mettler Toledo S220');
  assert.ok(markup.includes(equipment.nextCalibrationDue as string));
  assert.ok(markup.includes(equipment.nextDueInstrumentName as string));
  assert.ok(!markup.includes('April 28'));
  assert.ok(!markup.includes('15 days remaining'));
  assert.ok(!markup.includes('All 5 instruments'));
});

test('QC KPI figures match the real QC evaluator, not a fabricated literal', () => {
  const qcPassRate = qc.status !== 'invalid' && qc.totalRuns > 0
    ? `${(((qc.totalRuns - qc.outOfRangeCount) / qc.totalRuns) * 100).toFixed(1)}%`
    : 'N/A';
  assert.ok(markup.includes(qcPassRate));
  assert.ok(markup.includes(`${qc.outOfRangeCount} out-of-range`));
  assert.ok(!markup.includes('100% pass rate — 0 out-of-range'));
  assert.ok(!markup.includes('100% pass rate - 0 out-of-range'));
});

test('Sample Types bars use distinct colours keyed to the real sample types', () => {
  const sampleTypesBlock = markup.slice(markup.indexOf('Sample Types'), markup.indexOf('Action Items'));
  const barClasses = [...sampleTypesBlock.matchAll(/h-full rounded-full ([a-z0-9-]+)/g)].map((m) => m[1]);
  assert.equal(barClasses.length, Object.keys(sampleCounts.byType).length);
  for (const cls of barClasses) {
    assert.notEqual(cls, 'bg-slate-400');
  }
  assert.equal(new Set(barClasses).size, 4);
});

test('header no longer claims to be real-time or system-operational on a frozen fixture', () => {
  assert.ok(!markup.includes('Real-time overview'));
  assert.ok(!markup.includes('>All Systems Operational<'));
  assert.ok(markup.includes('Synthetic fixture'));
});

test('CAP audit readiness card is labelled as fabricated', () => {
  const capIndex = markup.indexOf('CAP audit readiness: PASS');
  const fabricatedIndex = markup.indexOf('fabricated');
  assert.ok(capIndex >= 0);
  assert.ok(fabricatedIndex >= 0);
  assert.ok(fabricatedIndex > capIndex);
});

test('dashboard hrefs are unchanged from the pinned route-integrity snapshot', () => {
  const hrefs = [...markup.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, [
    '/senaite-demo/qc',
    '/senaite-demo/equipment',
    '/senaite-demo/training',
    '/senaite-demo/samples/SA-2026-0847',
    '/senaite-demo/equipment',
  ]);
});
