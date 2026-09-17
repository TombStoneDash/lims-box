import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ConsumableInventoryError,
  evaluateConsumableInventory,
  explainConsumableInventoryError,
  explainConsumableInventoryStatus,
  type ConsumableDeclaration,
  type ConsumableInventoryErrorCode,
  type ConsumableInventoryStatus,
  type ConsumableLot,
} from '../../lib/ohworks-consumable-inventory';

/**
 * All fabricated: synthetic consumable and lot identifiers with made-up
 * quantities. None of this represents a real reagent, supplier, or order.
 */
function baselineConsumables(): ConsumableDeclaration[] {
  return [
    {
      consumableId: 'consumable-synthetic-swabs',
      averageDailyUsage: 10,
      leadTimeDays: 5,
      safetyStock: 20,
      targetCoverDays: 30,
    },
  ];
}

function baselineLots(): ConsumableLot[] {
  return [
    { consumableId: 'consumable-synthetic-swabs', lotId: 'lot-1', quantityOnHand: 100, daysUntilExpiry: null },
  ];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const ALL_ERROR_CODES: ConsumableInventoryErrorCode[] = [
  'consumables-not-array',
  'consumable-malformed',
  'duplicate-consumable-id',
  'average-daily-usage-invalid',
  'lead-time-missing',
  'safety-stock-invalid',
  'target-cover-invalid',
  'lots-not-array',
  'lot-malformed',
  'unknown-consumable',
  'duplicate-lot-id',
  'stock-invalid',
  'negative-stock',
  'expiry-invalid',
];

const ALL_STATUSES: ConsumableInventoryStatus[] = ['ok', 'reorder-needed'];

function assertThrowsCode(fn: () => unknown, code: ConsumableInventoryErrorCode): void {
  assert.throws(
    fn,
    (error: unknown) => {
      assert.ok(error instanceof ConsumableInventoryError);
      assert.equal((error as ConsumableInventoryError).code, code);
      return true;
    },
  );
}

test('a well-supplied consumable is ok with the expected days of cover', () => {
  const [result] = evaluateConsumableInventory(baselineConsumables(), baselineLots());
  assert.equal(result.consumableId, 'consumable-synthetic-swabs');
  assert.equal(result.stockOnHand, 100);
  assert.equal(result.daysOfCover, 10);
  assert.equal(result.status, 'ok');
});

test('reorder point is averageDailyUsage * leadTimeDays + safetyStock', () => {
  const [result] = evaluateConsumableInventory(baselineConsumables(), baselineLots());
  assert.equal(result.reorderPoint, 10 * 5 + 20);
});

test('reorder quantity reaches averageDailyUsage * targetCoverDays + safetyStock', () => {
  const consumables = baselineConsumables();
  const lots = baselineLots();
  const [result] = evaluateConsumableInventory(consumables, lots);
  const targetStockLevel = 10 * 30 + 20;
  assert.equal(result.reorderQuantity, targetStockLevel - 100);
});

test('reorder quantity is floored at zero when stock already exceeds the target level', () => {
  const consumables = baselineConsumables();
  const lots = [
    { consumableId: 'consumable-synthetic-swabs', lotId: 'lot-1', quantityOnHand: 10000, daysUntilExpiry: null },
  ];
  const [result] = evaluateConsumableInventory(consumables, lots);
  assert.equal(result.reorderQuantity, 0);
});

test('status is reorder-needed when stock on hand falls to or below the reorder point', () => {
  const consumables = baselineConsumables();
  const reorderPoint = 10 * 5 + 20; // 70
  const lots = [
    { consumableId: 'consumable-synthetic-swabs', lotId: 'lot-1', quantityOnHand: reorderPoint, daysUntilExpiry: null },
  ];
  const [result] = evaluateConsumableInventory(consumables, lots);
  assert.equal(result.status, 'reorder-needed');
});

test('status is ok when stock on hand is strictly above the reorder point', () => {
  const consumables = baselineConsumables();
  const reorderPoint = 10 * 5 + 20; // 70
  const lots = [
    {
      consumableId: 'consumable-synthetic-swabs',
      lotId: 'lot-1',
      quantityOnHand: reorderPoint + 1,
      daysUntilExpiry: null,
    },
  ];
  const [result] = evaluateConsumableInventory(consumables, lots);
  assert.equal(result.status, 'ok');
});

test('days of cover is null when average daily usage is zero', () => {
  const consumables: ConsumableDeclaration[] = [
    { consumableId: 'c1', averageDailyUsage: 0, leadTimeDays: 5, safetyStock: 10, targetCoverDays: 30 },
  ];
  const lots: ConsumableLot[] = [{ consumableId: 'c1', lotId: 'lot-1', quantityOnHand: 50, daysUntilExpiry: null }];
  const [result] = evaluateConsumableInventory(consumables, lots);
  assert.equal(result.daysOfCover, null);
});

test('a consumable with no declared lots has zero stock on hand and an empty lot flag list', () => {
  const [result] = evaluateConsumableInventory(baselineConsumables(), []);
  assert.equal(result.stockOnHand, 0);
  assert.deepEqual(result.lotFlags, []);
  assert.equal(result.status, 'reorder-needed');
});

test('stock on hand sums quantity across every lot for the consumable', () => {
  const consumables = baselineConsumables();
  const lots: ConsumableLot[] = [
    { consumableId: 'consumable-synthetic-swabs', lotId: 'lot-1', quantityOnHand: 40, daysUntilExpiry: null },
    { consumableId: 'consumable-synthetic-swabs', lotId: 'lot-2', quantityOnHand: 25, daysUntilExpiry: null },
  ];
  const [result] = evaluateConsumableInventory(consumables, lots);
  assert.equal(result.stockOnHand, 65);
});

test('results are returned in the same order the consumables were declared', () => {
  const consumables: ConsumableDeclaration[] = [
    { consumableId: 'c-b', averageDailyUsage: 1, leadTimeDays: 1, safetyStock: 0, targetCoverDays: 1 },
    { consumableId: 'c-a', averageDailyUsage: 1, leadTimeDays: 1, safetyStock: 0, targetCoverDays: 1 },
  ];
  const results = evaluateConsumableInventory(consumables, []);
  assert.deepEqual(
    results.map((r) => r.consumableId),
    ['c-b', 'c-a'],
  );
});

test('a lot that will be fully consumed before it expires is not flagged', () => {
  const consumables: ConsumableDeclaration[] = [
    { consumableId: 'c1', averageDailyUsage: 10, leadTimeDays: 5, safetyStock: 0, targetCoverDays: 10 },
  ];
  const lots: ConsumableLot[] = [
    { consumableId: 'c1', lotId: 'lot-1', quantityOnHand: 50, daysUntilExpiry: 10 },
  ];
  const [result] = evaluateConsumableInventory(consumables, lots);
  assert.equal(result.lotFlags[0].willExpireUnused, false);
  assert.equal(result.lotFlags[0].expiredQuantity, 0);
});

test('a lot that cannot be fully consumed before it expires is flagged with the leftover quantity', () => {
  const consumables: ConsumableDeclaration[] = [
    { consumableId: 'c1', averageDailyUsage: 5, leadTimeDays: 5, safetyStock: 0, targetCoverDays: 10 },
  ];
  const lots: ConsumableLot[] = [
    { consumableId: 'c1', lotId: 'lot-1', quantityOnHand: 100, daysUntilExpiry: 10 },
  ];
  const [result] = evaluateConsumableInventory(consumables, lots);
  // 5/day * 10 days = 50 consumable before expiry; 100 on hand => 50 left over.
  assert.equal(result.lotFlags[0].willExpireUnused, true);
  assert.equal(result.lotFlags[0].expiredQuantity, 50);
});

test('lots are consumed soonest-expiring first (FEFO) when computing expiry risk', () => {
  const consumables: ConsumableDeclaration[] = [
    { consumableId: 'c1', averageDailyUsage: 10, leadTimeDays: 1, safetyStock: 0, targetCoverDays: 1 },
  ];
  const lots: ConsumableLot[] = [
    { consumableId: 'c1', lotId: 'lot-far', quantityOnHand: 50, daysUntilExpiry: 20 },
    { consumableId: 'c1', lotId: 'lot-near', quantityOnHand: 50, daysUntilExpiry: 5 },
  ];
  const [result] = evaluateConsumableInventory(consumables, lots);
  // FEFO consumes lot-near (expires day 5) first: 10/day * 5 days = 50 consumed from lot-near exactly.
  const near = result.lotFlags.find((flag) => flag.lotId === 'lot-near')!;
  const far = result.lotFlags.find((flag) => flag.lotId === 'lot-far')!;
  assert.equal(near.expiredQuantity, 0);
  // By day 20, 10/day * 20 days = 200 consumable total, minus the 50 already attributed to lot-near = 150
  // available for lot-far's 50 units, so none of lot-far expires either.
  assert.equal(far.expiredQuantity, 0);
});

test('a later-expiring lot absorbs usage only after earlier-expiring lots are accounted for', () => {
  const consumables: ConsumableDeclaration[] = [
    { consumableId: 'c1', averageDailyUsage: 1, leadTimeDays: 1, safetyStock: 0, targetCoverDays: 1 },
  ];
  const lots: ConsumableLot[] = [
    { consumableId: 'c1', lotId: 'lot-near', quantityOnHand: 10, daysUntilExpiry: 5 },
    { consumableId: 'c1', lotId: 'lot-far', quantityOnHand: 10, daysUntilExpiry: 6 },
  ];
  const [result] = evaluateConsumableInventory(consumables, lots);
  // 1/day * 5 days = 5 consumable by lot-near's expiry; 10 on hand => 5 left over.
  const near = result.lotFlags.find((flag) => flag.lotId === 'lot-near')!;
  assert.equal(near.expiredQuantity, 5);
  // By lot-far's expiry (day 6): 1/day * 6 days = 6 consumable total, minus 10 already
  // allocated to lot-near => none left for lot-far, so all 10 of lot-far expire.
  const far = result.lotFlags.find((flag) => flag.lotId === 'lot-far')!;
  assert.equal(far.expiredQuantity, 10);
  assert.equal(far.willExpireUnused, true);
});

test('a lot with no declared expiry is never flagged, even with zero usage', () => {
  const consumables: ConsumableDeclaration[] = [
    { consumableId: 'c1', averageDailyUsage: 0, leadTimeDays: 5, safetyStock: 0, targetCoverDays: 10 },
  ];
  const lots: ConsumableLot[] = [{ consumableId: 'c1', lotId: 'lot-1', quantityOnHand: 100, daysUntilExpiry: null }];
  const [result] = evaluateConsumableInventory(consumables, lots);
  assert.equal(result.lotFlags[0].willExpireUnused, false);
});

test('zero average daily usage flags all quantity in an expiring lot as expired', () => {
  const consumables: ConsumableDeclaration[] = [
    { consumableId: 'c1', averageDailyUsage: 0, leadTimeDays: 5, safetyStock: 0, targetCoverDays: 10 },
  ];
  const lots: ConsumableLot[] = [{ consumableId: 'c1', lotId: 'lot-1', quantityOnHand: 30, daysUntilExpiry: 7 }];
  const [result] = evaluateConsumableInventory(consumables, lots);
  assert.equal(result.lotFlags[0].expiredQuantity, 30);
  assert.equal(result.expiredQuantityTotal, 30);
});

test('expiredQuantityTotal sums expiredQuantity across every lot', () => {
  const consumables: ConsumableDeclaration[] = [
    { consumableId: 'c1', averageDailyUsage: 0, leadTimeDays: 1, safetyStock: 0, targetCoverDays: 1 },
  ];
  const lots: ConsumableLot[] = [
    { consumableId: 'c1', lotId: 'lot-1', quantityOnHand: 10, daysUntilExpiry: 1 },
    { consumableId: 'c1', lotId: 'lot-2', quantityOnHand: 20, daysUntilExpiry: 2 },
  ];
  const [result] = evaluateConsumableInventory(consumables, lots);
  assert.equal(result.expiredQuantityTotal, 30);
});

test('lot flags are returned in the same order the lots were declared', () => {
  const consumables = baselineConsumables();
  const lots: ConsumableLot[] = [
    { consumableId: 'consumable-synthetic-swabs', lotId: 'lot-z', quantityOnHand: 10, daysUntilExpiry: 3 },
    { consumableId: 'consumable-synthetic-swabs', lotId: 'lot-a', quantityOnHand: 10, daysUntilExpiry: 1 },
  ];
  const [result] = evaluateConsumableInventory(consumables, lots);
  assert.deepEqual(
    result.lotFlags.map((flag) => flag.lotId),
    ['lot-z', 'lot-a'],
  );
});

test('evaluation is pure: it does not mutate input consumables or lots', () => {
  const consumables = baselineConsumables();
  const lots = baselineLots();
  const beforeConsumables = JSON.stringify(consumables);
  const beforeLots = JSON.stringify(lots);
  evaluateConsumableInventory(consumables, lots);
  assert.equal(JSON.stringify(consumables), beforeConsumables);
  assert.equal(JSON.stringify(lots), beforeLots);
});

test('evaluation is deterministic across repeated calls', () => {
  const consumables = baselineConsumables();
  const lots = baselineLots();
  const first = evaluateConsumableInventory(consumables, lots);
  const second = evaluateConsumableInventory(clone(consumables), clone(lots));
  assert.deepEqual(first, second);
});

test('the returned results are frozen, including nested lot flags', () => {
  const [result] = evaluateConsumableInventory(baselineConsumables(), baselineLots());
  const results = evaluateConsumableInventory(baselineConsumables(), baselineLots());
  assert.ok(Object.isFrozen(results));
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.lotFlags));
  assert.ok(Object.isFrozen(result.lotFlags[0] ?? {}));
});

