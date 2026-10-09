import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeQualityIndicators,
  type MonthlyQualityIndicatorInput,
} from '../../lib/ohworks-quality-indicators';

// All identifiers and targets in these fixtures are fabricated.
function inputFor(
  specimensReceived: MonthlyQualityIndicatorInput['specimensReceived'],
  specimensRejected: MonthlyQualityIndicatorInput['specimensRejected'],
): MonthlyQualityIndicatorInput {
  return {
    period: 'synthetic-period',
    specimensReceived,
    specimensRejected,
    resultsReported: [],
    correctedReports: [],
    criticalValues: [],
    targets: {
      rejectionRatePercentByReason: { hemolysis: 5, 'insufficient-volume': 3 },
      turnaroundTargetMinutesByPriority: {},
      turnaroundCompliancePercentByPriority: {},
      correctedReportRatePercent: 2,
      criticalValueAckTargetMinutes: 30,
      criticalValueAckCompliancePercent: 95,
    },
  };
}

test('duplicate receipts do not dilute the rejection rate', () => {
  const report = computeQualityIndicators(inputFor(
    [{ specimenId: 'synth-1' }, { specimenId: 'synth-2' }, { specimenId: 'synth-1' }],
    [{ specimenId: 'synth-1', reasonCode: 'hemolysis' }],
  ));
  assert.deepEqual(report.rejectionRateByReason, {
    hemolysis: { numerator: 1, denominator: 2, ratePercent: 50, targetPercent: 5 },
    'insufficient-volume': { numerator: 0, denominator: 2, ratePercent: 0, targetPercent: 3 },
  });
});

test('two identical rejections of one received specimen produce 100 percent, not 200', () => {
  const report = computeQualityIndicators(inputFor(
    [{ specimenId: 'synth-1' }],
    [
      { specimenId: 'synth-1', reasonCode: 'hemolysis' },
      { specimenId: 'synth-1', reasonCode: 'hemolysis' },
    ],
  ));
  assert.deepEqual(report.rejectionRateByReason.hemolysis, {
    numerator: 1, denominator: 1, ratePercent: 100, targetPercent: 5,
  });
});

test('one specimen counts once in each distinct declared reason', () => {
  const report = computeQualityIndicators(inputFor(
    [{ specimenId: 'synth-1' }],
    [
      { specimenId: 'synth-1', reasonCode: 'hemolysis' },
      { specimenId: 'synth-1', reasonCode: 'insufficient-volume' },
      { specimenId: 'synth-1', reasonCode: 'hemolysis' },
      { specimenId: 'synth-1', reasonCode: 'insufficient-volume' },
    ],
  ));
  assert.deepEqual(report.rejectionRateByReason, {
    hemolysis: { numerator: 1, denominator: 1, ratePercent: 100, targetPercent: 5 },
    'insufficient-volume': { numerator: 1, denominator: 1, ratePercent: 100, targetPercent: 3 },
  });
});

test('an empty period retains zero counts and null rates for every declared reason', () => {
  const report = computeQualityIndicators(inputFor([], []));
  assert.deepEqual(report.rejectionRateByReason, {
    hemolysis: { numerator: 0, denominator: 0, ratePercent: null, targetPercent: 5 },
    'insufficient-volume': { numerator: 0, denominator: 0, ratePercent: null, targetPercent: 3 },
  });
});

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length === 0) return [[]];
  return items.flatMap((item, index) =>
    permutations(items.filter((_, otherIndex) => otherIndex !== index))
      .map((rest) => [item, ...rest]),
  );
}

test('rejection counts and rates are invariant under receipt and rejection permutations', () => {
  const receipts = [{ specimenId: 'synth-1' }, { specimenId: 'synth-2' }, { specimenId: 'synth-1' }];
  const rejections = [
    { specimenId: 'synth-1', reasonCode: 'hemolysis' },
    { specimenId: 'synth-2', reasonCode: 'hemolysis' },
    { specimenId: 'synth-1', reasonCode: 'hemolysis' },
    { specimenId: 'synth-1', reasonCode: 'insufficient-volume' },
  ];
  for (const received of permutations(receipts)) {
    for (const rejected of permutations(rejections)) {
      const report = computeQualityIndicators(inputFor(received, rejected));
      assert.deepEqual(report.rejectionRateByReason, {
        hemolysis: { numerator: 2, denominator: 2, ratePercent: 100, targetPercent: 5 },
        'insufficient-volume': { numerator: 1, denominator: 2, ratePercent: 50, targetPercent: 3 },
      });
    }
  }
});
