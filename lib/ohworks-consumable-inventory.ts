/**
 * Fail-closed, deterministic OHWorks consumable reorder inventory logic.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated set
 * of consumables (each with a caller-declared average daily usage, lead
 * time, safety stock, and target days of cover) plus a fabricated set of
 * lots on hand (each with a quantity and a caller-declared number of days
 * until it expires), it computes, per consumable, the current days of
 * cover, the reorder point, the reorder quantity needed to reach the
 * declared target cover, and which lots -- consumed soonest-expiring
 * first -- will expire before they are used.
 *
 * It performs no I/O, reads no system clock, mutates no SENAITE or
 * database state, and touches no real specimen, instrument, or customer
 * data. Every "days until expiry" and "days of cover" value is relative to
 * a caller-declared reference point, never a wall-clock read.
 *
 * Fail-closed: a negative or non-finite stock quantity, a lead time that is
 * zero, missing, or otherwise not a positive whole number of days, a lot
 * referencing an undeclared consumable, a duplicate consumable or lot
 * identifier, or any other structurally invalid declaration all throw
 * ConsumableInventoryError rather than guessing at a reorder decision.
 */

export type ConsumableDeclaration = {
  /** Identifier for a fabricated consumable; must be unique within a single evaluation. */
  consumableId: string;
  /** Non-negative average units consumed per day, as declared by the caller. */
  averageDailyUsage: number;
  /** Whole days of supplier lead time. Zero is treated the same as missing: it fails closed. */
  leadTimeDays: number;
  /** Non-negative buffer quantity to hold beyond expected lead-time usage. */
  safetyStock: number;
  /** Positive number of days of cover the caller wants a reorder to reach. */
  targetCoverDays: number;
};

/** A fabricated lot of physical stock on hand for one consumable. Never real specimen or customer data. */
export type ConsumableLot = {
  consumableId: string;
  /** Identifier for this lot; must be unique within a single evaluation. */
  lotId: string;
  /** Non-negative quantity of this lot currently on hand. */
  quantityOnHand: number;
  /** Whole days from the caller's reference point until this lot expires, or null if it never expires. */
  daysUntilExpiry: number | null;
};

export type ConsumableInventoryStatus = 'ok' | 'reorder-needed';

const STATUS_MESSAGES: Record<ConsumableInventoryStatus, string> = {
  ok: 'Stock on hand is above the reorder point; no reorder is needed yet.',
  'reorder-needed': 'Stock on hand has fallen to or below the reorder point.',
};

/** Deterministic, privacy-safe human-readable text for a reorder status. */
export function explainConsumableInventoryStatus(status: ConsumableInventoryStatus): string {
  return STATUS_MESSAGES[status];
}

export type ConsumableLotExpiryFlag = {
  lotId: string;
  daysUntilExpiry: number | null;
  quantityOnHand: number;
  /** Quantity from this lot, consumed in soonest-expiring-first order, that will still be unused at expiry. */
  expiredQuantity: number;
  /** Whether any quantity from this lot will expire before it is used. */
  willExpireUnused: boolean;
};

export type ConsumableInventoryResult = {
  consumableId: string;
  /** Sum of quantityOnHand across every declared lot for this consumable. */
  stockOnHand: number;
  /** stockOnHand / averageDailyUsage, or null when averageDailyUsage is 0 (unlimited cover). */
  daysOfCover: number | null;
  /** averageDailyUsage * leadTimeDays + safetyStock. */
  reorderPoint: number;
  /** Quantity needed to reach averageDailyUsage * targetCoverDays + safetyStock, floored at 0. */
  reorderQuantity: number;
  status: ConsumableInventoryStatus;
  /** Per-lot expiry-risk flags, in the same order the lots were declared for this consumable. */
  lotFlags: readonly ConsumableLotExpiryFlag[];
  /** Sum of expiredQuantity across every lot for this consumable. */
  expiredQuantityTotal: number;
};

export type ConsumableInventoryErrorCode =
  | 'consumables-not-array'
  | 'consumable-malformed'
  | 'duplicate-consumable-id'
  | 'average-daily-usage-invalid'
  | 'lead-time-missing'
  | 'safety-stock-invalid'
  | 'target-cover-invalid'
  | 'lots-not-array'
  | 'lot-malformed'
  | 'unknown-consumable'
  | 'duplicate-lot-id'
  | 'stock-invalid'
  | 'negative-stock'
  | 'expiry-invalid';

