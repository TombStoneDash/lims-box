import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CarryoverInputError,
  evaluateCarryoverRisk,
  explainCarryoverReason,
  type CarryoverReasonCode,
  type CarryoverRun,
  type CarryoverSampleResult,
  type CarryoverThresholdRule,
} from '../../lib/ohworks-carryover';

/**
 * All fabricated: synthetic result identifiers, analyte codes, and made-up
 * numeric values. None of this represents a real patient, sample, or
 * instrument result.
 */
function baselineRules(): CarryoverThresholdRule[] {
  return [
    { analyteCode: 'ANALYTE-SYNTH-A', highThreshold: 100, carryoverFactor: 0.1, repeatThreshold: 5 },
    { analyteCode: 'ANALYTE-SYNTH-B', highThreshold: 200, carryoverFactor: 0.2, repeatThreshold: 10 },
  ];
}

function result(overrides: Partial<CarryoverSampleResult> = {}): CarryoverSampleResult {
  return {
    resultId: 'result-synthetic-1',
    position: 1,
    analyteCode: 'ANALYTE-SYNTH-A',
    value: 10,
    washBefore: false,
    ...overrides,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const ALL_REASON_CODES: CarryoverReasonCode[] = [
  'no-preceding-high',
  'reset-by-wash',
  'contribution-within-threshold',
  'contribution-exceeds-threshold',
];

const FORBIDDEN_WORDS = [/approved/i, /compliant/i, /accredited/i, /releasable/i];

test('a lone low result with no preceding high is clear', () => {
  const run: CarryoverRun = { results: [result()], rules: baselineRules() };
  const [assessment] = evaluateCarryoverRisk(run);
  assert.equal(assessment.status, 'clear');
  assert.equal(assessment.reasonCode, 'no-preceding-high');
  assert.equal(assessment.contribution, null);
  assert.equal(assessment.sourcePosition, null);
});

test('evaluation is pure: it does not mutate the input run', () => {
  const run: CarryoverRun = { results: [result()], rules: baselineRules() };
  const before = JSON.stringify(run);
  evaluateCarryoverRisk(run);
  assert.equal(JSON.stringify(run), before);
});

test('evaluation is deterministic across repeated calls', () => {
  const run: CarryoverRun = {
    results: [
      result({ resultId: 'r1', position: 1, value: 150 }),
      result({ resultId: 'r2', position: 2, value: 20 }),
    ],
    rules: baselineRules(),
  };
  const first = evaluateCarryoverRisk(run);
  const second = evaluateCarryoverRisk(clone(run));
  assert.deepEqual(first, second);
});

test('a result following a high result at risk but under the repeat threshold is at_risk', () => {
  // high = 150, carryoverFactor 0.1 -> contribution 15, repeatThreshold 5 exceeded -> must_repeat instead.
  // Use a smaller high so contribution stays under threshold: high = 40 -> contribution 4 < 5.
  const run: CarryoverRun = {
    results: [
      result({ resultId: 'r1', position: 1, value: 150 }),
      result({ resultId: 'r2', position: 2, value: 20 }),
    ],
    rules: [{ analyteCode: 'ANALYTE-SYNTH-A', highThreshold: 100, carryoverFactor: 0.02, repeatThreshold: 5 }],
  };
  const results = evaluateCarryoverRisk(run);
  const r2 = results[1];
  assert.equal(r2.status, 'at_risk');
  assert.equal(r2.reasonCode, 'contribution-within-threshold');
  assert.equal(r2.contribution, 3);
  assert.equal(r2.sourcePosition, 1);
});

test('a result following a high result whose contribution exceeds the repeat threshold must be repeated', () => {
  const run: CarryoverRun = {
    results: [
      result({ resultId: 'r1', position: 1, value: 150 }),
      result({ resultId: 'r2', position: 2, value: 20 }),
    ],
    rules: baselineRules(),
  };
  const results = evaluateCarryoverRisk(run);
  const r2 = results[1];
  assert.equal(r2.status, 'must_repeat');
  assert.equal(r2.reasonCode, 'contribution-exceeds-threshold');
  assert.equal(r2.contribution, 15);
  assert.equal(r2.sourcePosition, 1);
});

test('a contribution exactly at the repeat threshold does not require repeat', () => {
  const run: CarryoverRun = {
    results: [
      result({ resultId: 'r1', position: 1, value: 150 }),
      result({ resultId: 'r2', position: 2, value: 20 }),
    ],
    rules: [{ analyteCode: 'ANALYTE-SYNTH-A', highThreshold: 100, carryoverFactor: 0.1, repeatThreshold: 15 }],
  };
  const results = evaluateCarryoverRisk(run);
  assert.equal(results[1].status, 'at_risk');
});

test('carryover risk persists across multiple unwashed positions following the same high result', () => {
  const run: CarryoverRun = {
    results: [
      result({ resultId: 'r1', position: 1, value: 150 }),
      result({ resultId: 'r2', position: 2, value: 20 }),
      result({ resultId: 'r3', position: 3, value: 20 }),
    ],
    rules: baselineRules(),
  };
  const results = evaluateCarryoverRisk(run);
  assert.equal(results[1].status, 'must_repeat');
  assert.equal(results[2].status, 'must_repeat');
  assert.equal(results[2].sourcePosition, 1);
});

test('a declared wash step resets the carryover risk for the analyte it was pending for', () => {
  const run: CarryoverRun = {
    results: [
      result({ resultId: 'r1', position: 1, value: 150 }),
      result({ resultId: 'r2', position: 2, value: 20, washBefore: true }),
    ],
    rules: baselineRules(),
  };
  const results = evaluateCarryoverRisk(run);
  assert.equal(results[1].status, 'clear');
  assert.equal(results[1].reasonCode, 'reset-by-wash');
  assert.equal(results[1].contribution, null);
});

test('a wash step with no pending high result for any analyte reports no-preceding-high, not reset-by-wash', () => {
  const run: CarryoverRun = { results: [result({ washBefore: true })], rules: baselineRules() };
  const [assessment] = evaluateCarryoverRisk(run);
  assert.equal(assessment.status, 'clear');
  assert.equal(assessment.reasonCode, 'no-preceding-high');
});

test('a wash step resets every analyte pending source, not just the washed result analyte', () => {
  const run: CarryoverRun = {
    results: [
      result({ resultId: 'r1', position: 1, analyteCode: 'ANALYTE-SYNTH-A', value: 150 }),
      result({ resultId: 'r2', position: 2, analyteCode: 'ANALYTE-SYNTH-B', value: 250, washBefore: true }),
      result({ resultId: 'r3', position: 3, analyteCode: 'ANALYTE-SYNTH-A', value: 20 }),
    ],
    rules: baselineRules(),
  };
  const results = evaluateCarryoverRisk(run);
  // r2 washes before it runs, which clears ANALYTE-SYNTH-A's pending high from r1.
  assert.equal(results[2].status, 'clear');
  assert.equal(results[2].reasonCode, 'no-preceding-high');
});

test('after a wash, a new high result establishes a fresh active source', () => {
  const run: CarryoverRun = {
    results: [
      result({ resultId: 'r1', position: 1, value: 150 }),
      result({ resultId: 'r2', position: 2, value: 300, washBefore: true }),
      result({ resultId: 'r3', position: 3, value: 20 }),
    ],
    rules: baselineRules(),
  };
  const results = evaluateCarryoverRisk(run);
  assert.equal(results[2].status, 'must_repeat');
  assert.equal(results[2].sourcePosition, 2);
});

test('a high result itself is assessed against any preceding unwashed high result', () => {
  const run: CarryoverRun = {
    results: [
      result({ resultId: 'r1', position: 1, value: 150 }),
      result({ resultId: 'r2', position: 2, value: 500 }),
    ],
    rules: baselineRules(),
  };
  const results = evaluateCarryoverRisk(run);
  assert.equal(results[1].status, 'must_repeat');
  assert.equal(results[1].sourcePosition, 1);
});

test('multiple analytes are tracked independently without interference', () => {
  const run: CarryoverRun = {
    results: [
      result({ resultId: 'r1', position: 1, analyteCode: 'ANALYTE-SYNTH-A', value: 150 }),
      result({ resultId: 'r2', position: 2, analyteCode: 'ANALYTE-SYNTH-B', value: 20 }),
    ],
    rules: baselineRules(),
  };
  const results = evaluateCarryoverRisk(run);
  assert.equal(results[1].status, 'clear');
  assert.equal(results[1].reasonCode, 'no-preceding-high');
});

test('a result exactly at the high threshold counts as high', () => {
  const run: CarryoverRun = {
    results: [
      result({ resultId: 'r1', position: 1, value: 100 }),
      result({ resultId: 'r2', position: 2, value: 20 }),
    ],
    rules: baselineRules(),
  };
  const results = evaluateCarryoverRisk(run);
  assert.equal(results[1].sourcePosition, 1);
});

test('a result just under the high threshold does not count as high', () => {
  const run: CarryoverRun = {
    results: [
      result({ resultId: 'r1', position: 1, value: 99.999 }),
      result({ resultId: 'r2', position: 2, value: 20 }),
    ],
    rules: baselineRules(),
  };
  const results = evaluateCarryoverRisk(run);
  assert.equal(results[1].status, 'clear');
  assert.equal(results[1].reasonCode, 'no-preceding-high');
});

test('positions given out of strictly increasing order fail closed', () => {
  const run: CarryoverRun = {
    results: [result({ resultId: 'r1', position: 2 }), result({ resultId: 'r2', position: 1 })],
    rules: baselineRules(),
  };
  assert.throws(
    () => evaluateCarryoverRisk(run),
    (error: unknown) => {
      assert.ok(error instanceof CarryoverInputError);
      assert.equal((error as CarryoverInputError).code, 'positions-out-of-order');
      return true;
    },
  );
});

test('duplicate positions fail closed', () => {
  const run: CarryoverRun = {
    results: [result({ resultId: 'r1', position: 1 }), result({ resultId: 'r2', position: 1 })],
    rules: baselineRules(),
  };
  assert.throws(
    () => evaluateCarryoverRisk(run),
    (error: unknown) => {
      assert.ok(error instanceof CarryoverInputError);
      assert.equal((error as CarryoverInputError).code, 'positions-out-of-order');
      return true;
    },
  );
});

test('a non-integer position fails closed', () => {
  const run: CarryoverRun = { results: [result({ position: 1.5 })], rules: baselineRules() };
  assert.throws(
    () => evaluateCarryoverRisk(run),
    (error: unknown) => {
      assert.ok(error instanceof CarryoverInputError);
      assert.equal((error as CarryoverInputError).code, 'invalid-position');
      return true;
    },
  );
});

test('a non-finite position fails closed', () => {
  const run: CarryoverRun = { results: [result({ position: Number.POSITIVE_INFINITY })], rules: baselineRules() };
  assert.throws(
    () => evaluateCarryoverRisk(run),
    (error: unknown) => {
      assert.ok(error instanceof CarryoverInputError);
      assert.equal((error as CarryoverInputError).code, 'invalid-position');
      return true;
    },
  );
});

test('an unknown analyte with no declared rule fails closed', () => {
  const run: CarryoverRun = { results: [result({ analyteCode: 'ANALYTE-SYNTH-UNDECLARED' })], rules: baselineRules() };
  assert.throws(
    () => evaluateCarryoverRisk(run),
    (error: unknown) => {
      assert.ok(error instanceof CarryoverInputError);
      assert.equal((error as CarryoverInputError).code, 'unknown-analyte');
      return true;
    },
  );
});

test('a non-finite value fails closed', () => {
  const run: CarryoverRun = { results: [result({ value: Number.NaN })], rules: baselineRules() };
  assert.throws(
    () => evaluateCarryoverRisk(run),
    (error: unknown) => {
      assert.ok(error instanceof CarryoverInputError);
      assert.equal((error as CarryoverInputError).code, 'non-finite-value');
      return true;
    },
  );
});

test('an infinite value fails closed', () => {
  const run: CarryoverRun = { results: [result({ value: Number.POSITIVE_INFINITY })], rules: baselineRules() };
  assert.throws(
    () => evaluateCarryoverRisk(run),
    (error: unknown) => {
      assert.ok(error instanceof CarryoverInputError);
      assert.equal((error as CarryoverInputError).code, 'non-finite-value');
      return true;
    },
  );
});

test('a nonnumeric string value fails closed rather than being coerced', () => {
  const run: CarryoverRun = { results: [result({ value: '150' as unknown })], rules: baselineRules() };
  assert.throws(
    () => evaluateCarryoverRisk(run),
    (error: unknown) => {
      assert.ok(error instanceof CarryoverInputError);
      assert.equal((error as CarryoverInputError).code, 'non-finite-value');
      return true;
    },
  );
});

test('a missing identity field throws a sanitized typed error', () => {
  const run: CarryoverRun = { results: [{ ...result(), resultId: '' }], rules: baselineRules() };
  assert.throws(
    () => evaluateCarryoverRisk(run),
    (error: unknown) => {
      assert.ok(error instanceof CarryoverInputError);
      assert.equal((error as CarryoverInputError).code, 'result-missing-identity');
      return true;
    },
  );
});

test('a non-boolean washBefore throws a sanitized typed error', () => {
  const run: CarryoverRun = { results: [{ ...result(), washBefore: 'yes' as unknown as boolean }], rules: baselineRules() };
  assert.throws(
    () => evaluateCarryoverRisk(run),
    (error: unknown) => {
      assert.ok(error instanceof CarryoverInputError);
      assert.equal((error as CarryoverInputError).code, 'result-missing-identity');
      return true;
    },
  );
});

test('duplicate result identifiers throw a sanitized typed error', () => {
  const run: CarryoverRun = {
    results: [result({ resultId: 'dup', position: 1 }), result({ resultId: 'dup', position: 2 })],
    rules: baselineRules(),
  };
  assert.throws(
    () => evaluateCarryoverRisk(run),
    (error: unknown) => {
      assert.ok(error instanceof CarryoverInputError);
      assert.equal((error as CarryoverInputError).code, 'duplicate-result-id');
      return true;
    },
  );
});

test('a non-array results input throws a sanitized typed error', () => {
  const run = { results: 'not-an-array', rules: baselineRules() } as unknown as CarryoverRun;
  assert.throws(
    () => evaluateCarryoverRisk(run),
    (error: unknown) => {
      assert.ok(error instanceof CarryoverInputError);
      assert.equal((error as CarryoverInputError).code, 'results-not-array');
      return true;
    },
  );
});

test('a non-object run throws a sanitized typed error', () => {
  assert.throws(
    () => evaluateCarryoverRisk(null as unknown as CarryoverRun),
    (error: unknown) => {
      assert.ok(error instanceof CarryoverInputError);
      assert.equal((error as CarryoverInputError).code, 'run-not-object');
      return true;
    },
  );
});

test('a non-array rules input throws a sanitized typed error', () => {
  const run = { results: [result()], rules: 'not-an-array' } as unknown as CarryoverRun;
  assert.throws(
    () => evaluateCarryoverRisk(run),
    (error: unknown) => {
      assert.ok(error instanceof CarryoverInputError);
      assert.equal((error as CarryoverInputError).code, 'rules-not-array');
      return true;
    },
  );
});

test('an empty rules array throws a sanitized typed error', () => {
  const run: CarryoverRun = { results: [result()], rules: [] };
  assert.throws(
    () => evaluateCarryoverRisk(run),
    (error: unknown) => {
      assert.ok(error instanceof CarryoverInputError);
      assert.equal((error as CarryoverInputError).code, 'rules-empty');
      return true;
    },
  );
});

test('a rule with a carryoverFactor of zero throws a sanitized typed error', () => {
  const run: CarryoverRun = {
    results: [result()],
    rules: [{ analyteCode: 'ANALYTE-SYNTH-A', highThreshold: 100, carryoverFactor: 0, repeatThreshold: 5 }],
  };
  assert.throws(
    () => evaluateCarryoverRisk(run),
    (error: unknown) => {
      assert.ok(error instanceof CarryoverInputError);
      assert.equal((error as CarryoverInputError).code, 'rules-invalid');
      return true;
    },
  );
});

test('a rule with a carryoverFactor above one throws a sanitized typed error', () => {
  const run: CarryoverRun = {
    results: [result()],
    rules: [{ analyteCode: 'ANALYTE-SYNTH-A', highThreshold: 100, carryoverFactor: 1.5, repeatThreshold: 5 }],
  };
  assert.throws(() => evaluateCarryoverRisk(run), CarryoverInputError);
});

test('a rule with a negative repeatThreshold throws a sanitized typed error', () => {
  const run: CarryoverRun = {
    results: [result()],
    rules: [{ analyteCode: 'ANALYTE-SYNTH-A', highThreshold: 100, carryoverFactor: 0.1, repeatThreshold: -1 }],
  };
  assert.throws(() => evaluateCarryoverRisk(run), CarryoverInputError);
});

test('rules declaring the same analyte twice throw a sanitized typed error', () => {
  const run: CarryoverRun = {
    results: [result()],
    rules: [
      { analyteCode: 'ANALYTE-SYNTH-A', highThreshold: 100, carryoverFactor: 0.1, repeatThreshold: 5 },
      { analyteCode: 'ANALYTE-SYNTH-A', highThreshold: 90, carryoverFactor: 0.2, repeatThreshold: 6 },
    ],
  };
  assert.throws(
    () => evaluateCarryoverRisk(run),
    (error: unknown) => {
      assert.ok(error instanceof CarryoverInputError);
      assert.equal((error as CarryoverInputError).code, 'rules-duplicate-analyte');
      return true;
    },
  );
});

test('a typed input error message never echoes any submitted data', () => {
  const run: CarryoverRun = { results: [result()], rules: [] };
  try {
    evaluateCarryoverRisk(run);
    assert.fail('expected evaluateCarryoverRisk to throw');
  } catch (error) {
    assert.ok(error instanceof CarryoverInputError);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch((error as Error).message, pattern);
    }
    assert.doesNotMatch((error as Error).message, /result-synthetic|ANALYTE-SYNTH/);
  }
});

test('every reason code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainCarryoverReason(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /result-synthetic|ANALYTE-SYNTH/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(explainCarryoverReason('contribution-exceeds-threshold'), explainCarryoverReason('contribution-exceeds-threshold'));
});

test('no status ever uses approval, compliance, accreditation, or release language', () => {
  const statuses: string[] = ['clear', 'at_risk', 'must_repeat'];
  for (const status of statuses) {
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(status, pattern);
    }
  }
});

test('every assessment result is frozen', () => {
  const run: CarryoverRun = { results: [result()], rules: baselineRules() };
  const [assessment] = evaluateCarryoverRisk(run);
  assert.ok(Object.isFrozen(assessment));
});

test('assessments are returned in the same order results were given', () => {
  const run: CarryoverRun = {
    results: [
      result({ resultId: 'r3', position: 3, value: 5 }),
      result({ resultId: 'r1', position: 5, value: 6 }),
    ],
    rules: baselineRules(),
  };
  const results = evaluateCarryoverRisk(run);
  assert.deepEqual(results.map((r) => r.resultId), ['r3', 'r1']);
});
