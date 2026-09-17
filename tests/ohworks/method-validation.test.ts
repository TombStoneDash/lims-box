import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MethodValidationGateInputError,
  evaluateMethodValidationGate,
  explainMethodValidationGateReason,
  type MethodRecordInput,
  type MethodValidationGateOptions,
  type MethodValidationReasonCode,
  type MethodValidationRegistry,
} from '../../lib/ohworks-method-validation';

/**
 * All fabricated: synthetic method identifiers, matrices, and made-up
 * validation data. None of this represents a real method, sample, or
 * customer.
 */
function record(overrides: Partial<MethodRecordInput> = {}): MethodRecordInput {
  return {
    methodId: 'method-synthetic-001',
    validationState: 'validated',
    validatedAt: '2026-01-01T00:00:00.000Z',
    revalidationIntervalDays: 30,
    validatedMatrices: ['drinking-water', 'groundwater'],
    ...overrides,
  };
}

function registryOf(entry: MethodRecordInput): MethodValidationRegistry {
  return { [entry.methodId]: entry };
}

const ALL_REASON_CODES: MethodValidationReasonCode[] = [
  'unknown-method',
  'run-timestamp-invalid',
  'validation-timestamp-invalid',
  'revalidation-interval-invalid',
  'run-before-validation',
  'method-retired',
  'unknown-validation-state',
  'method-not-yet-validated',
  'matrix-outside-validated-scope',
  'revalidation-interval-expired',
  'revalidation-due',
  'validation-near-expiry',
  'method-validated-and-current',
];

const FORBIDDEN_WORDS = [/compliant/i, /accredited/i, /reported?\b.*\bresult/i];

// ---------------------------------------------------------------------------
// Golden paths
// ---------------------------------------------------------------------------

test('a current, validated method in scope is reported', () => {
  const entry = record();
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-10T00:00:00.000Z', 'drinking-water');
  assert.equal(result.decision, 'reported');
  assert.equal(result.reasonCode, 'method-validated-and-current');
});

test('a run at the exact moment of validation is reported', () => {
  const entry = record();
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, entry.validatedAt, 'drinking-water');
  assert.equal(result.decision, 'reported');
});

test('a method explicitly marked revalidation_due, still within interval, is reported_with_flag', () => {
  const entry = record({ validationState: 'revalidation_due' });
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-05T00:00:00.000Z', 'drinking-water');
  assert.equal(result.decision, 'reported_with_flag');
  assert.equal(result.reasonCode, 'revalidation-due');
});

test('a validated method inside the default 3-day near-expiry warning window is reported_with_flag', () => {
  const entry = record();
  // interval expires 2026-01-31T00:00:00.000Z; run 2 days before that.
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-29T00:00:00.000Z', 'drinking-water');
  assert.equal(result.decision, 'reported_with_flag');
  assert.equal(result.reasonCode, 'validation-near-expiry');
});

test('a validated method exactly nearExpiryWarningDays before expiry is reported_with_flag', () => {
  const entry = record();
  // expiry is 2026-01-31T00:00:00.000Z; exactly 3 days before is the boundary.
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-28T00:00:00.000Z', 'drinking-water');
  assert.equal(result.decision, 'reported_with_flag');
  assert.equal(result.reasonCode, 'validation-near-expiry');
});

test('a validated method one instant more than nearExpiryWarningDays before expiry is reported', () => {
  const entry = record();
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-27T23:59:59.999Z', 'drinking-water');
  assert.equal(result.decision, 'reported');
  assert.equal(result.reasonCode, 'method-validated-and-current');
});

test('a revalidation_due state takes precedence over the near-expiry flag', () => {
  const entry = record({ validationState: 'revalidation_due' });
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-29T00:00:00.000Z', 'drinking-water');
  assert.equal(result.decision, 'reported_with_flag');
  assert.equal(result.reasonCode, 'revalidation-due');
});

test('a custom nearExpiryWarningDays of 0 disables the near-expiry flag', () => {
  const entry = record();
  const options: MethodValidationGateOptions = { nearExpiryWarningDays: 0 };
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-29T00:00:00.000Z', 'drinking-water', options);
  assert.equal(result.decision, 'reported');
  assert.equal(result.reasonCode, 'method-validated-and-current');
});

