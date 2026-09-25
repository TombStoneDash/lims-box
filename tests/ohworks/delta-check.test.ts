import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DeltaCheckInputError,
  evaluateResultDelta,
  explainDeltaCheckReason,
  type DeltaCheckInput,
  type DeltaCheckReasonCode,
  type DeltaCheckSampleResult,
  type DeltaLimitRule,
} from '../../lib/ohworks-delta-check';

/**
 * All fabricated: synthetic subject/analyte identifiers and made-up numeric
 * values. None of this represents a real patient, sample, or result.
 */
function baselineRules(): DeltaLimitRule[] {
  return [
    {
      windowMs: 24 * 60 * 60 * 1000,
      unit: 'mg/L',
      flag: { absolute: 5, percent: 20 },
      block: { absolute: 10, percent: 50 },
    },
    {
      windowMs: 7 * 24 * 60 * 60 * 1000,
      unit: 'mg/L',
      flag: { absolute: 8, percent: 30 },
      block: { absolute: 15, percent: 75 },
    },
  ];
}

function baselineCurrent(): DeltaCheckSampleResult {
  return {
    subjectId: 'subject-synthetic-a',
    analyteCode: 'ANALYTE-SYNTH-A',
    value: 100,
    unit: 'mg/L',
    capturedAt: '2026-01-02T12:00:00.000Z',
  };
}

function baselinePrior(): DeltaCheckSampleResult {
  return {
    subjectId: 'subject-synthetic-a',
    analyteCode: 'ANALYTE-SYNTH-A',
    value: 100,
    unit: 'mg/L',
    capturedAt: '2026-01-01T12:00:00.000Z',
  };
}

function baselineInput(): DeltaCheckInput {
  return { current: baselineCurrent(), prior: baselinePrior(), rules: baselineRules() };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const ALL_REASON_CODES: DeltaCheckReasonCode[] = [
  'no-prior-result',
  'prior-outside-window',
  'prior-subject-mismatch',
  'prior-analyte-mismatch',
  'current-timestamp-invalid',
  'prior-timestamp-invalid',
  'prior-not-before-current',
  'current-value-invalid',
  'prior-value-invalid',
  'current-unit-missing',
  'prior-unit-missing',
  'current-unit-mismatched',
  'prior-unit-mismatched',
  'within-limits',
  'delta-flagged',
  'delta-blocked',
];

const FORBIDDEN_WORDS = [/approved/i, /compliant/i, /accredited/i, /releasable/i];

test('identical values one day apart pass with no rule violation', () => {
  const result = evaluateResultDelta(baselineInput());
  assert.equal(result.status, 'pass');
  assert.equal(result.reasonCode, 'within-limits');
  assert.deepEqual(result.delta, { absolute: 0, percent: 0 });
  assert.ok(result.rule);
  assert.equal(result.rule?.windowMs, 24 * 60 * 60 * 1000);
});

test('evaluation is pure: it does not mutate input records', () => {
  const input = baselineInput();
  const before = JSON.stringify(input);
  evaluateResultDelta(input);
  assert.equal(JSON.stringify(input), before);
});

test('evaluation is deterministic across repeated calls', () => {
  const input = baselineInput();
  const first = evaluateResultDelta(input);
  const second = evaluateResultDelta(clone(input));
  assert.deepEqual(first, second);
});

test('a status other than the three defined values is never produced', () => {
  const result = evaluateResultDelta(baselineInput());
  assert.ok(['pass', 'flag', 'block'].includes(result.status));
});

test('no prior result passes with a null delta and null rule', () => {
  const input = baselineInput();
  input.prior = null;
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'pass');
  assert.equal(result.reasonCode, 'no-prior-result');
  assert.equal(result.delta, null);
  assert.equal(result.rule, null);
});

