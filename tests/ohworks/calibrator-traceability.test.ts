import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CalibratorTraceabilityInputError,
  evaluateCalibratorLotTraceability,
  explainTraceabilityReason,
  type CalibratorLotRecordInput,
  type CalibratorLotRegistry,
  type CalibratorTraceabilityOptions,
  type TraceabilityReasonCode,
} from '../../lib/ohworks-calibrator-traceability';

/**
 * All fabricated: synthetic calibrator lot identifiers and made-up
 * certificate data. None of this represents a real calibrator, instrument,
 * sample, or customer.
 */
function lot(overrides: Partial<CalibratorLotRecordInput> = {}): CalibratorLotRecordInput {
  return {
    lotId: 'calibrator-synthetic-working-001',
    parentReferenceId: 'calibrator-synthetic-secondary-001',
    certificateExpiresAt: '2026-06-01T00:00:00.000Z',
    assignedValue: 100,
    assignedValueUncertainty: 0.5,
    ...overrides,
  };
}

function registryOf(...entries: CalibratorLotRecordInput[]): CalibratorLotRegistry {
  const registry: Record<string, CalibratorLotRecordInput> = {};
  for (const entry of entries) {
    registry[entry.lotId] = entry;
  }
  return registry;
}

function threeTierChain(): CalibratorLotRecordInput[] {
  const working = lot();
  const secondary = lot({
    lotId: 'calibrator-synthetic-secondary-001',
    parentReferenceId: 'calibrator-synthetic-primary-001',
    assignedValue: 100.1,
    assignedValueUncertainty: 0.3,
  });
  const primary = lot({
    lotId: 'calibrator-synthetic-primary-001',
    parentReferenceId: undefined,
    isDeclaredReference: true,
    assignedValue: 100.05,
    assignedValueUncertainty: 0.1,
  });
  return [working, secondary, primary];
}

const ALL_REASON_CODES: TraceabilityReasonCode[] = [
  'unknown-lot',
  'run-timestamp-invalid',
  'certificate-timestamp-invalid',
  'certificate-expired',
  'assigned-value-missing',
  'assigned-value-invalid',
  'uncertainty-missing',
  'uncertainty-invalid',
  'missing-parent',
  'undeclared-terminal-lot',
  'cycle-detected',
  'chain-too-long',
  'chain-traceable',
];

const FORBIDDEN_WORDS = [/compliant/i, /accredited/i, /released?\b.*\bresult/i];

// ---------------------------------------------------------------------------
// Golden paths
// ---------------------------------------------------------------------------

test('a single-tier chain to a declared reference is traceable', () => {
  const working = lot({ parentReferenceId: undefined, isDeclaredReference: true });
  const result = evaluateCalibratorLotTraceability(registryOf(working), working.lotId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'traceable');
  assert.equal(result.reasonCode, 'chain-traceable');
  assert.equal(result.referenceLotId, working.lotId);
  assert.equal(result.combinedUncertainty, 0.5);
  assert.deepEqual(result.chain, [working.lotId]);
});

test('a three-tier chain resolves to the declared reference with RSS combined uncertainty', () => {
  const [working, secondary, primary] = threeTierChain();
  const result = evaluateCalibratorLotTraceability(
    registryOf(working, secondary, primary),
    working.lotId,
    '2026-01-10T00:00:00.000Z',
  );
  assert.equal(result.decision, 'traceable');
  assert.equal(result.referenceLotId, primary.lotId);
  assert.deepEqual(result.chain, [working.lotId, secondary.lotId, primary.lotId]);
  const expected = Math.sqrt(0.5 * 0.5 + 0.3 * 0.3 + 0.1 * 0.1);
  assert.ok(result.combinedUncertainty !== null);
  assert.ok(Math.abs((result.combinedUncertainty as number) - expected) < 1e-12);
});

test('a run at the exact certificate expiry instant of every lot is traceable up to that boundary', () => {
  const working = lot({ certificateExpiresAt: '2026-06-01T00:00:00.000Z' });
  const secondary = lot({
    lotId: 'calibrator-synthetic-secondary-001',
    parentReferenceId: undefined,
    isDeclaredReference: true,
    certificateExpiresAt: '2026-06-01T00:00:00.000Z',
  });
  const result = evaluateCalibratorLotTraceability(
    registryOf(working, secondary),
    working.lotId,
    '2026-05-31T23:59:59.999Z',
  );
  assert.equal(result.decision, 'traceable');
});

