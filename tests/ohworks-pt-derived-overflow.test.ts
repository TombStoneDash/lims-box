import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PtScoringError,
  evaluatePtEvent,
  type PtConsensus,
  type PtEventLimits,
  type PtParticipantResult,
  type PtScoringErrorCode,
} from '../lib/ohworks-pt-scoring';

/**
 * All fabricated: synthetic participant identifiers and made-up numeric
 * values chosen to exercise double-precision overflow at the edges of the
 * representable range. None of this represents a real lab, patient, or
 * instrument result.
 */

function assertThrowsCode(fn: () => unknown, code: PtScoringErrorCode): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof PtScoringError);
    assert.equal((error as PtScoringError).code, code);
    assert.doesNotMatch((error as Error).message, /approved|compliant|accredited|releasable/i);
    return true;
  });
}

test('a reproduced declared-consensus range wide enough to overflow standard deviation throws derived-statistics-invalid, not a pass', () => {
  // high - low = 2e308 overflows double precision before it is divided down to a standard deviation.
  const consensus: PtConsensus = { assignedValue: 0, acceptableRange: { low: -1e308, high: 1e308 } };
  const results: PtParticipantResult[] = [{ participantId: 'lab-synthetic-1', reportedValue: 1e308 }];
  const limits: PtEventLimits = { minParticipantsForRobustStatistics: 1, minSatisfactoryRate: 1, maxUnsatisfactoryCount: 0 };
  assertThrowsCode(() => evaluatePtEvent(results, consensus, limits), 'derived-statistics-invalid');
});

test('robust statistics whose scaled median absolute deviation overflows throw derived-statistics-invalid', () => {
  // Each median pick lands on a single finite element (no summation), so only the
  // ROBUST_SD_SCALE_FACTOR multiplication of the derived MAD (1.3e308) overflows.
  const results: PtParticipantResult[] = [
    { participantId: 'lab-synthetic-1', reportedValue: -1.3e308 },
    { participantId: 'lab-synthetic-2', reportedValue: -1.3e308 },
    { participantId: 'lab-synthetic-3', reportedValue: 0 },
    { participantId: 'lab-synthetic-4', reportedValue: 1.3e308 },
    { participantId: 'lab-synthetic-5', reportedValue: 1.3e308 },
  ];
  const limits: PtEventLimits = { minParticipantsForRobustStatistics: 5, minSatisfactoryRate: 1, maxUnsatisfactoryCount: 0 };
  assertThrowsCode(() => evaluatePtEvent(results, null, limits), 'derived-statistics-invalid');
});

test('a z-score whose numerator overflows even with a finite assigned value and standard deviation throws derived-statistics-invalid', () => {
  // assignedValue and the derived standard deviation are both finite; only
  // (reportedValue - assignedValue) overflows before division.
  const consensus: PtConsensus = {
    assignedValue: -1.3e308,
    acceptableRange: { low: -1.3e308, high: -1.3e308 + 1e295 },
  };
  const results: PtParticipantResult[] = [{ participantId: 'lab-synthetic-1', reportedValue: 1.3e308 }];
  const limits: PtEventLimits = { minParticipantsForRobustStatistics: 1, minSatisfactoryRate: 1, maxUnsatisfactoryCount: 0 };
  assertThrowsCode(() => evaluatePtEvent(results, consensus, limits), 'derived-statistics-invalid');
});

test('ordinary finite declared-consensus scoring is unaffected and still passes', () => {
  const consensus: PtConsensus = { assignedValue: 100, acceptableRange: { low: 70, high: 130 } }; // SD = 10
  const results: PtParticipantResult[] = [
    { participantId: 'lab-synthetic-1', reportedValue: 100 }, // z = 0
    { participantId: 'lab-synthetic-2', reportedValue: 108 }, // z = 0.8
  ];
  const limits: PtEventLimits = { minParticipantsForRobustStatistics: 3, minSatisfactoryRate: 1, maxUnsatisfactoryCount: 0 };
  const result = evaluatePtEvent(results, consensus, limits);
  assert.equal(result.standardDeviation, 10);
  assert.equal(result.participantScores[0].zScore, 0);
  assert.equal(result.participantScores[0].classification, 'satisfactory');
  assert.equal(result.participantScores[1].zScore, 0.8);
  assert.equal(result.participantScores[1].classification, 'satisfactory');
  assert.equal(result.outcome, 'pass');
});

test('ordinary finite robust-statistics scoring is unaffected and still passes', () => {
  const results: PtParticipantResult[] = [
    { participantId: 'lab-synthetic-1', reportedValue: 98 },
    { participantId: 'lab-synthetic-2', reportedValue: 100 },
    { participantId: 'lab-synthetic-3', reportedValue: 102 },
    { participantId: 'lab-synthetic-4', reportedValue: 100 },
    { participantId: 'lab-synthetic-5', reportedValue: 104 },
  ];
  const limits: PtEventLimits = { minParticipantsForRobustStatistics: 3, minSatisfactoryRate: 1, maxUnsatisfactoryCount: 0 };
  const result = evaluatePtEvent(results, null, limits);
  assert.equal(result.consensusSource, 'robust-statistics');
  assert.equal(result.assignedValue, 100);
  assert.equal(result.standardDeviation, 1.4826 * 2);
  assert.equal(result.outcome, 'pass');
});

test('the existing zero-width and zero-spread errors are preserved and take priority over overflow handling', () => {
  const zeroWidthConsensus: PtConsensus = { assignedValue: 100, acceptableRange: { low: 100, high: 100 } };
  assertThrowsCode(
    () => evaluatePtEvent([{ participantId: 'lab-synthetic-1', reportedValue: 100 }], zeroWidthConsensus, {
      minParticipantsForRobustStatistics: 1,
      minSatisfactoryRate: 1,
      maxUnsatisfactoryCount: 0,
    }),
    'consensus-range-zero-width',
  );

  const zeroSpreadResults: PtParticipantResult[] = [
    { participantId: 'lab-synthetic-1', reportedValue: 100 },
    { participantId: 'lab-synthetic-2', reportedValue: 100 },
    { participantId: 'lab-synthetic-3', reportedValue: 100 },
  ];
  assertThrowsCode(
    () =>
      evaluatePtEvent(zeroSpreadResults, null, {
        minParticipantsForRobustStatistics: 3,
        minSatisfactoryRate: 1,
        maxUnsatisfactoryCount: 0,
      }),
    'robust-statistics-zero-spread',
  );
});

test('an overflowing event never produces a pass outcome or a published participant score', () => {
  const consensus: PtConsensus = { assignedValue: 0, acceptableRange: { low: -1e308, high: 1e308 } };
  const results: PtParticipantResult[] = [{ participantId: 'lab-synthetic-1', reportedValue: 1e308 }];
  const limits: PtEventLimits = { minParticipantsForRobustStatistics: 1, minSatisfactoryRate: 1, maxUnsatisfactoryCount: 0 };
  let thrown = false;
  try {
    evaluatePtEvent(results, consensus, limits);
  } catch (error) {
    thrown = true;
    assert.ok(error instanceof PtScoringError);
    assert.equal((error as PtScoringError).code, 'derived-statistics-invalid');
  }
  assert.ok(thrown, 'expected evaluatePtEvent to throw rather than return a partial or passing result');
});