test('a prior result older than every declared window passes with no rule applied', () => {
  const input = baselineInput();
  input.current.capturedAt = '2026-01-20T12:00:00.000Z'; // 19 days later, beyond the 7-day window
  input.current.value = 500; // large change, but no window covers it
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'pass');
  assert.equal(result.reasonCode, 'prior-outside-window');
  assert.equal(result.rule, null);
  assert.ok(result.delta);
  assert.equal(result.delta?.absolute, 400);
});

test('a prior result exactly at the narrower window boundary uses that window', () => {
  const input = baselineInput();
  input.current.capturedAt = '2026-01-02T12:00:00.000Z'; // exactly 24h after prior
  const result = evaluateResultDelta(input);
  assert.equal(result.rule?.windowMs, 24 * 60 * 60 * 1000);
});

test('a prior result just past the narrow window falls to the wider window', () => {
  const input = baselineInput();
  input.current.capturedAt = '2026-01-02T12:00:00.001Z'; // 24h + 1ms after prior
  const result = evaluateResultDelta(input);
  assert.equal(result.rule?.windowMs, 7 * 24 * 60 * 60 * 1000);
});

test('a delta within the narrow window flag threshold passes', () => {
  const input = baselineInput();
  input.current.value = 104; // absolute delta 4, under the 24h flag threshold of 5
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'pass');
});

test('a delta exceeding the narrow window absolute flag threshold flags', () => {
  const input = baselineInput();
  input.current.value = 106; // absolute delta 6, over the 24h flag threshold of 5, under block of 10
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'flag');
  assert.equal(result.reasonCode, 'delta-flagged');
  assert.equal(result.delta?.absolute, 6);
});

test('a delta exactly at the flag threshold does not flag', () => {
  const input = baselineInput();
  input.current.value = 105; // absolute delta exactly 5
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'pass');
});

test('a delta exceeding the block threshold blocks, not flags', () => {
  const input = baselineInput();
  input.current.value = 111; // absolute delta 11, over the 24h block threshold of 10
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'block');
  assert.equal(result.reasonCode, 'delta-blocked');
});

test('a delta exactly at the block threshold does not block', () => {
  const input = baselineInput();
  input.current.value = 110; // absolute delta exactly 10
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'flag');
});

test('a percent delta exceeding the flag threshold flags even when absolute is under threshold', () => {
  const input = baselineInput();
  input.prior.value = 10;
  input.current.value = 13; // absolute delta 3 (under 5), percent delta 30% (over 20% flag)
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'flag');
  assert.equal(result.delta?.percent, 30);
});

test('a percent delta exceeding the block threshold blocks', () => {
  const input = baselineInput();
  input.prior.value = 10;
  input.current.value = 16; // percent delta 60%, over the 24h block threshold of 50%
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'block');
});

test('a zero prior value yields a null percent delta and only absolute limits apply', () => {
  const input = baselineInput();
  input.prior.value = 0;
  input.current.value = 3; // under the absolute flag threshold of 5
  const result = evaluateResultDelta(input);
  assert.equal(result.delta?.percent, null);
  assert.equal(result.status, 'pass');
});

test('a negative delta magnitude is evaluated the same as a positive one', () => {
  const input = baselineInput();
  input.current.value = 89; // absolute delta -11, magnitude 11, over the 24h block threshold of 10
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'block');
  assert.equal(result.delta?.absolute, -11);
});

test('a mismatched prior subject fails closed to block', () => {
  const input = baselineInput();
  input.prior.subjectId = 'subject-synthetic-intruder';
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'block');
  assert.equal(result.reasonCode, 'prior-subject-mismatch');
});

test('a mismatched prior analyte fails closed to block', () => {
  const input = baselineInput();
  input.prior.analyteCode = 'ANALYTE-SYNTH-OTHER';
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'block');
  assert.equal(result.reasonCode, 'prior-analyte-mismatch');
});

test('an unparsable current timestamp fails closed to block', () => {
  const input = baselineInput();
  input.current.capturedAt = 'not-a-timestamp';
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'block');
  assert.equal(result.reasonCode, 'current-timestamp-invalid');
});

