import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateMeasurementUncertainty,
  explainMeasurementUncertaintyReason,
  MeasurementUncertaintyInputError,
  type DecisionLimitInput,
  type MeasurementUncertaintyReasonCode,
  type PatientResultInput,
  type QCUncertaintyLevelInput,
} from '../../lib/ohworks-measurement-uncertainty';

/**
 * All fabricated: synthetic level identifiers and made-up numeric values.
 * None of this represents a real instrument, customer, or result.
 */
function baselineLevel(): QCUncertaintyLevelInput {
  return {
    levelId: 'level-synthetic-1',
    unit: 'mg/L',
    minimumPointCount: 5,
    coverageFactor: 2,
    points: [
      { value: 10.0, unit: 'mg/L' },
      { value: 10.2, unit: 'mg/L' },
      { value: 9.8, unit: 'mg/L' },
      { value: 10.1, unit: 'mg/L' },
      { value: 9.9, unit: 'mg/L' },
    ],
  };
}

function baselinePatientResult(): PatientResultInput {
  return { value: 12, unit: 'mg/L' };
}

function baselineDecisionLimit(): DecisionLimitInput {
  return { value: 20, unit: 'mg/L' };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const ALL_REASON_CODES: MeasurementUncertaintyReasonCode[] = [
  'insufficient-qc-points',
  'non-finite-value',
  'unit-mismatch',
  'uncertainty-evaluated',
];

const FORBIDDEN_WORDS = [/approved/i, /compliant/i, /accredited/i, /releasable/i];

function meanOf(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function sampleStdDevOf(values: number[]): number {
  const mean = meanOf(values);
  const sumSq = values.reduce((sum, v) => sum + (v - mean) ** 2, 0);
  return Math.sqrt(sumSq / (values.length - 1));
}

test('a well-formed baseline QC series is evaluated with correct statistics', () => {
  const level = baselineLevel();
  const result = evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit());
  assert.equal(result.decision, 'evaluated');
  assert.equal(result.reasonCode, 'uncertainty-evaluated');
  assert.ok(result.statistics);

  const values = level.points.map((p) => p.value);
  const expectedMean = meanOf(values);
  const expectedSd = sampleStdDevOf(values);
  const expectedCv = (expectedSd / expectedMean) * 100;
  const expectedExpanded = level.coverageFactor * expectedSd;

  assert.equal(result.statistics!.pointCount, 5);
  assert.ok(Math.abs(result.statistics!.mean - expectedMean) < 1e-9);
  assert.ok(Math.abs(result.statistics!.standardDeviation - expectedSd) < 1e-9);
  assert.ok(Math.abs(result.statistics!.coefficientOfVariationPercent - expectedCv) < 1e-9);
  assert.ok(Math.abs(result.statistics!.expandedUncertainty - expectedExpanded) < 1e-9);
});

test('the patient interval is centered on the patient value with the expanded uncertainty as the half-width', () => {
  const result = evaluateMeasurementUncertainty(baselineLevel(), baselinePatientResult(), baselineDecisionLimit());
  assert.ok(result.patientInterval);
  const expandedUncertainty = result.statistics!.expandedUncertainty;
  assert.ok(Math.abs(result.patientInterval!.lowerBound - (12 - expandedUncertainty)) < 1e-9);
  assert.ok(Math.abs(result.patientInterval!.upperBound - (12 + expandedUncertainty)) < 1e-9);
  assert.equal(result.patientInterval!.value, 12);
  assert.equal(result.patientInterval!.unit, 'mg/L');
});

test('a decision limit far outside the interval does not cross', () => {
  const result = evaluateMeasurementUncertainty(baselineLevel(), baselinePatientResult(), baselineDecisionLimit());
  assert.ok(result.decisionLimitCrossing);
  assert.equal(result.decisionLimitCrossing!.crossesInterval, false);
});

test('a decision limit inside the interval crosses', () => {
  const level = baselineLevel();
  const result = evaluateMeasurementUncertainty(level, { value: 12, unit: 'mg/L' }, { value: 12.05, unit: 'mg/L' });
  assert.ok(result.decisionLimitCrossing);
  assert.equal(result.decisionLimitCrossing!.crossesInterval, true);
});

test('a decision limit exactly at the upper bound crosses', () => {
  const level = baselineLevel();
  const result = evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit());
  const upper = result.patientInterval!.upperBound;
  const boundaryResult = evaluateMeasurementUncertainty(level, baselinePatientResult(), { value: upper, unit: 'mg/L' });
  assert.equal(boundaryResult.decisionLimitCrossing!.crossesInterval, true);
});

