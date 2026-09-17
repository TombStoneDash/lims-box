import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CriticalRepeatPolicyInputError,
  evaluateCriticalRepeat,
  explainCriticalRepeatReason,
  type CriticalRepeatInput,
  type CriticalRepeatPolicy,
  type CriticalRepeatReasonCode,
  type CriticalRepeatResult,
} from '../../lib/ohworks-critical-repeat';

/**
 * All fabricated: synthetic subject/analyte identifiers and made-up numeric
 * values. None of this represents a real patient, sample, or result.
 */
function baselinePolicy(): CriticalRepeatPolicy {
  return {
    analyteCode: 'ANALYTE-SYNTH-A',
    unit: 'mmol/L',
    repeatRequired: true,
    tolerance: { absolute: 0.5, percent: 10 },
    maxRepeats: 2,
  };
}

function baselineFirst(): CriticalRepeatResult {
  return {
    subjectId: 'subject-synthetic-a',
    analyteCode: 'ANALYTE-SYNTH-A',
    value: 10,
    unit: 'mmol/L',
    capturedAt: '2026-01-02T12:00:00.000Z',
  };
}

function baselineRepeat(capturedAt: string, value: number): CriticalRepeatResult {
  return {
    subjectId: 'subject-synthetic-a',
    analyteCode: 'ANALYTE-SYNTH-A',
    value,
    unit: 'mmol/L',
    capturedAt,
  };
}

function baselineInput(): CriticalRepeatInput {
  return {
    first: baselineFirst(),
    repeats: [baselineRepeat('2026-01-02T12:15:00.000Z', 10.2)],
    policy: baselinePolicy(),
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const ALL_REASON_CODES: CriticalRepeatReasonCode[] = [
  'repeat-not-required',
  'awaiting-first-repeat',
  'awaiting-next-repeat',
  'repeat-confirmed',
  'repeats-exhausted',
  'first-result-timestamp-invalid',
  'first-result-value-invalid',
  'first-result-unit-missing',
  'first-result-unit-mismatched',
  'repeat-subject-mismatch',
  'repeat-analyte-mismatch',
  'repeat-timestamp-invalid',
  'repeat-not-after-previous',
  'repeat-value-invalid',
  'repeat-unit-missing',
  'repeat-unit-mismatched',
];

const FORBIDDEN_WORDS = [/approved/i, /compliant/i, /accredited/i, /releasable/i];

test('an agreeing repeat within tolerance confirms and reports the first value', () => {
  const result = evaluateCriticalRepeat(baselineInput());
  assert.equal(result.status, 'confirmed');
  assert.equal(result.reasonCode, 'repeat-confirmed');
  assert.equal(result.reportValue, 10);
  assert.equal(result.repeatsEvaluated, 1);
  assert.equal(result.notifyAllowed, true);
});

test('evaluation is pure: it does not mutate input records', () => {
  const input = baselineInput();
  const before = JSON.stringify(input);
  evaluateCriticalRepeat(input);
  assert.equal(JSON.stringify(input), before);
});

test('evaluation is deterministic across repeated calls', () => {
  const input = baselineInput();
  const first = evaluateCriticalRepeat(input);
  const second = evaluateCriticalRepeat(clone(input));
  assert.deepEqual(first, second);
});

test('a status other than the three defined values is never produced', () => {
  const result = evaluateCriticalRepeat(baselineInput());
  assert.ok(['confirmed', 'discordant', 'pending'].includes(result.status));
});

test('a policy that does not require a repeat confirms immediately with no repeats', () => {
  const input = baselineInput();
  input.policy.repeatRequired = false;
  input.repeats = [];
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'confirmed');
  assert.equal(result.reasonCode, 'repeat-not-required');
  assert.equal(result.reportValue, 10);
  assert.equal(result.repeatsEvaluated, 0);
  assert.equal(result.notifyAllowed, true);
});

test('a required repeat with none supplied yet is pending, unreportable, and blocks notification', () => {
  const input = baselineInput();
  input.repeats = [];
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'pending');
  assert.equal(result.reasonCode, 'awaiting-first-repeat');
  assert.equal(result.reportValue, null);
  assert.equal(result.repeatsEvaluated, 0);
  assert.equal(result.notifyAllowed, false);
});

