import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateQCRules,
  explainQCRuleCode,
  QCRuleEvaluationInputError,
  type QCRuleCode,
  type QCRuleEvaluationInput,
  type QCRuleEvaluationInputErrorCode,
  type QCRuleLevelStats,
  type QCRuleResult,
} from '../../lib/ohworks-qc-rules';

/**
 * All fabricated: synthetic level/run identifiers and made-up numeric
 * values. None of this represents a real instrument, lot, or patient
 * result.
 */
function baselineLevels(): QCRuleLevelStats[] {
  return [
    { levelId: 'LEVEL-1', mean: 100, sd: 5 },
    { levelId: 'LEVEL-2', mean: 200, sd: 10 },
  ];
}

function result(levelId: string, runId: string, value: number): QCRuleResult {
  return { levelId, runId, value };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const ALL_RULE_CODES: QCRuleCode[] = ['1_3s', '2_2s', '4_1s', '10_x', 'R_4s'];

const ALL_INPUT_ERROR_CODES: QCRuleEvaluationInputErrorCode[] = [
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
  'duplicate-level-run-pair',
];

const FORBIDDEN_WORDS = [/approved/i, /compliant/i, /accredited/i, /releasable/i, /diagnos/i];

test('a run with no results at all is accepted with no firings', () => {
  const input: QCRuleEvaluationInput = { levels: baselineLevels(), results: [] };
  const outcome = evaluateQCRules(input);
  assert.equal(outcome.status, 'accepted');
  assert.deepEqual(outcome.firings, []);
});

test('unremarkable results near the mean are accepted', () => {
  const input: QCRuleEvaluationInput = {
    levels: baselineLevels(),
    results: [
      result('LEVEL-1', 'run-1', 101),
      result('LEVEL-1', 'run-2', 99),
      result('LEVEL-1', 'run-3', 100.5),
      result('LEVEL-2', 'run-1', 201),
    ],
  };
  const outcome = evaluateQCRules(input);
  assert.equal(outcome.status, 'accepted');
  assert.deepEqual(outcome.firings, []);
});

test('1_3s fires and rejects on a single point beyond three standard deviations', () => {
  const input: QCRuleEvaluationInput = {
    levels: baselineLevels(),
    results: [result('LEVEL-1', 'run-1', 100 + 3.5 * 5)],
  };
  const outcome = evaluateQCRules(input);
  assert.equal(outcome.status, 'rejected');
  assert.deepEqual(outcome.firings, [
    { rule: '1_3s', severity: 'reject', position: 0, levelId: 'LEVEL-1' },
  ]);
});

test('1_3s does not fire for a point exactly at three standard deviations', () => {
  const input: QCRuleEvaluationInput = {
    levels: baselineLevels(),
    results: [result('LEVEL-1', 'run-1', 100 + 3 * 5)],
  };
  const outcome = evaluateQCRules(input);
  assert.equal(outcome.status, 'accepted');
});

test('2_2s fires and rejects on two consecutive same-side points beyond two standard deviations', () => {
  const input: QCRuleEvaluationInput = {
    levels: baselineLevels(),
    results: [
      result('LEVEL-1', 'run-1', 100 + 2.5 * 5),
      result('LEVEL-1', 'run-2', 100 + 2.2 * 5),
      result('LEVEL-1', 'run-3', 100),
    ],
  };
  const outcome = evaluateQCRules(input);
  assert.equal(outcome.status, 'rejected');
  assert.deepEqual(outcome.firings, [
    { rule: '2_2s', severity: 'reject', position: 1, levelId: 'LEVEL-1' },
  ]);
});

test('2_2s does not fire when consecutive beyond-two-SD points are on opposite sides', () => {
  const input: QCRuleEvaluationInput = {
    levels: baselineLevels(),
    results: [
      result('LEVEL-1', 'run-1', 100 + 2.5 * 5),
      result('LEVEL-1', 'run-2', 100 - 2.5 * 5),
    ],
  };
  const outcome = evaluateQCRules(input);
  assert.equal(outcome.status, 'accepted');
});

test('4_1s fires and rejects on four consecutive same-side points beyond one standard deviation', () => {
  const input: QCRuleEvaluationInput = {
    levels: baselineLevels(),
    results: [
      result('LEVEL-1', 'run-1', 100 + 1.5 * 5),
      result('LEVEL-1', 'run-2', 100 + 1.3 * 5),
      result('LEVEL-1', 'run-3', 100 + 1.4 * 5),
      result('LEVEL-1', 'run-4', 100 + 1.1 * 5),
    ],
  };
  const outcome = evaluateQCRules(input);
  assert.equal(outcome.status, 'rejected');
  assert.deepEqual(outcome.firings, [
    { rule: '4_1s', severity: 'reject', position: 3, levelId: 'LEVEL-1' },
  ]);
});

test('4_1s fires once per completed window on a longer same-side streak', () => {
  const input: QCRuleEvaluationInput = {
    levels: baselineLevels(),
    results: [
      result('LEVEL-1', 'run-1', 100 + 1.5 * 5),
      result('LEVEL-1', 'run-2', 100 + 1.5 * 5),
      result('LEVEL-1', 'run-3', 100 + 1.5 * 5),
      result('LEVEL-1', 'run-4', 100 + 1.5 * 5),
      result('LEVEL-1', 'run-5', 100 + 1.5 * 5),
    ],
  };
  const outcome = evaluateQCRules(input);
  const fourOneS = outcome.firings.filter((firing) => firing.rule === '4_1s');
  assert.deepEqual(fourOneS.map((firing) => firing.position), [3, 4]);
});

test('10_x fires and warns (not rejects) on ten consecutive same-side points', () => {
  const results: QCRuleResult[] = [];
  for (let i = 0; i < 10; i += 1) {
    results.push(result('LEVEL-1', `run-${i}`, 100 + 0.3 * 5));
  }
  const input: QCRuleEvaluationInput = { levels: baselineLevels(), results };
  const outcome = evaluateQCRules(input);
  assert.equal(outcome.status, 'warning');
  assert.deepEqual(outcome.firings, [
    { rule: '10_x', severity: 'warning', position: 9, levelId: 'LEVEL-1' },
  ]);
});

test('10_x does not fire when a point exactly at the mean breaks the same-side streak', () => {
  const results: QCRuleResult[] = [];
  for (let i = 0; i < 9; i += 1) {
    results.push(result('LEVEL-1', `run-${i}`, 100 + 0.3 * 5));
  }
  results.push(result('LEVEL-1', 'run-9', 100));
  results.push(result('LEVEL-1', 'run-10', 100 + 0.3 * 5));
  const input: QCRuleEvaluationInput = { levels: baselineLevels(), results };
  const outcome = evaluateQCRules(input);
  assert.equal(outcome.status, 'accepted');
});

test('a rejecting rule outranks a simultaneous warning-only rule in the overall status', () => {
  const results: QCRuleResult[] = [];
  for (let i = 0; i < 10; i += 1) {
    results.push(result('LEVEL-1', `run-${i}`, 100 + 0.3 * 5));
  }
  results.push(result('LEVEL-1', 'run-last', 100 + 3.5 * 5));
  const input: QCRuleEvaluationInput = { levels: baselineLevels(), results };
  const outcome = evaluateQCRules(input);
  assert.equal(outcome.status, 'rejected');
  assert.ok(outcome.firings.some((firing) => firing.rule === '10_x'));
  assert.ok(outcome.firings.some((firing) => firing.rule === '1_3s'));
});

test('R_4s fires and rejects when two levels in the same run span more than four standard deviations', () => {
  const input: QCRuleEvaluationInput = {
    levels: baselineLevels(),
    results: [
      result('LEVEL-1', 'run-1', 100 + 2.5 * 5),
      result('LEVEL-2', 'run-1', 200 - 2.5 * 10),
    ],
  };
  const outcome = evaluateQCRules(input);
  assert.equal(outcome.status, 'rejected');
  assert.deepEqual(outcome.firings, [
    {
      rule: 'R_4s',
      severity: 'reject',
      position: 1,
      levelId: 'LEVEL-2',
      pairedPosition: 0,
      pairedLevelId: 'LEVEL-1',
    },
  ]);
});

test('R_4s does not fire for two levels in the same run within four standard deviations', () => {
  const input: QCRuleEvaluationInput = {
    levels: baselineLevels(),
    results: [
      result('LEVEL-1', 'run-1', 100 + 1 * 5),
      result('LEVEL-2', 'run-1', 200 - 1 * 10),
    ],
  };
  const outcome = evaluateQCRules(input);
  assert.equal(outcome.status, 'accepted');
});

test('R_4s does not pair results from different runs', () => {
  const input: QCRuleEvaluationInput = {
    levels: baselineLevels(),
    results: [
      result('LEVEL-1', 'run-1', 100 + 2.5 * 5),
      result('LEVEL-2', 'run-2', 200 - 2.5 * 10),
    ],
  };
  const outcome = evaluateQCRules(input);
  assert.equal(outcome.status, 'accepted');
});

test('firings are ordered by position and then by rule name', () => {
  const input: QCRuleEvaluationInput = {
    levels: baselineLevels(),
    results: [
      result('LEVEL-1', 'run-1', 100 + 3.5 * 5),
      result('LEVEL-2', 'run-1', 200 - 3.5 * 10),
    ],
  };
  const outcome = evaluateQCRules(input);
  const positions = outcome.firings.map((firing) => firing.position);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});

test('every rule code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_RULE_CODES) {
    const message = explainQCRuleCode(code);
    assert.ok(message.length > 0);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('rejects a declared level with a zero standard deviation', () => {
  const input: QCRuleEvaluationInput = {
    levels: [{ levelId: 'LEVEL-1', mean: 100, sd: 0 }],
    results: [],
  };
  assert.throws(
    () => evaluateQCRules(input),
    (error: unknown) => error instanceof QCRuleEvaluationInputError && error.code === 'level-sd-invalid',
  );
});

test('rejects a declared level with a negative standard deviation', () => {
  const input: QCRuleEvaluationInput = {
    levels: [{ levelId: 'LEVEL-1', mean: 100, sd: -5 }],
    results: [],
  };
  assert.throws(
    () => evaluateQCRules(input),
    (error: unknown) => error instanceof QCRuleEvaluationInputError && error.code === 'level-sd-invalid',
  );
});

test('rejects a declared level with a non-finite standard deviation', () => {
  const input: QCRuleEvaluationInput = {
    levels: [{ levelId: 'LEVEL-1', mean: 100, sd: Infinity }],
    results: [],
  };
  assert.throws(
    () => evaluateQCRules(input),
    (error: unknown) => error instanceof QCRuleEvaluationInputError && error.code === 'level-sd-invalid',
  );
});

test('rejects a declared level with a non-finite mean', () => {
  const input: QCRuleEvaluationInput = {
    levels: [{ levelId: 'LEVEL-1', mean: NaN, sd: 5 }],
    results: [],
  };
  assert.throws(
    () => evaluateQCRules(input),
    (error: unknown) => error instanceof QCRuleEvaluationInputError && error.code === 'level-mean-non-finite',
  );
});

test('rejects a QC result with a non-finite value', () => {
  const input: QCRuleEvaluationInput = {
    levels: baselineLevels(),
    results: [result('LEVEL-1', 'run-1', Infinity)],
  };
  assert.throws(
    () => evaluateQCRules(input),
    (error: unknown) => error instanceof QCRuleEvaluationInputError && error.code === 'result-value-non-finite',
  );
});

test('rejects a QC result with a NaN value', () => {
  const input: QCRuleEvaluationInput = {
    levels: baselineLevels(),
    results: [result('LEVEL-1', 'run-1', NaN)],
  };
  assert.throws(
    () => evaluateQCRules(input),
    (error: unknown) => error instanceof QCRuleEvaluationInputError && error.code === 'result-value-non-finite',
  );
});

test('rejects a QC result declaring a level that was never declared', () => {
  const input: QCRuleEvaluationInput = {
    levels: baselineLevels(),
    results: [result('LEVEL-UNKNOWN', 'run-1', 100)],
  };
  assert.throws(
    () => evaluateQCRules(input),
    (error: unknown) => error instanceof QCRuleEvaluationInputError && error.code === 'unknown-level',
  );
});

test('rejects duplicate declared level identifiers', () => {
  const input: QCRuleEvaluationInput = {
    levels: [
      { levelId: 'LEVEL-1', mean: 100, sd: 5 },
      { levelId: 'LEVEL-1', mean: 105, sd: 5 },
    ],
    results: [],
  };
  assert.throws(
    () => evaluateQCRules(input),
    (error: unknown) => error instanceof QCRuleEvaluationInputError && error.code === 'duplicate-level-id',
  );
});

test('rejects more than one result for the same level within the same run', () => {
  const input: QCRuleEvaluationInput = {
    levels: baselineLevels(),
    results: [result('LEVEL-1', 'run-1', 100), result('LEVEL-1', 'run-1', 101)],
  };
  assert.throws(
    () => evaluateQCRules(input),
    (error: unknown) => error instanceof QCRuleEvaluationInputError && error.code === 'duplicate-level-run-pair',
  );
});

test('rejects a non-array levels field', () => {
  const input = { levels: 'not-an-array', results: [] } as unknown as QCRuleEvaluationInput;
  assert.throws(
    () => evaluateQCRules(input),
    (error: unknown) => error instanceof QCRuleEvaluationInputError && error.code === 'levels-not-array',
  );
});

test('rejects an empty levels list', () => {
  const input: QCRuleEvaluationInput = { levels: [], results: [] };
  assert.throws(
    () => evaluateQCRules(input),
    (error: unknown) => error instanceof QCRuleEvaluationInputError && error.code === 'no-levels',
  );
});

test('rejects a non-array results field', () => {
  const input = { levels: baselineLevels(), results: 'not-an-array' } as unknown as QCRuleEvaluationInput;
  assert.throws(
    () => evaluateQCRules(input),
    (error: unknown) => error instanceof QCRuleEvaluationInputError && error.code === 'results-not-array',
  );
});

test('rejects a declared level missing its identity field', () => {
  const input = { levels: [{ mean: 100, sd: 5 }], results: [] } as unknown as QCRuleEvaluationInput;
  assert.throws(
    () => evaluateQCRules(input),
    (error: unknown) => error instanceof QCRuleEvaluationInputError && error.code === 'level-malformed',
  );
});

test('rejects a QC result missing its identity field', () => {
  const input = { levels: baselineLevels(), results: [{ value: 100 }] } as unknown as QCRuleEvaluationInput;
  assert.throws(
    () => evaluateQCRules(input),
    (error: unknown) => error instanceof QCRuleEvaluationInputError && error.code === 'result-malformed',
  );
});

test('every declared input error code produces a distinct, privacy-safe message', () => {
  const seen = new Set<string>();
  for (const code of ALL_INPUT_ERROR_CODES) {
    const error = new QCRuleEvaluationInputError(code);
    assert.equal(error.name, 'QCRuleEvaluationInputError');
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
  const input: QCRuleEvaluationInput = {
    levels: baselineLevels(),
    results: [result('LEVEL-1', 'run-1', 100 + 3.5 * 5)],
  };
  const before = clone(input);
  evaluateQCRules(input);
  assert.deepEqual(input, before);
});
