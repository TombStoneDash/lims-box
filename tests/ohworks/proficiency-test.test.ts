import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateProficiencyTestRounds,
  ProficiencyTestInputError,
  type ProficiencyTestRound,
} from '../../lib/ohworks-proficiency-test';

/**
 * All fabricated: synthetic round identifiers, analyte codes, and values.
 * None of this represents a real instrument, patient, or customer result.
 */
function fixedRangeRound(overrides: Partial<ProficiencyTestRound> = {}): ProficiencyTestRound {
  return {
    roundId: 'PT-ROUND-1',
    analyteCode: 'CHLORIDE',
    reportedValue: 15,
    reportedUnit: 'mg/L',
    assignedValue: 15,
    assignedUnit: 'mg/L',
    acceptanceCriterion: { kind: 'fixed-range', lowerBound: 10, upperBound: 20, unit: 'mg/L' },
    ...overrides,
  };
}

function percentageRound(overrides: Partial<ProficiencyTestRound> = {}): ProficiencyTestRound {
  return {
    roundId: 'PT-ROUND-1',
    analyteCode: 'CHLORIDE',
    reportedValue: 15,
    reportedUnit: 'mg/L',
    assignedValue: 15,
    assignedUnit: 'mg/L',
    acceptanceCriterion: { kind: 'percentage-of-assigned', percentage: 20, unit: 'mg/L' },
    ...overrides,
  };
}

test('a reported value inside a fixed-range criterion is acceptable', () => {
  const result = evaluateProficiencyTestRounds([fixedRangeRound()], {
    consecutiveUnacceptableThresholdForSuspension: 2,
  });
  assert.equal(result.roundEvaluations[0].classification, 'acceptable');
  assert.equal(result.roundEvaluations[0].deviation, 0);
  assert.deepEqual(result.roundEvaluations[0].reasons, []);
});

test('a reported value exactly at the fixed-range bounds is acceptable (inclusive)', () => {
  const lower = evaluateProficiencyTestRounds([fixedRangeRound({ reportedValue: 10 })], {
    consecutiveUnacceptableThresholdForSuspension: 2,
  });
  assert.equal(lower.roundEvaluations[0].classification, 'acceptable');

  const upper = evaluateProficiencyTestRounds([fixedRangeRound({ reportedValue: 20 })], {
    consecutiveUnacceptableThresholdForSuspension: 2,
  });
  assert.equal(upper.roundEvaluations[0].classification, 'acceptable');
});

test('a reported value outside a fixed-range criterion is unacceptable', () => {
  const result = evaluateProficiencyTestRounds([fixedRangeRound({ reportedValue: 25 })], {
    consecutiveUnacceptableThresholdForSuspension: 2,
  });
  assert.equal(result.roundEvaluations[0].classification, 'unacceptable');
  assert.equal(result.roundEvaluations[0].deviation, 10);
});

test('a reported value inside a percentage-of-assigned criterion is acceptable', () => {
  const result = evaluateProficiencyTestRounds([percentageRound({ reportedValue: 17 })], {
    consecutiveUnacceptableThresholdForSuspension: 2,
  });
  assert.equal(result.roundEvaluations[0].classification, 'acceptable');
});

test('a reported value outside a percentage-of-assigned criterion is unacceptable', () => {
  const result = evaluateProficiencyTestRounds([percentageRound({ reportedValue: 19 })], {
    consecutiveUnacceptableThresholdForSuspension: 2,
  });
  assert.equal(result.roundEvaluations[0].classification, 'unacceptable');
  assert.ok(Math.abs((result.roundEvaluations[0].percentDeviation ?? 0) - (4 / 15) * 100) < 1e-9);
});

test('a percentage criterion boundary is acceptable (inclusive)', () => {
  const result = evaluateProficiencyTestRounds([percentageRound({ reportedValue: 18 })], {
    consecutiveUnacceptableThresholdForSuspension: 2,
  });
  assert.equal(result.roundEvaluations[0].classification, 'acceptable');
});

