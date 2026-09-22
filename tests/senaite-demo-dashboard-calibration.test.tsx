import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DemoDashboard from '../app/senaite-demo/page';
import { instruments } from '../lib/demo-data';

// tsx uses the classic JSX runtime for this repository's preserved JSX.
Object.assign(globalThis, { React });

function calibrationNotice() {
  const markup = renderToStaticMarkup(<DemoDashboard />);
  const notice = markup.match(/<div class="flex items-center gap-3 p-3 bg-blue-50[^]*?<\/a><\/div>/);
  assert.ok(notice, 'the dashboard should render a calibration action item');
  return notice[0];
}

test('shows the earliest calibration at the fixed demo date and links to equipment', () => {
  const notice = calibrationNotice();

  assert.match(notice, /pH Meter Mettler Toledo S220 calibration due April 20/);
  assert.match(notice, /7 days remaining/);
  assert.doesNotMatch(notice, /All 5 instruments|April 28|15 days remaining/);
  assert.match(notice, /href="\/senaite-demo\/equipment"[^>]*>View<\/a>/);
});

test('shows an honest empty state when there are no projected calibrations', () => {
  const originalInstruments = instruments.splice(0);
  try {
    const notice = calibrationNotice();
    assert.match(notice, /No calibration action items/);
    assert.match(notice, /No instruments overdue or due within 30 days\./);
    assert.doesNotMatch(notice, /days remaining|Due today|All 5 instruments/);
    assert.match(notice, /href="\/senaite-demo\/equipment"/);
  } finally {
    instruments.push(...originalInstruments);
  }
});
