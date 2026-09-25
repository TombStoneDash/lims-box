import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeTurnaroundTime,
  PRIORITY_CLASSES,
  TURNAROUND_STAGES,
  TurnaroundTimeInputError,
  type PausedInterval,
  type PriorityClass,
  type TurnaroundInput,
} from '../../lib/ohworks-turnaround-time';

/**
 * All fabricated: synthetic timestamps on an arbitrary fixture day. None of
 * this represents a real patient, specimen, or lab event.
 */
const BASE_MS = Date.parse('2026-01-01T00:00:00.000Z');

function ts(minutesFromBase: number): string {
  return new Date(BASE_MS + minutesFromBase * 60000).toISOString();
}

const STAGE_TARGET_MINUTES: Record<PriorityClass, [number, number, number]> = {
  ROUTINE: [720, 1440, 720],
  URGENT: [60, 120, 60],
  STAT: [15, 30, 15],
};

function buildInput(
  priorityClass: string,
  stageMinutes: [number, number, number],
  pausedIntervals?: PausedInterval[],
): TurnaroundInput {
  const [c2r, r2a, a2r] = stageMinutes;
  return {
    priorityClass,
    timestamps: {
      collectedAt: ts(0),
      receivedAt: ts(c2r),
      analyzedAt: ts(c2r + r2a),
      reportedAt: ts(c2r + r2a + a2r),
    },
    ...(pausedIntervals ? { pausedIntervals } : {}),
  };
}

test('never reads the wall clock', () => {
  const originalNow = Date.now;
  Date.now = () => {
    throw new Error('Date.now should not be called by a deterministic module');
  };
  try {
    const result = computeTurnaroundTime(buildInput('STAT', [1, 1, 1]));
    assert.equal(result.status, 'on_target');
  } finally {
    Date.now = originalNow;
  }
});

test('reports on_target with the correct stage durations and target total for every priority class', () => {
  for (const priorityClass of PRIORITY_CLASSES) {
    const [c2rTarget, r2aTarget, a2rTarget] = STAGE_TARGET_MINUTES[priorityClass];
    const stageMinutes: [number, number, number] = [c2rTarget * 0.1, r2aTarget * 0.1, a2rTarget * 0.1];
    const result = computeTurnaroundTime(buildInput(priorityClass, stageMinutes));

    assert.equal(result.status, 'on_target');
    assert.equal(result.causingStage, undefined);
    assert.equal(result.priorityClass, priorityClass);
    assert.equal(result.targetTotalMinutes, c2rTarget + r2aTarget + a2rTarget);
    assert.equal(result.totalPausedMinutes, 0);
    assert.deepEqual(
      result.stages.map((s) => s.stage),
      TURNAROUND_STAGES,
    );
    assert.deepEqual(
      result.stages.map((s) => s.durationMinutes),
      stageMinutes,
    );
    assert.equal(
      result.totalDurationMinutes,
      stageMinutes.reduce((a, b) => a + b, 0),
    );
  }
});

test('flags at_risk once the total crosses the risk threshold while still within target, naming the largest-overrun stage', () => {
  // STAT targets: 15 / 30 / 15, total 60, at-risk threshold 48.
  const result = computeTurnaroundTime(buildInput('STAT', [20, 20, 10]));

  assert.equal(result.totalDurationMinutes, 50);
  assert.equal(result.status, 'at_risk');
  assert.equal(result.causingStage, 'collection_to_receipt');
});

test('flags breached once the total exceeds the target, and breaks overrun ties by earliest stage', () => {
  // STAT targets: 15 / 30 / 15. Actual 20 / 25 / 20 = 65 total, overrun of +5 tied
  // between collection_to_receipt and analysis_to_report.
  const result = computeTurnaroundTime(buildInput('STAT', [20, 25, 20]));

  assert.equal(result.totalDurationMinutes, 65);
  assert.equal(result.status, 'breached');
  assert.equal(result.causingStage, 'collection_to_receipt');
});