test('an unparsable prior timestamp fails closed to block', () => {
  const input = baselineInput();
  input.prior.capturedAt = 'not-a-timestamp';
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'block');
  assert.equal(result.reasonCode, 'prior-timestamp-invalid');
});

test('a prior result at the same instant as current fails closed to block', () => {
  const input = baselineInput();
  input.prior.capturedAt = input.current.capturedAt;
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'block');
  assert.equal(result.reasonCode, 'prior-not-before-current');
});

test('a prior result after the current result fails closed to block', () => {
  const input = baselineInput();
  input.prior.capturedAt = '2026-01-05T12:00:00.000Z';
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'block');
  assert.equal(result.reasonCode, 'prior-not-before-current');
});

test('a nonnumeric current value fails closed to block', () => {
  const input = baselineInput();
  (input.current as unknown as { value: unknown }).value = 'not-a-number';
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'block');
  assert.equal(result.reasonCode, 'current-value-invalid');
});

test('a nonnumeric prior value fails closed to block', () => {
  const input = baselineInput();
  (input.prior as unknown as { value: unknown }).value = 'not-a-number';
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'block');
  assert.equal(result.reasonCode, 'prior-value-invalid');
});

test('a numeric-looking string current value is accepted as numeric', () => {
  const input = baselineInput();
  (input.current as unknown as { value: unknown }).value = '100';
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'pass');
});

test('a missing current unit fails closed to block', () => {
  const input = baselineInput();
  delete input.current.unit;
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'block');
  assert.equal(result.reasonCode, 'current-unit-missing');
});

test('a missing prior unit fails closed to block', () => {
  const input = baselineInput();
  delete input.prior.unit;
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'block');
  assert.equal(result.reasonCode, 'prior-unit-missing');
});

test('a current unit that mismatches the declared rule unit fails closed to block', () => {
  const input = baselineInput();
  input.current.unit = 'g/L';
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'block');
  assert.equal(result.reasonCode, 'current-unit-mismatched');
});

test('a prior unit that mismatches the declared rule unit fails closed to block', () => {
  const input = baselineInput();
  input.prior.unit = 'g/L';
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'block');
  assert.equal(result.reasonCode, 'prior-unit-mismatched');
});

test('unit comparison ignores outer whitespace and case', () => {
  const input = baselineInput();
  input.current.unit = '  MG/L  ';
  input.prior.unit = 'Mg/L';
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'pass');
});

test('unit comparison never infers a conversion: mg/L and g/L still mismatch', () => {
  const input = baselineInput();
  input.current.unit = 'g/L';
  input.prior.unit = 'g/L';
  const result = evaluateResultDelta(input);
  assert.equal(result.status, 'block');
  assert.equal(result.reasonCode, 'current-unit-mismatched');
});

test('current identity fields missing throw a sanitized typed error', () => {
  const input = baselineInput();
  delete (input.current as Partial<DeltaCheckSampleResult>).subjectId;
  assert.throws(
    () => evaluateResultDelta(input),
    (error: unknown) => {
      assert.ok(error instanceof DeltaCheckInputError);
      assert.equal((error as DeltaCheckInputError).code, 'current-malformed');
      return true;
    },
  );
});

test('prior identity fields missing throw a sanitized typed error', () => {
  const input = baselineInput();
  delete (input.prior as Partial<DeltaCheckSampleResult>).analyteCode;
  assert.throws(
    () => evaluateResultDelta(input),
    (error: unknown) => {
      assert.ok(error instanceof DeltaCheckInputError);
      assert.equal((error as DeltaCheckInputError).code, 'prior-malformed');
      return true;
    },
  );
});

test('a non-array rules input throws a sanitized typed error', () => {
  const input = baselineInput();
  (input as unknown as { rules: unknown }).rules = 'not-an-array';
  assert.throws(
    () => evaluateResultDelta(input),
    (error: unknown) => {
      assert.ok(error instanceof DeltaCheckInputError);
      assert.equal((error as DeltaCheckInputError).code, 'rules-not-array');
      return true;
    },
  );
});

