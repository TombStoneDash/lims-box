import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DemoDashboard from '../app/senaite-demo/page';
import { instruments } from '../lib/demo-data';

// tsx uses the classic JSX runtime for this repository's preserved JSX.
Object.assign(globalThis, { React });

const originalInstruments = [...instruments];
afterEach(() => {
  instruments.splice(0, instruments.length, ...originalInstruments);
});

function mockInstruments(deadlines: string[]) {
  instruments.splice(0, instruments.length, ...deadlines.map((nextCalibration, index) => ({
    ...originalInstruments[index],
    name: `Mock instrument ${index + 1}`,
    nextCalibration,
  })));
}

function renderReminder() {
  const markup = renderToStaticMarkup(<DemoDashboard />);
  assert.match(markup, /Real-time overview — April 13, 2026/);
  const reminder = markup.match(/<p class="text-sm font-medium text-blue-800">[\s\S]*?<\/a>/)?.[0];
  assert.ok(reminder, 'the calibration action item should be rendered');
  assert.match(reminder, /href="\/senaite-demo\/equipment"/);
  assert.doesNotMatch(reminder, /All 5 instruments|15 days remaining/);
  return reminder;
}

test('reminds about the real pH meter deadline on April 20 with seven days remaining', () => {
  const reminder = renderReminder();
  assert.match(reminder, /Instrument calibration due April 20, 2026/);
  assert.match(reminder, /pH Meter Mettler Toledo S220 — 7 days remaining/);
  assert.doesNotMatch(reminder, /April 28/);
});

test('prioritizes the earliest overdue instrument over today and upcoming deadlines', () => {
  mockInstruments(['2026-04-20', '2026-04-13', '2026-04-12', '2026-04-10']);
  const reminder = renderReminder();
  assert.match(reminder, /Instrument calibration overdue — April 10, 2026/);
  assert.match(reminder, /Mock instrument 4 — Overdue by 3 days/);
  assert.doesNotMatch(reminder, /days remaining|Mock instrument [123]/);
});

test('identifies a calibration due today without a remaining-days countdown', () => {
  mockInstruments(['2026-04-20', '2026-04-13']);
  const reminder = renderReminder();
  assert.match(reminder, /Instrument calibration due April 13, 2026/);
  assert.match(reminder, /Mock instrument 2 — Due today/);
  assert.doesNotMatch(reminder, /days remaining|Overdue/);
});

for (const [state, deadlines] of [
  ['no instruments', []],
  ['only deadlines outside the window', ['2026-06-01']],
  ['only invalid deadlines', ['invalid-date']],
] as const) {
  test(`handles an empty projection with ${state} without inventing a deadline`, () => {
    mockInstruments([...deadlines]);
    const reminder = renderReminder();
    assert.match(reminder, /No upcoming calibration reminders/);
    assert.match(reminder, /No instruments overdue or due within 30 days\./);
    assert.doesNotMatch(reminder, /2026|remaining|Due today|Overdue by|Invalid Date/);
  });
}
