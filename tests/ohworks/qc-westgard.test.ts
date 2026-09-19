import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateQCWestgardMultirule,
  explainQCWestgardRuleCode,
  QCWestgardInputError,
  type QCWestgardEvaluationInput,
  type QCWestgardInputErrorCode,
  type QCWestgardLevelStats,
  type QCWestgardResult,
  type QCWestgardRuleCode,
} from '../../lib/ohworks-qc-westgard';

/**
 * All fabricated: synthetic level/run identifiers, made-up timestamps, and
 * made-up numeric values. None of this represents a real instrument, lot,
 * or patient result.
 */
function baselineLevels(): QCWestgardLevelStats[] {
  return [
    { levelId: 'LEVEL-1', mean: 100, sd: 5 },
    { levelId: 'LEVEL-2', mean: 200, sd: 10 },
  ];
}

function isoAt(minuteOffset: number): string {
  return new Date(2026, 0, 1, 8, minuteOffset).toISOString();
}

function result(levelId: string, runId: string, value: number, minuteOffset: number): QCWestgardResult {
  return { levelId, runId, value, timestamp: isoAt(minuteOffset) };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const ALL_RULE_CODES: QCWestgardRuleCode[] = [
  '1_2s',
  '1_3s',
  '2_2s_within_level',
  '2_2s_across_levels',
  'R_4s',
  '4_1s',
  '10_x',
];

const ALL_INPUT_ERROR_CODES: QCWestgardInputErrorCode[] = [
  'levels-not-array',
  'no-levels',
  'level-malformed',
  'duplicate-level-id',
  'level-mean-non-finite',
  'level-sd-invalid',
  'results-not-array',
  'result-malformed',
  'unknown-level',
  'result-value-non-finite',
  'result-timestamp-invalid',
  'duplicate-level-run-pair',
  'timestamps-out-of-order',
];

const FORBIDDEN_WORDS = [/approved/i, /compliant/i, /accredited/i, /releasable/i, /diagnos/i];

test('no results at all yields no runs and no points', () => {
  const input: QCWestgardEvaluationInput = { levels: baselineLevels(), results: [] };
  const outcome = evaluateQCWestgardMultirule(input);
  assert.deepEqual(outcome.runs, []);
  assert.deepEqual(outcome.points, []);
});

test('an unremarkable single-level single-run point is accepted with a correct SDI', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [result('LEVEL-1', 'run-1', 101, 0)],
  };
  const outcome = evaluateQCWestgardMultirule(input);
  assert.equal(outcome.runs.length, 1);
  assert.equal(outcome.runs[0].status, 'accepted');
  assert.deepEqual(outcome.runs[0].violatedRules, []);
  assert.equal(outcome.points.length, 1);
  assert.equal(outcome.points[0].sdi, 0.2);
});

test('a lone point in a run reports 2_2s_across_levels and R_4s as not-evaluable, never satisfied', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [result('LEVEL-1', 'run-1', 100, 0)],
  };
  const outcome = evaluateQCWestgardMultirule(input);
  const evaluations = outcome.runs[0].evidence.ruleEvaluations;
  const across = evaluations.find((e) => e.rule === '2_2s_across_levels');
  const r4s = evaluations.find((e) => e.rule === 'R_4s');
  assert.equal(across?.status, 'not-evaluable');
  assert.equal(r4s?.status, 'not-evaluable');
});

test('the first point ever seen for a level reports 2_2s_within_level as not-evaluable', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [result('LEVEL-1', 'run-1', 100 + 2.5 * 5, 0)],
  };
  const outcome = evaluateQCWestgardMultirule(input);
  const evaluations = outcome.runs[0].evidence.ruleEvaluations;
  const within = evaluations.find((e) => e.rule === '2_2s_within_level');
  assert.equal(within?.status, 'not-evaluable');
});