test('a negative assigned value with a percentage criterion still computes a valid, ordered range', () => {
  const result = evaluateProficiencyTestRounds(
    [
      percentageRound({
        reportedValue: -11,
        assignedValue: -10,
      }),
    ],
    { consecutiveUnacceptableThresholdForSuspension: 2 },
  );
  assert.equal(result.roundEvaluations[0].classification, 'acceptable');
  assert.deepEqual(result.roundEvaluations[0].reasons, []);
});

test('an assigned value of zero yields an undefined percentDeviation but is still evaluated', () => {
  const result = evaluateProficiencyTestRounds(
    [
      fixedRangeRound({
        assignedValue: 0,
        reportedValue: 0,
        acceptanceCriterion: { kind: 'fixed-range', lowerBound: -1, upperBound: 1, unit: 'mg/L' },
      }),
    ],
    { consecutiveUnacceptableThresholdForSuspension: 2 },
  );
  assert.equal(result.roundEvaluations[0].classification, 'acceptable');
  assert.equal(result.roundEvaluations[0].percentDeviation, undefined);
});

test('a missing assigned value fails closed to not_evaluated', () => {
  const result = evaluateProficiencyTestRounds([fixedRangeRound({ assignedValue: undefined })], {
    consecutiveUnacceptableThresholdForSuspension: 2,
  });
  assert.equal(result.roundEvaluations[0].classification, 'not_evaluated');
  assert.deepEqual(result.roundEvaluations[0].reasons, [{ code: 'assigned-value-missing' }]);
  assert.equal(result.roundEvaluations[0].deviation, undefined);
});

test('a non-finite assigned value fails closed to not_evaluated', () => {
  const result = evaluateProficiencyTestRounds([fixedRangeRound({ assignedValue: NaN })], {
    consecutiveUnacceptableThresholdForSuspension: 2,
  });
  assert.equal(result.roundEvaluations[0].classification, 'not_evaluated');
  assert.ok(result.roundEvaluations[0].reasons.some((r) => r.code === 'assigned-value-non-finite'));
});

test('a non-finite reported value fails closed to not_evaluated', () => {
  const result = evaluateProficiencyTestRounds([fixedRangeRound({ reportedValue: Infinity })], {
    consecutiveUnacceptableThresholdForSuspension: 2,
  });
  assert.equal(result.roundEvaluations[0].classification, 'not_evaluated');
  assert.ok(result.roundEvaluations[0].reasons.some((r) => r.code === 'reported-value-non-finite'));
});

test('a unit mismatch between reported and assigned units fails closed to not_evaluated', () => {
  const result = evaluateProficiencyTestRounds([fixedRangeRound({ assignedUnit: 'ug/L' })], {
    consecutiveUnacceptableThresholdForSuspension: 2,
  });
  assert.equal(result.roundEvaluations[0].classification, 'not_evaluated');
  assert.ok(result.roundEvaluations[0].reasons.some((r) => r.code === 'unit-mismatch'));
});

test('a unit mismatch between the criterion unit and the result units fails closed to not_evaluated', () => {
  const result = evaluateProficiencyTestRounds(
    [fixedRangeRound({ acceptanceCriterion: { kind: 'fixed-range', lowerBound: 10, upperBound: 20, unit: 'ug/L' } })],
    { consecutiveUnacceptableThresholdForSuspension: 2 },
  );
  assert.equal(result.roundEvaluations[0].classification, 'not_evaluated');
  assert.ok(result.roundEvaluations[0].reasons.some((r) => r.code === 'unit-mismatch'));
});

test('outer-whitespace and case differences in matching units are tolerated, not flagged mismatched', () => {
  const result = evaluateProficiencyTestRounds(
    [
      fixedRangeRound({
        reportedUnit: '  MG/L  ',
        assignedUnit: 'Mg/L',
        acceptanceCriterion: { kind: 'fixed-range', lowerBound: 10, upperBound: 20, unit: 'mg/l' },
      }),
    ],
    { consecutiveUnacceptableThresholdForSuspension: 2 },
  );
  assert.equal(result.roundEvaluations[0].classification, 'acceptable');
});