test('a status other than ok or reorder-needed is never produced', () => {
  const [result] = evaluateConsumableInventory(baselineConsumables(), baselineLots());
  assert.ok(ALL_STATUSES.includes(result.status));
});

test('a non-array consumables input throws consumables-not-array', () => {
  assertThrowsCode(
    () => evaluateConsumableInventory('not-an-array' as unknown as ConsumableDeclaration[], []),
    'consumables-not-array',
  );
});

test('a consumable missing an identifier throws consumable-malformed', () => {
  const consumables = baselineConsumables();
  delete (consumables[0] as Partial<ConsumableDeclaration>).consumableId;
  assertThrowsCode(() => evaluateConsumableInventory(consumables, []), 'consumable-malformed');
});

test('a duplicate consumable identifier throws duplicate-consumable-id', () => {
  const consumables = [...baselineConsumables(), ...baselineConsumables()];
  assertThrowsCode(() => evaluateConsumableInventory(consumables, []), 'duplicate-consumable-id');
});

test('a negative average daily usage throws average-daily-usage-invalid', () => {
  const consumables = baselineConsumables();
  consumables[0].averageDailyUsage = -1;
  assertThrowsCode(() => evaluateConsumableInventory(consumables, []), 'average-daily-usage-invalid');
});

test('a non-finite average daily usage throws average-daily-usage-invalid', () => {
  const consumables = baselineConsumables();
  (consumables[0] as unknown as { averageDailyUsage: unknown }).averageDailyUsage = Number.NaN;
  assertThrowsCode(() => evaluateConsumableInventory(consumables, []), 'average-daily-usage-invalid');
});

