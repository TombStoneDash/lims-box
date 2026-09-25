import { evaluateQCBracketing, explainQCBracketRule, type QCBracketRun, type QCBracketDecision } from './ohworks-qc-bracket';
import { evaluateReagentLot, explainReagentLotError, ReagentLotError, type ReagentLotProfile, type ReagentLotRegistry, type ReagentLotStatus, type ReagentLotRuleCode, type ReagentLotErrorCode } from './ohworks-reagent-lot';
import { evaluateLotComparison, explainLotComparisonCriterion, type LotComparisonPair, type LotComparisonLimits, type LotComparisonResult } from './ohworks-lot-comparison';

export const DEMO_USE_AT = '2026-09-19T12:00:00.000Z';
const HOUR_MS = 60 * 60 * 1000;

/** All times, windows, values and limits are fabricated examples, not regulatory guidance. */
export function createPilotQcBracketLotFixtures(): {
  runs: QCBracketRun[];
  lots: ReagentLotProfile[];
  registry: ReagentLotRegistry;
  comparisons: { label: string; pairs: LotComparisonPair[]; limits: LotComparisonLimits }[];
} {
  const at = (time: string) => `2026-09-19T${time}:00.000Z`;
  return {
    runs: [
      {
        runId: 'SYNTHETIC-BRK-RUN-1', status: 'complete', windowMs: HOUR_MS / 2,
        qcResults: [
          { qcId: 'SYNTHETIC-QC-01', level: 'normal', outcome: 'pass', timestamp: at('08:00') },
          { qcId: 'SYNTHETIC-QC-02', level: 'normal', outcome: 'pass', timestamp: at('08:30') },
          { qcId: 'SYNTHETIC-QC-03', level: 'normal', outcome: 'fail', timestamp: at('09:00') },
        ],
        patientResults: [
          { resultId: 'SYNTHETIC-RES-001', timestamp: at('07:45') },
          { resultId: 'SYNTHETIC-RES-002', timestamp: at('08:15') },
          { resultId: 'SYNTHETIC-RES-003', timestamp: at('08:45') },
        ],
      },
      {
        runId: 'SYNTHETIC-BRK-RUN-2', status: 'complete', windowMs: HOUR_MS / 2,
        qcResults: [
          { qcId: 'SYNTHETIC-QC-04', level: 'low', outcome: 'pass', timestamp: at('08:00') },
          { qcId: 'SYNTHETIC-QC-05', level: 'low', outcome: 'pass', timestamp: at('09:15') },
        ],
        patientResults: [{ resultId: 'SYNTHETIC-RES-004', timestamp: at('09:00') }],
      },
      {
        runId: 'SYNTHETIC-BRK-RUN-3', status: 'in-progress', windowMs: HOUR_MS / 2,
        qcResults: [{ qcId: 'SYNTHETIC-QC-06', level: 'high', outcome: 'pass', timestamp: at('11:30') }],
        patientResults: [{ resultId: 'SYNTHETIC-RES-005', timestamp: at('11:45') }],
      },
    ],
    lots: [
      { lotId: 'SYNTHETIC-LOT-001', manufacturerExpiresAt: '2026-09-30T12:00:00.000Z', nearExpiryWindowMs: 48 * HOUR_MS },
      { lotId: 'SYNTHETIC-LOT-002', manufacturerExpiresAt: '2026-09-20T12:00:00.000Z', nearExpiryWindowMs: 48 * HOUR_MS },
      { lotId: 'SYNTHETIC-LOT-003', manufacturerExpiresAt: '2026-09-30T12:00:00.000Z', firstOpenedAt: at('00:00'), openVialStabilityMs: 8 * HOUR_MS, nearExpiryWindowMs: HOUR_MS },
      { lotId: 'SYNTHETIC-LOT-004', manufacturerExpiresAt: '2026-09-30T12:00:00.000Z', nearExpiryWindowMs: 48 * HOUR_MS },
      { lotId: 'SYNTHETIC-LOT-005', manufacturerExpiresAt: '2026-09-30T12:00:00.000Z', nearExpiryWindowMs: 48 * HOUR_MS },
    ],
    registry: { knownLotIds: ['SYNTHETIC-LOT-001', 'SYNTHETIC-LOT-002', 'SYNTHETIC-LOT-003', 'SYNTHETIC-LOT-004'], recalledLotIds: ['SYNTHETIC-LOT-004'] },
    comparisons: [0.1234, 1.2345].map((difference, index) => ({
      label: `Fabricated paired set ${index + 1}`,
      pairs: [10, 11, 12].map((oldValue, pairIndex) => ({
        specimenId: `SYNTHETIC-SPEC-${String(index * 3 + pairIndex + 1).padStart(3, '0')}`,
        oldValue, newValue: oldValue + difference, oldUnit: 'mg/L', newUnit: 'mg/L',
      })),
      limits: { minPairs: 3, unit: 'mg/L', allowableDifference: { absolute: 5, percent: 50 }, maxMeanDifference: 5, maxPercentBias: 5, maxOutlierPairs: 0 },
    })),
  };
}