test('an inverted fixed-range criterion fails closed to not_evaluated', () => {
  const result = evaluateProficiencyTestRounds(
    [fixedRangeRound({ acceptanceCriterion: { kind: 'fixed-range', lowerBound: 20, upperBound: 10, unit: 'mg/L' } })],
    { consecutiveUnacceptableThresholdForSuspension: 2 },
  );
  assert.equal(result.roundEvaluations[0].classification, 'not_evaluated');
  assert.ok(result.roundEvaluations[0].reasons.some((r) => r.code === 'fixed-range-inverted'));
});

test('a non-finite fixed-range bound fails closed to not_evaluated', () => {
  const result = evaluateProficiencyTestRounds(
    [fixedRangeRound({ acceptanceCriterion: { kind: 'fixed-range', lowerBound: NaN, upperBound: 20, unit: 'mg/L' } })],
    { consecutiveUnacceptableThresholdForSuspension: 2 },
  );
  assert.equal(result.roundEvaluations[0].classification, 'not_evaluated');
  assert.ok(result.roundEvaluations[0].reasons.some((r) => r.code === 'fixed-range-bound-non-finite'));
});

test('a negative percentage criterion fails closed to not_evaluated', () => {
  const result = evaluateProficiencyTestRounds(
    [percentageRound({ acceptanceCriterion: { kind: 'percentage-of-assigned', percentage: -5, unit: 'mg/L' } })],
    { consecutiveUnacceptableThresholdForSuspension: 2 },
  );
  assert.equal(result.roundEvaluations[0].classification, 'not_evaluated');
  assert.ok(result.roundEvaluations[0].reasons.some((r) => r.code === 'percentage-negative'));
});

test('a non-finite percentage criterion fails closed to not_evaluated', () => {
  const result = evaluateProficiencyTestRounds(
    [percentageRound({ acceptanceCriterion: { kind: 'percentage-of-assigned', percentage: Infinity, unit: 'mg/L' } })],
    { consecutiveUnacceptableThresholdForSuspension: 2 },
  );
  assert.equal(result.roundEvaluations[0].classification, 'not_evaluated');
  assert.ok(result.roundEvaluations[0].reasons.some((r) => r.code === 'percentage-non-finite'));
});

test('duplicate round identifiers fail closed to not_evaluated for every affected round', () => {
  const result = evaluateProficiencyTestRounds(
    [
      fixedRangeRound({ roundId: 'PT-ROUND-DUP', analyteCode: 'CHLORIDE' }),
      fixedRangeRound({ roundId: 'PT-ROUND-DUP', analyteCode: 'NITRATE' }),
    ],
    { consecutiveUnacceptableThresholdForSuspension: 2 },
  );
  assert.equal(result.roundEvaluations[0].classification, 'not_evaluated');
  assert.equal(result.roundEvaluations[1].classification, 'not_evaluated');
  assert.deepEqual(result.roundEvaluations[0].reasons, [{ code: 'round-id-duplicate' }]);
  assert.deepEqual(result.roundEvaluations[1].reasons, [{ code: 'round-id-duplicate' }]);
});

test('a non-duplicated round identifier alongside a duplicated one is unaffected', () => {
  const result = evaluateProficiencyTestRounds(
    [
      fixedRangeRound({ roundId: 'PT-ROUND-DUP' }),
      fixedRangeRound({ roundId: 'PT-ROUND-DUP' }),
      fixedRangeRound({ roundId: 'PT-ROUND-UNIQUE' }),
    ],
    { consecutiveUnacceptableThresholdForSuspension: 2 },
  );
  assert.equal(result.roundEvaluations[2].classification, 'acceptable');
});