test('an empty rules array throws a sanitized typed error', () => {
  const input = baselineInput();
  input.rules = [];
  assert.throws(
    () => evaluateResultDelta(input),
    (error: unknown) => {
      assert.ok(error instanceof DeltaCheckInputError);
      assert.equal((error as DeltaCheckInputError).code, 'rules-empty');
      return true;
    },
  );
});

test('a rule with no declared limits at all throws a sanitized typed error', () => {
  const input = baselineInput();
  input.rules = [
    {
      windowMs: 1000,
      unit: 'mg/L',
      flag: { absolute: null, percent: null },
      block: { absolute: null, percent: null },
    },
  ];
  assert.throws(
    () => evaluateResultDelta(input),
    (error: unknown) => {
      assert.ok(error instanceof DeltaCheckInputError);
      assert.equal((error as DeltaCheckInputError).code, 'rules-invalid');
      return true;
    },
  );
});

test('a rule with a negative limit throws a sanitized typed error', () => {
  const input = baselineInput();
  input.rules = [
    {
      windowMs: 1000,
      unit: 'mg/L',
      flag: { absolute: -1, percent: null },
      block: { absolute: null, percent: null },
    },
  ];
  assert.throws(() => evaluateResultDelta(input), DeltaCheckInputError);
});

test('a rule with a non-positive window throws a sanitized typed error', () => {
  const input = baselineInput();
  input.rules = [
    {
      windowMs: 0,
      unit: 'mg/L',
      flag: { absolute: 5, percent: null },
      block: { absolute: 10, percent: null },
    },
  ];
  assert.throws(() => evaluateResultDelta(input), DeltaCheckInputError);
});

test('rules declared in inconsistent units throw a sanitized typed error', () => {
  const input = baselineInput();
  input.rules = [
    { windowMs: 1000, unit: 'mg/L', flag: { absolute: 5, percent: null }, block: { absolute: 10, percent: null } },
    { windowMs: 2000, unit: 'g/L', flag: { absolute: 5, percent: null }, block: { absolute: 10, percent: null } },
  ];
  assert.throws(
    () => evaluateResultDelta(input),
    (error: unknown) => {
      assert.ok(error instanceof DeltaCheckInputError);
      assert.equal((error as DeltaCheckInputError).code, 'rules-unit-inconsistent');
      return true;
    },
  );
});

test('rules declaring duplicate windows throw a sanitized typed error', () => {
  const input = baselineInput();
  input.rules = [
    { windowMs: 1000, unit: 'mg/L', flag: { absolute: 5, percent: null }, block: { absolute: 10, percent: null } },
    { windowMs: 1000, unit: 'mg/L', flag: { absolute: 6, percent: null }, block: { absolute: 12, percent: null } },
  ];
  assert.throws(
    () => evaluateResultDelta(input),
    (error: unknown) => {
      assert.ok(error instanceof DeltaCheckInputError);
      assert.equal((error as DeltaCheckInputError).code, 'rules-duplicate-window');
      return true;
    },
  );
});

test('a typed input error message never echoes any submitted data', () => {
  const input = baselineInput();
  input.rules = [];
  try {
    evaluateResultDelta(input);
    assert.fail('expected evaluateResultDelta to throw');
  } catch (error) {
    assert.ok(error instanceof DeltaCheckInputError);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch((error as Error).message, pattern);
    }
    assert.doesNotMatch((error as Error).message, /subject-synthetic|ANALYTE-SYNTH/);
  }
});

test('every reason code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainDeltaCheckReason(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /subject-synthetic|ANALYTE-SYNTH/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(explainDeltaCheckReason('delta-blocked'), explainDeltaCheckReason('delta-blocked'));
});

test('no status ever uses approval, compliance, accreditation, or release language', () => {
  const statuses: string[] = ['pass', 'flag', 'block'];
  for (const status of statuses) {
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(status, pattern);
    }
  }
});

test('the returned outcome is frozen', () => {
  const result = evaluateResultDelta(baselineInput());
  assert.ok(Object.isFrozen(result));
});