test('a paused interval inside a single stage reduces that stage and the total, and can pull a breach back to at_risk', () => {
  const paused: PausedInterval[] = [{ startedAt: ts(5), endedAt: ts(15), reason: 'specimen on hold' }];
  const result = computeTurnaroundTime(buildInput('STAT', [20, 25, 20], paused));

  const c2r = result.stages.find((s) => s.stage === 'collection_to_receipt')!;
  assert.equal(c2r.pausedMinutes, 10);
  assert.equal(c2r.durationMinutes, 10);
  assert.equal(result.totalPausedMinutes, 10);
  assert.equal(result.totalDurationMinutes, 55);
  assert.equal(result.status, 'at_risk');
  assert.equal(result.causingStage, 'analysis_to_report');
});

test('a paused interval spanning a stage boundary splits its minutes across both stages', () => {
  const paused: PausedInterval[] = [{ startedAt: ts(15), endedAt: ts(25) }];
  const result = computeTurnaroundTime(buildInput('STAT', [20, 25, 20], paused));

  const c2r = result.stages.find((s) => s.stage === 'collection_to_receipt')!;
  const r2a = result.stages.find((s) => s.stage === 'receipt_to_analysis')!;
  assert.equal(c2r.pausedMinutes, 5);
  assert.equal(r2a.pausedMinutes, 5);
  assert.equal(result.totalPausedMinutes, 10);
});

test('multiple non-overlapping paused intervals within one stage accumulate', () => {
  const paused: PausedInterval[] = [
    { startedAt: ts(22), endedAt: ts(25) },
    { startedAt: ts(30), endedAt: ts(33) },
  ];
  const result = computeTurnaroundTime(buildInput('STAT', [20, 25, 20], paused));

  const r2a = result.stages.find((s) => s.stage === 'receipt_to_analysis')!;
  assert.equal(r2a.pausedMinutes, 6);
  assert.equal(r2a.durationMinutes, 19);
});

test('a paused interval outside every stage window contributes no paused time', () => {
  const paused: PausedInterval[] = [{ startedAt: ts(-100), endedAt: ts(-50) }];
  const result = computeTurnaroundTime(buildInput('STAT', [20, 25, 20], paused));

  assert.equal(result.totalPausedMinutes, 0);
  assert.equal(result.totalDurationMinutes, 65);
});

test('fails closed on duplicate paused intervals instead of silently double-subtracting them', () => {
  const paused: PausedInterval[] = [
    { startedAt: ts(45), endedAt: ts(60) },
    { startedAt: ts(45), endedAt: ts(60) },
  ];
  assert.throws(
    () => computeTurnaroundTime(buildInput('STAT', [15, 30, 15], paused)),
    (error: unknown) => error instanceof TurnaroundTimeInputError && error.code === 'paused-interval-overlap',
  );
});

test('fails closed on a nested paused interval instead of silently double-subtracting it', () => {
  const paused: PausedInterval[] = [
    { startedAt: ts(0), endedAt: ts(30) },
    { startedAt: ts(10), endedAt: ts(20) },
  ];
  assert.throws(
    () => computeTurnaroundTime(buildInput('STAT', [15, 30, 15], paused)),
    (error: unknown) => error instanceof TurnaroundTimeInputError && error.code === 'paused-interval-overlap',
  );
});

test('fails closed on a partially overlapping paused interval instead of silently double-subtracting the overlap', () => {
  const paused: PausedInterval[] = [
    { startedAt: ts(0), endedAt: ts(20) },
    { startedAt: ts(10), endedAt: ts(30) },
  ];
  assert.throws(
    () => computeTurnaroundTime(buildInput('STAT', [15, 30, 15], paused)),
    (error: unknown) => error instanceof TurnaroundTimeInputError && error.code === 'paused-interval-overlap',
  );
});

test('fails closed on overlapping paused intervals declared out of order', () => {
  const paused: PausedInterval[] = [
    { startedAt: ts(10), endedAt: ts(30) },
    { startedAt: ts(0), endedAt: ts(20) },
  ];
  assert.throws(
    () => computeTurnaroundTime(buildInput('STAT', [15, 30, 15], paused)),
    (error: unknown) => error instanceof TurnaroundTimeInputError && error.code === 'paused-interval-overlap',
  );
});

