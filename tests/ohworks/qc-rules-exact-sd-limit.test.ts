import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateQCRules,
  type QCRuleEvaluationInput,
  type QCRuleLevelStats,
  type QCRuleResult,
} from '../../lib/ohworks-qc-rules';

/**
 * All fabricated: a single synthetic QC level ('L1') with a made-up
 * mean/SD, and synthetic run ids. None of this represents a real
 * instrument, lot, or patient result. These cases exist to prove that a
 * value landing exactly on a Westgard SD limit is not pushed over it by
 * ordinary (value - mean) / sd floating-point drift.
 */
function driftLevels(): QCRuleLevelStats[] {
  return [{ levelId: 'L1', mean: 1, sd: 0.1 }];
}

function result(runId: string, value: number): QCRuleResult {
  return { levelId: 'L1', runId, value };
}

test('1_3s does not fire for a value exactly at 3 SD even with float drift in the z-score', () => {
  const input: QCRuleEvaluationInput = {
    levels: driftLevels(),
    results: [result('r1', 1.3)],
  };
  const outcome = evaluateQCRules(input);
  assert.equal(outcome.status, 'accepted');
  assert.deepEqual(outcome.firings, []);
});

test('1_3s still fires for a value just past 3 SD', () => {
  const input: QCRuleEvaluationInput = {
    levels: driftLevels(),
    results: [result('r1', 1.31)],
  };
  const outcome = evaluateQCRules(input);
  assert.equal(outcome.status, 'rejected');
  assert.deepEqual(outcome.firings, [{ rule: '1_3s', severity: 'reject', position: 0, levelId: 'L1' }]);
});

test('4_1s does not fire for four consecutive values exactly at +1 SD even with float drift', () => {
  const input: QCRuleEvaluationInput = {
    levels: driftLevels(),
    results: [result('r1', 1.1), result('r2', 1.1), result('r3', 1.1), result('r4', 1.1)],
  };
  const outcome = evaluateQCRules(input);
  assert.equal(outcome.status, 'accepted');
  assert.deepEqual(outcome.firings, []);
});

test('2_2s does not fire for two consecutive values exactly at +2 SD even with float drift', () => {
  const input: QCRuleEvaluationInput = {
    levels: driftLevels(),
    results: [result('r1', 1.2), result('r2', 1.2)],
  };
  const outcome = evaluateQCRules(input);
  assert.equal(outcome.status, 'accepted');
  assert.deepEqual(outcome.firings, []);
});

test('2_2s still fires for two consecutive values just past 2 SD', () => {
  const input: QCRuleEvaluationInput = {
    levels: driftLevels(),
    results: [result('r1', 1.21), result('r2', 1.21)],
  };
  const outcome = evaluateQCRules(input);
  assert.equal(outcome.status, 'rejected');
  assert.deepEqual(outcome.firings, [{ rule: '2_2s', severity: 'reject', position: 1, levelId: 'L1' }]);
});

test('R_4s does not fire for two levels exactly 4 SD apart even with float drift', () => {
  const input: QCRuleEvaluationInput = {
    levels: [
      { levelId: 'L1', mean: 1, sd: 0.1 },
      { levelId: 'L2', mean: 1, sd: 0.1 },
    ],
    results: [
      { levelId: 'L1', runId: 'r1', value: 1.2 },
      { levelId: 'L2', runId: 'r1', value: 0.8 },
    ],
  };
  const outcome = evaluateQCRules(input);
  assert.equal(outcome.status, 'accepted');
  assert.deepEqual(outcome.firings, []);
});

test('R_4s still fires for two levels just past 4 SD apart', () => {
  const input: QCRuleEvaluationInput = {
    levels: [
      { levelId: 'L1', mean: 1, sd: 0.1 },
      { levelId: 'L2', mean: 1, sd: 0.1 },
    ],
    results: [
      { levelId: 'L1', runId: 'r1', value: 1.21 },
      { levelId: 'L2', runId: 'r1', value: 0.8 },
    ],
  };
  const outcome = evaluateQCRules(input);
  assert.equal(outcome.status, 'rejected');
  assert.deepEqual(outcome.firings, [
    {
      rule: 'R_4s',
      severity: 'reject',
      position: 1,
      levelId: 'L2',
      pairedPosition: 0,
      pairedLevelId: 'L1',
    },
  ]);
});
