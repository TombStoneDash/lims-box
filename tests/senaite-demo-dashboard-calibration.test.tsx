import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DemoDashboard from '../app/senaite-demo/page';
import { instruments } from '../lib/demo-data';

// tsx uses the classic JSX runtime for this repository's preserved JSX.
Object.assign(globalThis, { React });

function renderCalibrationAction() {
  const markup = renderToStaticMarkup(<DemoDashboard />);
  const actionItems = markup.slice(markup.indexOf('Action Items'));
  assert.match(actionItems, /href="\/senaite-demo\/equipment"[^>]*>View<\/a>/);
  assert.doesNotMatch(actionItems, /April 28|All 5 instruments|15 days remaining|NaN|Invalid Date/);
  return actionItems;
}

test('dashboard renders the real earliest calibration deadline, instrument, and fixed-demo day count', () => {
  const markup = renderCalibrationAction();
  assert.match(markup, /Instrument calibration due 2026-04-20/);
  assert.match(markup, /pH Meter Mettler Toledo S220 — 7 days remaining/);
});

function withSchedule(schedule: typeof instruments, check: () => void) {
  const original = [...instruments];
  try {
    instruments.splice(0, instruments.length, ...schedule);
    check();
  } finally {
    instruments.splice(0, instruments.length, ...original);
  }
}

function assertUnavailable() {
  const markup = renderCalibrationAction();
  assert.match(markup, /Calibration schedule unavailable/);
  assert.match(markup, /Review equipment calibration data/);
  assert.doesNotMatch(markup, /Instrument calibration due|days? remaining|2026-\d{2}-\d{2}/);
}

test('dashboard handles an empty schedule without inventing a deadline', () => {
  withSchedule([], assertUnavailable);
});

test('dashboard handles invalid dates and statuses without inventing a deadline', () => {
  for (const overrides of [
    { nextCalibration: 'not-a-date' },
    { nextCalibration: '2026-02-30' },
    { calibrationStatus: 'Unknown' },
  ]) {
    withSchedule([{ ...instruments[0], ...overrides }], assertUnavailable);
  }
});

test('dashboard does not present a partial invalid schedule as a confirmed next deadline', () => {
  withSchedule([
    instruments[3],
    { ...instruments[0], nextCalibration: '' },
  ], assertUnavailable);
});