test('4_1s and 10_x report not-evaluable until enough history exists, never satisfied prematurely', () => {
  const results: QCWestgardResult[] = [];
  for (let i = 0; i < 3; i += 1) {
    results.push(result('LEVEL-1', `run-${i}`, 100 + 1.5 * 5, i));
  }
  const input: QCWestgardEvaluationInput = { levels: baselineLevels(), results };
  const outcome = evaluateQCWestgardMultirule(input);
  for (const run of outcome.runs) {
    const four = run.evidence.ruleEvaluations.find((e) => e.rule === '4_1s');
    const ten = run.evidence.ruleEvaluations.find((e) => e.rule === '10_x');
    assert.equal(four?.status, 'not-evaluable');
    assert.equal(ten?.status, 'not-evaluable');
  }
});

test('1_2s fires as a warning and does not reject on its own', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [result('LEVEL-1', 'run-1', 100 + 2.5 * 5, 0)],
  };
  const outcome = evaluateQCWestgardMultirule(input);
  const run = outcome.runs[0];
  assert.equal(run.status, 'warning');
  assert.deepEqual(run.violatedRules, [
    { rule: '1_2s', severity: 'warning', position: 0, levelId: 'LEVEL-1' },
  ]);
});

test('1_3s fires and rejects on a single point beyond three standard deviations', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [result('LEVEL-1', 'run-1', 100 + 3.5 * 5, 0)],
  };
  const outcome = evaluateQCWestgardMultirule(input);
  const run = outcome.runs[0];
  assert.equal(run.status, 'rejected');
  const ruleNames = run.violatedRules.map((f) => f.rule);
  assert.ok(ruleNames.includes('1_3s'));
  assert.ok(ruleNames.includes('1_2s'));
});

test('1_3s does not fire for a point exactly at three standard deviations', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [result('LEVEL-1', 'run-1', 100 + 3 * 5, 0)],
  };
  const outcome = evaluateQCWestgardMultirule(input);
  assert.ok(!outcome.runs[0].violatedRules.some((f) => f.rule === '1_3s'));
});

test('2_2s_within_level fires and rejects on two consecutive same-side runs beyond two standard deviations', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [
      result('LEVEL-1', 'run-1', 100 + 2.5 * 5, 0),
      result('LEVEL-1', 'run-2', 100 + 2.2 * 5, 1),
      result('LEVEL-1', 'run-3', 100, 2),
    ],
  };
  const outcome = evaluateQCWestgardMultirule(input);
  const secondRun = outcome.runs[1];
  assert.equal(secondRun.status, 'rejected');
  assert.ok(secondRun.violatedRules.some((f) => f.rule === '2_2s_within_level' && f.position === 1));
});

test('2_2s_within_level does not fire when consecutive beyond-two-SD points are on opposite sides', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [
      result('LEVEL-1', 'run-1', 100 + 2.5 * 5, 0),
      result('LEVEL-1', 'run-2', 100 - 2.5 * 5, 1),
    ],
  };
  const outcome = evaluateQCWestgardMultirule(input);
  assert.ok(!outcome.runs[1].violatedRules.some((f) => f.rule === '2_2s_within_level'));
});

test('2_2s_across_levels fires and rejects on two different levels in the same run beyond two standard deviations', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [
      result('LEVEL-1', 'run-1', 100 + 2.5 * 5, 0),
      result('LEVEL-2', 'run-1', 200 + 2.2 * 10, 0),
    ],
  };
  const outcome = evaluateQCWestgardMultirule(input);
  const run = outcome.runs[0];
  assert.equal(run.status, 'rejected');
  assert.ok(
    run.violatedRules.some(
      (f) => f.rule === '2_2s_across_levels' && f.levelId === 'LEVEL-2' && f.pairedLevelId === 'LEVEL-1',
    ),
  );
});

