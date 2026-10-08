import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateReagentLot,
  ReagentLotError,
  type ReagentLotErrorCode,
  type ReagentLotProfile,
} from '../../lib/ohworks-reagent-lot';

// Entirely synthetic lot and timestamps; no manufacturer or patient data.
const registry = { knownLotIds: ['SYNTHETIC-CALENDAR-LOT'] };
const lot: ReagentLotProfile = {
  lotId: registry.knownLotIds[0],
  manufacturerExpiresAt: '2028-06-01T08:00:00.000Z',
};

const fields = [
  ['manufacturerExpiresAt', 'manufacturer-expiry-invalid'],
  ['useAt', 'use-at-invalid'],
  ['firstOpenedAt', 'first-opened-at-invalid'],
] as const satisfies readonly (readonly [string, ReagentLotErrorCode])[];

for (const invalid of [
  '2026-02-30T08:00:00.000Z',
  '2026-02-29T08:00:00Z',
  '2100-02-29T08:00:00.123456Z',
  '2028-02-30T08:00:00.1Z',
  '2026-04-31T08:00:00.000Z',
]) {
  for (const [field, code] of fields) {
    test(`rejects ${invalid} independently in ${field}`, () => {
      const input = field === 'useAt' ? lot : { ...lot, [field]: invalid };
      // Keep other fields valid and chronological, so only calendar validation fails.
      const useAt = field === 'useAt' ? invalid : '2101-01-01T08:00:00.000Z';
      assert.throws(
        () => evaluateReagentLot(input, useAt, registry),
        (error: unknown) => error instanceof ReagentLotError && error.code === code,
      );
    });
  }
}

test('rejects the favorable invalid manufacturer-expiry reproduction', () => {
  assert.throws(
    () => evaluateReagentLot(
      { ...lot, manufacturerExpiresAt: '2026-02-30T08:00:00.000Z' },
      '2026-02-20T08:00:00.000Z',
      registry,
    ),
    (error: unknown) => error instanceof ReagentLotError && error.code === 'manufacturer-expiry-invalid',
  );
});

for (const year of ['2000', '2028']) {
  for (const fraction of ['', '.1', '.123', '.123456']) {
    test(`accepts leap day in all fields with ${year} and fraction '${fraction}'`, () => {
      const timestamp = `${year}-02-29T08:00:00${fraction}Z`;
      const input = { ...lot, manufacturerExpiresAt: timestamp, firstOpenedAt: timestamp };
      assert.deepEqual(evaluateReagentLot(input, timestamp, registry), {
        status: 'expired',
        ruleCode: 'manufacturer-expiry-exceeded',
        governingLimitAt: new Date(timestamp).toISOString(),
        overdueMs: 0,
      });
      assert.equal(evaluateReagentLot(input, timestamp, {
        ...registry, recalledLotIds: [lot.lotId],
      }).ruleCode, 'lot-recalled');
    });
  }
}

test('preserves usable leap-day inputs and exact open-vial expiry', () => {
  const input = {
    ...lot,
    firstOpenedAt: '2028-02-29T08:00:00.123456Z',
    openVialStabilityMs: 60 * 60 * 1000,
    nearExpiryWindowMs: 1000,
  };
  assert.equal(evaluateReagentLot(input, '2028-02-29T08:00:00.123456Z', registry).status, 'usable');
  assert.deepEqual(evaluateReagentLot(input, '2028-02-29T09:00:00.123Z', registry), {
    status: 'expired',
    ruleCode: 'open-vial-window-exceeded',
    governingLimitAt: '2028-02-29T09:00:00.123Z',
    overdueMs: 0,
  });
});

for (const missing of [undefined, null, '']) {
  test(`preserves missing-field behavior for ${String(missing)}`, () => {
    const useAt = '2028-02-29T08:00:00Z';
    assert.equal(evaluateReagentLot({ ...lot, firstOpenedAt: missing }, useAt, registry).status, 'usable');
    assert.throws(
      () => evaluateReagentLot({ ...lot, manufacturerExpiresAt: missing as unknown as string }, useAt, registry),
      (error: unknown) => error instanceof ReagentLotError && error.code === 'manufacturer-expiry-missing',
    );
    assert.throws(
      () => evaluateReagentLot(lot, missing as unknown as string, registry),
      (error: unknown) => error instanceof ReagentLotError && error.code === 'use-at-missing',
    );
  });
}
