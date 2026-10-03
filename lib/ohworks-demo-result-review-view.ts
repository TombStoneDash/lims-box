import {
  runSyntheticLabDay,
  type SyntheticLabDayInput,
  type SyntheticLabDayResultInput,
  type SyntheticLabDayReport,
  type SyntheticLabDayResult,
} from './ohworks-synthetic-lab-day';

export type PilotResultReviewRow = Pick<SyntheticLabDayResult,
  'resultId' | 'specimenId' | 'runId' | 'outcome' | 'holdReasonCodes' | 'trace'> & {
  subjectId: string;
  testCode: string;
  reported: { value: number; unit: string } | null;
  reference: { classification: string; flag: string } | null;
  catalogueVersionId: string | null;
  referenceInterval: { lowerBound: number; upperBound: number } | null;
  turnaround: { status: string; totalMinutes: number | null } | null;
};

export type PilotResultReviewView = {
  rows: PilotResultReviewRow[];
  totals: SyntheticLabDayReport['totals'];
  heldByReason: { code: string; count: number }[];
};

/** All identities, values, limits, windows and timestamps are fabricated examples. */
export function buildPilotResultReviewView(): PilotResultReviewView {
  const result = (id: string, overrides: Partial<SyntheticLabDayResultInput> = {}): SyntheticLabDayResultInput => ({
    resultId: `SYNTHETIC-RES-${id}`, subjectId: `SYNTHETIC-SUBJECT-${id}`,
    specimenId: `SYNTHETIC-SPEC-${id}`, runId: 'SYNTHETIC-RUN-GOOD',
    testCode: 'SYNTHETIC-GLUCOSE', analyteCode: 'GLUCOSE', value: 90,
    instrumentUnit: 'mg/dL', resultTimestamp: '2026-09-19T10:00:00Z',
    limitOfDetection: 0.1, upperLimitOfQuantitation: 30,
    deltaRules: [{ windowMs: 86400000, unit: 'mmol/L', flag: { absolute: 1, percent: null }, block: { absolute: 2, percent: null } }],
    measurementRange: { lowerBound: 0.1, upperBound: 30, unit: 'mmol/L' },
    criticalLimits: { lower: 1, upper: 25, unit: 'mmol/L' },
    instrumentFlags: [], consumptionVolume: 1, ...overrides,
  });
  const results = [
    result('001', { value: 91 }),
    result('002', { runId: 'SYNTHETIC-RUN-BAD' }),
    result('003', { runId: 'SYNTHETIC-RUN-BAD' }),
    result('004', { previousResult: { subjectId: 'SYNTHETIC-SUBJECT-004', analyteCode: 'GLUCOSE', value: 2, unit: 'mmol/L', capturedAt: '2026-09-19T09:00:00Z' } }),
    result('005', { analyteCode: 'SYNTHETIC-UNKNOWN' }),
    result('006', { resultTimestamp: '2026-09-18T10:00:00Z' }),
    result('007'),
    result('008', { consumptionVolume: 11 }),
    result('009'),
  ];
  const input: SyntheticLabDayInput = {
    catalog: [
      { versionId: 'SYNTHETIC-V1', testCode: 'SYNTHETIC-GLUCOSE', methodIdentifier: 'SYNTHETIC-METHOD', units: 'mmol/L', referenceInterval: { lowerBound: 3, upperBound: 4 }, effectiveFrom: '2026-01-01T00:00:00Z', effectiveTo: '2026-09-19T00:00:00Z' },
      { versionId: 'SYNTHETIC-V2', testCode: 'SYNTHETIC-GLUCOSE', methodIdentifier: 'SYNTHETIC-METHOD', units: 'mmol/L', referenceInterval: { lowerBound: 3, upperBound: 6 }, effectiveFrom: '2026-09-19T00:00:00Z' },
    ],
    runs: [10, 14].map((value, index) => {
      const runId = index === 0 ? 'SYNTHETIC-RUN-GOOD' : 'SYNTHETIC-RUN-BAD';
      return { runId, qc: {
        levels: [{ levelId: 'SYNTHETIC-LEVEL', mean: 10, sd: 1 }],
        results: [{ levelId: 'SYNTHETIC-LEVEL', runId, value }],
      } };
    }),
    specimens: results.map((entry) => ({
      volume: { accessionId: entry.specimenId, initialVolume: 10, deadVolume: 0 },
      turnaround: { priorityClass: 'STAT', timestamps: {
        collectedAt: entry.resultTimestamp.replace('10:00', '09:30'),
        receivedAt: entry.resultTimestamp.replace('10:00', '09:40'),
        analyzedAt: entry.resultTimestamp,
        reportedAt: entry.resultTimestamp.replace('10:00', entry.resultId === 'SYNTHETIC-RES-009' ? '12:00' : '10:10'),
      } },
    })),
    results,
  };
  const report = runSyntheticLabDay(input);
  const rows = report.results.map((entry, index): PilotResultReviewRow => ({
    resultId: entry.resultId, subjectId: results[index].subjectId,
    specimenId: entry.specimenId, runId: entry.runId, testCode: results[index].testCode,
    outcome: entry.outcome, holdReasonCodes: entry.holdReasonCodes,
    reported: entry.converted ? { value: Number(entry.converted.value.toFixed(2)), unit: entry.converted.unit } : null,
    reference: entry.referenceRange ? { classification: entry.referenceRange.classification, flag: entry.referenceRange.flag } : null,
    catalogueVersionId: entry.definition?.versionId ?? null,
    referenceInterval: entry.definition?.referenceInterval ?? null,
    turnaround: entry.turnaround ? { status: entry.turnaround.status, totalMinutes: entry.turnaround.totalDurationMinutes } : null,
    trace: entry.trace,
  }));
  return {
    rows, totals: report.totals,
    heldByReason: Object.entries(report.totals.heldByReason).sort(([left], [right]) => left.localeCompare(right))
      .map(([code, count]) => ({ code, count })),
  };
}
