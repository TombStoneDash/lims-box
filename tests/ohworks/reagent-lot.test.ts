import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateReagentLot,
  explainReagentLotError,
  ReagentLotError,
  type ReagentLotErrorCode,
  type ReagentLotProfile,
  type ReagentLotRegistry,
} from '../../lib/ohworks-reagent-lot';

/**
 * All fabricated: synthetic lot identifiers and made-up expiry/open/use
 * timestamps. None of this represents a real manufacturer, reagent, or
 * patient result.
 */
function baselineLot(overrides: Partial<ReagentLotProfile> = {}): ReagentLotProfile {
  return {
    lotId: 'LOT-0001',
    manufacturerExpiresAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function baselineRegistry(overrides: Partial<ReagentLotRegistry> = {}): ReagentLotRegistry {
  return {
    knownLotIds: ['LOT-0001', 'LOT-0002', 'LOT-RECALLED'],
    recalledLotIds: ['LOT-RECALLED'],
    ...overrides,
  };
}

const MANUFACTURER_EXPIRES_AT = '2026-06-01T00:00:00.000Z';
const FIRST_OPENED_AT = '2026-01-01T08:00:00.000Z';

function afterFirstOpened(ms: number): string {
  return new Date(Date.parse(FIRST_OPENED_AT) + ms).toISOString();
}

function beforeManufacturerExpiry(ms: number): string {
  return new Date(Date.parse(MANUFACTURER_EXPIRES_AT) - ms).toISOString();
}

test('reports usable for a never-opened lot well before manufacturer expiry', () => {
  const result = evaluateReagentLot(baselineLot(), beforeManufacturerExpiry(30 * 24 * 60 * 60 * 1000), baselineRegistry());
  assert.equal(result.status, 'usable');
  assert.equal(result.ruleCode, 'within-manufacturer-expiry');
  assert.equal(result.governingLimitAt, MANUFACTURER_EXPIRES_AT);
  if (result.status === 'usable') {
    assert.equal(result.remainingMs, 30 * 24 * 60 * 60 * 1000);
  }
});

test('reports usable_with_flag for a never-opened lot inside the default near-expiry window', () => {
  const result = evaluateReagentLot(baselineLot(), beforeManufacturerExpiry(60 * 60 * 1000), baselineRegistry());
  assert.equal(result.status, 'usable_with_flag');
  assert.equal(result.ruleCode, 'near-manufacturer-expiry');
  if (result.status === 'usable_with_flag') {
    assert.equal(result.remainingMs, 60 * 60 * 1000);
  }
});

test('reports usable_with_flag exactly at the default 48h near-expiry boundary', () => {
  const result = evaluateReagentLot(baselineLot(), beforeManufacturerExpiry(48 * 60 * 60 * 1000), baselineRegistry());
  assert.equal(result.status, 'usable_with_flag');
});

test('reports usable just outside the default 48h near-expiry boundary', () => {
  const result = evaluateReagentLot(baselineLot(), beforeManufacturerExpiry(48 * 60 * 60 * 1000 + 1), baselineRegistry());
  assert.equal(result.status, 'usable');
});

test('reports expired for a never-opened lot exactly at manufacturer expiry', () => {
  const result = evaluateReagentLot(baselineLot(), MANUFACTURER_EXPIRES_AT, baselineRegistry());
  assert.equal(result.status, 'expired');
  assert.equal(result.ruleCode, 'manufacturer-expiry-exceeded');
  if (result.status === 'expired') {
    assert.equal(result.overdueMs, 0);
  }
});

test('reports expired well past manufacturer expiry with the exact overdue duration', () => {
  const overdueBy = 5 * 24 * 60 * 60 * 1000;
  const useAt = new Date(Date.parse(MANUFACTURER_EXPIRES_AT) + overdueBy).toISOString();
  const result = evaluateReagentLot(baselineLot(), useAt, baselineRegistry());
  assert.equal(result.status, 'expired');
  if (result.status === 'expired') {
    assert.equal(result.overdueMs, overdueBy);
  }
});

test('an opened lot with no declared open-vial window is governed by manufacturer expiry alone', () => {
  const lot = baselineLot({ firstOpenedAt: FIRST_OPENED_AT });
  const result = evaluateReagentLot(lot, beforeManufacturerExpiry(30 * 24 * 60 * 60 * 1000), baselineRegistry());
  assert.equal(result.status, 'usable');
  assert.equal(result.ruleCode, 'within-manufacturer-expiry');
  assert.equal(result.governingLimitAt, MANUFACTURER_EXPIRES_AT);
});

test('an opened lot within its open-vial window well before it expires is usable', () => {
  const lot = baselineLot({
    firstOpenedAt: FIRST_OPENED_AT,
    openVialStabilityMs: 8 * 60 * 60 * 1000,
    nearExpiryWindowMs: 30 * 60 * 1000,
  });
  const result = evaluateReagentLot(lot, afterFirstOpened(60 * 60 * 1000), baselineRegistry());
  assert.equal(result.status, 'usable');
  assert.equal(result.ruleCode, 'within-open-vial-window');
  assert.equal(result.governingLimitAt, afterFirstOpened(8 * 60 * 60 * 1000));
  if (result.status === 'usable') {
    assert.equal(result.remainingMs, 7 * 60 * 60 * 1000);
  }
});

test('an opened lot is flagged when inside the near-expiry window of its open-vial limit', () => {
  const lot = baselineLot({
    firstOpenedAt: FIRST_OPENED_AT,
    openVialStabilityMs: 8 * 60 * 60 * 1000,
    nearExpiryWindowMs: 30 * 60 * 1000,
  });
  const result = evaluateReagentLot(lot, afterFirstOpened(8 * 60 * 60 * 1000 - 10 * 60 * 1000), baselineRegistry());
  assert.equal(result.status, 'usable_with_flag');
  assert.equal(result.ruleCode, 'near-open-vial-expiry');
  if (result.status === 'usable_with_flag') {
    assert.equal(result.remainingMs, 10 * 60 * 1000);
  }
});

test('an opened lot expires at its open-vial window even though manufacturer expiry is far off', () => {
  const lot = baselineLot({ firstOpenedAt: FIRST_OPENED_AT, openVialStabilityMs: 8 * 60 * 60 * 1000 });
  const result = evaluateReagentLot(lot, afterFirstOpened(8 * 60 * 60 * 1000), baselineRegistry());
  assert.equal(result.status, 'expired');
  assert.equal(result.ruleCode, 'open-vial-window-exceeded');
  assert.equal(result.governingLimitAt, afterFirstOpened(8 * 60 * 60 * 1000));
  if (result.status === 'expired') {
    assert.equal(result.overdueMs, 0);
  }
});

test('the open-vial window only governs when it is earlier than manufacturer expiry', () => {
  const lot = baselineLot({
    firstOpenedAt: FIRST_OPENED_AT,
    openVialStabilityMs: 365 * 24 * 60 * 60 * 1000,
  });
  const result = evaluateReagentLot(lot, beforeManufacturerExpiry(60 * 60 * 1000), baselineRegistry());
  assert.equal(result.status, 'usable_with_flag');
  assert.equal(result.ruleCode, 'near-manufacturer-expiry');
  assert.equal(result.governingLimitAt, MANUFACTURER_EXPIRES_AT);
});

test('a recalled lot is always reported expired regardless of remaining shelf life', () => {
  const lot: ReagentLotProfile = {
    lotId: 'LOT-RECALLED',
    manufacturerExpiresAt: '2027-01-01T00:00:00.000Z',
  };
  const useAt = '2026-01-01T00:00:00.000Z';
  const result = evaluateReagentLot(lot, useAt, baselineRegistry());
  assert.equal(result.status, 'expired');
  assert.equal(result.ruleCode, 'lot-recalled');
  assert.equal(result.governingLimitAt, useAt);
  if (result.status === 'expired') {
    assert.equal(result.overdueMs, 0);
  }
});

test('a recalled but never-opened lot with an unopened stability window is still expired', () => {
  const lot: ReagentLotProfile = {
    lotId: 'LOT-RECALLED',
    manufacturerExpiresAt: '2027-01-01T00:00:00.000Z',
    firstOpenedAt: FIRST_OPENED_AT,
    openVialStabilityMs: 8 * 60 * 60 * 1000,
  };
  const result = evaluateReagentLot(lot, afterFirstOpened(60 * 60 * 1000), baselineRegistry());
  assert.equal(result.status, 'expired');
  assert.equal(result.ruleCode, 'lot-recalled');
});

test('fails closed on an unknown lot identifier', () => {
  assert.throws(
    () => evaluateReagentLot(baselineLot({ lotId: 'LOT-UNKNOWN' }), beforeManufacturerExpiry(0), baselineRegistry()),
    (error: unknown) => error instanceof ReagentLotError && error.code === 'lot-unknown',
  );
});

test('fails closed on a missing manufacturer expiry', () => {
  assert.throws(
    () =>
      evaluateReagentLot(
        baselineLot({ manufacturerExpiresAt: '' as string }),
        MANUFACTURER_EXPIRES_AT,
        baselineRegistry(),
      ),
    (error: unknown) => error instanceof ReagentLotError && error.code === 'manufacturer-expiry-missing',
  );
});

test('fails closed on an unparsable manufacturer expiry', () => {
  assert.throws(
    () =>
      evaluateReagentLot(
        baselineLot({ manufacturerExpiresAt: 'not-a-timestamp' }),
        MANUFACTURER_EXPIRES_AT,
        baselineRegistry(),
      ),
    (error: unknown) => error instanceof ReagentLotError && error.code === 'manufacturer-expiry-invalid',
  );
});

test('fails closed on a non-UTC (no trailing Z) manufacturer expiry', () => {
  assert.throws(
    () =>
      evaluateReagentLot(
        baselineLot({ manufacturerExpiresAt: '2026-06-01T00:00:00.000' }),
        MANUFACTURER_EXPIRES_AT,
        baselineRegistry(),
      ),
    (error: unknown) => error instanceof ReagentLotError && error.code === 'manufacturer-expiry-invalid',
  );
});

test('fails closed on a missing use timestamp', () => {
  assert.throws(
    () => evaluateReagentLot(baselineLot(), '' as string, baselineRegistry()),
    (error: unknown) => error instanceof ReagentLotError && error.code === 'use-at-missing',
  );
});

test('fails closed on an unparsable use timestamp', () => {
  assert.throws(
    () => evaluateReagentLot(baselineLot(), 'not-a-timestamp', baselineRegistry()),
    (error: unknown) => error instanceof ReagentLotError && error.code === 'use-at-invalid',
  );
});

test('fails closed on an unparsable first-opened timestamp', () => {
  assert.throws(
    () =>
      evaluateReagentLot(
        baselineLot({ firstOpenedAt: 'not-a-timestamp' }),
        MANUFACTURER_EXPIRES_AT,
        baselineRegistry(),
      ),
    (error: unknown) => error instanceof ReagentLotError && error.code === 'first-opened-at-invalid',
  );
});

test('fails closed on a non-positive open-vial stability window', () => {
  assert.throws(
    () =>
      evaluateReagentLot(
        baselineLot({ firstOpenedAt: FIRST_OPENED_AT, openVialStabilityMs: 0 }),
        FIRST_OPENED_AT,
        baselineRegistry(),
      ),
    (error: unknown) => error instanceof ReagentLotError && error.code === 'open-vial-stability-invalid',
  );
});

test('fails closed on a non-finite open-vial stability window', () => {
  assert.throws(
    () =>
      evaluateReagentLot(
        baselineLot({ firstOpenedAt: FIRST_OPENED_AT, openVialStabilityMs: Number.POSITIVE_INFINITY }),
        FIRST_OPENED_AT,
        baselineRegistry(),
      ),
    (error: unknown) => error instanceof ReagentLotError && error.code === 'open-vial-stability-invalid',
  );
});

test('fails closed on a non-positive near-expiry window', () => {
  assert.throws(
    () => evaluateReagentLot(baselineLot({ nearExpiryWindowMs: 0 }), MANUFACTURER_EXPIRES_AT, baselineRegistry()),
    (error: unknown) => error instanceof ReagentLotError && error.code === 'near-expiry-window-invalid',
  );
});

test('fails closed on a use timestamp preceding the first-opened timestamp', () => {
  assert.throws(
    () =>
      evaluateReagentLot(
        baselineLot({ firstOpenedAt: FIRST_OPENED_AT, openVialStabilityMs: 8 * 60 * 60 * 1000 }),
        afterFirstOpened(-1),
        baselineRegistry(),
      ),
    (error: unknown) => error instanceof ReagentLotError && error.code === 'timestamps-non-monotonic',
  );
});

test('allows a use timestamp exactly equal to the first-opened timestamp', () => {
  const lot = baselineLot({
    firstOpenedAt: FIRST_OPENED_AT,
    openVialStabilityMs: 8 * 60 * 60 * 1000,
    nearExpiryWindowMs: 30 * 60 * 1000,
  });
  const result = evaluateReagentLot(lot, FIRST_OPENED_AT, baselineRegistry());
  assert.equal(result.status, 'usable');
  if (result.status === 'usable') {
    assert.equal(result.remainingMs, 8 * 60 * 60 * 1000);
  }
});

test('checks lot identity before manufacturer expiry validity', () => {
  assert.throws(
    () =>
      evaluateReagentLot(
        baselineLot({ lotId: 'LOT-UNKNOWN', manufacturerExpiresAt: 'garbage' }),
        MANUFACTURER_EXPIRES_AT,
        baselineRegistry(),
      ),
    (error: unknown) => error instanceof ReagentLotError && error.code === 'lot-unknown',
  );
});

test('checks manufacturer expiry before use timestamp validity', () => {
  assert.throws(
    () => evaluateReagentLot(baselineLot({ manufacturerExpiresAt: 'garbage' }), 'also-garbage', baselineRegistry()),
    (error: unknown) => error instanceof ReagentLotError && error.code === 'manufacturer-expiry-invalid',
  );
});

test('explainReagentLotError returns deterministic, non-empty text for every error code', () => {
  const codes: ReagentLotErrorCode[] = [
    'lot-unknown',
    'manufacturer-expiry-missing',
    'manufacturer-expiry-invalid',
    'use-at-missing',
    'use-at-invalid',
    'first-opened-at-invalid',
    'open-vial-stability-invalid',
    'near-expiry-window-invalid',
    'timestamps-non-monotonic',
  ];
  for (const code of codes) {
    const message = explainReagentLotError(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

test('never reads the system clock: identical inputs always produce identical output', () => {
  const lot = baselineLot({ firstOpenedAt: FIRST_OPENED_AT, openVialStabilityMs: 8 * 60 * 60 * 1000 });
  const first = evaluateReagentLot(lot, afterFirstOpened(60 * 60 * 1000), baselineRegistry());
  const second = evaluateReagentLot(lot, afterFirstOpened(60 * 60 * 1000), baselineRegistry());
  assert.deepEqual(first, second);
});
