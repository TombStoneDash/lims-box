import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildPilotFacilityReadinessView,
  createPilotFacilityReadinessFixtures,
  DEMO_RUN_AT,
} from '../../lib/ohworks-demo-facility-readiness-view';
import { evaluateEnvironmentalMonitoring, explainEnvironmentalMonitoringError, EnvironmentalMonitoringError } from '../../lib/ohworks-environmental-monitoring';
import { evaluateEquipmentQualificationGate } from '../../lib/ohworks-equipment-qualification';
import { evaluateConsumableInventory, explainConsumableInventoryStatus, explainConsumableInventoryError, ConsumableInventoryError } from '../../lib/ohworks-consumable-inventory';

test('room rows match the real environmental evaluator on exported fixtures, including the unresolved room', () => {
  const view = buildPilotFacilityReadinessView();
  const fixtures = createPilotFacilityReadinessFixtures();
  const expected = evaluateEnvironmentalMonitoring(fixtures.environmental.profiles, fixtures.environmental.readings);

  assert.equal(view.rooms.length, fixtures.environmental.profiles.length + 1);
  expected.roomSummaries.forEach((summary, index) => {
    const row = view.rooms[index];
    assert.equal(row.roomId, summary.roomId);
    assert.equal(row.resolved, true);
    assert.equal(row.readingCount, summary.readingCount);
    assert.equal(row.minorExcursionCount, summary.minorExcursionCount);
    assert.equal(row.criticalExcursionCount, summary.criticalExcursionCount);
    assert.equal(row.totalExcursionMinutes, summary.totalExcursionDurationMs / 60_000);
    if (summary.worstExcursion === null) {
      assert.equal(row.worstExcursion, null);
    } else {
      assert.deepEqual(row.worstExcursion, {
        metric: summary.worstExcursion.metric,
        severity: summary.worstExcursion.severity,
        worstValue: summary.worstExcursion.worstValue,
        minutes: summary.worstExcursion.durationMs / 60_000,
      });
    }
  });

  // Room 1: every reading inside the acceptable window — no excursions.
  assert.deepEqual([view.rooms[0].minorExcursionCount, view.rooms[0].criticalExcursionCount], [0, 0]);
  assert.equal(view.rooms[0].worstExcursion, null);

  // Room 2: consecutive out-of-window temperature readings merge into one minor excursion.
  assert.deepEqual([view.rooms[1].minorExcursionCount, view.rooms[1].criticalExcursionCount], [1, 0]);
  assert.equal(view.rooms[1].worstExcursion?.severity, 'minor');
  assert.equal(view.rooms[1].worstExcursion?.metric, 'temperature');
  assert.equal(view.rooms[1].worstExcursion?.worstValue, 24);
  assert.equal(view.rooms[1].totalExcursionMinutes, 30);

  // Room 3: a pressure-differential reading beyond the critical bound.
  assert.deepEqual([view.rooms[2].minorExcursionCount, view.rooms[2].criticalExcursionCount], [0, 1]);
  assert.equal(view.rooms[2].worstExcursion?.severity, 'critical');
  assert.equal(view.rooms[2].worstExcursion?.metric, 'pressureDifferential');
  assert.equal(view.rooms[2].worstExcursion?.worstValue, 0.22);
  assert.equal(view.rooms[2].totalExcursionMinutes, 15);

  const unresolved = view.rooms.at(-1);
  assert.equal(unresolved?.resolved, false);
  assert.equal(unresolved?.roomId, fixtures.environmental.unknownRoomReadings[0].roomId);
  assert.equal(unresolved?.readingCount, null);
  assert.throws(() => evaluateEnvironmentalMonitoring(fixtures.environmental.profiles, fixtures.environmental.unknownRoomReadings), (error: unknown) => {
    assert.ok(error instanceof EnvironmentalMonitoringError);
    assert.equal(unresolved?.errorCode, error.code);
    assert.equal(unresolved?.explanation, explainEnvironmentalMonitoringError(error.code));
    return true;
  });
});

