import { computeQualityIndicators, type MonthlyQualityIndicatorInput, type QualityIndicatorResult } from './ohworks-quality-indicators';
import {
  evaluatePtEvent, explainPtClassification, explainPtEventFailReason,
  type PtConsensus, type PtEventLimits, type PtParticipantResult, type PtEventScoringResult,
} from './ohworks-pt-scoring';

/** Fresh, deterministic fixtures. Every identifier, value, period and target is fabricated. */
export function buildQualityIndicatorsFixture(): MonthlyQualityIndicatorInput {
  const specimensReceived = [];
  const specimensRejected = [];
  const resultsReported = [];
  const correctedReports = [];
  const criticalValues = [];
  for (let i = 1; i <= 40; i++) {
    const specimenId = `SYNTHETIC-SPEC-${String(i).padStart(3, '0')}`;
    specimensReceived.push({ specimenId });
    if (i <= 4) specimensRejected.push({ specimenId, reasonCode: 'SYNTHETIC-VOLUME' });
    if (i === 5) specimensRejected.push({ specimenId, reasonCode: 'SYNTHETIC-LABEL' });
  }
  for (let i = 1; i <= 20; i++) {
    const resultId = `SYNTHETIC-RESULT-${String(i).padStart(3, '0')}`;
    resultsReported.push({ resultId, priority: i <= 10 ? 'SYNTHETIC-ROUTINE' : 'SYNTHETIC-URGENT', turnaroundMinutes: i <= 10 ? 90 : (i <= 16 ? 20 : 60) });
    if (i <= 2) correctedReports.push({ resultId });
  }
  for (let i = 1; i <= 5; i++) {
    criticalValues.push({ criticalValueId: `SYNTHETIC-CRITICAL-${i}`, acknowledgedAfterMinutes: i === 5 ? null : i * 5 });
  }
  return {
    period: 'SYNTHETIC-2026-08', specimensReceived, specimensRejected, resultsReported, correctedReports, criticalValues,
    targets: {
      rejectionRatePercentByReason: { 'SYNTHETIC-VOLUME': 5, 'SYNTHETIC-LABEL': 5 },
      turnaroundTargetMinutesByPriority: { 'SYNTHETIC-ROUTINE': 120, 'SYNTHETIC-URGENT': 30, 'SYNTHETIC-DEFERRED': 240 },
      turnaroundCompliancePercentByPriority: { 'SYNTHETIC-ROUTINE': 90, 'SYNTHETIC-URGENT': 90, 'SYNTHETIC-DEFERRED': 90 },
      correctedReportRatePercent: 10, criticalValueAckTargetMinutes: 15, criticalValueAckCompliancePercent: 80,
    },
  };
}

export function buildQualityPtFixtures(): { label: string; results: PtParticipantResult[]; consensus: PtConsensus; limits: PtEventLimits }[] {
  return [false, true].map((robust) => {
    const results: PtParticipantResult[] = [];
    const values = robust ? [98, 99, 100, 101, 102, 130] : [98, 99, 100, 101, 102, 103];
    for (let i = 0; i < values.length; i++) {
      results.push({ participantId: `SYNTHETIC-PARTICIPANT-${String(i + 1).padStart(2, '0')}`, reportedValue: values[i] });
    }
    return {
      label: robust ? 'SYNTHETIC-PT-ROBUST' : 'SYNTHETIC-PT-DECLARED', results,
      consensus: robust ? null : { assignedValue: 100, acceptableRange: { low: 85, high: 115 } },
      limits: { minParticipantsForRobustStatistics: 5, minSatisfactoryRate: 0.9, maxUnsatisfactoryCount: 0 },
    };
  });
}

type IndicatorRow = QualityIndicatorResult & {
  label: string; direction: 'lower' | 'higher'; rate: string; target: string;
  meetsTarget: boolean | null; status: 'met' | 'missed' | 'not measurable';
};
type PtRow = Omit<PtEventScoringResult, 'assignedValue' | 'standardDeviation' | 'satisfactoryRate' | 'participantScores'> & {
  label: string; assignedValue: string; standardDeviation: string; satisfactoryRate: string;
  failReasonExplanations: string[];
  participantScores: { participantId: string; zScore: string; classification: PtEventScoringResult['participantScores'][number]['classification']; explanation: string }[];
};
export type PilotQualityIndicatorsView = { period: string; indicators: IndicatorRow[]; ptEvents: PtRow[] };

function indicator(label: string, value: QualityIndicatorResult, direction: IndicatorRow['direction']): IndicatorRow {
  const meetsTarget = value.ratePercent === null ? null : direction === 'lower'
    ? value.ratePercent <= value.targetPercent : value.ratePercent >= value.targetPercent;
  return {
    ...value, label, direction, meetsTarget,
    rate: value.ratePercent === null ? 'not measurable this period' : `${value.ratePercent.toFixed(1)}%`,
    target: `${direction === 'lower' ? '≤' : '≥'} ${value.targetPercent.toFixed(1)}%`,
    status: meetsTarget === null ? 'not measurable' : meetsTarget ? 'met' : 'missed',
  };
}

/** Local synthetic demonstration only; no SENAITE connection or real records. */
export function buildPilotQualityIndicatorsView(): PilotQualityIndicatorsView {
  const fixture = buildQualityIndicatorsFixture();
  const report = computeQualityIndicators(fixture);
  return {
    period: report.period,
    indicators: [
      ...Object.entries(report.rejectionRateByReason).map(([reason, value]) => indicator(`Fabricated rejection: ${reason}`, value, 'lower')),
      ...Object.entries(report.turnaroundComplianceByPriority).map(([priority, value]) => indicator(`Fabricated turnaround: ${priority} (within ${fixture.targets.turnaroundTargetMinutesByPriority[priority]} fabricated minutes)`, value, 'higher')),
      indicator('Fabricated corrected reports', report.correctedReportRate, 'lower'),
      indicator(`Fabricated critical acknowledgements (within ${fixture.targets.criticalValueAckTargetMinutes} fabricated minutes)`, report.criticalValueAckCompliance, 'higher'),
    ],
    ptEvents: buildQualityPtFixtures().map((event) => {
      const result = evaluatePtEvent(event.results, event.consensus, event.limits);
      return {
        ...result, label: event.label,
        assignedValue: result.assignedValue.toFixed(2), standardDeviation: result.standardDeviation.toFixed(2),
        satisfactoryRate: `${(result.satisfactoryRate * 100).toFixed(1)}%`,
        failReasonExplanations: result.failReasons.map(explainPtEventFailReason),
        participantScores: result.participantScores.map((score) => ({
          participantId: score.participantId, zScore: score.zScore.toFixed(2), classification: score.classification,
          explanation: explainPtClassification(score.classification),
        })),
      };
    }),
  };
}
