import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LinearityVerificationInputError,
  evaluateLinearityVerification,
  explainLinearityReason,
  type LinearityAcceptanceLimits,
  type LinearityLevelInput,
  type LinearityReasonCode,
} from '../../lib/ohworks-linearity';

/**
 * All fabricated: synthetic level identifiers and made-up calibrator
 * concentrations/responses. None of this represents a real instrument,
 * sample, or customer.
 */
function levels(expected: number[], observed: number[]): LinearityLevelInput[] {
  assert.equal(expected.length, observed.length, 'fixture arrays must be the same length');
  return expected.map((value, index) => ({
    levelId: `cal-${index + 1}`,
    expected: value,
    observed: observed[index],
  }));
}

function limits(overrides: Partial<LinearityAcceptanceLimits> = {}): LinearityAcceptanceLimits {
  return {
    slopeMin: 0.9,
    slopeMax: 1.1,
    interceptMin: -5,
    interceptMax: 5,
    correlationMin: 0.99,
    recoveryMinPercent: 90,
    recoveryMaxPercent: 110,
    ...overrides,
  };
}

function closeTo(actual: number, expected: number, epsilon = 1e-9): void {
  assert.ok(Math.abs(actual - expected) < epsilon, `expected ${actual} to be close to ${expected}`);
}

const EXPECTED_LEVELS = [10, 20, 30, 40, 50];

const ALL_REASON_CODES: LinearityReasonCode[] = [
  'insufficient-levels',
  'non-finite-value',
  'duplicate-level',
  'slope-out-of-range',
  'intercept-out-of-range',
  'correlation-below-minimum',
  'recovery-out-of-range',
  'linearity-verified',
];

const FORBIDDEN_WORDS = [/compliant/i, /accredited/i, /reported?\b.*\bresult/i];

// ---------------------------------------------------------------------------
// Golden path
// ---------------------------------------------------------------------------

test('a perfectly linear, in-limits fit passes with slope 1, intercept 0, correlation 1', () => {
  const result = evaluateLinearityVerification(levels(EXPECTED_LEVELS, [10, 20, 30, 40, 50]), limits());
  assert.equal(result.decision, 'pass');
  assert.equal(result.reasonCode, 'linearity-verified');
  assert.equal(result.slope, 1);
  assert.equal(result.intercept, 0);
  assert.equal(result.correlation, 1);
  assert.equal(result.levelRecoveries.length, 5);
  for (const recovery of result.levelRecoveries) {
    assert.equal(recovery.recoveryPercent, 100);
    assert.equal(recovery.withinLimits, true);
  }
});

// ---------------------------------------------------------------------------
// Slope acceptance limits
// ---------------------------------------------------------------------------

test('slope exactly at the declared max boundary passes (inclusive), recovery exactly at max also passes', () => {
  const result = evaluateLinearityVerification(levels(EXPECTED_LEVELS, [11, 22, 33, 44, 55]), limits());
  assert.equal(result.decision, 'pass');
  closeTo(result.slope as number, 1.1);
  assert.equal(result.intercept, 0);
  assert.equal(result.correlation, 1);
  for (const recovery of result.levelRecoveries) {
    closeTo(recovery.recoveryPercent, 110);
    assert.equal(recovery.withinLimits, true);
  }
});

test('slope exactly at the declared min boundary passes (inclusive), recovery exactly at min also passes', () => {
  const result = evaluateLinearityVerification(levels(EXPECTED_LEVELS, [9, 18, 27, 36, 45]), limits());
  assert.equal(result.decision, 'pass');
  closeTo(result.slope as number, 0.9);
  for (const recovery of result.levelRecoveries) {
    closeTo(recovery.recoveryPercent, 90);
    assert.equal(recovery.withinLimits, true);
  }
});

test('a slope above the declared max fails as slope-out-of-range', () => {
  const result = evaluateLinearityVerification(levels(EXPECTED_LEVELS, [20, 40, 60, 80, 100]), limits());
  assert.equal(result.decision, 'fail');
  assert.equal(result.reasonCode, 'slope-out-of-range');
  assert.equal(result.slope, 2);
});

