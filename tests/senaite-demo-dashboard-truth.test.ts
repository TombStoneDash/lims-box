import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DemoDashboard from '../app/senaite-demo/page';
import { allQCData, instruments, sampleCounts } from '../lib/demo-data';
import { evaluateEquipmentStatus } from '../lib/senaite-demo-equipment';
import { evaluateQCSummary } from '../lib/senaite-demo-qc';

// tsx compiles this repository's preserved JSX in classic mode.
Object.assign(globalThis, { React });

const markup = renderToStaticMarkup(React.createElement(DemoDashboard));
const equipment = evaluateEquipmentStatus(instruments);
const qc = evaluateQCSummary(allQCData);

test('Instruments card is derived from the real equipment evaluator', () => {
  // The calibration action item itself is #339's reminder, covered by
  // tests/senaite-demo-dashboard-calibration-reminder.test.tsx.
  assert.equal(equipment.nextCalibrationDue, '2026-04-20');
  const start = markup.indexOf('>Instruments<');
  const end = markup.indexOf('>Staff<');
  assert.ok(start >= 0 && end > start, 'Instruments card precedes the Staff card');
  const card = markup.slice(start, end);
  assert.ok(card.includes(`>${equipment.totalInstruments}<`));
  assert.ok(card.includes(`${equipment.currentCount} of ${equipment.totalInstruments} calibrated, next due ${equipment.nextCalibrationDue}`));
  assert.ok(!markup.includes('All calibrated'));
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