test('a custom, wider nearExpiryWarningDays flags earlier runs', () => {
  const entry = record();
  const options: MethodValidationGateOptions = { nearExpiryWarningDays: 10 };
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-25T00:00:00.000Z', 'drinking-water', options);
  assert.equal(result.decision, 'reported_with_flag');
  assert.equal(result.reasonCode, 'validation-near-expiry');
});

test('a method validated for multiple matrices reports for each in-scope matrix', () => {
  const entry = record();
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-10T00:00:00.000Z', 'groundwater');
  assert.equal(result.decision, 'reported');
  assert.equal(result.matrix, 'groundwater');
});

// ---------------------------------------------------------------------------
// Fail closed: unknown method
// ---------------------------------------------------------------------------

test('a method absent from the registry is blocked as unknown', () => {
  const entry = record();
  const result = evaluateMethodValidationGate(registryOf(entry), 'method-synthetic-does-not-exist', '2026-01-05T00:00:00.000Z', 'drinking-water');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'unknown-method');
});

test('an empty registry blocks every lookup as unknown', () => {
  const result = evaluateMethodValidationGate({}, 'method-synthetic-001', '2026-01-05T00:00:00.000Z', 'drinking-water');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'unknown-method');
});

// ---------------------------------------------------------------------------
// Fail closed: retired and draft methods
// ---------------------------------------------------------------------------

test('a retired method is blocked', () => {
  const entry = record({ validationState: 'retired' });
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-05T00:00:00.000Z', 'drinking-water');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'method-retired');
});

test('a retired method is blocked even for a matrix outside its scope', () => {
  const entry = record({ validationState: 'retired' });
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-05T00:00:00.000Z', 'seawater');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'method-retired');
});

test('a draft (never validated) method is blocked', () => {
  const entry = record({ validationState: 'draft' });
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-05T00:00:00.000Z', 'drinking-water');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'method-not-yet-validated');
});

test('an unrecognized validation state value is blocked', () => {
  const entry = record({ validationState: 'approved-verbally' as MethodRecordInput['validationState'] });
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-05T00:00:00.000Z', 'drinking-water');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'unknown-validation-state');
});

// ---------------------------------------------------------------------------
// Fail closed: matrix outside validated scope
// ---------------------------------------------------------------------------

test('a matrix outside the validated scope is blocked', () => {
  const entry = record();
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-05T00:00:00.000Z', 'seawater');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'matrix-outside-validated-scope');
});

test('a matrix outside scope is blocked even when the method is revalidation_due', () => {
  const entry = record({ validationState: 'revalidation_due' });
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-05T00:00:00.000Z', 'seawater');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'matrix-outside-validated-scope');
});

test('matrix matching is case-sensitive and exact', () => {
  const entry = record();
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-05T00:00:00.000Z', 'Drinking-Water');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'matrix-outside-validated-scope');
});

// ---------------------------------------------------------------------------
// Fail closed: expired revalidation interval
// ---------------------------------------------------------------------------

test('a run at the exact expiry instant is blocked as expired', () => {
  const entry = record();
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-31T00:00:00.000Z', 'drinking-water');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'revalidation-interval-expired');
});

test('a run well past the interval is blocked as expired', () => {
  const entry = record();
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-03-01T00:00:00.000Z', 'drinking-water');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'revalidation-interval-expired');
});

test('interval expiry is checked before the revalidation_due flag', () => {
  const entry = record({ validationState: 'revalidation_due' });
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-31T00:00:00.000Z', 'drinking-water');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'revalidation-interval-expired');
});

// ---------------------------------------------------------------------------
// Fail closed: malformed timestamps and interval, as blocked reason codes
// ---------------------------------------------------------------------------

test('an unparsable run timestamp is blocked', () => {
  const entry = record();
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, 'not-a-timestamp', 'drinking-water');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'run-timestamp-invalid');
});

