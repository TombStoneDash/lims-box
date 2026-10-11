import assert from 'node:assert/strict';
import test from 'node:test';

import { diffResultVersions } from '../../lib/ohworks-result-diff';

// Fabricated analyte and values only; no patient, sample, or customer data.
const analyteCode = 'ANALYTE-SYNTH-RADIX';

function compare(oldValue: string, newValue: number | string) {
  return diffResultVersions(
    [{ analyteCode, value: oldValue }],
    [{ analyteCode, value: newValue }],
    [{ analyteCode, absolute: 10000, percent: null }],
  );
}

for (const [oldValue, newValue] of [
  ['0x10', 16],
  ['0b10', 2],
  ['0o10', 8],
  ['negative', 'positive'],
  ['1_000', 1000],
  ['1e', 1],
] as const) {
  test(`${oldValue} -> ${newValue} is a significant qualitative change`, () => {
    const diff = compare(oldValue, newValue);
    assert.equal(diff.changed.length, 1);
    const entry = diff.changed[0];
    assert.equal(entry.oldValue, oldValue);
    assert.equal(entry.newValue, newValue);
    assert.equal(entry.valueChanged, true);
    assert.equal(entry.flagsChanged, false);
    assert.equal(entry.significant, true);
    assert.equal(entry.significanceReason, 'nonnumeric-value-changed');
    assert.equal(entry.delta, null);
    assert.equal(diff.hasSignificantChange, true);
    assert.deepEqual(diff.changeLines, [
      `${analyteCode}: ${oldValue} -> ${newValue} (clinically significant)`,
    ]);
  });
}

for (const [oldValue, newValue] of [
  ['1e3', 1000],
  ['5.0', 5],
  [' +.5E+2 ', 50],
  ['-5.', -5],
  ['2.5e-1', 0.25],
  ['0x10', '0x10'],
  ['0b10', '0b10'],
  ['0o10', '0o10'],
  ['negative', 'negative'],
] as const) {
  test(`${JSON.stringify(oldValue)} and ${JSON.stringify(newValue)} remain unchanged`, () => {
    const diff = compare(oldValue, newValue);
    assert.deepEqual(diff.changed, []);
    assert.deepEqual(diff.changeLines, []);
    assert.equal(diff.hasSignificantChange, false);
  });
}
