import {
  evaluateQCWestgardMultirule,
  explainQCWestgardRuleCode,
  type QCWestgardEvaluationInput,
  type QCWestgardLevelStats,
  type QCWestgardRuleCode,
  type QCWestgardRuleSeverity,
  type QCWestgardRunStatus,
} from './ohworks-qc-westgard';

export type PilotQcView = {
  levels: QCWestgardLevelStats[];
  counts: Record<QCWestgardRunStatus, number>;
  runs: {
    runId: string;
    status: QCWestgardRunStatus;
    firedRules: { code: QCWestgardRuleCode; severity: QCWestgardRuleSeverity; explanation: string }[];
    points: { levelId: string; value: number; timestamp: string; sdi: number }[];
  }[];
};

/** Pure local demonstration: every control value, identifier and timestamp is fabricated. */
export function buildPilotQcView(): PilotQcView {
  const levels: QCWestgardLevelStats[] = [
    { levelId: 'SYNTHETIC-LEVEL-1', mean: 100, sd: 5 },
    { levelId: 'SYNTHETIC-LEVEL-2', mean: 200, sd: 10 },
  ];
  // One point per level per run, in fixed chronological evaluation order.
  const fabricatedRuns = [
    { runId: 'SYNTHETIC-RUN-01', timestamp: '2026-01-01T08:00:00.000Z', values: [101.234, 198] },
    { runId: 'SYNTHETIC-RUN-02', timestamp: '2026-01-01T09:00:00.000Z', values: [112.5, 200] },
    { runId: 'SYNTHETIC-RUN-03', timestamp: '2026-01-01T10:00:00.000Z', values: [82.5, 200] },
    { runId: 'SYNTHETIC-RUN-04', timestamp: '2026-01-01T11:00:00.000Z', values: [112.5, 225] },
    { runId: 'SYNTHETIC-RUN-05', timestamp: '2026-01-01T12:00:00.000Z', values: [100, 200] },
    { runId: 'SYNTHETIC-RUN-06', timestamp: '2026-01-01T13:00:00.000Z', values: [98, 203] },
    { runId: 'SYNTHETIC-RUN-07', timestamp: '2026-01-01T14:00:00.000Z', values: [102, 197] },
    { runId: 'SYNTHETIC-RUN-08', timestamp: '2026-01-01T15:00:00.000Z', values: [99, 202] },
    { runId: 'SYNTHETIC-RUN-09', timestamp: '2026-01-01T16:00:00.000Z', values: [101, 198] },
    { runId: 'SYNTHETIC-RUN-10', timestamp: '2026-01-01T17:00:00.000Z', values: [100, 200] },
  ];
  const input: QCWestgardEvaluationInput = {
    levels,
    results: fabricatedRuns.flatMap((run) => levels.map((level, index) => ({
      levelId: level.levelId,
      runId: run.runId,
      value: run.values[index],
      timestamp: run.timestamp,
    }))),
  };
  const outcome = evaluateQCWestgardMultirule(input);
  const counts: PilotQcView['counts'] = { accepted: 0, warning: 0, rejected: 0 };
  const runs = outcome.runs.map((run) => {
    counts[run.status] += 1;
    return {
      runId: run.runId,
      status: run.status,
      firedRules: run.violatedRules.map((firing) => ({
        code: firing.rule,
        severity: firing.severity,
        explanation: explainQCWestgardRuleCode(firing.rule),
      })),
      points: outcome.points.filter((point) => point.runId === run.runId).map((point) => ({
        levelId: point.levelId,
        value: point.value,
        timestamp: input.results[point.position].timestamp,
        sdi: Number(point.sdi.toFixed(2)),
      })),
    };
  });
  return { levels, counts, runs };
}