test('a non-UTC (offset, non-"Z") run timestamp is blocked', () => {
  const entry = record();
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-05T00:00:00.000+00:00', 'drinking-water');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'run-timestamp-invalid');
});

test('an unparsable validation timestamp is blocked', () => {
  const entry = record({ validatedAt: 'not-a-timestamp' });
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-05T00:00:00.000Z', 'drinking-water');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'validation-timestamp-invalid');
});

test('a non-UTC validation timestamp is blocked', () => {
  const entry = record({ validatedAt: '2026-01-01T00:00:00.000+05:00' });
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-05T00:00:00.000Z', 'drinking-water');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'validation-timestamp-invalid');
});

test('a zero revalidation interval is blocked as invalid', () => {
  const entry = record({ revalidationIntervalDays: 0 });
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-05T00:00:00.000Z', 'drinking-water');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'revalidation-interval-invalid');
});

test('a negative revalidation interval is blocked as invalid', () => {
  const entry = record({ revalidationIntervalDays: -30 });
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-05T00:00:00.000Z', 'drinking-water');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'revalidation-interval-invalid');
});

test('a non-integer revalidation interval is blocked as invalid', () => {
  const entry = record({ revalidationIntervalDays: 30.5 });
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-05T00:00:00.000Z', 'drinking-water');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'revalidation-interval-invalid');
});

test('a run timestamp before the validation date is blocked', () => {
  const entry = record();
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2025-12-31T00:00:00.000Z', 'drinking-water');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'run-before-validation');
});

// ---------------------------------------------------------------------------
// Structurally malformed input throws, rather than guessing
// ---------------------------------------------------------------------------

test('a null registry throws a sanitized typed error', () => {
  assert.throws(
    () => evaluateMethodValidationGate(null as unknown as MethodValidationRegistry, 'method-synthetic-001', '2026-01-05T00:00:00.000Z', 'drinking-water'),
    (error: unknown) => {
      assert.ok(error instanceof MethodValidationGateInputError);
      assert.equal((error as MethodValidationGateInputError).code, 'registry-malformed');
      return true;
    },
  );
});

test('an array registry throws a sanitized typed error', () => {
  assert.throws(
    () => evaluateMethodValidationGate([] as unknown as MethodValidationRegistry, 'method-synthetic-001', '2026-01-05T00:00:00.000Z', 'drinking-water'),
    (error: unknown) => {
      assert.ok(error instanceof MethodValidationGateInputError);
      assert.equal((error as MethodValidationGateInputError).code, 'registry-malformed');
      return true;
    },
  );
});

test('an empty-string method id throws a sanitized typed error', () => {
  const entry = record();
  assert.throws(
    () => evaluateMethodValidationGate(registryOf(entry), '', '2026-01-05T00:00:00.000Z', 'drinking-water'),
    (error: unknown) => {
      assert.ok(error instanceof MethodValidationGateInputError);
      assert.equal((error as MethodValidationGateInputError).code, 'method-id-malformed');
      return true;
    },
  );
});

test('a non-string run timestamp throws a sanitized typed error', () => {
  const entry = record();
  assert.throws(
    () => evaluateMethodValidationGate(registryOf(entry), entry.methodId, 12345 as unknown as string, 'drinking-water'),
    (error: unknown) => {
      assert.ok(error instanceof MethodValidationGateInputError);
      assert.equal((error as MethodValidationGateInputError).code, 'run-timestamp-malformed');
      return true;
    },
  );
});

test('an empty-string matrix throws a sanitized typed error', () => {
  const entry = record();
  assert.throws(
    () => evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-05T00:00:00.000Z', ''),
    (error: unknown) => {
      assert.ok(error instanceof MethodValidationGateInputError);
      assert.equal((error as MethodValidationGateInputError).code, 'matrix-malformed');
      return true;
    },
  );
});

test('a non-string matrix throws a sanitized typed error', () => {
  const entry = record();
  assert.throws(
    () => evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-05T00:00:00.000Z', 42 as unknown as string),
    (error: unknown) => {
      assert.ok(error instanceof MethodValidationGateInputError);
      assert.equal((error as MethodValidationGateInputError).code, 'matrix-malformed');
      return true;
    },
  );
});