test('multiple independent defects are all reported, deterministically sorted', () => {
  const result = evaluateProficiencyTestRounds(
    [fixedRangeRound({ reportedValue: NaN, assignedValue: undefined, assignedUnit: 'ug/L' })],
    { consecutiveUnacceptableThresholdForSuspension: 2 },
  );
  const codes = result.roundEvaluations[0].reasons.map((r) => r.code);
  assert.deepEqual(codes, ['assigned-value-missing', 'reported-value-non-finite', 'unit-mismatch'].sort());
  assert.deepEqual([...codes].sort(), codes);
});

test('two consecutive unacceptable rounds for an analyte reach the suspension threshold', () => {
  const result = evaluateProficiencyTestRounds(
    [
      fixedRangeRound({ roundId: 'R1', reportedValue: 25 }),
      fixedRangeRound({ roundId: 'R2', reportedValue: 26 }),
    ],
    { consecutiveUnacceptableThresholdForSuspension: 2 },
  );
  const status = result.analyteStatuses.find((s) => s.analyteCode === 'CHLORIDE');
  assert.equal(status?.consecutiveUnacceptableRounds, 2);
  assert.equal(status?.needsSuspension, true);
});

test('a single unacceptable round does not reach a threshold of two', () => {
  const result = evaluateProficiencyTestRounds([fixedRangeRound({ roundId: 'R1', reportedValue: 25 })], {
    consecutiveUnacceptableThresholdForSuspension: 2,
  });
  const status = result.analyteStatuses.find((s) => s.analyteCode === 'CHLORIDE');
  assert.equal(status?.consecutiveUnacceptableRounds, 1);
  assert.equal(status?.needsSuspension, false);
});

test('an acceptable round resets the consecutive-unacceptable streak', () => {
  const result = evaluateProficiencyTestRounds(
    [
      fixedRangeRound({ roundId: 'R1', reportedValue: 25 }),
      fixedRangeRound({ roundId: 'R2', reportedValue: 26 }),
      fixedRangeRound({ roundId: 'R3', reportedValue: 15 }),
    ],
    { consecutiveUnacceptableThresholdForSuspension: 2 },
  );
  const status = result.analyteStatuses.find((s) => s.analyteCode === 'CHLORIDE');
  assert.equal(status?.consecutiveUnacceptableRounds, 0);
  assert.equal(status?.needsSuspension, false);
});

test('a not_evaluated round neither extends nor resets the consecutive-unacceptable streak', () => {
  const result = evaluateProficiencyTestRounds(
    [
      fixedRangeRound({ roundId: 'R1', reportedValue: 25 }),
      fixedRangeRound({ roundId: 'R2', assignedValue: undefined }),
      fixedRangeRound({ roundId: 'R3', reportedValue: 26 }),
    ],
    { consecutiveUnacceptableThresholdForSuspension: 2 },
  );
  const status = result.analyteStatuses.find((s) => s.analyteCode === 'CHLORIDE');
  assert.equal(status?.consecutiveUnacceptableRounds, 2);
  assert.equal(status?.needsSuspension, true);
});

test('analyte streaks are tracked independently per analyte', () => {
  const result = evaluateProficiencyTestRounds(
    [
      fixedRangeRound({ roundId: 'R1', analyteCode: 'CHLORIDE', reportedValue: 25 }),
      fixedRangeRound({ roundId: 'R2', analyteCode: 'NITRATE', reportedValue: 15 }),
      fixedRangeRound({ roundId: 'R3', analyteCode: 'CHLORIDE', reportedValue: 26 }),
    ],
    { consecutiveUnacceptableThresholdForSuspension: 2 },
  );
  const chloride = result.analyteStatuses.find((s) => s.analyteCode === 'CHLORIDE');
  const nitrate = result.analyteStatuses.find((s) => s.analyteCode === 'NITRATE');
  assert.equal(chloride?.needsSuspension, true);
  assert.equal(nitrate?.consecutiveUnacceptableRounds, 0);
});