test('a slope below the declared min fails as slope-out-of-range', () => {
  const result = evaluateLinearityVerification(levels(EXPECTED_LEVELS, [8.5, 17, 25.5, 34, 42.5]), limits());
  assert.equal(result.decision, 'fail');
  assert.equal(result.reasonCode, 'slope-out-of-range');
  closeTo(result.slope as number, 0.85);
});

test('slope-out-of-range is reported even when intercept is also out of range', () => {
  const result = evaluateLinearityVerification(
    levels(EXPECTED_LEVELS, [20, 40, 60, 80, 100]),
    limits({ slopeMax: 1.1, interceptMin: -100, interceptMax: -1 }),
  );
  assert.equal(result.decision, 'fail');
  assert.equal(result.reasonCode, 'slope-out-of-range');
});

// ---------------------------------------------------------------------------
// Intercept acceptance limits
// ---------------------------------------------------------------------------

test('intercept exactly at the declared max boundary passes (inclusive)', () => {
  // slope=1, intercept=2, correlation ~= 0.9622 for this fixture (hand-derived).
  const result = evaluateLinearityVerification(
    levels(EXPECTED_LEVELS, [10, 20, 40, 40, 50]),
    limits({ interceptMax: 2, correlationMin: 0.9, recoveryMinPercent: 50, recoveryMaxPercent: 150 }),
  );
  assert.equal(result.decision, 'pass');
  assert.equal(result.slope, 1);
  closeTo(result.intercept as number, 2);
  closeTo(result.correlation as number, 0.9622, 1e-3);
});

test('an intercept above the declared max fails as intercept-out-of-range', () => {
  // slope=1, intercept=4, correlation ~= 0.8704 for this fixture (hand-derived).
  const result = evaluateLinearityVerification(
    levels(EXPECTED_LEVELS, [10, 20, 50, 40, 50]),
    limits({ interceptMax: 2, correlationMin: 0.5, recoveryMinPercent: 50, recoveryMaxPercent: 200 }),
  );
  assert.equal(result.decision, 'fail');
  assert.equal(result.reasonCode, 'intercept-out-of-range');
  assert.equal(result.slope, 1);
  closeTo(result.intercept as number, 4);
});

test('intercept-out-of-range is reported even when correlation is also below minimum', () => {
  const result = evaluateLinearityVerification(
    levels(EXPECTED_LEVELS, [10, 20, 50, 40, 50]),
    limits({ interceptMax: 2, correlationMin: 0.99, recoveryMinPercent: 50, recoveryMaxPercent: 200 }),
  );
  assert.equal(result.decision, 'fail');
  assert.equal(result.reasonCode, 'intercept-out-of-range');
});

// ---------------------------------------------------------------------------
// Correlation acceptance limits
// ---------------------------------------------------------------------------

test('a correlation at or above the declared minimum passes', () => {
  const result = evaluateLinearityVerification(
    levels(EXPECTED_LEVELS, [10, 20, 50, 40, 50]),
    limits({ interceptMin: -10, interceptMax: 10, correlationMin: 0.86, recoveryMinPercent: 50, recoveryMaxPercent: 200 }),
  );
  assert.equal(result.decision, 'pass');
  closeTo(result.correlation as number, 0.8704, 1e-3);
});

test('a correlation below the declared minimum fails as correlation-below-minimum', () => {
  const result = evaluateLinearityVerification(
    levels(EXPECTED_LEVELS, [10, 20, 50, 40, 50]),
    limits({ interceptMin: -10, interceptMax: 10, correlationMin: 0.88, recoveryMinPercent: 50, recoveryMaxPercent: 200 }),
  );
  assert.equal(result.decision, 'fail');
  assert.equal(result.reasonCode, 'correlation-below-minimum');
});