test('2_2s_across_levels does not fire when the two levels are on opposite sides', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [
      result('LEVEL-1', 'run-1', 100 + 2.5 * 5, 0),
      result('LEVEL-2', 'run-1', 200 - 2.5 * 10, 0),
    ],
  };
  const outcome = evaluateQCWestgardMultirule(input);
  assert.ok(!outcome.runs[0].violatedRules.some((f) => f.rule === '2_2s_across_levels'));
});

test('4_1s fires and rejects on four consecutive same-side runs beyond one standard deviation', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [
      result('LEVEL-1', 'run-1', 100 + 1.5 * 5, 0),
      result('LEVEL-1', 'run-2', 100 + 1.3 * 5, 1),
      result('LEVEL-1', 'run-3', 100 + 1.4 * 5, 2),
      result('LEVEL-1', 'run-4', 100 + 1.1 * 5, 3),
    ],
  };
  const outcome = evaluateQCWestgardMultirule(input);
  const lastRun = outcome.runs[3];
  assert.equal(lastRun.status, 'rejected');
  assert.ok(lastRun.violatedRules.some((f) => f.rule === '4_1s'));
});

test('10_x fires and warns (not rejects) on ten consecutive same-side runs', () => {
  const results: QCWestgardResult[] = [];
  for (let i = 0; i < 10; i += 1) {
    results.push(result('LEVEL-1', `run-${i}`, 100 + 0.3 * 5, i));
  }
  const input: QCWestgardEvaluationInput = { levels: baselineLevels(), results };
  const outcome = evaluateQCWestgardMultirule(input);
  const lastRun = outcome.runs[9];
  assert.equal(lastRun.status, 'rejected');
  assert.ok(lastRun.violatedRules.some((f) => f.rule === '10_x'));
});

test('10_x does not fire when a point exactly at the mean breaks the same-side streak', () => {
  const results: QCWestgardResult[] = [];
  for (let i = 0; i < 9; i += 1) {
    results.push(result('LEVEL-1', `run-${i}`, 100 + 0.3 * 5, i));
  }
  results.push(result('LEVEL-1', 'run-9', 100, 9));
  results.push(result('LEVEL-1', 'run-10', 100 + 0.3 * 5, 10));
  const input: QCWestgardEvaluationInput = { levels: baselineLevels(), results };
  const outcome = evaluateQCWestgardMultirule(input);
  assert.ok(!outcome.runs.some((run) => run.violatedRules.some((f) => f.rule === '10_x')));
});

test('R_4s fires and rejects when two levels in the same run span more than four standard deviations', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [
      result('LEVEL-1', 'run-1', 100 + 2.5 * 5, 0),
      result('LEVEL-2', 'run-1', 200 - 2.5 * 10, 0),
    ],
  };
  const outcome = evaluateQCWestgardMultirule(input);
  const run = outcome.runs[0];
  assert.equal(run.status, 'rejected');
  assert.ok(
    run.violatedRules.some(
      (f) => f.rule === 'R_4s' && f.levelId === 'LEVEL-2' && f.pairedLevelId === 'LEVEL-1' && f.pairedPosition === 0,
    ),
  );
});

test('R_4s does not fire for two levels in the same run within four standard deviations', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [
      result('LEVEL-1', 'run-1', 100 + 1 * 5, 0),
      result('LEVEL-2', 'run-1', 200 - 1 * 10, 0),
    ],
  };
  const outcome = evaluateQCWestgardMultirule(input);
  assert.ok(!outcome.runs[0].violatedRules.some((f) => f.rule === 'R_4s'));
});

test('R_4s does not pair results from different runs', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [
      result('LEVEL-1', 'run-1', 100 + 2.5 * 5, 0),
      result('LEVEL-2', 'run-2', 200 - 2.5 * 10, 1),
    ],
  };
  const outcome = evaluateQCWestgardMultirule(input);
  assert.ok(!outcome.runs.some((run) => run.violatedRules.some((f) => f.rule === 'R_4s')));
});