const ERROR_MESSAGES: Record<ConsumableInventoryErrorCode, string> = {
  'consumables-not-array': 'The declared consumables are not a list.',
  'consumable-malformed': 'A declared consumable is missing a required identity field.',
  'duplicate-consumable-id': 'More than one declared consumable shares the same identifier.',
  'average-daily-usage-invalid': 'A declared average daily usage is not a non-negative finite number.',
  'lead-time-missing': 'A declared lead time is zero, missing, or otherwise not a positive whole number of days.',
  'safety-stock-invalid': 'A declared safety stock is not a non-negative finite number.',
  'target-cover-invalid': 'A declared target cover is not a positive finite number of days.',
  'lots-not-array': 'The declared lots are not a list.',
  'lot-malformed': 'A declared lot is missing a required identity field.',
  'unknown-consumable': 'A declared lot references a consumable that was not declared.',
  'duplicate-lot-id': 'More than one declared lot shares the same identifier.',
  'stock-invalid': 'A declared lot quantity on hand is not a finite number.',
  'negative-stock': 'A declared lot quantity on hand is negative.',
  'expiry-invalid': 'A declared lot expiry is not null or a non-negative whole number of days.',
};

/** Deterministic, human-readable text for a fail-closed error code. */
export function explainConsumableInventoryError(code: ConsumableInventoryErrorCode): string {
  return ERROR_MESSAGES[code];
}

/** Thrown for any input this evaluator cannot safely resolve to a reorder decision. */
export class ConsumableInventoryError extends Error {
  readonly code: ConsumableInventoryErrorCode;

