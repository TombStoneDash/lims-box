import {
  evaluateEnvironmentalMonitoring,
  explainEnvironmentalMonitoringError,
  EnvironmentalMonitoringError,
  type RoomEnvironmentalLimits,
  type EnvironmentalReading,
  type EnvironmentalMetric,
  type ExcursionSeverity,
  type EnvironmentalMonitoringErrorCode,
} from './ohworks-environmental-monitoring';
import {
  evaluateEquipmentQualificationGate,
  type InstrumentQualificationRegistry,
  type QualificationDecision,
  type QualificationReasonCode,
} from './ohworks-equipment-qualification';
import {
  evaluateConsumableInventory,
  explainConsumableInventoryStatus,
  explainConsumableInventoryError,
  ConsumableInventoryError,
  type ConsumableDeclaration,
  type ConsumableLot,
  type ConsumableInventoryStatus,
  type ConsumableLotExpiryFlag,
  type ConsumableInventoryErrorCode,
} from './ohworks-consumable-inventory';

export const DEMO_RUN_AT = '2026-09-19T12:00:00.000Z';
const MINUTE_MS = 60_000;

const FACILITY_READINESS_CAPTION =
  'Rooms, instruments, stock levels and limits are fabricated examples evaluated by the real rule modules; this panel orders nothing and asserts nothing about any real facility.';

function iso(hour: string, minute: string): string {
  return `2026-09-19T${hour}:${minute}:00.000Z`;
}