test('runs are ordered by first appearance and violated rules are ordered by position, rule, and level', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [
      result('LEVEL-1', 'run-1', 100 + 3.5 * 5, 0),
      result('LEVEL-2', 'run-1', 200 - 3.5 * 10, 0),
    ],
  };
  const outcome = evaluateQCWestgardMultirule(input);
  assert.deepEqual(
    outcome.runs.map((r) => r.runId),
    ['run-1'],
  );
  const positions = outcome.runs[0].violatedRules.map((f) => f.position);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});

test('every rule code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_RULE_CODES) {
    const message = explainQCWestgardRuleCode(code);
    assert.ok(message.length > 0);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('rejects a declared level with a zero standard deviation', () => {
  const input: QCWestgardEvaluationInput = {
    levels: [{ levelId: 'LEVEL-1', mean: 100, sd: 0 }],
    results: [],
  };
  assert.throws(
    () => evaluateQCWestgardMultirule(input),
    (error: unknown) => error instanceof QCWestgardInputError && error.code === 'level-sd-invalid',
  );
});

test('rejects a declared level with a negative standard deviation', () => {
  const input: QCWestgardEvaluationInput = {
    levels: [{ levelId: 'LEVEL-1', mean: 100, sd: -5 }],
    results: [],
  };
  assert.throws(
    () => evaluateQCWestgardMultirule(input),
    (error: unknown) => error instanceof QCWestgardInputError && error.code === 'level-sd-invalid',
  );
});

test('rejects a declared level with a non-finite standard deviation', () => {
  const input: QCWestgardEvaluationInput = {
    levels: [{ levelId: 'LEVEL-1', mean: 100, sd: Infinity }],
    results: [],
  };
  assert.throws(
    () => evaluateQCWestgardMultirule(input),
    (error: unknown) => error instanceof QCWestgardInputError && error.code === 'level-sd-invalid',
  );
});

test('rejects a declared level with a non-finite mean', () => {
  const input: QCWestgardEvaluationInput = {
    levels: [{ levelId: 'LEVEL-1', mean: NaN, sd: 5 }],
    results: [],
  };
  assert.throws(
    () => evaluateQCWestgardMultirule(input),
    (error: unknown) => error instanceof QCWestgardInputError && error.code === 'level-mean-non-finite',
  );
});

test('rejects a QC result with a non-finite value', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [result('LEVEL-1', 'run-1', Infinity, 0)],
  };
  assert.throws(
    () => evaluateQCWestgardMultirule(input),
    (error: unknown) => error instanceof QCWestgardInputError && error.code === 'result-value-non-finite',
  );
});

test('rejects a QC result with a NaN value', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [result('LEVEL-1', 'run-1', NaN, 0)],
  };
  assert.throws(
    () => evaluateQCWestgardMultirule(input),
    (error: unknown) => error instanceof QCWestgardInputError && error.code === 'result-value-non-finite',
  );
});

test('rejects a QC result with a non-numeric value delivered as a string', () => {
  const input = {
    levels: baselineLevels(),
    results: [{ levelId: 'LEVEL-1', runId: 'run-1', value: 'not-a-number', timestamp: isoAt(0) }],
  } as unknown as QCWestgardEvaluationInput;
  assert.throws(
    () => evaluateQCWestgardMultirule(input),
    (error: unknown) => error instanceof QCWestgardInputError && error.code === 'result-value-non-finite',
  );
});

test('rejects a QC result declaring a level that was never declared', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [result('LEVEL-UNKNOWN', 'run-1', 100, 0)],
  };
  assert.throws(
    () => evaluateQCWestgardMultirule(input),
    (error: unknown) => error instanceof QCWestgardInputError && error.code === 'unknown-level',
  );
});

