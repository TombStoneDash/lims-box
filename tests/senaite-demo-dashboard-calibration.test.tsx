import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DemoDashboard from '../app/senaite-demo/page';
import { instruments } from '../lib/demo-data';

// Match the repository's classic JSX runtime when rendering the actual page.
Object.assign(globalThis, { React });

function renderNotice() {
  const markup = renderToStaticMarkup(<DemoDashboard />);
  const notice = markup.match(/<p class="text-sm font-medium text-blue-800">[\s\S]*?<\/a>/)?.[0];
  assert.ok(notice, 'dashboard must render the calibration action and equipment link');
  assert.match(notice, /href="\/senaite-demo\/equipment"/);
  assert.doesNotMatch(markup, /Instrument calibration due April 28|All 5 instruments|15 days remaining/);
  return notice;
}

function withInstruments(fixture: typeof instruments, check: () => void) {
  const original = instruments.slice();
  try {
    instruments.splice(0, instruments.length, ...fixture);
    check();
  } finally {
    instruments.splice(0, instruments.length, ...original);
  }
}

test('dashboard identifies the pH meter due April 20 with seven UTC days remaining', () => {
  const notice = renderNotice();
  assert.match(notice, /Instrument calibration due April 20, 2026/);
  assert.match(notice, /pH Meter Mettler Toledo S220 — April 20, 2026 — 7 days remaining/);
});

test('dashboard follows changed fixture deadlines and names', () => {
  withInstruments(instruments.map((instrument, index) => index === 0
    ? { ...instrument, name: 'Replacement instrument', nextCalibration: '2026-04-14' }
    : instrument), () => {
    assert.match(renderNotice(), /Replacement instrument — April 14, 2026 — 1 day remaining/);
  });
});

test('dashboard warns of overdue instruments while retaining the next upcoming deadline', () => {
  withInstruments(instruments.map((instrument, index) => index === 0
    ? { ...instrument, nextCalibration: '2026-04-12' }
    : instrument), () => {
    const notice = renderNotice();
    assert.match(notice, /Instrument calibration overdue/);
    assert.match(notice, /Overdue: ICP-MS Agilent 7900/);
    assert.match(notice, /pH Meter Mettler Toledo S220 — April 20, 2026 — 7 days remaining/);
  });
});

test('dashboard explicitly reports overdue-only schedules without a future deadline', () => {
  withInstruments([{ ...instruments[0], nextCalibration: '2026-04-12' }], () => {
    const notice = renderNotice();
    assert.match(notice, /Instrument calibration overdue/);
    assert.match(notice, /Overdue: ICP-MS Agilent 7900/);
    assert.match(notice, /Next calibration date unavailable/);
    assert.doesNotMatch(notice, /days remaining|NaN/);
  });
});

test('dashboard explicitly reports unavailable calibration for an empty fixture', () => {
  withInstruments([], () => {
    const notice = renderNotice();
    assert.match(notice, /Calibration schedule unavailable/);
    assert.match(notice, /Next calibration date unavailable/);
    assert.doesNotMatch(notice, /days remaining|undefined|null|NaN/);
  });
});

test('dashboard reports invalid fixture dates as unavailable', () => {
  withInstruments([{ ...instruments[0], nextCalibration: 'invalid' }], () => {
    assert.match(renderNotice(), /Calibration schedule unavailable/);
  });
});

test('dashboard reports zero days for calibration due on the demo date', () => {
  withInstruments([{ ...instruments[0], nextCalibration: '2026-04-13' }], () => {
    const notice = renderNotice();
    assert.match(notice, /April 13, 2026 — 0 days remaining/);
    assert.doesNotMatch(notice, /overdue/i);
  });
});

test('fixture overrides are restored and unrelated dashboard cards remain', () => {
  assert.match(renderNotice(), /pH Meter Mettler Toledo S220 — April 20, 2026 — 7 days remaining/);
  const markup = renderToStaticMarkup(<DemoDashboard />);
  for (const text of ['Total Samples', 'QC Runs (90 days)', 'Staff', 'Sample Status', 'Sample Types',
    '3 samples pending verification', 'CAP audit readiness: PASS']) {
    assert.ok(markup.includes(text), `expected unchanged dashboard content: ${text}`);
  }
});
