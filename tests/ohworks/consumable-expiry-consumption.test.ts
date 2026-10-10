import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateConsumableInventory,
  type ConsumableLot,
} from '../../lib/ohworks-consumable-inventory';

// All identifiers, quantities, and expiry dates are synthetic.
const consumableId = 'synthetic-expiry-consumable';

function lot(lotId: string, quantityOnHand: number, daysUntilExpiry: number | null): ConsumableLot {
  return { consumableId, lotId, quantityOnHand, daysUntilExpiry };
}

function evaluate(lots: ConsumableLot[], averageDailyUsage = 10) {
  const before = structuredClone(lots);
  const [result] = evaluateConsumableInventory(
    [{ consumableId, averageDailyUsage, leadTimeDays: 5, safetyStock: 20, targetCoverDays: 30 }],
    lots,
  );
  assert.deepEqual(lots, before);
  assert.deepEqual(result.lotFlags.map((flag) => flag.lotId), lots.map((item) => item.lotId));
  return result;
}

function assertWaste(result: ReturnType<typeof evaluate>, perLot: number[], total: number) {
  assert.deepEqual(result.lotFlags.map((flag) => flag.expiredQuantity), perLot);
  assert.deepEqual(result.lotFlags.map((flag) => flag.willExpireUnused), perLot.map((waste) => waste > 0));
  assert.equal(result.expiredQuantityTotal, total);
}

test('later lots satisfy demand after earlier stock expires unused', () => {
  const result = evaluate([lot('synthetic-A', 100, 1), lot('synthetic-B', 20, 3)]);

  assertWaste(result, [90, 0], 90);
  assert.equal(result.stockOnHand, 120);
  assert.equal(result.daysOfCover, 12);
  assert.equal(result.reorderPoint, 70);
  assert.equal(result.reorderQuantity, 200);
  assert.equal(result.status, 'ok');
});

test('three successive expiries exclude each discarded remainder and preserve declaration order', () => {
  const result = evaluate([
    lot('synthetic-C', 25, 5),
    lot('synthetic-A', 100, 1),
    lot('synthetic-B', 30, 3),
  ]);

  assertWaste(result, [5, 90, 10], 105);
});

test('tied expiries share the same demand in declaration order', () => {
  const result = evaluate([
    lot('synthetic-tied-z', 15, 2),
    lot('synthetic-later', 10, 3),
    lot('synthetic-tied-a', 20, 2),
  ]);

  assertWaste(result, [0, 0, 15], 15);
});

test('zero daily usage wastes all expiring stock and no non-expiring stock', () => {
  const result = evaluate([
    lot('synthetic-A', 100, 1),
    lot('synthetic-B', 20, 3),
    lot('synthetic-permanent', 50, null),
  ], 0);

  assertWaste(result, [100, 20, 0], 120);
  assert.equal(result.daysOfCover, null);
});

test('a non-expiring lot sorts last for consumption even when declared first', () => {
  const result = evaluate([
    lot('synthetic-permanent', 50, null),
    lot('synthetic-B', 20, 3),
    lot('synthetic-A', 100, 1),
  ]);

  assertWaste(result, [0, 0, 90], 90);
  assert.equal(result.lotFlags[0].daysUntilExpiry, null);
});
