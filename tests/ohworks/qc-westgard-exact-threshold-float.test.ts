import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateQCWestgardMultirule,
  type QCWestgardEvaluationInput,
  type QCWestgardLevelStats,
  type QCWestgardResult,
} from '../../lib/ohworks-qc-westgard';

/**
 * All fabricated: synthetic level/run identifiers, a made-up timestamp, and
 * made-up numeric values. None of this represents a real instrument, lot,
 * or patient result.
 *
 * Each case below uses a single declared level and a single result, so the
 * only rules that can possibly evaluate are 1_2s and 1_3s -- every other
 * rule is `not-evaluable` for a lone point in a lone run. The point is
 * constructed so that (value - mean) / sd lands on or just past an exact SD
 * boundary with IEEE-754 float drift, e.g. (7.5 - 7.35) / 0.05 evaluates to
 * 3.000000000000007, not exactly 3.
 */
function singlePointInput(level: QCWestgardLevelStats, result: QCWestgardResult): QCWestgardEvaluationInput {
  return { levels: [level], results: [result] };
}

const TIMESTAMP = new Date(2026, 0, 1, 8, 0).toISOString();

test('a value whose float sdi drifts just past exactly 3 SD is warning with only 1_2s, not rejected', () => {
  const level: QCWestgardLevelStats = { levelId: 'LEVEL-1', mean: 7.35, sd: 0.05 };
  const point: QCWestgardResult = { levelId: 'LEVEL-1', runId: 'run-1', value: 7.5, timestamp: TIMESTAMP };
  const outcome = evaluateQCWestgardMultirule(singlePointInput(level, point));
  assert.equal(outcome.runs.length, 1);
  assert.equal(outcome.runs[0].status, 'warning');
  assert.deepEqual(
    outcome.runs[0].violatedRules.map((firing) => firing.rule),
    ['1_2s'],
  );
});

test('a value whose float sdi drifts just past exactly 2 SD is accepted with no violations', () => {
  const level: QCWestgardLevelStats = { levelId: 'LEVEL-1', mean: 5.1, sd: 0.1 };
  const point: QCWestgardResult = { levelId: 'LEVEL-1', runId: 'run-1', value: 5.3, timestamp: TIMESTAMP };
  const outcome = evaluateQCWestgardMultirule(singlePointInput(level, point));
  assert.equal(outcome.runs.length, 1);
  assert.equal(outcome.runs[0].status, 'accepted');
  assert.deepEqual(outcome.runs[0].violatedRules, []);
});

test('a value genuinely beyond 3 SD is still rejected with 1_2s and 1_3s', () => {
  const level: QCWestgardLevelStats = { levelId: 'LEVEL-1', mean: 7.35, sd: 0.05 };
  const point: QCWestgardResult = { levelId: 'LEVEL-1', runId: 'run-1', value: 7.51, timestamp: TIMESTAMP };
  const outcome = evaluateQCWestgardMultirule(singlePointInput(level, point));
  assert.equal(outcome.runs.length, 1);
  assert.equal(outcome.runs[0].status, 'rejected');
  assert.deepEqual(
    outcome.runs[0].violatedRules.map((firing) => firing.rule),
    ['1_2s', '1_3s'],
  );
});

test('a value genuinely beyond 2 SD but not 3 SD is still warning with only 1_2s', () => {
  const level: QCWestgardLevelStats = { levelId: 'LEVEL-1', mean: 5.1, sd: 0.1 };
  const point: QCWestgardResult = { levelId: 'LEVEL-1', runId: 'run-1', value: 5.31, timestamp: TIMESTAMP };
  const outcome = evaluateQCWestgardMultirule(singlePointInput(level, point));
  assert.equal(outcome.runs.length, 1);
  assert.equal(outcome.runs[0].status, 'warning');
  assert.deepEqual(
    outcome.runs[0].violatedRules.map((firing) => firing.rule),
    ['1_2s'],
  );
});
