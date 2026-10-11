import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CalibratorTraceabilityInputError,
  evaluateCalibratorLotTraceability,
  type CalibratorLotRecordInput,
  type CalibratorLotRegistry,
} from '../../lib/ohworks-calibrator-traceability';

/**
 * All fabricated: synthetic calibrator lot identifiers chosen specifically
 * to collide with Object.prototype member names. None of this represents a
 * real calibrator, instrument, sample, or customer.
 */
function lot(overrides: Partial<CalibratorLotRecordInput> = {}): CalibratorLotRecordInput {
  return {
    lotId: 'LOT-1',
    certificateExpiresAt: '2027-01-01T00:00:00.000Z',
    assignedValue: 1,
    assignedValueUncertainty: 0.1,
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

for (const inheritedLotId of ['constructor', 'toString', '__proto__']) {
  test(`a lot id of '${inheritedLotId}' with no own registry entry is unknown-lot, not a thrown error`, () => {
    const result = evaluateCalibratorLotTraceability({}, inheritedLotId, '2026-01-01T00:00:00.000Z');
    assert.equal(result.decision, 'not_traceable');
    assert.equal(result.reasonCode, 'unknown-lot');
    assert.deepEqual(result.chain, [inheritedLotId]);
  });
}

test('a parent reference id that collides with an inherited prototype member is missing-parent, not a thrown error', () => {
  const working = lot({ lotId: 'LOT-1', parentReferenceId: 'constructor' });
  const result = evaluateCalibratorLotTraceability(registryOf(working), 'LOT-1', '2026-01-01T00:00:00.000Z');
  assert.equal(result.decision, 'not_traceable');
  assert.equal(result.reasonCode, 'missing-parent');
  assert.deepEqual(result.chain, ['LOT-1', 'constructor']);
});

test('a genuinely malformed own registry entry still throws lot-record-malformed', () => {
  const registry = {
    'LOT-1': { lotId: 'LOT-1' } as unknown as CalibratorLotRecordInput,
  } satisfies CalibratorLotRegistry;
  assert.throws(
    () => evaluateCalibratorLotTraceability(registry, 'LOT-1', '2026-01-01T00:00:00.000Z'),
    (error: unknown) =>
      error instanceof CalibratorTraceabilityInputError && error.code === 'lot-record-malformed',
  );
});

test('a normal two-lot chain to a declared reference remains traceable', () => {
  const working = lot({ lotId: 'LOT-1', parentReferenceId: 'LOT-2' });
  const reference = lot({
    lotId: 'LOT-2',
    parentReferenceId: undefined,
    isDeclaredReference: true,
    assignedValue: 1.01,
    assignedValueUncertainty: 0.05,
  });
  const result = evaluateCalibratorLotTraceability(
    registryOf(working, reference),
    'LOT-1',
    '2026-01-01T00:00:00.000Z',
  );
  assert.equal(result.decision, 'traceable');
  assert.equal(result.reasonCode, 'chain-traceable');
  assert.equal(result.referenceLotId, 'LOT-2');
  assert.deepEqual(result.chain, ['LOT-1', 'LOT-2']);
  const expected = Math.sqrt(0.1 * 0.1 + 0.05 * 0.05);
  assert.ok(result.combinedUncertainty !== null);
  assert.ok(Math.abs((result.combinedUncertainty as number) - expected) < 1e-12);
});