test('a decision limit exactly at the lower bound crosses', () => {
  const level = baselineLevel();
  const result = evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit());
  const lower = result.patientInterval!.lowerBound;
  const boundaryResult = evaluateMeasurementUncertainty(level, baselinePatientResult(), { value: lower, unit: 'mg/L' });
  assert.equal(boundaryResult.decisionLimitCrossing!.crossesInterval, true);
});

test('a decision limit just past the upper bound does not cross', () => {
  const level = baselineLevel();
  const result = evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit());
  const upper = result.patientInterval!.upperBound;
  const boundaryResult = evaluateMeasurementUncertainty(level, baselinePatientResult(), {
    value: upper + 1,
    unit: 'mg/L',
  });
  assert.equal(boundaryResult.decisionLimitCrossing!.crossesInterval, false);
});

test('exactly the declared minimum point count is accepted', () => {
  const level = baselineLevel();
  level.minimumPointCount = 5;
  assert.equal(level.points.length, 5);
  const result = evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit());
  assert.equal(result.decision, 'evaluated');
});

test('fewer QC points than the declared minimum fails closed to blocked', () => {
  const level = baselineLevel();
  level.points = level.points.slice(0, 4);
  const result = evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit());
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'insufficient-qc-points');
  assert.equal(result.statistics, null);
  assert.equal(result.patientInterval, null);
  assert.equal(result.decisionLimitCrossing, null);
});

test('zero QC points fails closed to blocked as insufficient', () => {
  const level = baselineLevel();
  level.points = [];
  const result = evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit());
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'insufficient-qc-points');
});

test('more QC points than the declared minimum is accepted', () => {
  const level = baselineLevel();
  level.points.push({ value: 10.05, unit: 'mg/L' });
  const result = evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit());
  assert.equal(result.decision, 'evaluated');
  assert.equal(result.statistics!.pointCount, 6);
});

test('a NaN QC point value fails closed to blocked as non-finite', () => {
  const level = baselineLevel();
  level.points[0].value = NaN;
  const result = evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit());
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'non-finite-value');
});

test('an Infinity QC point value fails closed to blocked as non-finite', () => {
  const level = baselineLevel();
  level.points[0].value = Infinity;
  const result = evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit());
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'non-finite-value');
});

test('a NaN patient result value fails closed to blocked as non-finite', () => {
  const result = evaluateMeasurementUncertainty(baselineLevel(), { value: NaN, unit: 'mg/L' }, baselineDecisionLimit());
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'non-finite-value');
});

test('an Infinity decision limit value fails closed to blocked as non-finite', () => {
  const result = evaluateMeasurementUncertainty(baselineLevel(), baselinePatientResult(), {
    value: Infinity,
    unit: 'mg/L',
  });
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'non-finite-value');
});

test('a QC series with zero mean fails closed to blocked as non-finite (coefficient of variation undefined)', () => {
  const level = baselineLevel();
  level.points = [
    { value: 1, unit: 'mg/L' },
    { value: -1, unit: 'mg/L' },
    { value: 0.5, unit: 'mg/L' },
    { value: -0.5, unit: 'mg/L' },
    { value: 0, unit: 'mg/L' },
  ];
  const result = evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit());
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'non-finite-value');
});

test('a QC point unit that disagrees with the declared level unit fails closed to blocked', () => {
  const level = baselineLevel();
  level.points[0].unit = 'g/L';
  const result = evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit());
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'unit-mismatch');
});

test('a patient result unit that disagrees with the declared level unit fails closed to blocked', () => {
  const result = evaluateMeasurementUncertainty(baselineLevel(), { value: 12, unit: 'g/L' }, baselineDecisionLimit());
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'unit-mismatch');
});

test('a decision limit unit that disagrees with the declared level unit fails closed to blocked', () => {
  const result = evaluateMeasurementUncertainty(baselineLevel(), baselinePatientResult(), {
    value: 20,
    unit: 'g/L',
  });
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'unit-mismatch');
});