/** All rooms, instruments, consumables, limits and readings below are fabricated examples, not regulatory guidance. */
export function createPilotFacilityReadinessFixtures(): {
  environmental: {
    profiles: RoomEnvironmentalLimits[];
    readings: EnvironmentalReading[];
    unknownRoomReadings: EnvironmentalReading[];
  };
  equipment: {
    registry: InstrumentQualificationRegistry;
    checkInstrumentIds: string[];
  };
  consumables: { declaration: ConsumableDeclaration; lots: ConsumableLot[] }[];
} {
  const temperatureLimits = { minAcceptable: 18, maxAcceptable: 22, criticalBelow: 15, criticalAbove: 25 };
  const humidityLimits = { minAcceptable: 30, maxAcceptable: 60, criticalBelow: 20, criticalAbove: 70 };
  const pressureLimits = { minAcceptable: 0.02, maxAcceptable: 0.08, criticalBelow: -0.02, criticalAbove: 0.15 };

  const profiles: RoomEnvironmentalLimits[] = [
    {
      roomId: 'SYNTHETIC-ROOM-001',
      limits: { temperature: temperatureLimits, humidity: humidityLimits, pressureDifferential: pressureLimits },
    },
    {
      roomId: 'SYNTHETIC-ROOM-002',
      limits: { temperature: temperatureLimits, humidity: humidityLimits, pressureDifferential: pressureLimits },
    },
    {
      roomId: 'SYNTHETIC-ROOM-003',
      limits: { temperature: temperatureLimits, humidity: humidityLimits, pressureDifferential: pressureLimits },
    },
  ];

  const readings: EnvironmentalReading[] = [
    // Room 1: every reading inside the acceptable window — no excursions.
    { roomId: 'SYNTHETIC-ROOM-001', metric: 'temperature', value: 20, timestamp: iso('00', '00') },
    { roomId: 'SYNTHETIC-ROOM-001', metric: 'humidity', value: 45, timestamp: iso('00', '15') },
    { roomId: 'SYNTHETIC-ROOM-001', metric: 'pressureDifferential', value: 0.05, timestamp: iso('00', '30') },
    { roomId: 'SYNTHETIC-ROOM-001', metric: 'temperature', value: 21, timestamp: iso('00', '45') },
    // Room 2: a temperature drift outside acceptable but inside critical bounds for three consecutive readings — one minor excursion.
    { roomId: 'SYNTHETIC-ROOM-002', metric: 'temperature', value: 21, timestamp: iso('01', '00') },
    { roomId: 'SYNTHETIC-ROOM-002', metric: 'temperature', value: 23, timestamp: iso('01', '15') },
    { roomId: 'SYNTHETIC-ROOM-002', metric: 'temperature', value: 24, timestamp: iso('01', '30') },
    { roomId: 'SYNTHETIC-ROOM-002', metric: 'temperature', value: 23, timestamp: iso('01', '45') },
    { roomId: 'SYNTHETIC-ROOM-002', metric: 'temperature', value: 20, timestamp: iso('02', '00') },
    // Room 3: a pressure-differential reading beyond the critical bound — one critical excursion.
    { roomId: 'SYNTHETIC-ROOM-003', metric: 'pressureDifferential', value: 0.05, timestamp: iso('02', '15') },
    { roomId: 'SYNTHETIC-ROOM-003', metric: 'pressureDifferential', value: 0.20, timestamp: iso('02', '30') },
    { roomId: 'SYNTHETIC-ROOM-003', metric: 'pressureDifferential', value: 0.22, timestamp: iso('02', '45') },
    { roomId: 'SYNTHETIC-ROOM-003', metric: 'pressureDifferential', value: 0.05, timestamp: iso('03', '00') },
  ];

  const unknownRoomReadings: EnvironmentalReading[] = [
    { roomId: 'SYNTHETIC-ROOM-404', metric: 'temperature', value: 20, timestamp: iso('05', '00') },
  ];

  const registry: InstrumentQualificationRegistry = {
    'SYNTHETIC-INSTR-001': {
      instrumentId: 'SYNTHETIC-INSTR-001',
      installation: { completedAt: '2026-01-01T00:00:00.000Z', approverRole: 'quality-manager' },
      operational: { completedAt: '2026-03-01T00:00:00.000Z', approverRole: 'quality-manager' },
      performance: { completedAt: '2026-06-01T00:00:00.000Z', approverRole: 'quality-manager' },
      requalificationIntervalDays: 365,
    },
    'SYNTHETIC-INSTR-002': {
      instrumentId: 'SYNTHETIC-INSTR-002',
      installation: { completedAt: '2026-01-01T00:00:00.000Z', approverRole: 'quality-manager' },
      operational: { completedAt: '2026-03-01T00:00:00.000Z', approverRole: 'quality-manager' },
      requalificationIntervalDays: 365,
    },
    'SYNTHETIC-INSTR-003': {
      instrumentId: 'SYNTHETIC-INSTR-003',
      installation: { completedAt: '2026-01-01T00:00:00.000Z', approverRole: 'quality-manager' },
      operational: { completedAt: '2026-03-01T00:00:00.000Z', approverRole: 'quality-manager' },
      performance: { completedAt: '2026-06-01T00:00:00.000Z', approverRole: 'quality-manager' },
      requalificationIntervalDays: 365,
      changeEvents: [{ kind: 'relocation', occurredAt: '2026-07-01T00:00:00.000Z' }],
    },
    'SYNTHETIC-INSTR-004': {
      instrumentId: 'SYNTHETIC-INSTR-004',
      installation: { completedAt: '2023-01-01T00:00:00.000Z', approverRole: 'quality-manager' },
      operational: { completedAt: '2023-06-01T00:00:00.000Z', approverRole: 'quality-manager' },
      performance: { completedAt: '2024-01-01T00:00:00.000Z', approverRole: 'quality-manager' },
      requalificationIntervalDays: 30,
    },
    'SYNTHETIC-INSTR-005': {
      instrumentId: 'SYNTHETIC-INSTR-005',
      installation: { completedAt: '2026-02-01T00:00:00.000Z', approverRole: 'quality-manager' },
      operational: { completedAt: '2026-01-01T00:00:00.000Z', approverRole: 'quality-manager' },
      requalificationIntervalDays: 365,
    },
  };

  const checkInstrumentIds = [
    'SYNTHETIC-INSTR-001',
    'SYNTHETIC-INSTR-002',
    'SYNTHETIC-INSTR-003',
    'SYNTHETIC-INSTR-004',
    'SYNTHETIC-INSTR-005',
    'SYNTHETIC-INSTR-006',
  ];

  const consumables: { declaration: ConsumableDeclaration; lots: ConsumableLot[] }[] = [
    {
      // Well above the reorder point.
      declaration: {
        consumableId: 'SYNTHETIC-CONSUMABLE-001',
        averageDailyUsage: 10,
        leadTimeDays: 5,
        safetyStock: 20,
        targetCoverDays: 30,
      },
      lots: [
        { consumableId: 'SYNTHETIC-CONSUMABLE-001', lotId: 'SYNTHETIC-CONSUMABLE-001-LOT-A', quantityOnHand: 500, daysUntilExpiry: 200 },
      ],
    },
    {
      // Below the reorder point.
      declaration: {
        consumableId: 'SYNTHETIC-CONSUMABLE-002',
        averageDailyUsage: 10,
        leadTimeDays: 5,
        safetyStock: 10,
        targetCoverDays: 20,
      },
      lots: [
        { consumableId: 'SYNTHETIC-CONSUMABLE-002', lotId: 'SYNTHETIC-CONSUMABLE-002-LOT-A', quantityOnHand: 40, daysUntilExpiry: 60 },
      ],
    },
    {
      // Enough stock in total but one lot expiring before it can be used.
      declaration: {
        consumableId: 'SYNTHETIC-CONSUMABLE-003',
        averageDailyUsage: 10,
        leadTimeDays: 5,
        safetyStock: 10,
        targetCoverDays: 30,
      },
      lots: [
        { consumableId: 'SYNTHETIC-CONSUMABLE-003', lotId: 'SYNTHETIC-CONSUMABLE-003-LOT-A', quantityOnHand: 100, daysUntilExpiry: 3 },
        { consumableId: 'SYNTHETIC-CONSUMABLE-003', lotId: 'SYNTHETIC-CONSUMABLE-003-LOT-B', quantityOnHand: 200, daysUntilExpiry: null },
      ],
    },
    {
      // Declared with a zero lead time — evaluated separately, fails closed.
      declaration: {
        consumableId: 'SYNTHETIC-CONSUMABLE-004',
        averageDailyUsage: 5,
        leadTimeDays: 0,
        safetyStock: 10,
        targetCoverDays: 20,
      },
      lots: [
        { consumableId: 'SYNTHETIC-CONSUMABLE-004', lotId: 'SYNTHETIC-CONSUMABLE-004-LOT-A', quantityOnHand: 50, daysUntilExpiry: 100 },
      ],
    },
  ];

  return { environmental: { profiles, readings, unknownRoomReadings }, equipment: { registry, checkInstrumentIds }, consumables };
}