// ---------------------------------------------------------------------------
// Fail closed: unknown lot / broken chain
// ---------------------------------------------------------------------------

test('a lot absent from the registry is not_traceable as unknown', () => {
  const result = evaluateCalibratorLotTraceability({}, 'calibrator-synthetic-does-not-exist', '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'not_traceable');
  assert.equal(result.reasonCode, 'unknown-lot');
  assert.equal(result.referenceLotId, null);
  assert.equal(result.combinedUncertainty, null);
});

test('a chain whose parent identifier has no matching record is not_traceable as missing-parent', () => {
  const working = lot({ parentReferenceId: 'calibrator-synthetic-ghost-parent' });
  const result = evaluateCalibratorLotTraceability(registryOf(working), working.lotId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_traceable');
  assert.equal(result.reasonCode, 'missing-parent');
  assert.deepEqual(result.chain, [working.lotId, 'calibrator-synthetic-ghost-parent']);
});

test('a lot with no parent and no declared-reference flag is not_traceable as undeclared-terminal-lot', () => {
  const working = lot({ parentReferenceId: undefined });
  const result = evaluateCalibratorLotTraceability(registryOf(working), working.lotId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_traceable');
  assert.equal(result.reasonCode, 'undeclared-terminal-lot');
});

// ---------------------------------------------------------------------------
// Fail closed: cycles
// ---------------------------------------------------------------------------

test('a two-lot cycle is not_traceable as cycle-detected', () => {
  const a = lot({ lotId: 'calibrator-synthetic-a', parentReferenceId: 'calibrator-synthetic-b' });
  const b = lot({ lotId: 'calibrator-synthetic-b', parentReferenceId: 'calibrator-synthetic-a' });
  const result = evaluateCalibratorLotTraceability(registryOf(a, b), a.lotId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_traceable');
  assert.equal(result.reasonCode, 'cycle-detected');
});

test('a lot that cites itself as its own parent is not_traceable as cycle-detected', () => {
  const working = lot({ parentReferenceId: 'calibrator-synthetic-working-001' });
  const result = evaluateCalibratorLotTraceability(registryOf(working), working.lotId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_traceable');
  assert.equal(result.reasonCode, 'cycle-detected');
});

// ---------------------------------------------------------------------------
// Fail closed: chain too long
// ---------------------------------------------------------------------------

test('a cycle-free chain exceeding maxChainDepth is not_traceable as chain-too-long', () => {
  const chainLength = 5;
  const entries: CalibratorLotRecordInput[] = [];
  for (let i = 0; i < chainLength; i += 1) {
    entries.push(
      lot({
        lotId: `calibrator-synthetic-tier-${i}`,
        parentReferenceId: i === chainLength - 1 ? undefined : `calibrator-synthetic-tier-${i + 1}`,
        isDeclaredReference: i === chainLength - 1,
      }),
    );
  }
  const options: CalibratorTraceabilityOptions = { maxChainDepth: 3 };
  const result = evaluateCalibratorLotTraceability(registryOf(...entries), entries[0].lotId, '2026-01-10T00:00:00.000Z', options);
  assert.equal(result.decision, 'not_traceable');
  assert.equal(result.reasonCode, 'chain-too-long');
});

test('a chain exactly at maxChainDepth resolves if the last lot is the declared reference', () => {
  const working = lot({ parentReferenceId: 'calibrator-synthetic-secondary-001' });
  const secondary = lot({
    lotId: 'calibrator-synthetic-secondary-001',
    parentReferenceId: undefined,
    isDeclaredReference: true,
  });
  const options: CalibratorTraceabilityOptions = { maxChainDepth: 2 };
  const result = evaluateCalibratorLotTraceability(registryOf(working, secondary), working.lotId, '2026-01-10T00:00:00.000Z', options);
  assert.equal(result.decision, 'traceable');
});

// ---------------------------------------------------------------------------
// Fail closed: expired certificates
// ---------------------------------------------------------------------------

test('a run at the exact certificate expiry instant is not_traceable as expired', () => {
  const working = lot({ parentReferenceId: undefined, isDeclaredReference: true, certificateExpiresAt: '2026-06-01T00:00:00.000Z' });
  const result = evaluateCalibratorLotTraceability(registryOf(working), working.lotId, '2026-06-01T00:00:00.000Z');
  assert.equal(result.decision, 'not_traceable');
  assert.equal(result.reasonCode, 'certificate-expired');
});

test('an expired certificate on the parent reference blocks the chain even if the working lot certificate is current', () => {
  const [working, secondary, primary] = threeTierChain();
  const expiredPrimary = { ...primary, certificateExpiresAt: '2026-01-01T00:00:00.000Z' };
  const result = evaluateCalibratorLotTraceability(
    registryOf(working, secondary, expiredPrimary),
    working.lotId,
    '2026-01-10T00:00:00.000Z',
  );
  assert.equal(result.decision, 'not_traceable');
  assert.equal(result.reasonCode, 'certificate-expired');
  assert.deepEqual(result.chain, [working.lotId, secondary.lotId, primary.lotId]);
});

test('an unparsable certificate expiry timestamp is not_traceable as certificate-timestamp-invalid', () => {
  const working = lot({ parentReferenceId: undefined, isDeclaredReference: true, certificateExpiresAt: 'not-a-timestamp' });
  const result = evaluateCalibratorLotTraceability(registryOf(working), working.lotId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_traceable');
  assert.equal(result.reasonCode, 'certificate-timestamp-invalid');
});

test('a non-UTC (offset, non-"Z") certificate expiry timestamp is not_traceable', () => {
  const working = lot({
    parentReferenceId: undefined,
    isDeclaredReference: true,
    certificateExpiresAt: '2026-06-01T00:00:00.000+00:00',
  });
  const result = evaluateCalibratorLotTraceability(registryOf(working), working.lotId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_traceable');
  assert.equal(result.reasonCode, 'certificate-timestamp-invalid');
});

// ---------------------------------------------------------------------------
// Fail closed: missing / invalid assigned values and uncertainties
// ---------------------------------------------------------------------------

test('a lot missing an assigned value is not_traceable', () => {
  const working = lot({ parentReferenceId: undefined, isDeclaredReference: true, assignedValue: undefined });
  const result = evaluateCalibratorLotTraceability(registryOf(working), working.lotId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_traceable');
  assert.equal(result.reasonCode, 'assigned-value-missing');
});

test('a lot with a non-finite assigned value is not_traceable', () => {
  const working = lot({ parentReferenceId: undefined, isDeclaredReference: true, assignedValue: Number.NaN });
  const result = evaluateCalibratorLotTraceability(registryOf(working), working.lotId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_traceable');
  assert.equal(result.reasonCode, 'assigned-value-invalid');
});

test('a lot missing an assigned-value uncertainty is not_traceable', () => {
  const working = lot({ parentReferenceId: undefined, isDeclaredReference: true, assignedValueUncertainty: undefined });
  const result = evaluateCalibratorLotTraceability(registryOf(working), working.lotId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_traceable');
  assert.equal(result.reasonCode, 'uncertainty-missing');
});

test('a lot with a negative uncertainty is not_traceable as invalid', () => {
  const working = lot({ parentReferenceId: undefined, isDeclaredReference: true, assignedValueUncertainty: -0.1 });
  const result = evaluateCalibratorLotTraceability(registryOf(working), working.lotId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_traceable');
  assert.equal(result.reasonCode, 'uncertainty-invalid');
});

test('a lot with a non-finite uncertainty is not_traceable as invalid', () => {
  const working = lot({ parentReferenceId: undefined, isDeclaredReference: true, assignedValueUncertainty: Number.POSITIVE_INFINITY });
  const result = evaluateCalibratorLotTraceability(registryOf(working), working.lotId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_traceable');
  assert.equal(result.reasonCode, 'uncertainty-invalid');
});

test('a zero uncertainty is valid (a perfectly certain assignment is not the same as a missing one)', () => {
  const working = lot({ parentReferenceId: undefined, isDeclaredReference: true, assignedValueUncertainty: 0 });
  const result = evaluateCalibratorLotTraceability(registryOf(working), working.lotId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'traceable');
  assert.equal(result.combinedUncertainty, 0);
});

test('a missing assigned value deep in the chain blocks traceability even though the working lot is fine', () => {
  const [working, secondary, primary] = threeTierChain();
  const brokenSecondary = { ...secondary, assignedValue: undefined };
  const result = evaluateCalibratorLotTraceability(
    registryOf(working, brokenSecondary, primary),
    working.lotId,
    '2026-01-10T00:00:00.000Z',
  );
  assert.equal(result.decision, 'not_traceable');
  assert.equal(result.reasonCode, 'assigned-value-missing');
  assert.deepEqual(result.chain, [working.lotId, secondary.lotId]);
});

// ---------------------------------------------------------------------------
// Fail closed: run timestamp
// ---------------------------------------------------------------------------

test('an unparsable run timestamp is not_traceable', () => {
  const working = lot({ parentReferenceId: undefined, isDeclaredReference: true });
  const result = evaluateCalibratorLotTraceability(registryOf(working), working.lotId, 'not-a-timestamp');
  assert.equal(result.decision, 'not_traceable');
  assert.equal(result.reasonCode, 'run-timestamp-invalid');
});

test('a non-UTC (offset, non-"Z") run timestamp is not_traceable', () => {
  const working = lot({ parentReferenceId: undefined, isDeclaredReference: true });
  const result = evaluateCalibratorLotTraceability(registryOf(working), working.lotId, '2026-01-10T00:00:00.000+00:00');
  assert.equal(result.decision, 'not_traceable');
  assert.equal(result.reasonCode, 'run-timestamp-invalid');
});

// ---------------------------------------------------------------------------
// Structurally malformed input throws, rather than guessing
// ---------------------------------------------------------------------------

test('a null registry throws a sanitized typed error', () => {
  assert.throws(
    () => evaluateCalibratorLotTraceability(null as unknown as CalibratorLotRegistry, 'calibrator-synthetic-working-001', '2026-01-10T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof CalibratorTraceabilityInputError);
      assert.equal((error as CalibratorTraceabilityInputError).code, 'registry-malformed');
      return true;
    },
  );
});

test('an array registry throws a sanitized typed error', () => {
  assert.throws(
    () => evaluateCalibratorLotTraceability([] as unknown as CalibratorLotRegistry, 'calibrator-synthetic-working-001', '2026-01-10T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof CalibratorTraceabilityInputError);
      assert.equal((error as CalibratorTraceabilityInputError).code, 'registry-malformed');
      return true;
    },
  );
});

test('an empty-string lot id throws a sanitized typed error', () => {
  const working = lot();
  assert.throws(
    () => evaluateCalibratorLotTraceability(registryOf(working), '', '2026-01-10T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof CalibratorTraceabilityInputError);
      assert.equal((error as CalibratorTraceabilityInputError).code, 'lot-id-malformed');
      return true;
    },
  );
});

test('a non-string run timestamp throws a sanitized typed error', () => {
  const working = lot();
  assert.throws(
    () => evaluateCalibratorLotTraceability(registryOf(working), working.lotId, 12345 as unknown as string),
    (error: unknown) => {
      assert.ok(error instanceof CalibratorTraceabilityInputError);
      assert.equal((error as CalibratorTraceabilityInputError).code, 'run-timestamp-malformed');
      return true;
    },
  );
});

test('a zero maxChainDepth option throws a sanitized typed error', () => {
  const working = lot();
  assert.throws(
    () => evaluateCalibratorLotTraceability(registryOf(working), working.lotId, '2026-01-10T00:00:00.000Z', { maxChainDepth: 0 }),
    (error: unknown) => {
      assert.ok(error instanceof CalibratorTraceabilityInputError);
      assert.equal((error as CalibratorTraceabilityInputError).code, 'options-malformed');
      return true;
    },
  );
});

test('a non-integer maxChainDepth option throws a sanitized typed error', () => {
  const working = lot();
  assert.throws(
    () => evaluateCalibratorLotTraceability(registryOf(working), working.lotId, '2026-01-10T00:00:00.000Z', { maxChainDepth: 2.5 }),
    CalibratorTraceabilityInputError,
  );
});

test('a registry entry missing a required field throws a sanitized typed error', () => {
  const malformed = lot();
  delete (malformed as Partial<CalibratorLotRecordInput>).certificateExpiresAt;
  assert.throws(
    () => evaluateCalibratorLotTraceability({ [malformed.lotId]: malformed } as unknown as CalibratorLotRegistry, malformed.lotId, '2026-01-10T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof CalibratorTraceabilityInputError);
      assert.equal((error as CalibratorTraceabilityInputError).code, 'lot-record-malformed');
      return true;
    },
  );
});

test('a registry entry with a wrongly typed isDeclaredReference throws a sanitized typed error', () => {
  const malformed = lot({ isDeclaredReference: 'yes' as unknown as boolean });
  assert.throws(
    () => evaluateCalibratorLotTraceability(registryOf(malformed), malformed.lotId, '2026-01-10T00:00:00.000Z'),
    CalibratorTraceabilityInputError,
  );
});

test('a malformed record encountered deep in the chain (not at the root) also throws', () => {
  const working = lot();
  const malformedSecondary = { lotId: 'calibrator-synthetic-secondary-001', certificateExpiresAt: 123 as unknown as string };
  assert.throws(
    () => evaluateCalibratorLotTraceability(registryOf(working, malformedSecondary as unknown as CalibratorLotRecordInput), working.lotId, '2026-01-10T00:00:00.000Z'),
    CalibratorTraceabilityInputError,
  );
});

test('a typed input error message never echoes any submitted data', () => {
  try {
    evaluateCalibratorLotTraceability(null as unknown as CalibratorLotRegistry, 'calibrator-secret-token-abc123', '2026-01-10T00:00:00.000Z');
    assert.fail('expected evaluateCalibratorLotTraceability to throw');
  } catch (error) {
    assert.ok(error instanceof CalibratorTraceabilityInputError);
    assert.doesNotMatch((error as Error).message, /calibrator-secret-token-abc123/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch((error as Error).message, pattern);
    }
  }
});

// ---------------------------------------------------------------------------
// Determinism, purity, and immutability
// ---------------------------------------------------------------------------

test('the result is deterministic across repeated calls with equivalent input', () => {
  const [working, secondary, primary] = threeTierChain();
  const registry = registryOf(working, secondary, primary);
  const first = evaluateCalibratorLotTraceability(registry, working.lotId, '2026-01-10T00:00:00.000Z');
  const second = evaluateCalibratorLotTraceability(registry, working.lotId, '2026-01-10T00:00:00.000Z');
  assert.deepEqual(first, second);
});

test('the result object and its chain array are frozen', () => {
  const working = lot({ parentReferenceId: undefined, isDeclaredReference: true });
  const result = evaluateCalibratorLotTraceability(registryOf(working), working.lotId, '2026-01-10T00:00:00.000Z');
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.chain));
  const mutationSucceeded = Reflect.set(result, 'decision', 'not_traceable');
  assert.equal(mutationSucceeded, false);
  assert.equal(result.decision, 'traceable');
});

test('evaluateCalibratorLotTraceability does not mutate its registry input', () => {
  const [working, secondary, primary] = threeTierChain();
  const registry = registryOf(working, secondary, primary);
  const before = JSON.stringify(registry);
  evaluateCalibratorLotTraceability(registry, working.lotId, '2026-01-10T00:00:00.000Z');
  assert.equal(JSON.stringify(registry), before);
});

// ---------------------------------------------------------------------------
// Explanations
// ---------------------------------------------------------------------------

test('every reason code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainTraceabilityReason(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /calibrator-synthetic/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(explainTraceabilityReason('certificate-expired'), explainTraceabilityReason('certificate-expired'));
});

test('the reason field on a result matches explainTraceabilityReason for its reasonCode', () => {
  const working = lot({ parentReferenceId: undefined, isDeclaredReference: true });
  const result = evaluateCalibratorLotTraceability(registryOf(working), working.lotId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.reason, explainTraceabilityReason(result.reasonCode));
});