  constructor(code: ConsumableInventoryErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'ConsumableInventoryError';
    this.code = code;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isPositiveIntegerLeadTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function hasRequiredDeclarationShape(
  value: unknown,
): value is Record<string, unknown> & { consumableId: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return isNonEmptyString(candidate.consumableId);
}

function hasRequiredLotShape(
  value: unknown,
): value is Record<string, unknown> & { consumableId: string; lotId: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return isNonEmptyString(candidate.consumableId) && isNonEmptyString(candidate.lotId);
}

function isValidExpiry(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0);
}

type ValidatedDeclaration = {
  consumableId: string;
  averageDailyUsage: number;
  leadTimeDays: number;
  safetyStock: number;
  targetCoverDays: number;
};

type ValidatedLot = {
  consumableId: string;
  lotId: string;
  quantityOnHand: number;
  daysUntilExpiry: number | null;
};

function validateDeclarations(consumables: unknown): ValidatedDeclaration[] {
  if (!Array.isArray(consumables)) {
    throw new ConsumableInventoryError('consumables-not-array');
  }

  const seenConsumableIds = new Set<string>();
  const validated: ValidatedDeclaration[] = [];

  for (const declaration of consumables) {
    if (!hasRequiredDeclarationShape(declaration)) {
      throw new ConsumableInventoryError('consumable-malformed');
    }
    if (seenConsumableIds.has(declaration.consumableId)) {
      throw new ConsumableInventoryError('duplicate-consumable-id');
    }
    seenConsumableIds.add(declaration.consumableId);

    if (!isNonNegativeFiniteNumber(declaration.averageDailyUsage)) {
      throw new ConsumableInventoryError('average-daily-usage-invalid');
    }
    if (!isPositiveIntegerLeadTime(declaration.leadTimeDays)) {
      throw new ConsumableInventoryError('lead-time-missing');
    }
    if (!isNonNegativeFiniteNumber(declaration.safetyStock)) {
      throw new ConsumableInventoryError('safety-stock-invalid');
    }
    if (!isPositiveFiniteNumber(declaration.targetCoverDays)) {
      throw new ConsumableInventoryError('target-cover-invalid');
    }

    validated.push({
      consumableId: declaration.consumableId,
      averageDailyUsage: declaration.averageDailyUsage as number,
      leadTimeDays: declaration.leadTimeDays as number,
      safetyStock: declaration.safetyStock as number,
      targetCoverDays: declaration.targetCoverDays as number,
    });
  }

  return validated;
}

function validateLots(lots: unknown, declaredConsumableIds: ReadonlySet<string>): ValidatedLot[] {
  if (!Array.isArray(lots)) {
    throw new ConsumableInventoryError('lots-not-array');
  }

  const seenLotIds = new Set<string>();
  const validated: ValidatedLot[] = [];

  for (const lot of lots) {
    if (!hasRequiredLotShape(lot)) {
      throw new ConsumableInventoryError('lot-malformed');
    }
    if (!declaredConsumableIds.has(lot.consumableId)) {
      throw new ConsumableInventoryError('unknown-consumable');
    }
    if (seenLotIds.has(lot.lotId)) {
      throw new ConsumableInventoryError('duplicate-lot-id');
    }
    seenLotIds.add(lot.lotId);

    const quantityOnHand = lot.quantityOnHand;
    if (typeof quantityOnHand !== 'number' || !Number.isFinite(quantityOnHand)) {
      throw new ConsumableInventoryError('stock-invalid');
    }
    if (quantityOnHand < 0) {
      throw new ConsumableInventoryError('negative-stock');
    }

    const daysUntilExpiry = lot.daysUntilExpiry;
    if (!isValidExpiry(daysUntilExpiry)) {
      throw new ConsumableInventoryError('expiry-invalid');
    }

    validated.push({
      consumableId: lot.consumableId,
      lotId: lot.lotId,
      quantityOnHand,
      daysUntilExpiry,
    });
  }

  return validated;
}

/**
 * Simulate soonest-expiring-first consumption of a consumable's lots against
 * its declared average daily usage, and return the quantity of each lot
 * that will remain unused at that lot's expiry.
 *
 * Lots with no declared expiry (null) are never flagged, and are consumed
 * last in the simulation.
 */
function computeExpiryFlags(
  lots: readonly ValidatedLot[],
  averageDailyUsage: number,
): Map<string, ConsumableLotExpiryFlag> {
  const fefoOrder = [...lots].sort((a, b) => {
    const left = a.daysUntilExpiry === null ? Number.POSITIVE_INFINITY : a.daysUntilExpiry;
    const right = b.daysUntilExpiry === null ? Number.POSITIVE_INFINITY : b.daysUntilExpiry;
    return left - right;
  });

  const flagsByLotId = new Map<string, ConsumableLotExpiryFlag>();
  let cumulativeBeforeLot = 0;

  for (const lot of fefoOrder) {
    if (lot.daysUntilExpiry === null) {
      flagsByLotId.set(lot.lotId, {
        lotId: lot.lotId,
        daysUntilExpiry: null,
        quantityOnHand: lot.quantityOnHand,
        expiredQuantity: 0,
        willExpireUnused: false,
      });
      cumulativeBeforeLot += lot.quantityOnHand;
      continue;
    }

    const quantityConsumableByExpiry = averageDailyUsage * lot.daysUntilExpiry;
    const consumedFromThisLot = Math.min(
      lot.quantityOnHand,
      Math.max(0, quantityConsumableByExpiry - cumulativeBeforeLot),
    );
    const expiredQuantity = lot.quantityOnHand - consumedFromThisLot;

    flagsByLotId.set(lot.lotId, {
      lotId: lot.lotId,
      daysUntilExpiry: lot.daysUntilExpiry,
      quantityOnHand: lot.quantityOnHand,
      expiredQuantity,
      willExpireUnused: expiredQuantity > 0,
    });

    cumulativeBeforeLot += lot.quantityOnHand;
  }

  return flagsByLotId;
}

/**
 * Evaluate a fabricated set of consumables and their fabricated lots on
 * hand, and return, for each declared consumable, its current days of
 * cover, reorder point, reorder quantity, and per-lot expiry risk.
 *
 * Fail-closed: a negative or non-finite stock quantity, a lead time that is
 * zero, missing, or otherwise not a positive whole number of days, a lot
 * referencing an undeclared consumable, a duplicate consumable or lot
 * identifier, or any other structurally invalid declaration all throw
 * ConsumableInventoryError instead of guessing at a reorder decision.
 *
 * Results are returned in the same order the consumables were declared.
 */
export function evaluateConsumableInventory(
  consumables: ReadonlyArray<ConsumableDeclaration>,
  lots: ReadonlyArray<ConsumableLot>,
): readonly ConsumableInventoryResult[] {
  const validatedDeclarations = validateDeclarations(consumables);
  const declaredConsumableIds = new Set(validatedDeclarations.map((declaration) => declaration.consumableId));
  const validatedLots = validateLots(lots, declaredConsumableIds);

  const lotsByConsumableId = new Map<string, ValidatedLot[]>();
  for (const lot of validatedLots) {
    const existing = lotsByConsumableId.get(lot.consumableId);
    if (existing) {
      existing.push(lot);
    } else {
      lotsByConsumableId.set(lot.consumableId, [lot]);
    }
  }

  const results: ConsumableInventoryResult[] = [];

  for (const declaration of validatedDeclarations) {
    const consumableLots = lotsByConsumableId.get(declaration.consumableId) ?? [];
    const stockOnHand = consumableLots.reduce((sum, lot) => sum + lot.quantityOnHand, 0);

    const daysOfCover = declaration.averageDailyUsage > 0 ? stockOnHand / declaration.averageDailyUsage : null;
    const reorderPoint = declaration.averageDailyUsage * declaration.leadTimeDays + declaration.safetyStock;
    const targetStockLevel = declaration.averageDailyUsage * declaration.targetCoverDays + declaration.safetyStock;
    const reorderQuantity = Math.max(0, targetStockLevel - stockOnHand);
    const status: ConsumableInventoryStatus = stockOnHand <= reorderPoint ? 'reorder-needed' : 'ok';

    const flagsByLotId = computeExpiryFlags(consumableLots, declaration.averageDailyUsage);
    const lotFlags = consumableLots.map((lot) => Object.freeze(flagsByLotId.get(lot.lotId) as ConsumableLotExpiryFlag));
    const expiredQuantityTotal = lotFlags.reduce((sum, flag) => sum + flag.expiredQuantity, 0);

    results.push(
      Object.freeze({
        consumableId: declaration.consumableId,
        stockOnHand,
        daysOfCover,
        reorderPoint,
        reorderQuantity,
        status,
        lotFlags: Object.freeze(lotFlags),
        expiredQuantityTotal,
      }),
    );
  }

  return Object.freeze(results);
}