test('analyte statuses are sorted by analyte code', () => {
  const result = evaluateProficiencyTestRounds(
    [
      fixedRangeRound({ roundId: 'R1', analyteCode: 'NITRATE' }),
      fixedRangeRound({ roundId: 'R2', analyteCode: 'CHLORIDE' }),
    ],
    { consecutiveUnacceptableThresholdForSuspension: 2 },
  );
  assert.deepEqual(
    result.analyteStatuses.map((s) => s.analyteCode),
    ['CHLORIDE', 'NITRATE'],
  );
});

test('rounds that are not an array throw ProficiencyTestInputError', () => {
  assert.throws(
    () => evaluateProficiencyTestRounds('not-an-array' as unknown as ProficiencyTestRound[], {
      consecutiveUnacceptableThresholdForSuspension: 2,
    }),
    ProficiencyTestInputError,
  );
});

test('a zero suspension threshold throws ProficiencyTestInputError', () => {
  assert.throws(
    () => evaluateProficiencyTestRounds([fixedRangeRound()], { consecutiveUnacceptableThresholdForSuspension: 0 }),
    ProficiencyTestInputError,
  );
});

test('a non-integer suspension threshold throws ProficiencyTestInputError', () => {
  assert.throws(
    () => evaluateProficiencyTestRounds([fixedRangeRound()], { consecutiveUnacceptableThresholdForSuspension: 1.5 }),
    ProficiencyTestInputError,
  );
});

test('a non-finite suspension threshold throws ProficiencyTestInputError', () => {
  assert.throws(
    () => evaluateProficiencyTestRounds([fixedRangeRound()], { consecutiveUnacceptableThresholdForSuspension: NaN }),
    ProficiencyTestInputError,
  );
});

test('a round missing its identifier throws ProficiencyTestInputError', () => {
  const bad = fixedRangeRound() as unknown as Record<string, unknown>;
  delete bad.roundId;
  assert.throws(
    () => evaluateProficiencyTestRounds([bad as unknown as ProficiencyTestRound], {
      consecutiveUnacceptableThresholdForSuspension: 2,
    }),
    ProficiencyTestInputError,
  );
});

test('a round with an unrecognized acceptance criterion kind throws ProficiencyTestInputError', () => {
  const bad = fixedRangeRound({
    acceptanceCriterion: { kind: 'unknown-kind' } as unknown as ProficiencyTestRound['acceptanceCriterion'],
  });
  assert.throws(
    () => evaluateProficiencyTestRounds([bad], { consecutiveUnacceptableThresholdForSuspension: 2 }),
    ProficiencyTestInputError,
  );
});

test('evaluation is pure: it does not mutate the input', () => {
  const rounds = [fixedRangeRound({ roundId: 'R1' }), percentageRound({ roundId: 'R2' })];
  const before = JSON.stringify(rounds);
  evaluateProficiencyTestRounds(rounds, { consecutiveUnacceptableThresholdForSuspension: 2 });
  assert.equal(JSON.stringify(rounds), before);
});

test('evaluation is deterministic across repeated calls with the same input', () => {
  const rounds = [fixedRangeRound({ roundId: 'R1' }), fixedRangeRound({ roundId: 'R2', reportedValue: 30 })];
  const first = evaluateProficiencyTestRounds(rounds, { consecutiveUnacceptableThresholdForSuspension: 2 });
  const second = evaluateProficiencyTestRounds(rounds, { consecutiveUnacceptableThresholdForSuspension: 2 });
  assert.deepEqual(first, second);
});

test('every classification is one of the three defined outcomes', () => {
  const allowed = ['acceptable', 'unacceptable', 'not_evaluated'];
  const result = evaluateProficiencyTestRounds(
    [
      fixedRangeRound({ roundId: 'R1' }),
      fixedRangeRound({ roundId: 'R2', reportedValue: 100 }),
      fixedRangeRound({ roundId: 'R3', assignedValue: undefined }),
    ],
    { consecutiveUnacceptableThresholdForSuspension: 2 },
  );
  for (const evaluation of result.roundEvaluations) {
    assert.ok(allowed.includes(evaluation.classification));
  }
});
