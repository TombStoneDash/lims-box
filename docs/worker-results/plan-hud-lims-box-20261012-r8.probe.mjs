// Read-only synthetic reproductions. Assertions confirm current defects, not desired behavior.
// Run with node --import tsx docs/worker-results/plan-hud-lims-box-20261012-r8.probe.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { evaluateReferenceRange } = require('../../lib/ohworks-reference-range.ts');
const { evaluatePtEvent } = require('../../lib/ohworks-pt-scoring.ts');
const { evaluateMethodComparison } = require('../../lib/ohworks-method-comparison.ts');
const { evaluateDilutionRerun } = require('../../lib/ohworks-dilution-rerun.ts');
const { formatReportedResult } = require('../../lib/ohworks-reporting-format.ts');
const { mapInstrumentFlags } = require('../../lib/ohworks-instrument-flags.ts');

const reference = evaluateReferenceRange({ result: '0x10', unit: 'mg/L', limitOfDetection: 1,
  upperLimitOfQuantitation: 100, referenceRange: { lowerBound: 10, upperBound: 20, unit: 'mg/L' } });
assert.equal(reference.classification, 'within_range');
console.log('J1 radix reference result:', reference);

const pt = evaluatePtEvent([{ participantId: 'SYNTHETIC-LAB', reportedValue: '0x64' }],
  { assignedValue: 100, acceptableRange: { low: 70, high: 130 } },
  { minParticipantsForRobustStatistics: 3, minSatisfactoryRate: 0.8, maxUnsatisfactoryCount: 0 });
assert.equal(pt.outcome, 'pass');
assert.equal(pt.participantScores[0].reportedValue, 100);
console.log('J2 radix PT result:', pt.outcome, pt.participantScores);

const comparison = evaluateMethodComparison([
  { specimenId: 'SYNTH-A', referenceValue: -1e308, candidateValue: 1e308, referenceUnit: 'mg/L', candidateUnit: 'mg/L' },
  { specimenId: 'SYNTH-B', referenceValue: 1e308, candidateValue: -1e308, referenceUnit: 'mg/L', candidateUnit: 'mg/L' },
], { minPairs: 2, unit: 'mg/L', loaMultiplier: 1.96, allowableBias: { maxMeanDifference: 2, maxPercentBias: null } });
assert.equal(comparison.decision, 'acceptable');
assert.ok(Number.isNaN(comparison.meanDifference));
console.log('J3 non-finite comparison:', comparison);

const dilution = evaluateDilutionRerun({ result: { analyteCode: 'SYNTH-A', unit: 'mg/L', rawReading: 50, appliedDilutionFactor: 100 },
  measuringRanges: [{ analyteCode: 'SYNTH-A', unit: 'mg/L', lowerLimit: 0, upperLimit: 100 }],
  ladder: { analyteCode: 'SYNTH-A', factors: [2, 5, 10, 20] }, maxDilutionFactor: 20,
  rerunTracking: { rerunCount: 0, maxReruns: 3 } });
assert.equal(dilution.decision, 'report_as_is');
assert.equal(dilution.correctedResult, 5000);
console.log('J4 excessive applied dilution:', dilution);

const report = formatReportedResult({ analyteCode: 'SYNTH-A', value: 50, formats: [{ analyteCode: 'SYNTH-A', unit: 'mg/L',
  decimalPlaces: 2, belowDetectionSymbol: '<', belowDetectionLimit: 100,
  aboveQuantitationSymbol: '>', aboveQuantitationLimit: 1, qualitativeThresholds: null }] });
assert.equal(report.reportString, '<100 mg/L');
console.log('J5 inverted censoring limits:', report);

const table = { SYNTH: {
  A: { canonicalFlag: 'synthetic-flag', severity: 'high', action: 'suppress' },
  B: { canonicalFlag: 'synthetic-flag', severity: 'high', action: 'report' },
} };
const first = mapInstrumentFlags(table, 'SYNTH', ['A', 'B']);
const reversed = mapInstrumentFlags(table, 'SYNTH', ['B', 'A']);
assert.equal(first.requiredAction, 'suppress');
assert.equal(reversed.requiredAction, 'report');
console.log('J6 same-canonical action order dependence:', first.requiredAction, reversed.requiredAction);
console.log('Verified 6 current defects; no product changes or external writes.');
