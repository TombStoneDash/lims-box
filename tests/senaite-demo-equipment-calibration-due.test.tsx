import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import EquipmentPage from '../app/senaite-demo/equipment/page';
import { instruments } from '../lib/demo-data';
import { projectUpcomingCalibrations } from '../lib/senaite-demo-calibration-schedule';
import { DEMO_AS_OF_DATE } from '../lib/senaite-demo-equipment';

// tsx uses the classic JSX runtime for this repository's preserved JSX.
Object.assign(globalThis, { React });

const HORIZON_DAYS = 30;

test('renders a Due for Calibration panel listing overdue-then-upcoming instruments with days-until-due', () => {
  const markup = renderToStaticMarkup(EquipmentPage());

  assert.match(markup, /Due for Calibration/);

  const expected = projectUpcomingCalibrations(
    instruments,
    new Date(`${DEMO_AS_OF_DATE}T00:00:00Z`),
    HORIZON_DAYS,
  );
  assert.ok(expected.length > 0, 'the demo fixture should have at least one instrument due within the horizon');

  // Every projected instrument appears in the panel, in the projector's own
  // order (overdue first, then soonest upcoming), each with its due-in-days.
  let previousIndex = -1;
  for (const { instrument, dueInDays, evaluation } of expected) {
    const nameIndex = markup.indexOf(instrument.name);
    assert.ok(nameIndex > previousIndex, `expected ${instrument.name} to appear after the previously listed instrument`);
    previousIndex = nameIndex;

    const rounded = Math.round(dueInDays);
    const expectedText = evaluation.status === 'overdue'
      ? `Overdue by ${Math.abs(rounded)} day`
      : rounded === 0
        ? 'Due today'
        : `Due in ${rounded} day`;
    assert.ok(markup.includes(expectedText), `expected markup to include "${expectedText}" for ${instrument.name}`);
  }
});

test('leaves the existing per-instrument cards, badges, and headline unchanged', () => {
  const markup = renderToStaticMarkup(EquipmentPage());

  assert.match(markup, /Equipment &amp; Calibration/);
  assert.match(markup, /instruments/);

  for (const inst of instruments) {
    assert.ok(markup.includes(inst.model), `expected the ${inst.name} card to still show its model`);
    assert.ok(markup.includes(inst.location), `expected the ${inst.name} card to still show its location`);
    assert.ok(markup.includes(inst.serialNumber), `expected the ${inst.name} card to still show its serial number`);
  }
});
