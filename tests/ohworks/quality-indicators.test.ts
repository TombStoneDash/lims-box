import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeQualityIndicators,
  QualityIndicatorInputError,
  type MonthlyQualityIndicatorInput,
  type QualityIndicatorTargets,
} from '../../lib/ohworks-quality-indicators';

/**
 * All fabricated: synthetic specimen/result/critical-value identifiers and
 * made-up durations. None of this represents a real patient, specimen, or
 * result.
 */
function baselineTargets(): QualityIndicatorTargets {
  return {
    rejectionRatePercentByReason: {
      hemolysis: 5,
      'insufficient-volume': 3,
    },
    turnaroundTargetMinutesByPriority: {
      stat: 60,
      routine: 480,
    },
    turnaroundCompliancePercentByPriority: {
      stat: 95,
      routine: 90,
    },
    correctedReportRatePercent: 2,
    criticalValueAckTargetMinutes: 30,
    criticalValueAckCompliancePercent: 95,
  };
}

function baselineInput(): MonthlyQualityIndicatorInput {
  return {
    period: '2026-08',
    specimensReceived: [
      { specimenId: 'spec-synth-1' },
      { specimenId: 'spec-synth-2' },
      { specimenId: 'spec-synth-3' },
      { specimenId: 'spec-synth-4' },
      { specimenId: 'spec-synth-5' },
      { specimenId: 'spec-synth-6' },
      { specimenId: 'spec-synth-7' },
      { specimenId: 'spec-synth-8' },
      { specimenId: 'spec-synth-9' },
      { specimenId: 'spec-synth-10' },
    ],
    specimensRejected: [
      { specimenId: 'spec-synth-1', reasonCode: 'hemolysis' },
      { specimenId: 'spec-synth-2', reasonCode: 'insufficient-volume' },
    ],
    resultsReported: [
      { resultId: 'result-synth-1', priority: 'stat', turnaroundMinutes: 45 },
      { resultId: 'result-synth-2', priority: 'stat', turnaroundMinutes: 90 },
      { resultId: 'result-synth-3', priority: 'routine', turnaroundMinutes: 200 },
      { resultId: 'result-synth-4', priority: 'routine', turnaroundMinutes: 500 },
    ],
    correctedReports: [{ resultId: 'result-synth-2' }],
    criticalValues: [
      { criticalValueId: 'crit-synth-1', acknowledgedAfterMinutes: 10 },
      { criticalValueId: 'crit-synth-2', acknowledgedAfterMinutes: 45 },
      { criticalValueId: 'crit-synth-3', acknowledgedAfterMinutes: null },
    ],
    targets: baselineTargets(),
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

test('computes rejection rate by reason against total specimens received', () => {
  const report = computeQualityIndicators(baselineInput());
  assert.deepEqual(report.rejectionRateByReason.hemolysis, {
    numerator: 1,
    denominator: 10,
    ratePercent: 10,
    targetPercent: 5,
  });
  assert.deepEqual(report.rejectionRateByReason['insufficient-volume'], {
    numerator: 1,
    denominator: 10,
    ratePercent: 10,
    targetPercent: 3,
  });
});

test('a declared reason with zero rejections reports a real zero rate, not null', () => {
  const input = baselineInput();
  input.specimensRejected = [{ specimenId: 'spec-synth-1', reasonCode: 'hemolysis' }];
  const report = computeQualityIndicators(input);
  assert.deepEqual(report.rejectionRateByReason['insufficient-volume'], {
    numerator: 0,
    denominator: 10,
    ratePercent: 0,
    targetPercent: 3,
  });
});

test('rejection rate is null, never zero, when no specimens were received', () => {
  const input = baselineInput();
  input.specimensReceived = [];
  input.specimensRejected = [];
  const report = computeQualityIndicators(input);
  assert.equal(report.rejectionRateByReason.hemolysis.denominator, 0);
  assert.equal(report.rejectionRateByReason.hemolysis.ratePercent, null);
  assert.equal(report.rejectionRateByReason['insufficient-volume'].ratePercent, null);
});

test('computes turnaround compliance percentage per priority', () => {
  const report = computeQualityIndicators(baselineInput());
  assert.deepEqual(report.turnaroundComplianceByPriority.stat, {
    numerator: 1,
    denominator: 2,
    ratePercent: 50,
    targetPercent: 95,
  });
  assert.deepEqual(report.turnaroundComplianceByPriority.routine, {
    numerator: 1,
    denominator: 2,
    ratePercent: 50,
    targetPercent: 90,
  });
});

test('a result exactly at the turnaround target duration counts as compliant', () => {
  const input = baselineInput();
  input.resultsReported = [{ resultId: 'result-synth-1', priority: 'stat', turnaroundMinutes: 60 }];
  input.correctedReports = [];
  const report = computeQualityIndicators(input);
  assert.equal(report.turnaroundComplianceByPriority.stat.numerator, 1);
  assert.equal(report.turnaroundComplianceByPriority.stat.ratePercent, 100);
});

test('turnaround compliance is null, never zero, when a declared priority saw no results', () => {
  const input = baselineInput();
  input.resultsReported = input.resultsReported.filter((event) => event.priority !== 'routine');
  input.correctedReports = [];
  const report = computeQualityIndicators(input);
  assert.equal(report.turnaroundComplianceByPriority.routine.denominator, 0);
  assert.equal(report.turnaroundComplianceByPriority.routine.ratePercent, null);
});

test('computes corrected report rate against total results reported', () => {
  const report = computeQualityIndicators(baselineInput());
  assert.deepEqual(report.correctedReportRate, {
    numerator: 1,
    denominator: 4,
    ratePercent: 25,
    targetPercent: 2,
  });
});

test('corrected report rate is null, never zero, when no results were reported', () => {
  const input = baselineInput();
  input.resultsReported = [];
  input.correctedReports = [];
  const report = computeQualityIndicators(input);
  assert.equal(report.correctedReportRate.denominator, 0);
  assert.equal(report.correctedReportRate.ratePercent, null);
});

test('a report corrected more than once counts once toward the corrected report rate', () => {
  const input = baselineInput();
  input.correctedReports = [{ resultId: 'result-synth-2' }, { resultId: 'result-synth-2' }];
  const report = computeQualityIndicators(input);
  assert.equal(report.correctedReportRate.numerator, 1);
});

test('computes critical value acknowledgement compliance, excluding unacknowledged values from the numerator', () => {
  const report = computeQualityIndicators(baselineInput());
  assert.deepEqual(report.criticalValueAckCompliance, {
    numerator: 1,
    denominator: 3,
    ratePercent: (1 / 3) * 100,
    targetPercent: 95,
  });
});

test('critical value acknowledgement compliance is null, never zero, with no critical values', () => {
  const input = baselineInput();
  input.criticalValues = [];
  const report = computeQualityIndicators(input);
  assert.equal(report.criticalValueAckCompliance.denominator, 0);
  assert.equal(report.criticalValueAckCompliance.ratePercent, null);
});

test('a critical value acknowledged exactly at the target delay counts as compliant', () => {
  const input = baselineInput();
  input.criticalValues = [{ criticalValueId: 'crit-synth-1', acknowledgedAfterMinutes: 30 }];
  const report = computeQualityIndicators(input);
  assert.equal(report.criticalValueAckCompliance.numerator, 1);
  assert.equal(report.criticalValueAckCompliance.ratePercent, 100);
});

test('rejects a period label that is missing', () => {
  const malformed = clone(baselineInput()) as Record<string, unknown>;
  delete malformed.period;
  const input = malformed as unknown as MonthlyQualityIndicatorInput;
  assert.throws(() => computeQualityIndicators(input), (error: unknown) => {
    assert.ok(error instanceof QualityIndicatorInputError);
    assert.equal(error.code, 'period-invalid');
    return true;
  });
});

test('rejects specimens received that are not a list', () => {
  const input = clone(baselineInput());
  // @ts-expect-error deliberately malformed for the fail-closed test
  input.specimensReceived = 'not-a-list';
  assert.throws(() => computeQualityIndicators(input), (error: unknown) => {
    assert.ok(error instanceof QualityIndicatorInputError);
    assert.equal(error.code, 'specimens-received-not-array');
    return true;
  });
});

test('rejects a rejected specimen that references a specimen never received this period', () => {
  const input = baselineInput();
  input.specimensRejected = [{ specimenId: 'spec-synth-unreceived', reasonCode: 'hemolysis' }];
  assert.throws(() => computeQualityIndicators(input), (error: unknown) => {
    assert.ok(error instanceof QualityIndicatorInputError);
    assert.equal(error.code, 'specimens-rejected-unknown-specimen');
    return true;
  });
});

test('rejects a rejected specimen with a reason code that has no declared target', () => {
  const input = baselineInput();
  input.specimensRejected = [{ specimenId: 'spec-synth-1', reasonCode: 'label-mismatch' }];
  assert.throws(() => computeQualityIndicators(input), (error: unknown) => {
    assert.ok(error instanceof QualityIndicatorInputError);
    assert.equal(error.code, 'specimens-rejected-unknown-reason');
    return true;
  });
});

test('rejects a reported result with a priority that has no declared turnaround target', () => {
  const input = baselineInput();
  input.resultsReported = [{ resultId: 'result-synth-1', priority: 'asap', turnaroundMinutes: 10 }];
  assert.throws(() => computeQualityIndicators(input), (error: unknown) => {
    assert.ok(error instanceof QualityIndicatorInputError);
    assert.equal(error.code, 'results-reported-unknown-priority');
    return true;
  });
});

test('rejects a reported result with a negative turnaround duration', () => {
  const input = baselineInput();
  input.resultsReported = [{ resultId: 'result-synth-1', priority: 'stat', turnaroundMinutes: -5 }];
  assert.throws(() => computeQualityIndicators(input), (error: unknown) => {
    assert.ok(error instanceof QualityIndicatorInputError);
    assert.equal(error.code, 'results-reported-invalid');
    return true;
  });
});

test('rejects a corrected report that references a result never reported this period', () => {
  const input = baselineInput();
  input.correctedReports = [{ resultId: 'result-synth-unreported' }];
  assert.throws(() => computeQualityIndicators(input), (error: unknown) => {
    assert.ok(error instanceof QualityIndicatorInputError);
    assert.equal(error.code, 'corrected-reports-unknown-result');
    return true;
  });
});

test('rejects a critical value with a non-numeric acknowledgement delay', () => {
  const input = baselineInput();
  // @ts-expect-error deliberately malformed for the fail-closed test
  input.criticalValues = [{ criticalValueId: 'crit-synth-1', acknowledgedAfterMinutes: 'soon' }];
  assert.throws(() => computeQualityIndicators(input), (error: unknown) => {
    assert.ok(error instanceof QualityIndicatorInputError);
    assert.equal(error.code, 'critical-values-invalid');
    return true;
  });
});

test('rejects turnaround duration and compliance targets that declare different priorities', () => {
  const input = baselineInput();
  input.targets = {
    ...baselineTargets(),
    turnaroundCompliancePercentByPriority: { stat: 95 },
  };
  input.resultsReported = input.resultsReported.filter((event) => event.priority === 'stat');
  input.specimensRejected = [];
  input.correctedReports = [];
  assert.throws(() => computeQualityIndicators(input), (error: unknown) => {
    assert.ok(error instanceof QualityIndicatorInputError);
    assert.equal(error.code, 'targets-turnaround-priority-mismatch');
    return true;
  });
});

test('rejects a rejection rate target that is out of the 0-100 percent range', () => {
  const input = baselineInput();
  input.targets = {
    ...baselineTargets(),
    rejectionRatePercentByReason: { hemolysis: 150, 'insufficient-volume': 3 },
  };
  assert.throws(() => computeQualityIndicators(input), (error: unknown) => {
    assert.ok(error instanceof QualityIndicatorInputError);
    assert.equal(error.code, 'targets-rejection-rate-invalid');
    return true;
  });
});

test('rejects declared targets that are missing entirely', () => {
  const malformed = clone(baselineInput()) as Record<string, unknown>;
  delete malformed.targets;
  const input = malformed as unknown as MonthlyQualityIndicatorInput;
  assert.throws(() => computeQualityIndicators(input), (error: unknown) => {
    assert.ok(error instanceof QualityIndicatorInputError);
    assert.equal(error.code, 'targets-invalid');
    return true;
  });
});

test('the report never emits a ratePercent of 0 for an indicator that had no denominator, across every indicator', () => {
  const input: MonthlyQualityIndicatorInput = {
    period: '2026-09',
    specimensReceived: [],
    specimensRejected: [],
    resultsReported: [],
    correctedReports: [],
    criticalValues: [],
    targets: baselineTargets(),
  };
  const report = computeQualityIndicators(input);
  assert.equal(report.rejectionRateByReason.hemolysis.ratePercent, null);
  assert.equal(report.rejectionRateByReason['insufficient-volume'].ratePercent, null);
  assert.equal(report.turnaroundComplianceByPriority.stat.ratePercent, null);
  assert.equal(report.turnaroundComplianceByPriority.routine.ratePercent, null);
  assert.equal(report.correctedReportRate.ratePercent, null);
  assert.equal(report.criticalValueAckCompliance.ratePercent, null);
});
