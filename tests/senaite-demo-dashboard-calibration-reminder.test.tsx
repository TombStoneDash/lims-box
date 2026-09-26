import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { InstrumentCalibrationInput } from '../lib/senaite-demo-equipment';

// tsx uses the classic JSX runtime for this repository's preserved JSX.
Object.assign(globalThis, { React });

const require = createRequire(import.meta.url);
const dataPath = require.resolve('../lib/demo-data');
const pagePath = require.resolve('../app/senaite-demo/page');
const fixtures = require(dataPath);

function renderReminder(instruments?: InstrumentCalibrationInput[]) {
  const originalData = require.cache[dataPath];
  const originalPage = require.cache[pagePath];
  try {
    if (instruments) {
      // Replace the module only for this render; never mutate the committed fixtures.
      require.cache[dataPath] = {
        ...originalData,
        exports: { ...fixtures, instruments },
      } as NodeModule;
    }
    delete require.cache[pagePath];
    const Dashboard = require(pagePath).default;
    const markup = renderToStaticMarkup(<Dashboard />);
    assert.match(markup, /Synthetic laboratory snapshot: fixed demo date April 13, 2026/);
    assert.doesNotMatch(markup, /All 5 instruments|Instrument calibration due April 28|15 days remaining/);
    const actionItems = markup.slice(markup.indexOf('Action Items'));
    const reminder = actionItems.match(/<div class="flex items-center gap-3 p-3 bg-blue-50[\s\S]*?<\/a><\/div>/)?.[0];
    assert.ok(reminder, 'the dashboard must render the calibration action item');
    assert.match(reminder, /href="\/senaite-demo\/equipment"/);
    return reminder.replace(/<[^>]+>/g, '');
  } finally {
    require.cache[dataPath] = originalData;
    if (originalPage) require.cache[pagePath] = originalPage;
    else delete require.cache[pagePath];
  }
}

function instrument(name: string, nextCalibration: string): InstrumentCalibrationInput {
  return { name, serialNumber: name, calibrationStatus: 'Calibrated', nextCalibration };
}

test('committed fixture identifies the pH meter due April 20 with seven days remaining', () => {
  const reminder = renderReminder();
  assert.match(reminder, /Instrument calibration due April 20/);
  assert.match(reminder, /pH Meter Mettler Toledo S220 — 1 instrument — 7 days remaining/);
  assert.doesNotMatch(reminder, /ICP-MS|GC-MS|IC Thermo|UV-Vis|April 28/);
});

test('tied earliest deadlines name only the tied instruments with plural wording', () => {
  const reminder = renderReminder([
    instrument('Later meter', '2026-04-25'),
    instrument('Beta meter', '2026-04-20'),
    instrument('Invalid meter', '2026-02-30'),
    instrument('Alpha meter', '2026-04-20'),
  ]);
  assert.match(reminder, /Instrument calibrations due April 20/);
  assert.match(reminder, /Alpha meter, Beta meter — 2 instruments — 7 days remaining/);
  assert.doesNotMatch(reminder, /Later meter|Invalid meter/);
});

test('a single remaining day uses singular wording', () => {
  assert.match(renderReminder([instrument('Test meter', '2026-04-14')]),
    /Test meter — 1 instrument — 1 day remaining/);
});

test('today and overdue deadlines do not claim future remaining days', () => {
  assert.match(renderReminder([instrument('Test meter', '2026-04-13')]), /Due today/);
  assert.match(renderReminder([instrument('Test meter', '2026-04-12')]), /1 day overdue/);
});

test('no valid deadlines shows a truthful empty state', () => {
  for (const instruments of [[], [
    instrument('Missing date', ''),
    instrument('Malformed date', 'not-a-date'),
    instrument('Impossible date', '2026-02-30'),
  ]]) {
    const reminder = renderReminder(instruments);
    assert.match(reminder, /No calibration deadline available/);
    assert.match(reminder, /No valid instrument calibration deadlines in demo data/);
    assert.doesNotMatch(reminder, /remaining|calibration due|Invalid Date|NaN/);
  }
});

test('fixture mocks leave the committed fixture intact', () => {
  assert.match(renderReminder(), /pH Meter Mettler Toledo S220 — 1 instrument — 7 days remaining/);
});