test('correlation-below-minimum is reported even when a level recovery is also out of range', () => {
  const result = evaluateLinearityVerification(
    levels(EXPECTED_LEVELS, [10, 20, 50, 40, 50]),
    limits({ interceptMin: -10, interceptMax: 10, correlationMin: 0.88, recoveryMinPercent: 90, recoveryMaxPercent: 150 }),
  );
  assert.equal(result.decision, 'fail');
  assert.equal(result.reasonCode, 'correlation-below-minimum');
});

// ---------------------------------------------------------------------------
// Per-level recovery acceptance limits
// ---------------------------------------------------------------------------

test('every level recovery exactly at the declared max boundary passes (inclusive)', () => {
  // slope=1, intercept=0.6, correlation ~= 0.99642 for this fixture (hand-derived); level 3 recovery is exactly 110%.
  const result = evaluateLinearityVerification(levels(EXPECTED_LEVELS, [10, 20, 33, 40, 50]), limits());
  assert.equal(result.decision, 'pass');
  closeTo(result.intercept as number, 0.6);
  const level3 = result.levelRecoveries[2];
  closeTo(level3.recoveryPercent, 110);
  assert.equal(level3.withinLimits, true);
});

test('a single level recovery above the declared max fails as recovery-out-of-range, naming that level', () => {
  // slope=1, intercept=0.66, correlation ~= 0.99567 for this fixture (hand-derived); level 3 recovery is 111%.
  const result = evaluateLinearityVerification(levels(EXPECTED_LEVELS, [10, 20, 33.3, 40, 50]), limits());
  assert.equal(result.decision, 'fail');
  assert.equal(result.reasonCode, 'recovery-out-of-range');
  const [l1, l2, l3, l4, l5] = result.levelRecoveries;
  assert.equal(l1.withinLimits, true);
  assert.equal(l2.withinLimits, true);
  assert.equal(l3.withinLimits, false);
  assert.equal(l3.levelId, 'cal-3');
  closeTo(l3.recoveryPercent, 111);
  assert.equal(l4.withinLimits, true);
  assert.equal(l5.withinLimits, true);
});

test('a level recovery below the declared min fails as recovery-out-of-range', () => {
  const result = evaluateLinearityVerification(
    levels(EXPECTED_LEVELS, [10, 20, 26, 40, 50]),
    limits({ correlationMin: 0.9 }),
  );
  assert.equal(result.decision, 'fail');
  assert.equal(result.reasonCode, 'recovery-out-of-range');
});

// ---------------------------------------------------------------------------
// Fail closed: fewer than five levels
// ---------------------------------------------------------------------------

test('fewer than five levels is blocked as insufficient-levels', () => {
  const result = evaluateLinearityVerification(levels([10, 20, 30, 40], [10, 20, 30, 40]), limits());
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'insufficient-levels');
  assert.equal(result.slope, null);
  assert.equal(result.intercept, null);
  assert.equal(result.correlation, null);
  assert.deepEqual(result.levelRecoveries, []);
});

test('zero levels is blocked as insufficient-levels', () => {
  const result = evaluateLinearityVerification([], limits());
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'insufficient-levels');
});

// ---------------------------------------------------------------------------
// Fail closed: non-finite values
// ---------------------------------------------------------------------------

test('a NaN observed value is blocked as non-finite-value', () => {
  const input = levels(EXPECTED_LEVELS, [10, 20, 30, 40, 50]);
  input[2] = { ...input[2], observed: NaN };
  const result = evaluateLinearityVerification(input, limits());
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'non-finite-value');
});

test('an Infinity expected value is blocked as non-finite-value', () => {
  const input = levels(EXPECTED_LEVELS, [10, 20, 30, 40, 50]);
  input[0] = { ...input[0], expected: Infinity };
  const result = evaluateLinearityVerification(input, limits());
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'non-finite-value');
});

test('a zero expected value that produces a non-finite recovery is blocked as non-finite-value', () => {
  const input = levels([0, 10, 20, 30, 40], [1, 10, 20, 30, 40]);
  const result = evaluateLinearityVerification(input, limits());
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'non-finite-value');
});