test('preserves valid adjacent paused intervals that merely touch at a shared boundary', () => {
  const paused: PausedInterval[] = [
    { startedAt: ts(0), endedAt: ts(10) },
    { startedAt: ts(10), endedAt: ts(20) },
  ];
  const result = computeTurnaroundTime(buildInput('STAT', [15, 30, 15], paused));

  assert.equal(result.totalPausedMinutes, 20);
  const c2r = result.stages.find((s) => s.stage === 'collection_to_receipt')!;
  assert.equal(c2r.pausedMinutes, 15);
});

test('preserves valid non-overlapping paused intervals across stages, unchanged behavior', () => {
  const paused: PausedInterval[] = [
    { startedAt: ts(5), endedAt: ts(10) },
    { startedAt: ts(22), endedAt: ts(25) },
    { startedAt: ts(30), endedAt: ts(33) },
  ];
  const result = computeTurnaroundTime(buildInput('STAT', [20, 25, 20], paused));

  assert.equal(result.totalPausedMinutes, 11);
  assert.equal(result.totalDurationMinutes, 54);
  assert.equal(result.status, 'at_risk');
});

test('fails closed on a negative raw stage duration from out-of-order timestamps', () => {
  const input = buildInput('STAT', [15, 30, 15]);
  input.timestamps.receivedAt = ts(-5);
  assert.throws(
    () => computeTurnaroundTime(input),
    (error: unknown) =>
      error instanceof TurnaroundTimeInputError &&
      error.code === 'stage-duration-negative' &&
      error.stage === 'collection_to_receipt',
  );
});

test('fails closed on an unrecognized priority class', () => {
  assert.throws(
    () => computeTurnaroundTime(buildInput('SUPER_STAT', [1, 1, 1])),
    (error: unknown) => error instanceof TurnaroundTimeInputError && error.code === 'priority-class-unknown',
  );
});

test('fails closed on a missing stage timestamp', () => {
  const input = buildInput('STAT', [15, 30, 15]);
  (input.timestamps as { analyzedAt?: string }).analyzedAt = undefined;
  assert.throws(
    () => computeTurnaroundTime(input),
    (error: unknown) => error instanceof TurnaroundTimeInputError && error.code === 'timestamps-missing',
  );
});

test('fails closed on a missing timestamps object', () => {
  const input = buildInput('STAT', [15, 30, 15]);
  (input as { timestamps?: unknown }).timestamps = undefined;
  assert.throws(
    () => computeTurnaroundTime(input),
    (error: unknown) => error instanceof TurnaroundTimeInputError && error.code === 'timestamps-missing',
  );
});

test('fails closed on an unparsable stage timestamp', () => {
  const input = buildInput('STAT', [15, 30, 15]);
  input.timestamps.collectedAt = 'not-a-timestamp';
  assert.throws(
    () => computeTurnaroundTime(input),
    (error: unknown) => error instanceof TurnaroundTimeInputError && error.code === 'timestamp-invalid',
  );
});

test('fails closed on a non-UTC (no trailing Z) stage timestamp', () => {
  const input = buildInput('STAT', [15, 30, 15]);
  input.timestamps.reportedAt = '2026-01-01T01:00:00.000';
  assert.throws(
    () => computeTurnaroundTime(input),
    (error: unknown) => error instanceof TurnaroundTimeInputError && error.code === 'timestamp-not-utc',
  );
});

test('fails closed on a stage timestamp naming a nonexistent calendar date instead of normalizing it', () => {
  const input = buildInput('STAT', [15, 30, 15]);
  input.timestamps.collectedAt = '2026-02-30T12:00:00.000Z';
  assert.throws(
    () => computeTurnaroundTime(input),
    (error: unknown) => error instanceof TurnaroundTimeInputError && error.code === 'timestamp-nonexistent-date',
  );
});

test('fails closed on an out-of-range month, which Date.parse cannot parse at all', () => {
  const monthInput = buildInput('STAT', [15, 30, 15]);
  monthInput.timestamps.receivedAt = '2026-13-01T00:00:00.000Z';
  assert.throws(
    () => computeTurnaroundTime(monthInput),
    (error: unknown) => error instanceof TurnaroundTimeInputError && error.code === 'timestamp-invalid',
  );
});

