import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateDilutionRerun,
  type DilutionLadder,
  type DilutionRerunRequest,
  type MeasuringRange,
} from '../../lib/ohworks-dilution-rerun';

/**
 * All fabricated: synthetic analyte code, unit, measuring range and numeric
 * readings. None of this represents a real specimen, instrument, or
 * customer result. These cases exercise derived-product overflow at the
 * boundaries where a raw reading is multiplied by its applied dilution
 * factor, or where a declared upper limit is multiplied by that factor.
 */
function baselineRange(): MeasuringRange {
  return { analyteCode: 'SYNTH', unit: 'mg/L', lowerLimit: 0, upperLimit: 1e308 };
}

function baselineLadder(): DilutionLadder {
  return { analyteCode: 'SYNTH', factors: [2] };
}

function baselineRequest(): DilutionRerunRequest {
  return {
    result: {
      analyteCode: 'SYNTH',
      unit: 'mg/L',
      rawReading: 1e308,
      appliedDilutionFactor: 2,
    },
    measuringRanges: [baselineRange()],
    ladder: baselineLadder(),
    maxDilutionFactor: 2,
    rerunTracking: { rerunCount: 0, maxReruns: 2 },
  };
}

test('a within-range reading whose corrected result overflows to Infinity blocks instead of reporting', () => {
  const request = baselineRequest();
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'block');
  assert.equal(result.reasonCode, 'non-finite-result');
  assert.equal(
    result.reason,
    'The derived reportable result could not be represented as a finite number at the currently applied dilution.',
  );
  assert.equal(result.correctedResult, null);
  assert.equal(result.nextDilutionFactor, null);
  assert.equal(result.greaterThanLimit, null);
});

test('a below-range reading whose corrected result overflows to -Infinity blocks instead of reporting', () => {
  const request = baselineRequest();
  request.measuringRanges = [{ analyteCode: 'SYNTH', unit: 'mg/L', lowerLimit: -1e307, upperLimit: 1e308 }];
  request.result.rawReading = -1e308; // finite, but below the declared lower limit of -1e307
  request.result.appliedDilutionFactor = 2; // -1e308 * 2 exceeds the most negative representable double
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'block');
  assert.equal(result.reasonCode, 'non-finite-result');
  assert.equal(result.correctedResult, null);
  assert.equal(result.nextDilutionFactor, null);
  assert.equal(result.greaterThanLimit, null);
});

test('an out-of-range reading whose greater-than limit overflows to Infinity blocks instead of reporting', () => {
  const request = baselineRequest();
  request.result.rawReading = 1.5e308; // finite, above the declared upper limit of 1e308
  request.result.appliedDilutionFactor = 2;
  request.ladder = { analyteCode: 'SYNTH', factors: [2] };
  request.maxDilutionFactor = 2; // no further ladder rung is usable, forcing the greater-than-limit path
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'block');
  assert.equal(result.reasonCode, 'non-finite-result');
  assert.equal(result.correctedResult, null);
  assert.equal(result.nextDilutionFactor, null);
  assert.equal(result.greaterThanLimit, null);
});

test('a large but representable corrected result still reports as-is with a finite numeric output', () => {
  const request = baselineRequest();
  request.result.rawReading = 1e307;
  request.result.appliedDilutionFactor = 2;
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'report_as_is');
  assert.equal(result.reasonCode, 'within-range');
  assert.equal(result.correctedResult, 2e307);
  assert.ok(Number.isFinite(result.correctedResult));
  assert.equal(result.nextDilutionFactor, null);
  assert.equal(result.greaterThanLimit, null);
});
