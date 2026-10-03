import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import EquipmentPage from '../app/senaite-demo/equipment/page';
import { instruments } from '../lib/demo-data';
import { nextCalibrationDisplay } from '../lib/senaite-demo-equipment-display';

// tsx uses the classic JSX runtime for this repository's preserved JSX.
Object.assign(globalThis, { React });

test('every instrument card has a captioned, scoped maintenance log table wrapped for horizontal scroll', () => {
  const markup = renderToStaticMarkup(EquipmentPage());

  const tableMatches = markup.match(/<table\b/g) ?? [];
  assert.equal(tableMatches.length, instruments.length);

  for (const inst of instruments) {
    assert.ok(
      markup.includes(`Maintenance log for ${inst.name}`),
      `expected a caption "Maintenance log for ${inst.name}"`,
    );
  }

  const captionMatches = markup.match(/<caption\b/g) ?? [];
  assert.equal(captionMatches.length, instruments.length);

  const thMatches = markup.match(/<th\b/g) ?? [];
  const scopedThMatches = markup.match(/<th\b[^>]*scope="col"/g) ?? [];
  assert.ok(thMatches.length > 0);
  assert.equal(thMatches.length, scopedThMatches.length);
});

function htmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

test('maintenance log notes are shown in full and the table is wrapped for horizontal scroll', () => {
  const markup = renderToStaticMarkup(EquipmentPage());

  assert.ok(!markup.includes('truncate'), 'expected no truncate class in the markup');
  assert.ok(!markup.includes('max-w-[300px]'), 'expected no max-w-[300px] class in the markup');

  for (const inst of instruments) {
    for (const entry of inst.maintenanceLog) {
      assert.ok(
        markup.includes(htmlEscape(entry.notes)),
        `expected the full note "${entry.notes}" to appear verbatim in the markup`,
      );
    }
  }

  const overflowWrapperCount = (markup.match(/class="overflow-x-auto"/g) ?? []).length;
  assert.ok(overflowWrapperCount >= instruments.length, 'expected each table to sit inside an overflow-x-auto wrapper');
});

test('nextCalibrationDisplay maps each calibration status to a distinct, non-colour-only style', () => {
  const overdue = nextCalibrationDisplay('overdue');
  assert.ok(!overdue.textClass.includes('blue'));
  assert.equal(overdue.srSuffix, ' (overdue)');

  const invalid = nextCalibrationDisplay('invalid');
  assert.equal(invalid.srSuffix, ' (date unreadable)');

  const current = nextCalibrationDisplay('current');
  assert.equal(current.textClass, 'font-medium text-blue-700');
  assert.equal(current.iconClass, 'text-blue-400');
  assert.equal(current.srSuffix, '');

  assert.deepEqual(nextCalibrationDisplay('bogus' as never), invalid);
});

test('the page wires the Next Calibration cell through the new display helper', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'app/senaite-demo/equipment/page.tsx'),
    'utf8',
  );

  assert.match(source, /from '@\/lib\/senaite-demo-equipment-display'/);
  assert.ok(
    !source.includes('<p className="font-medium text-blue-700">{inst.nextCalibration}'),
    'expected the hard-coded always-blue Next Calibration markup to be removed',
  );
});