test('a negative nearExpiryWarningDays option throws a sanitized typed error', () => {
  const entry = record();
  assert.throws(
    () => evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-05T00:00:00.000Z', 'drinking-water', { nearExpiryWarningDays: -1 }),
    (error: unknown) => {
      assert.ok(error instanceof MethodValidationGateInputError);
      assert.equal((error as MethodValidationGateInputError).code, 'options-malformed');
      return true;
    },
  );
});

test('a registry entry missing a required field throws a sanitized typed error', () => {
  const malformed = record();
  delete (malformed as Partial<MethodRecordInput>).validationState;
  assert.throws(
    () => evaluateMethodValidationGate({ [malformed.methodId]: malformed } as unknown as MethodValidationRegistry, malformed.methodId, '2026-01-05T00:00:00.000Z', 'drinking-water'),
    (error: unknown) => {
      assert.ok(error instanceof MethodValidationGateInputError);
      assert.equal((error as MethodValidationGateInputError).code, 'method-record-malformed');
      return true;
    },
  );
});

function isRecordMalformedError(error: unknown): boolean {
  return error instanceof MethodValidationGateInputError && error.code === 'method-record-malformed';
}

test('a registry entry with an empty validated-matrices list throws a sanitized typed error', () => {
  const entry = record({ validatedMatrices: [] });
  assert.throws(
    () => evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-05T00:00:00.000Z', 'drinking-water'),
    isRecordMalformedError,
  );
});

test('a registry entry with a non-array validated-matrices field throws a sanitized typed error', () => {
  const entry = record({ validatedMatrices: 'drinking-water' as unknown as string[] });
  assert.throws(
    () => evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-05T00:00:00.000Z', 'drinking-water'),
    isRecordMalformedError,
  );
});

test('a typed input error message never echoes any submitted data', () => {
  try {
    evaluateMethodValidationGate(null as unknown as MethodValidationRegistry, 'method-secret-token-abc123', '2026-01-05T00:00:00.000Z', 'drinking-water');
    assert.fail('expected evaluateMethodValidationGate to throw');
  } catch (error) {
    assert.ok(error instanceof MethodValidationGateInputError);
    assert.doesNotMatch((error as Error).message, /method-secret-token-abc123/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch((error as Error).message, pattern);
    }
  }
});

// ---------------------------------------------------------------------------
// Determinism, purity, and immutability
// ---------------------------------------------------------------------------

test('the result is deterministic across repeated calls with equivalent input', () => {
  const entry = record();
  const first = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-10T00:00:00.000Z', 'drinking-water');
  const second = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-10T00:00:00.000Z', 'drinking-water');
  assert.deepEqual(first, second);
});

test('the result object is frozen', () => {
  const entry = record();
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-10T00:00:00.000Z', 'drinking-water');
  assert.ok(Object.isFrozen(result));
  const mutationSucceeded = Reflect.set(result, 'decision', 'reported');
  assert.equal(mutationSucceeded, false);
  assert.equal(result.decision, 'reported');
});

test('evaluateMethodValidationGate does not mutate its registry input', () => {
  const entry = record();
  const registry = registryOf(entry);
  const before = JSON.stringify(registry);
  evaluateMethodValidationGate(registry, entry.methodId, '2026-01-10T00:00:00.000Z', 'drinking-water');
  assert.equal(JSON.stringify(registry), before);
});

// ---------------------------------------------------------------------------
// Explanations
// ---------------------------------------------------------------------------

test('every reason code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainMethodValidationGateReason(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /method-synthetic/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(explainMethodValidationGateReason('method-retired'), explainMethodValidationGateReason('method-retired'));
});

test('the reason field on a result matches explainMethodValidationGateReason for its reasonCode', () => {
  const entry = record();
  const result = evaluateMethodValidationGate(registryOf(entry), entry.methodId, '2026-01-10T00:00:00.000Z', 'drinking-water');
  assert.equal(result.reason, explainMethodValidationGateReason(result.reasonCode));
});
