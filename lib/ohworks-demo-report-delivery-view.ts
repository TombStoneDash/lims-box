import { formatReportedResult, ReportingFormatError, explainReportingFormatError, type ReportOutcome, type ReportingFormat, type ReportingFormatErrorCode } from './ohworks-reporting-format';
import { computeReportDistribution, explainDistributionBlockReason, explainDistributionBlockNextAction, type DistributionRule, type ReportForDistribution, type ReportDistributionSummary } from './ohworks-report-distribution';
import { applyReportAmendments, explainAmendmentChainReason, explainAmendmentChainNextAction, type ReportAmendment, type AmendmentChainSummary } from './ohworks-report-amendment';

type FormatRow = {
  analyteCode: string;
  value: number;
  outcome: ReportOutcome | null;
  errorCode: ReportingFormatErrorCode | null;
  explanation: string | null;
};
export type PilotReportDeliveryView = {
  formats: ReportingFormat[];
  formatting: FormatRow[];
  distribution: { report: ReportForDistribution; matrix: DistributionRule[]; outcome: ReportDistributionSummary; explanation: string | null; nextAction: string | null }[];
  amendments: { reportReferenceToken: string; amendments: ReportAmendment[]; outcome: AmendmentChainSummary; explanation: string | null; nextAction: string | null }[];
  counts: { censoredResults: number; blockedReports: number; invalidChains: number };
};

/** Every value, limit, threshold, role assignment and timestamp is fabricated. No I/O. */
export function buildPilotReportDeliveryView(): PilotReportDeliveryView {
  const formats: ReportingFormat[] = ['NUMERIC', 'LOW', 'HIGH', 'QUALITATIVE'].map((name) => ({
    analyteCode: `SYNTHETIC-ANALYTE-${name}`, unit: 'synthetic-units', decimalPlaces: 2,
    belowDetectionSymbol: '<', belowDetectionLimit: 1,
    aboveQuantitationSymbol: '>', aboveQuantitationLimit: 100,
    qualitativeThresholds: name === 'QUALITATIVE' ? [
      { label: 'synthetic-low-band', minValue: 1, maxValue: 10 },
      { label: 'synthetic-high-band', minValue: 10, maxValue: null },
    ] : null,
  }));
  const formatting: FormatRow[] = [...formats.map((format, index) => ({ analyteCode: format.analyteCode, value: [12.345, 0.5, 120, 20][index] })),
    { analyteCode: 'SYNTHETIC-ANALYTE-UNDECLARED', value: 5 }].map((input) => {
    try {
      return { ...input, outcome: formatReportedResult({ ...input, formats }), errorCode: null, explanation: null };
    } catch (error) {
      if (!(error instanceof ReportingFormatError)) throw error;
      return { ...input, outcome: null, errorCode: error.code, explanation: explainReportingFormatError(error.code) };
    }
  });
  const matrix: DistributionRule[] = [
    { recipientRole: 'SYNTHETIC-ORDERING-CLINICIAN', channelType: 'PORTAL_SECURE_MESSAGE', allowedTestClasses: ['SYNTHETIC-CHEMISTRY', 'SYNTHETIC-FITNESS-OUTCOME'], requiresFinal: true },
    { recipientRole: 'SYNTHETIC-EMPLOYER-OUTCOME-ONLY', channelType: 'ENCRYPTED_EMAIL', allowedTestClasses: ['SYNTHETIC-FITNESS-OUTCOME'], requiresFinal: true },
    { recipientRole: 'SYNTHETIC-LABORATORY-SYSTEM', channelType: 'LAB_INFORMATION_SYSTEM_API', allowedTestClasses: ['SYNTHETIC-CHEMISTRY', 'SYNTHETIC-FITNESS-OUTCOME'], requiresFinal: true },
  ];
  const reports: ReportForDistribution[] = [
    { reportReferenceToken: 'SYNTHETIC-RPT-001', kind: 'FINAL', testClasses: ['SYNTHETIC-CHEMISTRY', 'SYNTHETIC-FITNESS-OUTCOME'] },
    { reportReferenceToken: 'SYNTHETIC-RPT-002', kind: 'FINAL', testClasses: ['SYNTHETIC-CHEMISTRY', 'SYNTHETIC-UNROUTED'] },
    { reportReferenceToken: 'SYNTHETIC-RPT-003', kind: 'PRELIMINARY', testClasses: ['SYNTHETIC-FITNESS-OUTCOME'] },
    { reportReferenceToken: 'SYNTHETIC-RPT-004', kind: 'FINAL', testClasses: ['SYNTHETIC-CHEMISTRY'] },
  ];
  const distribution = reports.map((report, index) => {
    const declaredMatrix = matrix.map((rule, ruleIndex) => ({ ...rule, allowedTestClasses: [...rule.allowedTestClasses],
      channelType: index === 3 && ruleIndex === 0 ? 'SYNTHETIC-UNKNOWN-CHANNEL' : rule.channelType }));
    const outcome = computeReportDistribution(report, declaredMatrix);
    return { report, matrix: declaredMatrix, outcome,
      explanation: outcome.block ? explainDistributionBlockReason(outcome.block.code) : null,
      nextAction: outcome.block ? explainDistributionBlockNextAction(outcome.block.code) : null };
  });
  const first: ReportAmendment = { versionNumber: 2, supersedesVersion: 1, reasonCode: 'TRANSCRIPTION_ERROR', authorRole: 'LAB_DIRECTOR', timestamp: '2026-01-01T12:00:00.000Z' };
  const chains: ReportAmendment[][] = [
    [{ ...first }, { ...first, versionNumber: 3, supersedesVersion: 2, authorRole: 'QC_REVIEWER', timestamp: '2026-01-02T12:00:00.000Z' }],
    [{ ...first, authorRole: 'FRONT_DESK' }],
    [{ ...first, versionNumber: 3 }],
  ];
  const amendments = chains.map((chain, index) => {
    const reportReferenceToken = `SYNTHETIC-RPT-00${index + 5}`;
    const outcome = applyReportAmendments(reportReferenceToken, chain);
    return { reportReferenceToken, amendments: chain, outcome,
      explanation: outcome.failure ? explainAmendmentChainReason(outcome.failure.code) : null,
      nextAction: outcome.failure ? explainAmendmentChainNextAction(outcome.failure.code) : null };
  });
  return { formats, formatting, distribution, amendments, counts: {
    censoredResults: formatting.filter((row) => row.outcome?.censoring).length,
    blockedReports: distribution.filter((row) => row.outcome.status === 'BLOCKED').length,
    invalidChains: amendments.filter((row) => row.outcome.status === 'INVALID').length,
  } };
}