// ---------------------------------------------------------------------------
// Fail closed: duplicate levels
// ---------------------------------------------------------------------------

test('two levels sharing a level id are blocked as duplicate-level', () => {
  const input = levels(EXPECTED_LEVELS, [10, 20, 30, 40, 50]);
  input[1] = { ...input[1], levelId: input[0].levelId };
  const result = evaluateLinearityVerification(input, limits());
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'duplicate-level');
});

test('two levels sharing an expected value are blocked as duplicate-level', () => {
  const input = levels(EXPECTED_LEVELS, [10, 20, 30, 40, 50]);
  input[1] = { ...input[1], expected: input[0].expected };
  const result = evaluateLinearityVerification(input, limits());
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'duplicate-level');
});

// ---------------------------------------------------------------------------
// Structurally malformed input throws, rather than guessing
// ---------------------------------------------------------------------------

test('a non-array levels input throws a sanitized typed error', () => {
  assert.throws(
    () => evaluateLinearityVerification(null as unknown as LinearityLevelInput[], limits()),
    (error: unknown) => {
      assert.ok(error instanceof LinearityVerificationInputError);
      assert.equal((error as LinearityVerificationInputError).code, 'levels-malformed');
      return true;
    },
  );
});

test('an object (non-array) levels input throws a sanitized typed error', () => {
  assert.throws(
    () => evaluateLinearityVerification({} as unknown as LinearityLevelInput[], limits()),
    (error: unknown) => {
      assert.ok(error instanceof LinearityVerificationInputError);
      assert.equal((error as LinearityVerificationInputError).code, 'levels-malformed');
      return true;
    },
  );
});

test('a level entry missing a required field throws a sanitized typed error', () => {
  const input = levels(EXPECTED_LEVELS, [10, 20, 30, 40, 50]) as unknown[];
  const malformed = { ...(input[0] as object) } as Partial<LinearityLevelInput>;
  delete malformed.observed;
  input[0] = malformed;
  assert.throws(
    () => evaluateLinearityVerification(input as LinearityLevelInput[], limits()),
    (error: unknown) => {
      assert.ok(error instanceof LinearityVerificationInputError);
      assert.equal((error as LinearityVerificationInputError).code, 'level-entry-malformed');
      return true;
    },
  );
});

test('a level entry with a non-number expected value throws a sanitized typed error', () => {
  const input = levels(EXPECTED_LEVELS, [10, 20, 30, 40, 50]) as unknown[];
  input[0] = { ...(input[0] as object), expected: '10' };
  assert.throws(
    () => evaluateLinearityVerification(input as LinearityLevelInput[], limits()),
    (error: unknown) => {
      assert.ok(error instanceof LinearityVerificationInputError);
      assert.equal((error as LinearityVerificationInputError).code, 'level-entry-malformed');
      return true;
    },
  );
});

test('a level entry with an empty-string level id throws a sanitized typed error', () => {
  const input = levels(EXPECTED_LEVELS, [10, 20, 30, 40, 50]) as unknown[];
  input[0] = { ...(input[0] as object), levelId: '' };
  assert.throws(
    () => evaluateLinearityVerification(input as LinearityLevelInput[], limits()),
    (error: unknown) => {
      assert.ok(error instanceof LinearityVerificationInputError);
      assert.equal((error as LinearityVerificationInputError).code, 'level-entry-malformed');
      return true;
    },
  );
});

test('a null acceptance-limits input throws a sanitized typed error', () => {
  assert.throws(
    () => evaluateLinearityVerification(levels(EXPECTED_LEVELS, [10, 20, 30, 40, 50]), null as unknown as LinearityAcceptanceLimits),
    (error: unknown) => {
      assert.ok(error instanceof LinearityVerificationInputError);
      assert.equal((error as LinearityVerificationInputError).code, 'limits-malformed');
      return true;
    },
  );
});

