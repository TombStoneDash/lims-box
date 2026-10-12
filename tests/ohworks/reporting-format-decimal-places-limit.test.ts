import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ReportingFormatError,
  formatReportedResult,
  type ReportingFormat,
  type ReportRequest,
} from '../../lib/ohworks-reporting-format';

/**
 * All fabricated: synthetic analyte codes, made-up decimal places, and
 * censoring/qualitative details. None of this represents a real specimen,
 * instrument, or customer result.
 */
function baselineFormat(decimalPlaces: number): ReportingFormat {
  return {
    analyteCode: 'ANALYTE-SYNTH-A',
    unit: 'mg/L',
    decimalPlaces,
    belowDetectionSymbol: '<',
    belowDetectionLimit: 0,
    aboveQuantitationSymbol: '>',
    aboveQuantitationLimit: 1000,
    qualitativeThresholds: null,
  };
}

function baselineRequest(decimalPlaces: number): ReportRequest {
  return {
    analyteCode: 'ANALYTE-SYNTH-A',
    value: 1.5,
    formats: [baselineFormat(decimalPlaces)],
  };
}

test('a declared decimal places over 100 throws ReportingFormatError with code formats-malformed', () => {
  assert.throws(
    () => formatReportedResult(baselineRequest(101)),
    (error: unknown) => error instanceof ReportingFormatError && error.code === 'formats-malformed',
  );
});

test('a declared decimal places of 1000 throws ReportingFormatError with code formats-malformed', () => {
  assert.throws(
    () => formatReportedResult(baselineRequest(1000)),
    (error: unknown) => error instanceof ReportingFormatError && error.code === 'formats-malformed',
  );
});

test('a declared decimal places of 2 rounds and reports normally', () => {
  const result = formatReportedResult(baselineRequest(2));
  assert.equal(result.reportString, '1.50 mg/L');
});

test('a declared decimal places of 100 is still accepted and reports at full precision', () => {
  const result = formatReportedResult(baselineRequest(100));
  assert.ok(result.reportString.startsWith('1.5000'));
});
