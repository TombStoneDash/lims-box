import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { calculateROI, formatNetSavings } from '../../lib/roi-calculator';

const PAGE_PATH = path.join(__dirname, '..', '..', 'app', 'roi-calculator', 'page.tsx');

test('default inputs (200 samples, 5 staff, excel) reproduce today\'s numbers', () => {
  const roi = calculateROI(200, 5, 'excel');

  assert.equal(roi.totalHoursSaved, 55);
  assert.equal(roi.errorReduction, 94);
  assert.equal(roi.monthlySavings, 1925);
  assert.equal(roi.limsBoxCost, 1200);
  assert.equal(roi.netMonthlySavings, 725);
  assert.equal(roi.annualSavings, 8700);
});

test('a small lab on Excel with many staff costs more than it saves', () => {
  // 50 samples, 12 staff: 15 hours saved x $35/hr = $525 of labor against a
  // $2,500 subscription tier (staff > 10) = -$1,975/mo, -$23,700/yr.
  const roi = calculateROI(50, 12, 'excel');

  assert.equal(roi.totalHoursSaved, 15);
  assert.equal(roi.monthlySavings, 525);
  assert.equal(roi.limsBoxCost, 2500);
  assert.equal(roi.netMonthlySavings, -1975);
  assert.equal(roi.annualSavings, -23700);
  assert.ok(roi.netMonthlySavings < 0);

  const formatted = formatNetSavings(roi.netMonthlySavings);
  assert.equal(formatted.negative, true);
  assert.equal(formatted.text, '-$1,975');
  assert.ok(formatted.text.startsWith('-$'));
  assert.ok(!formatted.text.includes('*'));
});

test('formatNetSavings renders non-negative values without a sign', () => {
  const formatted = formatNetSavings(725);
  assert.equal(formatted.negative, false);
  assert.equal(formatted.text, '$725');

  const zero = formatNetSavings(0);
  assert.equal(zero.negative, false);
  assert.equal(zero.text, '$0');
});

test('non-finite and negative inputs never yield NaN', () => {
  const cases: Array<[number, number]> = [
    [NaN, NaN],
    [-50, -5],
    [Infinity, Infinity],
    [-Infinity, -Infinity],
    [NaN, 5],
    [200, NaN],
  ];

  for (const [samples, staff] of cases) {
    const roi = calculateROI(samples, staff, 'excel');
    for (const value of Object.values(roi)) {
      assert.ok(Number.isFinite(value), `expected finite value for samples=${samples}, staff=${staff}, got ${value}`);
    }
  }
});

test('LIMS BOX subscription tier boundaries at staff 3/4 and 10/11', () => {
  assert.equal(calculateROI(200, 3, 'excel').limsBoxCost, 500);
  assert.equal(calculateROI(200, 4, 'excel').limsBoxCost, 1200);
  assert.equal(calculateROI(200, 10, 'excel').limsBoxCost, 1200);
  assert.equal(calculateROI(200, 11, 'excel').limsBoxCost, 2500);
});

test('page no longer uses Math.abs on the ROI results', () => {
  const source = readFileSync(PAGE_PATH, 'utf8');
  assert.ok(!source.includes('Math.abs(roi.'), 'page.tsx should not call Math.abs on roi values anymore');
});

test('both range inputs have an id matched by a label htmlFor', () => {
  const source = readFileSync(PAGE_PATH, 'utf8');

  const inputTags = [...source.matchAll(/<input\b[^>]*>/g)].map(m => m[0]);
  const rangeIds = new Set(
    inputTags
      .filter(tag => /type="range"/.test(tag))
      .map(tag => tag.match(/\bid="([^"]+)"/)?.[1])
      .filter((id): id is string => Boolean(id)),
  );
  const htmlForValues = new Set([...source.matchAll(/htmlFor="([^"]+)"/g)].map(m => m[1]));

  assert.equal(rangeIds.size, 2, `expected exactly two range input ids, found: ${[...rangeIds].join(', ')}`);
  for (const id of rangeIds) {
    assert.ok(htmlForValues.has(id), `expected a label with htmlFor="${id}"`);
  }
});