export type PilotRoomReadinessRow = {
  roomId: string;
  resolved: boolean;
  readingCount: number | null;
  minorExcursionCount: number | null;
  criticalExcursionCount: number | null;
  totalExcursionMinutes: number | null;
  worstExcursion: { metric: EnvironmentalMetric; severity: ExcursionSeverity; worstValue: number; minutes: number } | null;
  errorCode: EnvironmentalMonitoringErrorCode | null;
  explanation: string;
};

export type PilotInstrumentReadinessRow = {
  instrumentId: string;
  decision: QualificationDecision;
  reasonCode: QualificationReasonCode;
  explanation: string;
};

export type PilotConsumableReadinessRow = {
  consumableId: string;
  resolved: boolean;
  stockOnHand: number | null;
  daysOfCover: string | null;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  status: ConsumableInventoryStatus | 'unresolved';
  lotsAtRisk: ConsumableLotExpiryFlag[];
  expiredQuantityTotal: number | null;
  errorCode: ConsumableInventoryErrorCode | null;
  explanation: string;
};

export type PilotFacilityReadinessView = {
  runAt: string;
  caption: string;
  rooms: PilotRoomReadinessRow[];
  instruments: PilotInstrumentReadinessRow[];
  consumables: PilotConsumableReadinessRow[];
  headline: {
    roomsWithCriticalExcursion: number;
    instrumentsNotQualified: number;
    consumablesToReorderOrUnresolved: number;
  };
};