test('units with only outer whitespace and case differences still match, not flagged as mismatched', () => {
  const level = baselineLevel();
  level.unit = '  MG/L  ';
  level.points = level.points.map((p) => ({ ...p, unit: ' Mg/L ' }));
  const result = evaluateMeasurementUncertainty(level, { value: 12, unit: 'mg/l' }, { value: 20, unit: 'MG/L' });
  assert.equal(result.decision, 'evaluated');
});

test('canonicalization never infers a conversion: mg/L and g/L still mismatch', () => {
  const level = baselineLevel();
  level.unit = 'mg/L';
  const result = evaluateMeasurementUncertainty(level, { value: 12, unit: 'g/L' }, baselineDecisionLimit());
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'unit-mismatch');
});

test('a blank (whitespace-only) QC point unit fails closed to blocked as mismatched, not canonicalized away', () => {
  const level = baselineLevel();
  level.points[0].unit = '   ';
  const result = evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit());
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'unit-mismatch');
});

test('evaluation is pure: it does not mutate input level, patient result, or decision limit', () => {
  const level = baselineLevel();
  const patientResult = baselinePatientResult();
  const decisionLimit = baselineDecisionLimit();
  const levelBefore = JSON.stringify(level);
  const patientBefore = JSON.stringify(patientResult);
  const limitBefore = JSON.stringify(decisionLimit);
  evaluateMeasurementUncertainty(level, patientResult, decisionLimit);
  assert.equal(JSON.stringify(level), levelBefore);
  assert.equal(JSON.stringify(patientResult), patientBefore);
  assert.equal(JSON.stringify(decisionLimit), limitBefore);
});

test('evaluation is deterministic across repeated calls', () => {
  const level = baselineLevel();
  const patientResult = baselinePatientResult();
  const decisionLimit = baselineDecisionLimit();
  const first = evaluateMeasurementUncertainty(level, patientResult, decisionLimit);
  const second = evaluateMeasurementUncertainty(clone(level), clone(patientResult), clone(decisionLimit));
  assert.deepEqual(first, second);
});

test('the returned result and its nested objects are immutable', () => {
  const result = evaluateMeasurementUncertainty(baselineLevel(), baselinePatientResult(), baselineDecisionLimit());
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.statistics));
  assert.ok(Object.isFrozen(result.patientInterval));
  assert.ok(Object.isFrozen(result.decisionLimitCrossing));
});

test('a higher coverage factor produces a wider interval', () => {
  const narrowLevel = baselineLevel();
  narrowLevel.coverageFactor = 1;
  const wideLevel = baselineLevel();
  wideLevel.coverageFactor = 3;
  const narrow = evaluateMeasurementUncertainty(narrowLevel, baselinePatientResult(), baselineDecisionLimit());
  const wide = evaluateMeasurementUncertainty(wideLevel, baselinePatientResult(), baselineDecisionLimit());
  assert.ok(wide.statistics!.expandedUncertainty > narrow.statistics!.expandedUncertainty);
  assert.ok(wide.patientInterval!.upperBound > narrow.patientInterval!.upperBound);
  assert.ok(wide.patientInterval!.lowerBound < narrow.patientInterval!.lowerBound);
});

test('a level with a non-integer declared minimum point count throws a sanitized typed error', () => {
  const level = baselineLevel();
  (level as unknown as { minimumPointCount: number }).minimumPointCount = 4.5;
  assert.throws(
    () => evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit()),
    (error: unknown) => {
      assert.ok(error instanceof MeasurementUncertaintyInputError);
      assert.equal((error as MeasurementUncertaintyInputError).code, 'level-malformed');
      return true;
    },
  );
});

test('a level with a declared minimum point count below 2 throws a sanitized typed error', () => {
  const level = baselineLevel();
  level.minimumPointCount = 1;
  assert.throws(
    () => evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit()),
    (error: unknown) => {
      assert.ok(error instanceof MeasurementUncertaintyInputError);
      assert.equal((error as MeasurementUncertaintyInputError).code, 'level-malformed');
      return true;
    },
  );
});