test('a zero lead time throws lead-time-missing, the same as a missing lead time', () => {
  const zeroLeadTime = baselineConsumables();
  zeroLeadTime[0].leadTimeDays = 0;
  assertThrowsCode(() => evaluateConsumableInventory(zeroLeadTime, []), 'lead-time-missing');

  const missingLeadTime = baselineConsumables();
  delete (missingLeadTime[0] as Partial<ConsumableDeclaration>).leadTimeDays;
  assertThrowsCode(() => evaluateConsumableInventory(missingLeadTime, []), 'lead-time-missing');
});

test('a non-integer lead time throws lead-time-missing', () => {
  const consumables = baselineConsumables();
  consumables[0].leadTimeDays = 2.5;
  assertThrowsCode(() => evaluateConsumableInventory(consumables, []), 'lead-time-missing');
});

test('a negative lead time throws lead-time-missing', () => {
  const consumables = baselineConsumables();
  consumables[0].leadTimeDays = -3;
  assertThrowsCode(() => evaluateConsumableInventory(consumables, []), 'lead-time-missing');
});

test('a negative safety stock throws safety-stock-invalid', () => {
  const consumables = baselineConsumables();
  consumables[0].safetyStock = -5;
  assertThrowsCode(() => evaluateConsumableInventory(consumables, []), 'safety-stock-invalid');
});