export type PilotReagentLotRow = {
  lotId: string;
  status: ReagentLotStatus | 'unresolved';
  ruleCode: ReagentLotRuleCode | ReagentLotErrorCode;
  governingLimitAt: string | null;
  wholeHours: number | null;
  timeLabel: 'remaining' | 'overdue' | 'recall effective' | 'unresolved';
  explanation: string;
};
export type PilotQcBracketLotView = {
  useAt: string;
  bracketRows: (QCBracketDecision & { runId: string; runStatus: QCBracketRun['status']; timestamp: string; explanation: string })[];
  lotRows: PilotReagentLotRow[];
  comparisonRows: (Pick<LotComparisonResult, 'decision' | 'governingCriterion' | 'pairCount' | 'outlierCount'> & { label: string; meanDifference: string; percentBias: string; unit: string; explanation: string })[];
  counts: { resultsNotReleasable: number; lotsNotUsable: number; comparisonsRejected: number };
};

/** Read-only synthetic evaluation; no backing server or persistence. */
export function buildPilotQcBracketLotView(): PilotQcBracketLotView {
  const fixtures = createPilotQcBracketLotFixtures();
  const bracketRows = fixtures.runs.flatMap((run) => evaluateQCBracketing(run).map((decision, index) => ({
    ...decision, runId: run.runId, runStatus: run.status, timestamp: run.patientResults[index].timestamp,
    explanation: explainQCBracketRule(decision.rule),
  })));
  const lotRows = fixtures.lots.map((lot): PilotReagentLotRow => {
    try {
      const result = evaluateReagentLot(lot, DEMO_USE_AT, fixtures.registry);
      return {
        lotId: lot.lotId, status: result.status, ruleCode: result.ruleCode, governingLimitAt: result.governingLimitAt,
        wholeHours: Math.floor(('remainingMs' in result ? result.remainingMs : result.overdueMs) / HOUR_MS),
        timeLabel: result.ruleCode === 'lot-recalled' ? 'recall effective' : result.status === 'expired' ? 'overdue' : 'remaining',
        // The reagent module exposes error explanations only; successful rows retain its exact rule code.
        explanation: result.ruleCode.replaceAll('-', ' '),
      };
    } catch (error) {
      if (!(error instanceof ReagentLotError) || error.code !== 'lot-unknown') throw error;
      return { lotId: lot.lotId, status: 'unresolved', ruleCode: error.code, governingLimitAt: null,
        wholeHours: null, timeLabel: 'unresolved', explanation: explainReagentLotError(error.code) };
    }
  });
  const comparisonRows = fixtures.comparisons.map(({ label, pairs, limits }) => {
    const result = evaluateLotComparison(pairs, limits);
    return { label, decision: result.decision, governingCriterion: result.governingCriterion,
      pairCount: result.pairCount, meanDifference: result.meanDifference.toFixed(2),
      percentBias: result.percentBias === null ? 'Undefined' : result.percentBias.toFixed(2),
      unit: limits.unit, outlierCount: result.outlierCount, explanation: explainLotComparisonCriterion(result.governingCriterion) };
  });
  return { useAt: DEMO_USE_AT, bracketRows, lotRows, comparisonRows, counts: {
    resultsNotReleasable: bracketRows.filter((row) => row.disposition !== 'releasable').length,
    // Includes flagged and unresolved lots; this is not an expired-only count.
    lotsNotUsable: lotRows.filter((row) => row.status !== 'usable').length,
    comparisonsRejected: comparisonRows.filter((row) => row.decision === 'reject').length,
  } };
}