test('instrument rows cover all six qualification scenarios and match the real gate exactly', () => {
  const view = buildPilotFacilityReadinessView();
  const fixtures = createPilotFacilityReadinessFixtures();

  assert.equal(view.instruments.length, 6);
  fixtures.equipment.checkInstrumentIds.forEach((instrumentId, index) => {
    const expected = evaluateEquipmentQualificationGate(fixtures.equipment.registry, instrumentId, DEMO_RUN_AT);
    const actual = view.instruments[index];
    assert.equal(actual.instrumentId, expected.instrumentId);
    assert.equal(actual.decision, expected.decision);
    assert.equal(actual.reasonCode, expected.reasonCode);
    assert.equal(actual.explanation, expected.reason);
  });

  assert.deepEqual(view.instruments.map((row) => [row.decision, row.reasonCode]), [
    ['qualified', 'fully-qualified'],
    ['not_qualified', 'performance-stage-missing'],
    ['not_qualified', 'installation-invalidated-by-change-event'],
    ['not_qualified', 'requalification-interval-expired'],
    ['not_qualified', 'operational-before-installation'],
    ['not_qualified', 'unknown-instrument'],
  ]);
});

test('consumable rows cover ok, reorder-needed, willExpireUnused and lead-time-missing scenarios and match the real evaluator', () => {
  const view = buildPilotFacilityReadinessView();
  const fixtures = createPilotFacilityReadinessFixtures();

  assert.equal(view.consumables.length, 4);

  fixtures.consumables.slice(0, 3).forEach(({ declaration, lots }, index) => {
    const [expected] = evaluateConsumableInventory([declaration], lots);
    const actual = view.consumables[index];
    assert.equal(actual.resolved, true);
    assert.equal(actual.consumableId, expected.consumableId);
    assert.equal(actual.stockOnHand, expected.stockOnHand);
    assert.equal(actual.daysOfCover, expected.daysOfCover === null ? 'Unlimited' : expected.daysOfCover.toFixed(1));
    assert.equal(actual.reorderPoint, expected.reorderPoint);
    assert.equal(actual.reorderQuantity, expected.reorderQuantity);
    assert.equal(actual.status, expected.status);
    assert.equal(actual.expiredQuantityTotal, expected.expiredQuantityTotal);
    assert.deepEqual(actual.lotsAtRisk, expected.lotFlags.filter((flag) => flag.willExpireUnused));
    assert.equal(actual.explanation, explainConsumableInventoryStatus(expected.status));
  });

  assert.equal(view.consumables[0].status, 'ok');
  assert.equal(view.consumables[0].daysOfCover, '50.0');
  assert.deepEqual(view.consumables[0].lotsAtRisk, []);

  assert.equal(view.consumables[1].status, 'reorder-needed');
  assert.equal(view.consumables[1].daysOfCover, '4.0');
  assert.equal(view.consumables[1].reorderQuantity, 170);

  assert.equal(view.consumables[2].status, 'ok');
  assert.equal(view.consumables[2].expiredQuantityTotal, 70);
  assert.ok(view.consumables[2].expiredQuantityTotal! > 0);
  assert.equal(view.consumables[2].lotsAtRisk.length, 1);
  assert.equal(view.consumables[2].lotsAtRisk[0].lotId, 'SYNTHETIC-CONSUMABLE-003-LOT-A');

  const unresolved = view.consumables[3];
  assert.equal(unresolved.resolved, false);
  assert.equal(unresolved.status, 'unresolved');
  assert.equal(unresolved.consumableId, fixtures.consumables[3].declaration.consumableId);
  const badDeclaration = fixtures.consumables[3];
  assert.throws(() => evaluateConsumableInventory([badDeclaration.declaration], badDeclaration.lots), (error: unknown) => {
    assert.ok(error instanceof ConsumableInventoryError);
    assert.equal(error.code, 'lead-time-missing');
    assert.equal(unresolved.errorCode, error.code);
    assert.equal(unresolved.explanation, explainConsumableInventoryError(error.code));
    return true;
  });
});