test('fails closed on an out-of-range hour, which Date.parse normalizes into the next day instead of rejecting', () => {
  const hourInput = buildInput('STAT', [15, 30, 15]);
  hourInput.timestamps.reportedAt = '2026-01-02T24:00:00.000Z';
  assert.throws(
    () => computeTurnaroundTime(hourInput),
    (error: unknown) => error instanceof TurnaroundTimeInputError && error.code === 'timestamp-nonexistent-date',
  );
});

test('accepts February 29 on a leap year but rejects it on a non-leap year', () => {
  const leapInput = buildInput('STAT', [1, 2, 1]);
  leapInput.timestamps.collectedAt = '2024-02-29T00:00:00.000Z';
  leapInput.timestamps.receivedAt = '2024-02-29T00:01:00.000Z';
  leapInput.timestamps.analyzedAt = '2024-02-29T00:03:00.000Z';
  leapInput.timestamps.reportedAt = '2024-02-29T00:04:00.000Z';
  const result = computeTurnaroundTime(leapInput);
  assert.equal(result.status, 'on_target');

  const nonLeapInput = buildInput('STAT', [15, 30, 15]);
  nonLeapInput.timestamps.collectedAt = '2026-02-29T00:00:00.000Z';
  assert.throws(
    () => computeTurnaroundTime(nonLeapInput),
    (error: unknown) => error instanceof TurnaroundTimeInputError && error.code === 'timestamp-nonexistent-date',
  );
});

test('fails closed on a paused interval naming a nonexistent calendar date', () => {
  const input = buildInput('STAT', [15, 30, 15], [
    { startedAt: '2026-02-30T00:00:00.000Z', endedAt: ts(10) },
  ]);
  assert.throws(
    () => computeTurnaroundTime(input),
    (error: unknown) => error instanceof TurnaroundTimeInputError && error.code === 'paused-interval-invalid',
  );
});

test('fails closed when paused intervals is not an array', () => {
  const input = buildInput('STAT', [15, 30, 15]);
  (input as { pausedIntervals?: unknown }).pausedIntervals = { startedAt: ts(1), endedAt: ts(2) };
  assert.throws(
    () => computeTurnaroundTime(input),
    (error: unknown) => error instanceof TurnaroundTimeInputError && error.code === 'paused-intervals-not-array',
  );
});

test('fails closed on a paused interval missing a required field', () => {
  const input = buildInput('STAT', [15, 30, 15], [{ startedAt: ts(1) } as PausedInterval]);
  assert.throws(
    () => computeTurnaroundTime(input),
    (error: unknown) => error instanceof TurnaroundTimeInputError && error.code === 'paused-interval-invalid',
  );
});

test('fails closed on a paused interval that ends before it starts', () => {
  const input = buildInput('STAT', [15, 30, 15], [{ startedAt: ts(10), endedAt: ts(5) }]);
  assert.throws(
    () => computeTurnaroundTime(input),
    (error: unknown) => error instanceof TurnaroundTimeInputError && error.code === 'paused-interval-invalid',
  );
});

test('fails closed on a paused interval with a non-UTC timestamp', () => {
  const input = buildInput('STAT', [15, 30, 15], [
    { startedAt: '2026-01-01T00:05:00.000', endedAt: ts(10) },
  ]);
  assert.throws(
    () => computeTurnaroundTime(input),
    (error: unknown) => error instanceof TurnaroundTimeInputError && error.code === 'paused-interval-invalid',
  );
});

test('fails closed on malformed top-level input', () => {
  assert.throws(
    () => computeTurnaroundTime(null as unknown as TurnaroundInput),
    (error: unknown) => error instanceof TurnaroundTimeInputError && error.code === 'input-malformed',
  );
  assert.throws(
    () => computeTurnaroundTime('nope' as unknown as TurnaroundInput),
    (error: unknown) => error instanceof TurnaroundTimeInputError && error.code === 'input-malformed',
  );
});

test('result stage duration objects expose only the documented fields', () => {
  const result = computeTurnaroundTime(buildInput('STAT', [1, 1, 1]));
  for (const stage of result.stages) {
    assert.deepEqual(Object.keys(stage).sort(), ['durationMinutes', 'pausedMinutes', 'stage', 'targetMinutes']);
  }
});