test('rejects duplicate declared level identifiers', () => {
  const input: QCWestgardEvaluationInput = {
    levels: [
      { levelId: 'LEVEL-1', mean: 100, sd: 5 },
      { levelId: 'LEVEL-1', mean: 105, sd: 5 },
    ],
    results: [],
  };
  assert.throws(
    () => evaluateQCWestgardMultirule(input),
    (error: unknown) => error instanceof QCWestgardInputError && error.code === 'duplicate-level-id',
  );
});

test('rejects more than one result for the same level within the same run', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [result('LEVEL-1', 'run-1', 100, 0), result('LEVEL-1', 'run-1', 101, 0)],
  };
  assert.throws(
    () => evaluateQCWestgardMultirule(input),
    (error: unknown) => error instanceof QCWestgardInputError && error.code === 'duplicate-level-run-pair',
  );
});

test('rejects a QC result with an unparsable timestamp', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [{ levelId: 'LEVEL-1', runId: 'run-1', value: 100, timestamp: 'not-a-timestamp' }],
  };
  assert.throws(
    () => evaluateQCWestgardMultirule(input),
    (error: unknown) => error instanceof QCWestgardInputError && error.code === 'result-timestamp-invalid',
  );
});

test('rejects QC results that are not given in non-decreasing timestamp order', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [result('LEVEL-1', 'run-1', 100, 5), result('LEVEL-1', 'run-2', 101, 0)],
  };
  assert.throws(
    () => evaluateQCWestgardMultirule(input),
    (error: unknown) => error instanceof QCWestgardInputError && error.code === 'timestamps-out-of-order',
  );
});

test('rejects a non-array levels field', () => {
  const input = { levels: 'not-an-array', results: [] } as unknown as QCWestgardEvaluationInput;
  assert.throws(
    () => evaluateQCWestgardMultirule(input),
    (error: unknown) => error instanceof QCWestgardInputError && error.code === 'levels-not-array',
  );
});

test('rejects an empty levels list', () => {
  const input: QCWestgardEvaluationInput = { levels: [], results: [] };
  assert.throws(
    () => evaluateQCWestgardMultirule(input),
    (error: unknown) => error instanceof QCWestgardInputError && error.code === 'no-levels',
  );
});

test('rejects a non-array results field', () => {
  const input = { levels: baselineLevels(), results: 'not-an-array' } as unknown as QCWestgardEvaluationInput;
  assert.throws(
    () => evaluateQCWestgardMultirule(input),
    (error: unknown) => error instanceof QCWestgardInputError && error.code === 'results-not-array',
  );
});

test('rejects a declared level missing its identity field', () => {
  const input = { levels: [{ mean: 100, sd: 5 }], results: [] } as unknown as QCWestgardEvaluationInput;
  assert.throws(
    () => evaluateQCWestgardMultirule(input),
    (error: unknown) => error instanceof QCWestgardInputError && error.code === 'level-malformed',
  );
});

test('rejects a QC result missing its identity field', () => {
  const input = { levels: baselineLevels(), results: [{ value: 100 }] } as unknown as QCWestgardEvaluationInput;
  assert.throws(
    () => evaluateQCWestgardMultirule(input),
    (error: unknown) => error instanceof QCWestgardInputError && error.code === 'result-malformed',
  );
});

test('every declared input error code produces a distinct, privacy-safe message', () => {
  const seen = new Set<string>();
  for (const code of ALL_INPUT_ERROR_CODES) {
    const error = new QCWestgardInputError(code);
    assert.equal(error.name, 'QCWestgardInputError');
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0);
    assert.ok(!seen.has(error.message));
    seen.add(error.message);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(error.message, pattern);
    }
  }
});

test('evaluation does not mutate the caller-supplied input', () => {
  const input: QCWestgardEvaluationInput = {
    levels: baselineLevels(),
    results: [result('LEVEL-1', 'run-1', 100 + 3.5 * 5, 0)],
  };
  const before = clone(input);
  evaluateQCWestgardMultirule(input);
  assert.deepEqual(input, before);
});