test('a disagreeing repeat with attempts remaining is pending and blocks notification', () => {
  const input = baselineInput();
  input.repeats = [baselineRepeat('2026-01-02T12:15:00.000Z', 20)];
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'pending');
  assert.equal(result.reasonCode, 'awaiting-next-repeat');
  assert.equal(result.reportValue, null);
  assert.equal(result.repeatsEvaluated, 1);
  assert.equal(result.notifyAllowed, false);
});

test('a second agreeing repeat after a disagreeing first repeat confirms', () => {
  const input = baselineInput();
  input.repeats = [
    baselineRepeat('2026-01-02T12:15:00.000Z', 20),
    baselineRepeat('2026-01-02T12:30:00.000Z', 10.1),
  ];
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'confirmed');
  assert.equal(result.reasonCode, 'repeat-confirmed');
  assert.equal(result.repeatsEvaluated, 2);
  assert.equal(result.notifyAllowed, true);
});

test('disagreement exhausting the maximum repeats is discordant, unreportable, and allows notification', () => {
  const input = baselineInput();
  input.repeats = [
    baselineRepeat('2026-01-02T12:15:00.000Z', 20),
    baselineRepeat('2026-01-02T12:30:00.000Z', 30),
  ];
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'discordant');
  assert.equal(result.reasonCode, 'repeats-exhausted');
  assert.equal(result.reportValue, null);
  assert.equal(result.repeatsEvaluated, 2);
  assert.equal(result.notifyAllowed, true);
});

test('a repeat exactly at the absolute tolerance boundary agrees', () => {
  const input = baselineInput();
  input.repeats = [baselineRepeat('2026-01-02T12:15:00.000Z', 10.5)]; // delta exactly 0.5
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'confirmed');
});

test('a repeat just past the absolute tolerance still agrees via percent tolerance', () => {
  const input = baselineInput();
  // absolute delta 0.6 (over 0.5), percent delta 6% (under 10%)
  input.repeats = [baselineRepeat('2026-01-02T12:15:00.000Z', 10.6)];
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'confirmed');
});

test('a repeat over both declared tolerances disagrees', () => {
  const input = baselineInput();
  input.repeats = [baselineRepeat('2026-01-02T12:15:00.000Z', 12)]; // absolute 2, percent 20%
  input.policy.maxRepeats = 1;
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'discordant');
  assert.equal(result.reasonCode, 'repeats-exhausted');
});

test('a zero first value yields a null percent delta and only absolute tolerance applies', () => {
  const input = baselineInput();
  input.first.value = 0;
  input.policy.tolerance = { absolute: 1, percent: 5 };
  input.repeats = [baselineRepeat('2026-01-02T12:15:00.000Z', 0.5)];
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'confirmed');
});

test('only the first agreeing repeat is evaluated; later repeats in the list are not needed', () => {
  const input = baselineInput();
  input.repeats = [
    baselineRepeat('2026-01-02T12:15:00.000Z', 10.1),
    baselineRepeat('2026-01-02T12:30:00.000Z', 999),
  ];
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'confirmed');
  assert.equal(result.repeatsEvaluated, 1);
});

test('a mismatched repeat subject fails closed to discordant', () => {
  const input = baselineInput();
  input.repeats[0]!.subjectId = 'subject-synthetic-intruder';
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'discordant');
  assert.equal(result.reasonCode, 'repeat-subject-mismatch');
  assert.equal(result.notifyAllowed, true);
});

test('a mismatched repeat analyte fails closed to discordant', () => {
  const input = baselineInput();
  input.repeats[0]!.analyteCode = 'ANALYTE-SYNTH-OTHER';
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'discordant');
  assert.equal(result.reasonCode, 'repeat-analyte-mismatch');
});

test('an unparsable repeat timestamp fails closed to discordant', () => {
  const input = baselineInput();
  input.repeats[0]!.capturedAt = 'not-a-timestamp';
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'discordant');
  assert.equal(result.reasonCode, 'repeat-timestamp-invalid');
});

test('a repeat not after the first result fails closed to discordant', () => {
  const input = baselineInput();
  input.repeats[0]!.capturedAt = input.first.capturedAt;
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'discordant');
  assert.equal(result.reasonCode, 'repeat-not-after-previous');
});

test('a second repeat not after the first repeat fails closed to discordant', () => {
  const input = baselineInput();
  input.policy.maxRepeats = 3;
  input.repeats = [
    baselineRepeat('2026-01-02T12:30:00.000Z', 20),
    baselineRepeat('2026-01-02T12:15:00.000Z', 10.1), // earlier than the previous repeat
  ];
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'discordant');
  assert.equal(result.reasonCode, 'repeat-not-after-previous');
  assert.equal(result.repeatsEvaluated, 2);
});

