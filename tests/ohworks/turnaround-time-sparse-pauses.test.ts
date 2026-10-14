import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeTurnaroundTime,
  TurnaroundTimeInputError,
  type PausedInterval,
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

function buildInput(pausedIntervals: PausedInterval[]): TurnaroundInput {
  return {
    priorityClass: 'ROUTINE',
    timestamps: {
      collectedAt: ts(0),
      receivedAt: ts(60),
      analyzedAt: ts(120),
      reportedAt: ts(180),
    },
    pausedIntervals,
  };
}

function assertFailsClosedOnInvalidPausedInterval(pausedIntervals: PausedInterval[]): void {
  assert.throws(
    () => computeTurnaroundTime(buildInput(pausedIntervals)),
    (error: unknown) => error instanceof TurnaroundTimeInputError && error.code === 'paused-interval-invalid',
  );
}

test('fails closed on a sparse pausedIntervals list with a leading hole', () => {
  const paused = new Array(2) as PausedInterval[];
  paused[1] = { startedAt: ts(10), endedAt: ts(20) };
  assertFailsClosedOnInvalidPausedInterval(paused);
});

test('fails closed on a sparse pausedIntervals list with a trailing hole', () => {
  const paused = new Array(2) as PausedInterval[];
  paused[0] = { startedAt: ts(10), endedAt: ts(20) };
  assertFailsClosedOnInvalidPausedInterval(paused);
});

test('fails closed on a pausedIntervals list that is entirely holes', () => {
  const paused = new Array(2) as PausedInterval[];
  assertFailsClosedOnInvalidPausedInterval(paused);
});

test('a dense pausedIntervals list behaves exactly as today', () => {
  const paused: PausedInterval[] = [{ startedAt: ts(10), endedAt: ts(20) }];
  const result = computeTurnaroundTime(buildInput(paused));

  const c2r = result.stages.find((s) => s.stage === 'collection_to_receipt')!;
  assert.equal(c2r.pausedMinutes, 10);
  assert.equal(result.totalPausedMinutes, 10);
});