test('error rows do not throw out of the builder and every explanation is non-empty', () => {
  const view = buildPilotFacilityReadinessView();
  for (const row of [...view.rooms, ...view.instruments, ...view.consumables]) {
    assert.ok(row.explanation.trim());
  }
});

test('headline counts match the derived rows', () => {
  const view = buildPilotFacilityReadinessView();
  assert.deepEqual(view.headline, {
    roomsWithCriticalExcursion: view.rooms.filter((row) => row.resolved && (row.criticalExcursionCount ?? 0) > 0).length,
    instrumentsNotQualified: view.instruments.filter((row) => row.decision !== 'qualified').length,
    consumablesToReorderOrUnresolved: view.consumables.filter((row) => row.status === 'reorder-needed' || row.status === 'unresolved').length,
  });
  assert.equal(view.headline.roomsWithCriticalExcursion, 1);
  assert.equal(view.headline.instrumentsNotQualified, 5);
  assert.equal(view.headline.consumablesToReorderOrUnresolved, 2);
});

test('every fabricated identifier is clearly synthetic', () => {
  const fixtures = createPilotFacilityReadinessFixtures();
  const ids = [
    ...fixtures.environmental.profiles.map((profile) => profile.roomId),
    ...fixtures.environmental.readings.map((reading) => reading.roomId),
    ...fixtures.environmental.unknownRoomReadings.map((reading) => reading.roomId),
    ...fixtures.equipment.checkInstrumentIds,
    ...Object.keys(fixtures.equipment.registry),
    ...fixtures.consumables.map((entry) => entry.declaration.consumableId),
    ...fixtures.consumables.flatMap((entry) => entry.lots.map((lot) => lot.lotId)),
  ];
  for (const id of ids) assert.match(id, /^SYNTHETIC-/);

  const view = buildPilotFacilityReadinessView();
  for (const row of view.rooms) assert.match(row.roomId, /^SYNTHETIC-/);
  for (const row of view.instruments) assert.match(row.instrumentId, /^SYNTHETIC-/);
  for (const row of view.consumables) assert.match(row.consumableId, /^SYNTHETIC-/);
});

test('builder is deterministic (two calls deepEqual) and the view-model source has no ambient inputs', () => {
  const first = buildPilotFacilityReadinessView();
  const second = buildPilotFacilityReadinessView();
  assert.deepEqual(first, second);

  const source = readFileSync('lib/ohworks-demo-facility-readiness-view.ts', 'utf8');
  assert.doesNotMatch(source, /Date\.now\s*\(|new Date\s*\(\s*\)|Math\.random|process\.env|fetch\s*\(/);
});

test('the panel source is a read-only server component that names its own fabrication', () => {
  const source = readFileSync('app/pilot/ohworks/_components/facility-readiness-panel.tsx', 'utf8');
  assert.doesNotMatch(source, /use client/);
  assert.match(source, /fabricated/);
  assert.match(source, /buildPilotFacilityReadinessView/);
  assert.doesNotMatch(source, /production-ready/i);
  assert.doesNotMatch(source, /live integration is supported/i);
  assert.doesNotMatch(source, /\b(is|are|now)\s+(accredited|certified|validated)\b/i);
  assert.doesNotMatch(source, /<form\b|fetch\s*\(/);
});

test('the pilot overview page imports and renders FacilityReadinessPanel exactly once', () => {
  const source = readFileSync('app/pilot/ohworks/page.tsx', 'utf8');
  assert.equal((source.match(/FacilityReadinessPanel/g) ?? []).length, 2);
  assert.match(source, /import \{ FacilityReadinessPanel \} from '@\/app\/pilot\/ohworks\/_components\/facility-readiness-panel';/);
  assert.match(source, /<FacilityReadinessPanel \/>/);
});
