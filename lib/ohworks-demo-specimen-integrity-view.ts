import {
  evaluateSpecimenStability, explainStabilityCheckReason,
  type StabilityCheckInput, type StabilityCheckOutcome,
} from './ohworks-stability-window';
import {
  evaluateTransportConditions, explainTransportConditionsError, TransportConditionsError,
  type SpecimenTypeTransportLimits, type TransportLog, type TransportDecision,
  type TransportConditionsErrorCode,
} from './ohworks-transport-conditions';

const MINUTE = 60_000;

/** All identities, timestamps, windows, bands and thresholds are fabricated examples. */
export function createPilotSpecimenIntegrityFixtures(): {
  stability: StabilityCheckInput[];
  limits: SpecimenTypeTransportLimits[];
  logs: TransportLog[];
} {
  const collectedAt = '2026-09-19T08:00:00.000Z';
  const windows: StabilityCheckInput['windows'] = [
    { condition: 'refrigerated', maxDurationMs: 120 * MINUTE },
    { condition: 'room-temp', maxDurationMs: 30 * MINUTE },
  ];
  return {
    stability: [
      { specimenId: 'SYNTHETIC-SPEC-INT-001', analyteCode: 'SYNTHETIC-ANALYTE-A', collectedAt,
        resultAt: '2026-09-19T09:00:00.000Z', windows, history: [{ condition: 'refrigerated', at: collectedAt }] },
      { specimenId: 'SYNTHETIC-SPEC-INT-002', analyteCode: 'SYNTHETIC-ANALYTE-A', collectedAt,
        resultAt: '2026-09-19T09:00:00.000Z', windows, history: [{ condition: 'room-temp', at: collectedAt }] },
      { specimenId: 'SYNTHETIC-SPEC-INT-003', analyteCode: 'SYNTHETIC-ANALYTE-A', collectedAt,
        resultAt: '2026-09-19T09:00:00.000Z', windows, history: [
          { condition: 'refrigerated', at: collectedAt }, { condition: 'frozen', at: '2026-09-19T08:30:00.000Z' },
        ] },
      { specimenId: 'SYNTHETIC-SPEC-INT-004', analyteCode: 'SYNTHETIC-ANALYTE-A', collectedAt,
        resultAt: '2026-09-19T09:00:00.000Z', windows,
        history: [{ condition: 'refrigerated', at: '2026-09-19T08:10:00.000Z' }] },
    ],
    limits: [
      { specimenType: 'SYNTHETIC-SERUM', band: { minC: 2, maxC: 8 } },
      { specimenType: 'SYNTHETIC-WHOLE-BLOOD', band: { minC: 18, maxC: 24 } },
    ].map((limit) => ({ ...limit,
      maxAcceptableTotalExcursionMs: 2 * MINUTE, maxAcceptableSingleExcursionMs: 2 * MINUTE,
      maxCommentableTotalExcursionMs: 10 * MINUTE, maxCommentableSingleExcursionMs: 10 * MINUTE,
      maxGapMs: 15 * MINUTE,
    })),
    logs: [
      { specimenId: 'SYNTHETIC-SPEC-INT-005', specimenType: 'SYNTHETIC-SERUM', readings: [
        { value: 4, timestamp: collectedAt }, { value: 6, timestamp: '2026-09-19T08:10:00.000Z' },
      ] },
      { specimenId: 'SYNTHETIC-SPEC-INT-006', specimenType: 'SYNTHETIC-SERUM', readings: [
        { value: 4, timestamp: collectedAt }, { value: 10, timestamp: '2026-09-19T08:05:00.000Z' },
        { value: 11, timestamp: '2026-09-19T08:10:00.000Z' }, { value: 4, timestamp: '2026-09-19T08:15:00.000Z' },
      ] },
      { specimenId: 'SYNTHETIC-SPEC-INT-007', specimenType: 'SYNTHETIC-WHOLE-BLOOD', readings: [
        { value: 22, timestamp: collectedAt }, { value: 28, timestamp: '2026-09-19T08:05:00.000Z' },
        { value: 29, timestamp: '2026-09-19T08:15:00.000Z' }, { value: 28, timestamp: '2026-09-19T08:25:00.000Z' },
        { value: 22, timestamp: '2026-09-19T08:30:00.000Z' },
      ] },
      { specimenId: 'SYNTHETIC-SPEC-INT-008', specimenType: 'SYNTHETIC-WHOLE-BLOOD', readings: [
        { value: 22, timestamp: collectedAt }, { value: 22, timestamp: '2026-09-19T08:30:00.000Z' },
      ] },
    ],
  };
}