/** Read-only synthetic evaluation; no backing server, sensor feed or persistence. */
export function buildPilotFacilityReadinessView(): PilotFacilityReadinessView {
  const fixtures = createPilotFacilityReadinessFixtures();

  const { roomSummaries } = evaluateEnvironmentalMonitoring(fixtures.environmental.profiles, fixtures.environmental.readings);
  const rooms: PilotRoomReadinessRow[] = roomSummaries.map((summary) => ({
    roomId: summary.roomId,
    resolved: true,
    readingCount: summary.readingCount,
    minorExcursionCount: summary.minorExcursionCount,
    criticalExcursionCount: summary.criticalExcursionCount,
    totalExcursionMinutes: summary.totalExcursionDurationMs / MINUTE_MS,
    worstExcursion: summary.worstExcursion === null ? null : {
      metric: summary.worstExcursion.metric,
      severity: summary.worstExcursion.severity,
      worstValue: summary.worstExcursion.worstValue,
      minutes: summary.worstExcursion.durationMs / MINUTE_MS,
    },
    errorCode: null,
    explanation: summary.excursionCount === 0
      ? 'No excursions recorded for this fabricated room across the synthetic reading history.'
      : `${summary.criticalExcursionCount} critical and ${summary.minorExcursionCount} minor excursion(s) recorded; worst was a ${summary.worstExcursion?.severity} ${summary.worstExcursion?.metric} excursion at ${summary.worstExcursion?.worstValue}.`,
  }));
  try {
    evaluateEnvironmentalMonitoring(fixtures.environmental.profiles, fixtures.environmental.unknownRoomReadings);
    throw new Error('Expected the unknown-room fixture to be rejected by the real evaluator.');
  } catch (error) {
    if (!(error instanceof EnvironmentalMonitoringError) || error.code !== 'room-unknown') {
      throw error;
    }
    rooms.push({
      roomId: fixtures.environmental.unknownRoomReadings[0].roomId,
      resolved: false,
      readingCount: null,
      minorExcursionCount: null,
      criticalExcursionCount: null,
      totalExcursionMinutes: null,
      worstExcursion: null,
      errorCode: error.code,
      explanation: explainEnvironmentalMonitoringError(error.code),
    });
  }

  const instruments: PilotInstrumentReadinessRow[] = fixtures.equipment.checkInstrumentIds.map((instrumentId) => {
    const result = evaluateEquipmentQualificationGate(fixtures.equipment.registry, instrumentId, DEMO_RUN_AT);
    return { instrumentId: result.instrumentId, decision: result.decision, reasonCode: result.reasonCode, explanation: result.reason };
  });

  const consumables: PilotConsumableReadinessRow[] = fixtures.consumables.map(({ declaration, lots }) => {
    try {
      const [result] = evaluateConsumableInventory([declaration], lots);
      return {
        consumableId: result.consumableId,
        resolved: true,
        stockOnHand: result.stockOnHand,
        daysOfCover: result.daysOfCover === null ? 'Unlimited' : result.daysOfCover.toFixed(1),
        reorderPoint: result.reorderPoint,
        reorderQuantity: result.reorderQuantity,
        status: result.status,
        lotsAtRisk: result.lotFlags.filter((flag) => flag.willExpireUnused).map((flag) => ({ ...flag })),
        expiredQuantityTotal: result.expiredQuantityTotal,
        errorCode: null,
        explanation: explainConsumableInventoryStatus(result.status),
      };
    } catch (error) {
      if (!(error instanceof ConsumableInventoryError)) {
        throw error;
      }
      return {
        consumableId: declaration.consumableId,
        resolved: false,
        stockOnHand: null,
        daysOfCover: null,
        reorderPoint: null,
        reorderQuantity: null,
        status: 'unresolved',
        lotsAtRisk: [],
        expiredQuantityTotal: null,
        errorCode: error.code,
        explanation: explainConsumableInventoryError(error.code),
      };
    }
  });

  return {
    runAt: DEMO_RUN_AT,
    caption: FACILITY_READINESS_CAPTION,
    rooms,
    instruments,
    consumables,
    headline: {
      roomsWithCriticalExcursion: rooms.filter((row) => row.resolved && (row.criticalExcursionCount ?? 0) > 0).length,
      instrumentsNotQualified: instruments.filter((row) => row.decision !== 'qualified').length,
      consumablesToReorderOrUnresolved: consumables.filter((row) => row.status === 'reorder-needed' || row.status === 'unresolved').length,
    },
  };
}