test('a nonnumeric repeat value fails closed to discordant', () => {
  const input = baselineInput();
  (input.repeats[0] as unknown as { value: unknown }).value = 'not-a-number';
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'discordant');
  assert.equal(result.reasonCode, 'repeat-value-invalid');
});

test('a numeric-looking string repeat value is accepted as numeric', () => {
  const input = baselineInput();
  (input.repeats[0] as unknown as { value: unknown }).value = '10.2';
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'confirmed');
});

test('a missing repeat unit fails closed to discordant', () => {
  const input = baselineInput();
  delete input.repeats[0]!.unit;
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'discordant');
  assert.equal(result.reasonCode, 'repeat-unit-missing');
});

test('a repeat unit mismatched against the declared policy unit fails closed to discordant', () => {
  const input = baselineInput();
  input.repeats[0]!.unit = 'mg/dL';
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'discordant');
  assert.equal(result.reasonCode, 'repeat-unit-mismatched');
});

test('unit comparison ignores outer whitespace and case', () => {
  const input = baselineInput();
  input.first.unit = '  MMOL/L  ';
  input.repeats[0]!.unit = 'Mmol/L';
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'confirmed');
});

test('an unparsable first result timestamp fails closed to discordant with zero repeats evaluated', () => {
  const input = baselineInput();
  input.first.capturedAt = 'not-a-timestamp';
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'discordant');
  assert.equal(result.reasonCode, 'first-result-timestamp-invalid');
  assert.equal(result.repeatsEvaluated, 0);
  assert.equal(result.notifyAllowed, true);
});

test('a nonnumeric first result value fails closed to discordant', () => {
  const input = baselineInput();
  (input.first as unknown as { value: unknown }).value = 'not-a-number';
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'discordant');
  assert.equal(result.reasonCode, 'first-result-value-invalid');
});

test('a missing first result unit fails closed to discordant', () => {
  const input = baselineInput();
  delete input.first.unit;
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'discordant');
  assert.equal(result.reasonCode, 'first-result-unit-missing');
});

test('a first result unit mismatched against the declared policy unit fails closed to discordant', () => {
  const input = baselineInput();
  input.first.unit = 'mg/dL';
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'discordant');
  assert.equal(result.reasonCode, 'first-result-unit-mismatched');
});

test('an unknown analyte throws a sanitized typed error', () => {
  const input = baselineInput();
  input.first.analyteCode = 'ANALYTE-SYNTH-UNDECLARED';
  assert.throws(
    () => evaluateCriticalRepeat(input),
    (error: unknown) => {
      assert.ok(error instanceof CriticalRepeatPolicyInputError);
      assert.equal((error as CriticalRepeatPolicyInputError).code, 'unknown-analyte');
      return true;
    },
  );
});

test('missing first result identity fields throw a sanitized typed error', () => {
  const input = baselineInput();
  delete (input.first as Partial<CriticalRepeatResult>).subjectId;
  assert.throws(
    () => evaluateCriticalRepeat(input),
    (error: unknown) => {
      assert.ok(error instanceof CriticalRepeatPolicyInputError);
      assert.equal((error as CriticalRepeatPolicyInputError).code, 'first-malformed');
      return true;
    },
  );
});

test('missing repeat identity fields throw a sanitized typed error', () => {
  const input = baselineInput();
  delete (input.repeats[0] as Partial<CriticalRepeatResult>).analyteCode;
  assert.throws(
    () => evaluateCriticalRepeat(input),
    (error: unknown) => {
      assert.ok(error instanceof CriticalRepeatPolicyInputError);
      assert.equal((error as CriticalRepeatPolicyInputError).code, 'repeat-malformed');
      return true;
    },
  );
});

test('a non-array repeats input throws a sanitized typed error', () => {
  const input = baselineInput();
  (input as unknown as { repeats: unknown }).repeats = 'not-an-array';
  assert.throws(
    () => evaluateCriticalRepeat(input),
    (error: unknown) => {
      assert.ok(error instanceof CriticalRepeatPolicyInputError);
      assert.equal((error as CriticalRepeatPolicyInputError).code, 'repeats-not-array');
      return true;
    },
  );
});