test('acceptance limits missing a required field throw a sanitized typed error', () => {
  const malformed: Partial<LinearityAcceptanceLimits> = limits();
  delete malformed.correlationMin;
  assert.throws(
    () => evaluateLinearityVerification(levels(EXPECTED_LEVELS, [10, 20, 30, 40, 50]), malformed as LinearityAcceptanceLimits),
    (error: unknown) => {
      assert.ok(error instanceof LinearityVerificationInputError);
      assert.equal((error as LinearityVerificationInputError).code, 'limits-malformed');
      return true;
    },
  );
});

test('acceptance limits with an inverted slope range throw a sanitized typed error', () => {
  assert.throws(
    () => evaluateLinearityVerification(levels(EXPECTED_LEVELS, [10, 20, 30, 40, 50]), limits({ slopeMin: 1.1, slopeMax: 0.9 })),
    (error: unknown) => {
      assert.ok(error instanceof LinearityVerificationInputError);
      assert.equal((error as LinearityVerificationInputError).code, 'limits-malformed');
      return true;
    },
  );
});

test('acceptance limits with an inverted recovery range throw a sanitized typed error', () => {
  assert.throws(
    () => evaluateLinearityVerification(levels(EXPECTED_LEVELS, [10, 20, 30, 40, 50]), limits({ recoveryMinPercent: 110, recoveryMaxPercent: 90 })),
    (error: unknown) => {
      assert.ok(error instanceof LinearityVerificationInputError);
      assert.equal((error as LinearityVerificationInputError).code, 'limits-malformed');
      return true;
    },
  );
});

test('a typed input error message never echoes any submitted data', () => {
  try {
    evaluateLinearityVerification(null as unknown as LinearityLevelInput[], limits());
    assert.fail('expected evaluateLinearityVerification to throw');
  } catch (error) {
    assert.ok(error instanceof LinearityVerificationInputError);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch((error as Error).message, pattern);
    }
  }
});

// ---------------------------------------------------------------------------
// Determinism, purity, and immutability
// ---------------------------------------------------------------------------

test('the result is deterministic across repeated calls with equivalent input', () => {
  const input = levels(EXPECTED_LEVELS, [10, 20, 30, 40, 50]);
  const first = evaluateLinearityVerification(input, limits());
  const second = evaluateLinearityVerification(levels(EXPECTED_LEVELS, [10, 20, 30, 40, 50]), limits());
  assert.deepEqual(first, second);
});

test('the result object is frozen', () => {
  const result = evaluateLinearityVerification(levels(EXPECTED_LEVELS, [10, 20, 30, 40, 50]), limits());
  assert.ok(Object.isFrozen(result));
  const mutationSucceeded = Reflect.set(result, 'decision', 'fail');
  assert.equal(mutationSucceeded, false);
  assert.equal(result.decision, 'pass');
});

test('the levelRecoveries array and its entries are frozen', () => {
  const result = evaluateLinearityVerification(levels(EXPECTED_LEVELS, [10, 20, 30, 40, 50]), limits());
  assert.ok(Object.isFrozen(result.levelRecoveries));
  for (const recovery of result.levelRecoveries) {
    assert.ok(Object.isFrozen(recovery));
  }
});

test('evaluateLinearityVerification does not mutate its levels or limits input', () => {
  const input = levels(EXPECTED_LEVELS, [10, 20, 30, 40, 50]);
  const acceptance = limits();
  const inputBefore = JSON.stringify(input);
  const limitsBefore = JSON.stringify(acceptance);
  evaluateLinearityVerification(input, acceptance);
  assert.equal(JSON.stringify(input), inputBefore);
  assert.equal(JSON.stringify(acceptance), limitsBefore);
});

// ---------------------------------------------------------------------------
// Explanations
// ---------------------------------------------------------------------------

test('every reason code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainLinearityReason(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(explainLinearityReason('slope-out-of-range'), explainLinearityReason('slope-out-of-range'));
});

test('the reason field on a result matches explainLinearityReason for its reasonCode', () => {
  const result = evaluateLinearityVerification(levels(EXPECTED_LEVELS, [10, 20, 30, 40, 50]), limits());
  assert.equal(result.reason, explainLinearityReason(result.reasonCode));
});