test('a non-positive declared coverage factor throws a sanitized typed error', () => {
  const level = baselineLevel();
  level.coverageFactor = 0;
  assert.throws(
    () => evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit()),
    (error: unknown) => {
      assert.ok(error instanceof MeasurementUncertaintyInputError);
      assert.equal((error as MeasurementUncertaintyInputError).code, 'level-malformed');
      return true;
    },
  );
});

test('a negative declared coverage factor throws a sanitized typed error', () => {
  const level = baselineLevel();
  level.coverageFactor = -2;
  assert.throws(() => evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit()), MeasurementUncertaintyInputError);
});

test('a non-finite declared coverage factor throws a sanitized typed error', () => {
  const level = baselineLevel();
  level.coverageFactor = Infinity;
  assert.throws(() => evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit()), MeasurementUncertaintyInputError);
});

test('a level missing its identifier throws a sanitized typed error', () => {
  const level = baselineLevel();
  delete (level as Partial<QCUncertaintyLevelInput>).levelId;
  assert.throws(
    () => evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit()),
    (error: unknown) => {
      assert.ok(error instanceof MeasurementUncertaintyInputError);
      assert.equal((error as MeasurementUncertaintyInputError).code, 'level-malformed');
      return true;
    },
  );
});

test('a level whose points field is not an array throws a sanitized typed error', () => {
  const level = baselineLevel();
  (level as unknown as { points: unknown }).points = 'not-an-array';
  assert.throws(() => evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit()), MeasurementUncertaintyInputError);
});

test('a QC point missing its value throws a sanitized typed error', () => {
  const level = baselineLevel();
  delete (level.points[0] as { value?: number }).value;
  assert.throws(
    () => evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit()),
    (error: unknown) => {
      assert.ok(error instanceof MeasurementUncertaintyInputError);
      assert.equal((error as MeasurementUncertaintyInputError).code, 'qc-point-malformed');
      return true;
    },
  );
});

test('a QC point with a non-string unit throws a sanitized typed error', () => {
  const level = baselineLevel();
  (level.points[0] as unknown as { unit: unknown }).unit = 5;
  assert.throws(() => evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit()), MeasurementUncertaintyInputError);
});

test('a patient result missing its value throws a sanitized typed error', () => {
  const patientResult = baselinePatientResult();
  delete (patientResult as Partial<PatientResultInput>).value;
  assert.throws(
    () => evaluateMeasurementUncertainty(baselineLevel(), patientResult, baselineDecisionLimit()),
    (error: unknown) => {
      assert.ok(error instanceof MeasurementUncertaintyInputError);
      assert.equal((error as MeasurementUncertaintyInputError).code, 'patient-result-malformed');
      return true;
    },
  );
});

test('a decision limit missing its unit throws a sanitized typed error', () => {
  const decisionLimit = baselineDecisionLimit();
  delete (decisionLimit as Partial<DecisionLimitInput>).unit;
  assert.throws(
    () => evaluateMeasurementUncertainty(baselineLevel(), baselinePatientResult(), decisionLimit),
    (error: unknown) => {
      assert.ok(error instanceof MeasurementUncertaintyInputError);
      assert.equal((error as MeasurementUncertaintyInputError).code, 'decision-limit-malformed');
      return true;
    },
  );
});

test('a typed input error message never echoes any submitted data', () => {
  const level = baselineLevel();
  level.coverageFactor = -1;
  try {
    evaluateMeasurementUncertainty(level, baselinePatientResult(), baselineDecisionLimit());
    assert.fail('expected evaluateMeasurementUncertainty to throw');
  } catch (error) {
    assert.ok(error instanceof MeasurementUncertaintyInputError);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch((error as Error).message, pattern);
    }
    assert.doesNotMatch((error as Error).message, /level-synthetic/);
  }
});

test('every reason code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainMeasurementUncertaintyReason(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /level-synthetic/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(
    explainMeasurementUncertaintyReason('uncertainty-evaluated'),
    explainMeasurementUncertaintyReason('uncertainty-evaluated'),
  );
});

test('no decision or reason code ever uses approval, compliance, accreditation, or release language', () => {
  const decisions: string[] = ['evaluated', 'blocked'];
  for (const value of [...decisions, ...ALL_REASON_CODES]) {
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(value, pattern);
    }
  }
});