test('more repeats than the declared maximum throws a sanitized typed error', () => {
  const input = baselineInput();
  input.policy.maxRepeats = 1;
  input.repeats = [
    baselineRepeat('2026-01-02T12:15:00.000Z', 20),
    baselineRepeat('2026-01-02T12:30:00.000Z', 30),
  ];
  assert.throws(
    () => evaluateCriticalRepeat(input),
    (error: unknown) => {
      assert.ok(error instanceof CriticalRepeatPolicyInputError);
      assert.equal((error as CriticalRepeatPolicyInputError).code, 'repeats-exceed-maximum');
      return true;
    },
  );
});

test('a policy with no declared unit throws a sanitized typed error', () => {
  const input = baselineInput();
  input.policy.unit = '';
  assert.throws(
    () => evaluateCriticalRepeat(input),
    (error: unknown) => {
      assert.ok(error instanceof CriticalRepeatPolicyInputError);
      assert.equal((error as CriticalRepeatPolicyInputError).code, 'policy-unit-missing');
      return true;
    },
  );
});

test('a policy with a non-positive maximum repeats throws a sanitized typed error', () => {
  const input = baselineInput();
  input.policy.maxRepeats = 0;
  assert.throws(
    () => evaluateCriticalRepeat(input),
    (error: unknown) => {
      assert.ok(error instanceof CriticalRepeatPolicyInputError);
      assert.equal((error as CriticalRepeatPolicyInputError).code, 'policy-max-repeats-invalid');
      return true;
    },
  );
});

test('a policy with a non-integer maximum repeats throws a sanitized typed error', () => {
  const input = baselineInput();
  input.policy.maxRepeats = 1.5;
  assert.throws(() => evaluateCriticalRepeat(input), CriticalRepeatPolicyInputError);
});

test('a policy with a negative tolerance throws a sanitized typed error', () => {
  const input = baselineInput();
  input.policy.tolerance = { absolute: -1, percent: null };
  assert.throws(
    () => evaluateCriticalRepeat(input),
    (error: unknown) => {
      assert.ok(error instanceof CriticalRepeatPolicyInputError);
      assert.equal((error as CriticalRepeatPolicyInputError).code, 'policy-tolerance-invalid');
      return true;
    },
  );
});

test('a repeat-required policy with no declared tolerance throws a sanitized typed error', () => {
  const input = baselineInput();
  input.policy.tolerance = { absolute: null, percent: null };
  assert.throws(
    () => evaluateCriticalRepeat(input),
    (error: unknown) => {
      assert.ok(error instanceof CriticalRepeatPolicyInputError);
      assert.equal((error as CriticalRepeatPolicyInputError).code, 'policy-tolerance-empty');
      return true;
    },
  );
});

test('a repeat-not-required policy with no declared tolerance does not throw', () => {
  const input = baselineInput();
  input.policy.repeatRequired = false;
  input.policy.tolerance = { absolute: null, percent: null };
  input.repeats = [];
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'confirmed');
});

test('a typed input error message never echoes any submitted data', () => {
  const input = baselineInput();
  input.first.analyteCode = 'ANALYTE-SYNTH-UNDECLARED';
  try {
    evaluateCriticalRepeat(input);
    assert.fail('expected evaluateCriticalRepeat to throw');
  } catch (error) {
    assert.ok(error instanceof CriticalRepeatPolicyInputError);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch((error as Error).message, pattern);
    }
    assert.doesNotMatch((error as Error).message, /subject-synthetic|ANALYTE-SYNTH/);
  }
});

test('every reason code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainCriticalRepeatReason(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /subject-synthetic|ANALYTE-SYNTH/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(explainCriticalRepeatReason('repeats-exhausted'), explainCriticalRepeatReason('repeats-exhausted'));
});

test('no status ever uses approval, compliance, accreditation, or release language', () => {
  const statuses: string[] = ['confirmed', 'discordant', 'pending'];
  for (const status of statuses) {
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(status, pattern);
    }
  }
});

test('the returned outcome is frozen', () => {
  const result = evaluateCriticalRepeat(baselineInput());
  assert.ok(Object.isFrozen(result));
});

test('notification is never allowed while status is pending', () => {
  const pendingInput = baselineInput();
  pendingInput.repeats = [];
  const pending = evaluateCriticalRepeat(pendingInput);
  assert.equal(pending.status, 'pending');
  assert.equal(pending.notifyAllowed, false);
});