test('a zero or negative target cover throws target-cover-invalid', () => {
  const zeroTarget = baselineConsumables();
  zeroTarget[0].targetCoverDays = 0;
  assertThrowsCode(() => evaluateConsumableInventory(zeroTarget, []), 'target-cover-invalid');

  const negativeTarget = baselineConsumables();
  negativeTarget[0].targetCoverDays = -10;
  assertThrowsCode(() => evaluateConsumableInventory(negativeTarget, []), 'target-cover-invalid');
});

test('a non-array lots input throws lots-not-array', () => {
  assertThrowsCode(
    () => evaluateConsumableInventory(baselineConsumables(), 'not-an-array' as unknown as ConsumableLot[]),
    'lots-not-array',
  );
});

test('a lot missing a lot identifier throws lot-malformed', () => {
  const lots = baselineLots();
  delete (lots[0] as Partial<ConsumableLot>).lotId;
  assertThrowsCode(() => evaluateConsumableInventory(baselineConsumables(), lots), 'lot-malformed');
});

test('a lot referencing an undeclared consumable throws unknown-consumable', () => {
  const lots = [{ consumableId: 'never-declared', lotId: 'lot-1', quantityOnHand: 10, daysUntilExpiry: null }];
  assertThrowsCode(() => evaluateConsumableInventory(baselineConsumables(), lots), 'unknown-consumable');
});

