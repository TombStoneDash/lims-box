import { mapInstrumentFlags, explainFlagMappingReason, type InstrumentFlagMappingTable } from './ohworks-instrument-flags';
import { evaluateCalibrationVerificationSchedule, explainCalibrationVerificationReason, type CalibrationVerificationScheduleInput } from './ohworks-calibration-verification';
import { evaluateCalibratorLotTraceability, explainTraceabilityReason, type CalibratorLotRegistry } from './ohworks-calibrator-traceability';

/** Fabricated inputs only; no instrument transport or backing server. */
export const DEMO_AS_OF = '2026-01-26T00:00:00.000Z';
const MODEL = 'SYNTHETIC-IMMUNOASSAY-ANALYZER';

export interface PilotInstrumentReadinessFixture {
  asOf: string;
  instrumentModel: string;
  flagTable: InstrumentFlagMappingTable;
  messages: ReadonlyArray<{ id: string; rawFlagCodes: ReadonlyArray<string> }>;
  schedules: ReadonlyArray<CalibrationVerificationScheduleInput>;
  lotRegistry: CalibratorLotRegistry;
  lotIds: ReadonlyArray<string>;
}

export function createPilotInstrumentReadinessFixture(): PilotInstrumentReadinessFixture {
  return {
    asOf: DEMO_AS_OF,
    instrumentModel: MODEL,
    flagTable: {
      [MODEL]: {
        'SYNTHETIC-F01': { canonicalFlag: 'SYNTHETIC-REPORTABLE', severity: 'info', action: 'report' },
        'SYNTHETIC-F02': { canonicalFlag: 'SYNTHETIC-REVIEW', severity: 'high', action: 'review' },
      },
    },
    messages: [
      { id: 'SYNTHETIC-MESSAGE-01', rawFlagCodes: ['SYNTHETIC-F01'] },
      { id: 'SYNTHETIC-MESSAGE-02', rawFlagCodes: ['SYNTHETIC-F02'] },
      { id: 'SYNTHETIC-MESSAGE-03', rawFlagCodes: ['SYNTHETIC-F01', 'SYNTHETIC-UNKNOWN'] },
    ],
    schedules: [
      { instrumentId: MODEL, analyteId: 'SYNTHETIC-ANALYTE-01', lastVerifiedAt: '2026-01-20T00:00:00.000Z', maxIntervalDays: 30, triggerEvents: [] },
      { instrumentId: MODEL, analyteId: 'SYNTHETIC-ANALYTE-02', lastVerifiedAt: '2026-01-01T00:00:00.000Z', maxIntervalDays: 30, triggerEvents: [] },
      { instrumentId: MODEL, analyteId: 'SYNTHETIC-ANALYTE-03', lastVerifiedAt: '2025-12-01T00:00:00.000Z', maxIntervalDays: 30, triggerEvents: [] },
      { instrumentId: MODEL, analyteId: 'SYNTHETIC-ANALYTE-04', lastVerifiedAt: '2026-01-20T00:00:00.000Z', maxIntervalDays: 30, triggerEvents: [{ kind: 'reagent-lot-change', occurredAt: '2026-01-25T00:00:00.000Z' }] },
    ],
    lotRegistry: {
      'SYNTHETIC-LOT-01': { lotId: 'SYNTHETIC-LOT-01', parentReferenceId: 'SYNTHETIC-REFERENCE', certificateExpiresAt: '2026-06-01T00:00:00.000Z', assignedValue: 100, assignedValueUncertainty: 0.5 },
      'SYNTHETIC-LOT-02': { lotId: 'SYNTHETIC-LOT-02', parentReferenceId: 'SYNTHETIC-REFERENCE', certificateExpiresAt: '2026-01-01T00:00:00.000Z', assignedValue: 100, assignedValueUncertainty: 0.5 },
      'SYNTHETIC-REFERENCE': { lotId: 'SYNTHETIC-REFERENCE', isDeclaredReference: true, certificateExpiresAt: '2026-06-01T00:00:00.000Z', assignedValue: 100, assignedValueUncertainty: 0.1 },
    },
    lotIds: ['SYNTHETIC-LOT-01', 'SYNTHETIC-LOT-02'],
  };
}

export interface PilotReadinessRow {
  id: string;
  detail: string;
  decision: string;
  reasonCode: string;
  explanation: string;
  blocking: boolean;
}

export interface PilotInstrumentReadinessView {
  asOf: string;
  instrumentModel: string;
  flagRows: PilotReadinessRow[];
  calibrationRows: PilotReadinessRow[];
  traceabilityRows: PilotReadinessRow[];
  blockingFindings: number;
  readyToRun: boolean;
  statusText: string;
}

/** One blocking finding per row. Due-soon is advisory; review/suppress and event requirements block. */
export function buildInstrumentReadinessView(fixture: PilotInstrumentReadinessFixture): PilotInstrumentReadinessView {
  const flagRows = fixture.messages.map(({ id, rawFlagCodes }) => {
    const result = mapInstrumentFlags(fixture.flagTable, fixture.instrumentModel, rawFlagCodes);
    return {
      id,
      detail: `Fabricated raw flags: ${rawFlagCodes.join(', ') || 'none'}; synthetic required action: ${result.requiredAction}`,
      decision: result.decision,
      reasonCode: result.reasonCode,
      explanation: explainFlagMappingReason(result.reasonCode),
      blocking: result.decision === 'blocked' || result.requiredAction === 'review' || result.requiredAction === 'suppress',
    };
  });
  const calibrationRows = fixture.schedules.map((schedule) => {
    const result = evaluateCalibrationVerificationSchedule(schedule, fixture.asOf);
    return {
      id: schedule.analyteId,
      detail: `Fabricated due instant: ${result.dueAt ?? 'unavailable'}; synthetic trigger: ${result.governingTriggerKind ?? 'none'}`,
      decision: result.decision,
      reasonCode: result.reasonCode,
      explanation: explainCalibrationVerificationReason(result.reasonCode),
      blocking: result.decision === 'OVERDUE' || result.decision === 'REQUIRED_BY_EVENT',
    };
  });
  const traceabilityRows = fixture.lotIds.map((lotId) => {
    const result = evaluateCalibratorLotTraceability(fixture.lotRegistry, lotId, fixture.asOf);
    return {
      id: lotId,
      detail: `Fabricated reference chain: ${result.chain.join(' → ')}`,
      decision: result.decision,
      reasonCode: result.reasonCode,
      explanation: explainTraceabilityReason(result.reasonCode),
      blocking: result.decision === 'not_traceable',
    };
  });
  const blockingFindings = [...flagRows, ...calibrationRows, ...traceabilityRows].filter((row) => row.blocking).length;
  return {
    asOf: fixture.asOf,
    instrumentModel: fixture.instrumentModel,
    flagRows,
    calibrationRows,
    traceabilityRows,
    blockingFindings,
    readyToRun: blockingFindings === 0,
    statusText: blockingFindings === 0 ? 'Ready to run — fabricated checks only' : `Not ready to run — ${blockingFindings} blocking findings`,
  };
}

export function buildPilotInstrumentReadinessView(): PilotInstrumentReadinessView {
  return buildInstrumentReadinessView(createPilotInstrumentReadinessFixture());
}