export type PilotStabilityRow = Omit<StabilityCheckOutcome, 'segments'> & {
  specimenId: string;
  analyteCode: string;
  explanation: string;
  segments: Array<StabilityCheckOutcome['segments'][number] & { elapsedMinutes: number; windowMinutes: number | null }>;
};

export type PilotTransportRow = {
  specimenId: string;
  specimenType: string;
  readingCount: number;
  excursionCount: number | null;
  totalExcursionMinutes: number | null;
  longestExcursionMinutes: number | null;
  decision: TransportDecision | 'unresolved';
  errorCode: TransportConditionsErrorCode | null;
  explanation: string;
};

export type PilotSpecimenIntegrityView = {
  stabilityRows: PilotStabilityRow[];
  transportRows: PilotTransportRow[];
  notWithinWindowCount: number;
  rejectedOrUnresolvedCount: number;
};

/** Pure, read-only synthetic demonstration; no backing SENAITE connection or persistence. */
export function buildPilotSpecimenIntegrityView(): PilotSpecimenIntegrityView {
  const fixtures = createPilotSpecimenIntegrityFixtures();
  const stabilityRows = fixtures.stability.map((input): PilotStabilityRow => {
    const result = evaluateSpecimenStability(input);
    return { ...result, specimenId: input.specimenId, analyteCode: input.analyteCode,
      explanation: explainStabilityCheckReason(result.reasonCode),
      segments: result.segments.map((segment) => ({ ...segment,
        elapsedMinutes: Math.floor(segment.elapsedMs / MINUTE),
        windowMinutes: segment.windowMs === null ? null : Math.floor(segment.windowMs / MINUTE),
      })),
    };
  });
  const transportRows = fixtures.logs.map((log): PilotTransportRow => {
    try {
      const result = evaluateTransportConditions(fixtures.limits, log);
      const explanations: Record<TransportDecision, string> = {
        acceptable: 'Excursion durations are within the fabricated acceptable thresholds.',
        acceptable_with_comment: 'Excursion durations exceed the fabricated acceptable thresholds but remain within the fabricated commentable thresholds.',
        reject: 'Excursion durations exceed the fabricated commentable thresholds; human review would be required.',
      };
      return { specimenId: result.specimenId, specimenType: result.specimenType,
        readingCount: result.readingCount, excursionCount: result.excursions.length,
        totalExcursionMinutes: Math.floor(result.totalExcursionMs / MINUTE),
        longestExcursionMinutes: Math.floor(result.longestExcursionMs / MINUTE),
        decision: result.decision, errorCode: null, explanation: explanations[result.decision],
      };
    } catch (error) {
      if (!(error instanceof TransportConditionsError) || error.code !== 'gap-too-large') throw error;
      return { specimenId: log.specimenId, specimenType: log.specimenType, readingCount: log.readings.length,
        excursionCount: null, totalExcursionMinutes: null, longestExcursionMinutes: null,
        decision: 'unresolved', errorCode: error.code,
        explanation: `${explainTransportConditionsError(error.code)} The temperature history cannot be trusted.`,
      };
    }
  });
  return { stabilityRows, transportRows,
    notWithinWindowCount: stabilityRows.filter((row) => row.status !== 'within-window').length,
    rejectedOrUnresolvedCount: transportRows.filter((row) => row.decision === 'reject' || row.decision === 'unresolved').length,
  };
}