test('a duplicate lot identifier throws duplicate-lot-id', () => {
  const lots = [...baselineLots(), ...baselineLots()];
  assertThrowsCode(() => evaluateConsumableInventory(baselineConsumables(), lots), 'duplicate-lot-id');
});

test('a non-finite lot quantity throws stock-invalid', () => {
  const lots = baselineLots();
  (lots[0] as unknown as { quantityOnHand: unknown }).quantityOnHand = 'a lot';
  assertThrowsCode(() => evaluateConsumableInventory(baselineConsumables(), lots), 'stock-invalid');
});

test('a negative lot quantity throws negative-stock', () => {
  const lots = baselineLots();
  lots[0].quantityOnHand = -1;
  assertThrowsCode(() => evaluateConsumableInventory(baselineConsumables(), lots), 'negative-stock');
});

test('a non-integer expiry throws expiry-invalid', () => {
  const lots = baselineLots();
  (lots[0] as unknown as { daysUntilExpiry: unknown }).daysUntilExpiry = 3.5;
  assertThrowsCode(() => evaluateConsumableInventory(baselineConsumables(), lots), 'expiry-invalid');
});

test('a negative expiry throws expiry-invalid', () => {
  const lots = baselineLots();
  lots[0].daysUntilExpiry = -1;
  assertThrowsCode(() => evaluateConsumableInventory(baselineConsumables(), lots), 'expiry-invalid');
});

test('an undefined expiry field throws expiry-invalid rather than being treated as null', () => {
  const lots = baselineLots();
  delete (lots[0] as Partial<ConsumableLot>).daysUntilExpiry;
  assertThrowsCode(() => evaluateConsumableInventory(baselineConsumables(), lots), 'expiry-invalid');
});

test('every error code has a non-empty explanation', () => {
  for (const code of ALL_ERROR_CODES) {
    const message = explainConsumableInventoryError(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

test('every status has a non-empty explanation', () => {
  for (const status of ALL_STATUSES) {
    const message = explainConsumableInventoryStatus(status);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(explainConsumableInventoryError('lead-time-missing'), explainConsumableInventoryError('lead-time-missing'));
  assert.equal(explainConsumableInventoryStatus('reorder-needed'), explainConsumableInventoryStatus('reorder-needed'));
});
