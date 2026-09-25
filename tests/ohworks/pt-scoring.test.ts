import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PT_CLASSIFICATIONS,
  PT_QUESTIONABLE_Z_LIMIT,
  PT_SATISFACTORY_Z_LIMIT,
  PtScoringError,
  classifyPtZScore,
  evaluatePtEvent,
  explainPtClassification,
  explainPtEventFailReason,
  explainPtScoringError,
  type PtClassification,
  type PtConsensus,
  type PtEventFailReason,
  type PtEventLimits,
  type PtParticipantResult,
  type PtScoringErrorCode,
} from '../../lib/ohworks-pt-scoring';

/**
 * All fabricated: synthetic participant identifiers and made-up numeric
 * values. None of this represents a real lab, patient, or instrument result.
 */
function baselineLimits(): PtEventLimits {
  return {
    minParticipantsForRobustStatistics: 3,
    minSatisfactoryRate: 0.8,
    maxUnsatisfactoryCount: 0,
  };
}

function baselineConsensus(): PtConsensus {
  return {
    assignedValue: 100,
    acceptableRange: { low: 70, high: 130 }, // width 60 / (2 * 3) => SD = 10
  };
}

function baselineResults(): PtParticipantResult[] {
  return [
    { participantId: 'lab-synthetic-1', reportedValue: 100 }, // z = 0
    { participantId: 'lab-synthetic-2', reportedValue: 105 }, // z = 0.5
    { participantId: 'lab-synthetic-3', reportedValue: 95 }, // z = -0.5
    { participantId: 'lab-synthetic-4', reportedValue: 108 }, // z = 0.8
    { participantId: 'lab-synthetic-5', reportedValue: 92 }, // z = -0.8
  ];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const ALL_ERROR_CODES: PtScoringErrorCode[] = [
  'limits-malformed',
  'results-not-array',
  'results-empty',
  'result-malformed',
  'duplicate-participant-id',
  'reported-value-invalid',
  'consensus-malformed',
  'consensus-range-invalid',
  'consensus-range-zero-width',
  'consensus-missing-insufficient-participants',
  'robust-statistics-zero-spread',
];

const ALL_CLASSIFICATIONS: PtClassification[] = ['satisfactory', 'questionable', 'unsatisfactory'];

const ALL_FAIL_REASONS: PtEventFailReason[] = ['satisfactory-rate-below-minimum', 'unsatisfactory-count-exceeded'];

const FORBIDDEN_WORDS = [/approved/i, /compliant/i, /accredited/i, /releasable/i];

function assertThrowsCode(fn: () => unknown, code: PtScoringErrorCode): void {
  assert.throws(
    fn,
    (error: unknown) => {
      assert.ok(error instanceof PtScoringError);
      assert.equal((error as PtScoringError).code, code);
      return true;
    },
  );
}

test('standard PT acceptance limits are 2 and 3', () => {
  assert.equal(PT_SATISFACTORY_Z_LIMIT, 2);
  assert.equal(PT_QUESTIONABLE_Z_LIMIT, 3);
});

test('classifyPtZScore classifies at and around the standard limits', () => {
  assert.equal(classifyPtZScore(0), 'satisfactory');
  assert.equal(classifyPtZScore(2), 'satisfactory');
  assert.equal(classifyPtZScore(-2), 'satisfactory');
  assert.equal(classifyPtZScore(2.0001), 'questionable');
  assert.equal(classifyPtZScore(3), 'questionable');
  assert.equal(classifyPtZScore(-3), 'questionable');
  assert.equal(classifyPtZScore(3.0001), 'unsatisfactory');
  assert.equal(classifyPtZScore(-3.0001), 'unsatisfactory');
});

test('a well-behaved event with a declared consensus scores each participant and passes', () => {
  const result = evaluatePtEvent(baselineResults(), baselineConsensus(), baselineLimits());
  assert.equal(result.consensusSource, 'declared');
  assert.equal(result.assignedValue, 100);
  assert.equal(result.standardDeviation, 10);
  assert.equal(result.participantScores.length, 5);
  assert.equal(result.participantScores[0].zScore, 0);
  assert.equal(result.participantScores[0].classification, 'satisfactory');
  assert.equal(result.participantScores[3].zScore, 0.8);
  assert.equal(result.participantScores[3].classification, 'satisfactory');
  assert.equal(result.satisfactoryCount, 5);
  assert.equal(result.questionableCount, 0);
  assert.equal(result.unsatisfactoryCount, 0);
  assert.equal(result.satisfactoryRate, 1);
  assert.equal(result.outcome, 'pass');
  assert.deepEqual(result.failReasons, []);
});

test('the standard deviation is derived from the declared range as width / (2 * questionable limit)', () => {
  const consensus: PtConsensus = { assignedValue: 50, acceptableRange: { low: 20, high: 80 } }; // width 60 / 6 = 10
  const result = evaluatePtEvent(
    [{ participantId: 'lab-1', reportedValue: 60 }],
    consensus,
    baselineLimits(),
  );
  assert.equal(result.standardDeviation, 10);
  assert.equal(result.participantScores[0].zScore, 1);
});

test('a questionable result is classified correctly and counted', () => {
  const results: PtParticipantResult[] = [
    { participantId: 'lab-1', reportedValue: 100 },
    { participantId: 'lab-2', reportedValue: 125 }, // z = 2.5 => questionable
  ];
  const limits: PtEventLimits = { minParticipantsForRobustStatistics: 3, minSatisfactoryRate: 0, maxUnsatisfactoryCount: 0 };
  const result = evaluatePtEvent(results, baselineConsensus(), limits);
  assert.equal(result.participantScores[1].classification, 'questionable');
  assert.equal(result.questionableCount, 1);
});

test('an unsatisfactory result is classified correctly and counted', () => {
  const results: PtParticipantResult[] = [
    { participantId: 'lab-1', reportedValue: 100 },
    { participantId: 'lab-2', reportedValue: 140 }, // z = 4 => unsatisfactory
  ];
  const limits: PtEventLimits = { minParticipantsForRobustStatistics: 3, minSatisfactoryRate: 0, maxUnsatisfactoryCount: 5 };
  const result = evaluatePtEvent(results, baselineConsensus(), limits);
  assert.equal(result.participantScores[1].classification, 'unsatisfactory');
  assert.equal(result.unsatisfactoryCount, 1);
});

test('event fails with satisfactory-rate-below-minimum when the satisfactory rate is too low', () => {
  const results: PtParticipantResult[] = [
    { participantId: 'lab-1', reportedValue: 100 },
    { participantId: 'lab-2', reportedValue: 125 }, // questionable
  ];
  const limits: PtEventLimits = { minParticipantsForRobustStatistics: 3, minSatisfactoryRate: 0.75, maxUnsatisfactoryCount: 5 };
  const result = evaluatePtEvent(results, baselineConsensus(), limits);
  assert.equal(result.outcome, 'fail');
  assert.ok(result.failReasons.includes('satisfactory-rate-below-minimum'));
});

test('event fails with unsatisfactory-count-exceeded when unsatisfactory results exceed the declared maximum', () => {
  const results: PtParticipantResult[] = [
    { participantId: 'lab-1', reportedValue: 100 },
    { participantId: 'lab-2', reportedValue: 140 }, // unsatisfactory
  ];
  const limits: PtEventLimits = { minParticipantsForRobustStatistics: 3, minSatisfactoryRate: 0, maxUnsatisfactoryCount: 0 };
  const result = evaluatePtEvent(results, baselineConsensus(), limits);
  assert.equal(result.outcome, 'fail');
  assert.ok(result.failReasons.includes('unsatisfactory-count-exceeded'));
});

test('an event can fail with both reasons at once', () => {
  const results: PtParticipantResult[] = [
    { participantId: 'lab-1', reportedValue: 140 }, // unsatisfactory
    { participantId: 'lab-2', reportedValue: 140 }, // unsatisfactory
  ];
  const limits: PtEventLimits = { minParticipantsForRobustStatistics: 3, minSatisfactoryRate: 0.5, maxUnsatisfactoryCount: 0 };
  const result = evaluatePtEvent(results, baselineConsensus(), limits);
  assert.equal(result.outcome, 'fail');
  assert.equal(result.failReasons.length, 2);
  assert.ok(result.failReasons.includes('satisfactory-rate-below-minimum'));
  assert.ok(result.failReasons.includes('unsatisfactory-count-exceeded'));
});

test('a satisfactory rate exactly at the declared minimum does not fail on that reason', () => {
  const results: PtParticipantResult[] = [
    { participantId: 'lab-1', reportedValue: 100 }, // satisfactory
    { participantId: 'lab-2', reportedValue: 125 }, // questionable
  ];
  const limits: PtEventLimits = { minParticipantsForRobustStatistics: 3, minSatisfactoryRate: 0.5, maxUnsatisfactoryCount: 5 };
  const result = evaluatePtEvent(results, baselineConsensus(), limits);
  assert.equal(result.outcome, 'pass');
});

test('an unsatisfactory count exactly at the declared maximum does not fail on that reason', () => {
  const results: PtParticipantResult[] = [
    { participantId: 'lab-1', reportedValue: 100 },
    { participantId: 'lab-2', reportedValue: 140 }, // unsatisfactory
  ];
  const limits: PtEventLimits = { minParticipantsForRobustStatistics: 3, minSatisfactoryRate: 0, maxUnsatisfactoryCount: 1 };
  const result = evaluatePtEvent(results, baselineConsensus(), limits);
  assert.equal(result.outcome, 'pass');
});

test('a null consensus falls back to robust statistics computed from the declared results', () => {
  const results: PtParticipantResult[] = [
    { participantId: 'lab-1', reportedValue: 98 },
    { participantId: 'lab-2', reportedValue: 100 },
    { participantId: 'lab-3', reportedValue: 102 },
    { participantId: 'lab-4', reportedValue: 100 },
    { participantId: 'lab-5', reportedValue: 104 },
  ];
  const result = evaluatePtEvent(results, null, baselineLimits());
  assert.equal(result.consensusSource, 'robust-statistics');
  // sorted: 98, 100, 100, 102, 104 => median 100
  assert.equal(result.assignedValue, 100);
  // abs deviations: 2, 0, 0, 2, 4 => sorted 0,0,2,2,4 => median 2 => SD = 1.4826 * 2
  assert.equal(result.standardDeviation, 1.4826 * 2);
});

test('robust statistics use the median for an even number of results', () => {
  const results: PtParticipantResult[] = [
    { participantId: 'lab-1', reportedValue: 10 },
    { participantId: 'lab-2', reportedValue: 20 },
    { participantId: 'lab-3', reportedValue: 30 },
    { participantId: 'lab-4', reportedValue: 40 },
  ];
  const limits: PtEventLimits = { minParticipantsForRobustStatistics: 3, minSatisfactoryRate: 0, maxUnsatisfactoryCount: 10 };
  const result = evaluatePtEvent(results, null, limits);
  // median of 10,20,30,40 = 25
  assert.equal(result.assignedValue, 25);
});

test('a null consensus with fewer numeric results than the declared minimum throws consensus-missing-insufficient-participants', () => {
  const results: PtParticipantResult[] = [
    { participantId: 'lab-1', reportedValue: 100 },
    { participantId: 'lab-2', reportedValue: 102 },
  ];
  assertThrowsCode(
    () => evaluatePtEvent(results, null, baselineLimits()),
    'consensus-missing-insufficient-participants',
  );
});

test('robust statistics with zero spread throw robust-statistics-zero-spread', () => {
  const results: PtParticipantResult[] = [
    { participantId: 'lab-1', reportedValue: 100 },
    { participantId: 'lab-2', reportedValue: 100 },
    { participantId: 'lab-3', reportedValue: 100 },
    { participantId: 'lab-4', reportedValue: 100 },
  ];
  assertThrowsCode(() => evaluatePtEvent(results, null, baselineLimits()), 'robust-statistics-zero-spread');
});

test('a declared acceptable range with zero width throws consensus-range-zero-width', () => {
  const consensus: PtConsensus = { assignedValue: 100, acceptableRange: { low: 100, high: 100 } };
  assertThrowsCode(() => evaluatePtEvent(baselineResults(), consensus, baselineLimits()), 'consensus-range-zero-width');
});

test('a declared acceptable range with low above high throws consensus-range-invalid', () => {
  const consensus: PtConsensus = { assignedValue: 100, acceptableRange: { low: 130, high: 70 } };
  assertThrowsCode(() => evaluatePtEvent(baselineResults(), consensus, baselineLimits()), 'consensus-range-invalid');
});

test('a structurally invalid declared consensus throws consensus-malformed', () => {
  assertThrowsCode(
    () => evaluatePtEvent(baselineResults(), {} as unknown as PtConsensus, baselineLimits()),
    'consensus-malformed',
  );
});

test('a declared consensus with a non-finite assigned value throws consensus-malformed', () => {
  const consensus = { assignedValue: Number.POSITIVE_INFINITY, acceptableRange: { low: 70, high: 130 } };
  assertThrowsCode(
    () => evaluatePtEvent(baselineResults(), consensus as unknown as PtConsensus, baselineLimits()),
    'consensus-malformed',
  );
});

test('malformed declared limits throw limits-malformed', () => {
  assertThrowsCode(
    () => evaluatePtEvent(baselineResults(), baselineConsensus(), {} as unknown as PtEventLimits),
    'limits-malformed',
  );
});

test('declared limits with an out-of-range minSatisfactoryRate throw limits-malformed', () => {
  const limits = baselineLimits();
  (limits as unknown as { minSatisfactoryRate: number }).minSatisfactoryRate = 1.5;
  assertThrowsCode(() => evaluatePtEvent(baselineResults(), baselineConsensus(), limits), 'limits-malformed');
});

test('declared limits with a non-integer maxUnsatisfactoryCount throw limits-malformed', () => {
  const limits = baselineLimits();
  (limits as unknown as { maxUnsatisfactoryCount: number }).maxUnsatisfactoryCount = 1.5;
  assertThrowsCode(() => evaluatePtEvent(baselineResults(), baselineConsensus(), limits), 'limits-malformed');
});

test('declared limits with a non-positive minParticipantsForRobustStatistics throw limits-malformed', () => {
  const limits = baselineLimits();
  (limits as unknown as { minParticipantsForRobustStatistics: number }).minParticipantsForRobustStatistics = 0;
  assertThrowsCode(() => evaluatePtEvent(baselineResults(), baselineConsensus(), limits), 'limits-malformed');
});

test('a non-array results input throws results-not-array', () => {
  assertThrowsCode(
    () => evaluatePtEvent('not-an-array' as unknown as PtParticipantResult[], baselineConsensus(), baselineLimits()),
    'results-not-array',
  );
});

test('an empty results array throws results-empty', () => {
  assertThrowsCode(() => evaluatePtEvent([], baselineConsensus(), baselineLimits()), 'results-empty');
});

test('a result missing a participant identifier throws result-malformed', () => {
  const results = baselineResults();
  delete (results[0] as Partial<PtParticipantResult>).participantId;
  assertThrowsCode(() => evaluatePtEvent(results, baselineConsensus(), baselineLimits()), 'result-malformed');
});

test('a duplicate participant identifier throws duplicate-participant-id', () => {
  const results = baselineResults();
  results[1] = { ...results[1], participantId: results[0].participantId };
  assertThrowsCode(() => evaluatePtEvent(results, baselineConsensus(), baselineLimits()), 'duplicate-participant-id');
});

test('a non-numeric reported value throws reported-value-invalid', () => {
  const results = baselineResults();
  (results[0] as unknown as { reportedValue: unknown }).reportedValue = 'not-a-number';
  assertThrowsCode(() => evaluatePtEvent(results, baselineConsensus(), baselineLimits()), 'reported-value-invalid');
});

test('a non-finite reported value throws reported-value-invalid', () => {
  const results = baselineResults();
  (results[0] as unknown as { reportedValue: unknown }).reportedValue = Number.POSITIVE_INFINITY;
  assertThrowsCode(() => evaluatePtEvent(results, baselineConsensus(), baselineLimits()), 'reported-value-invalid');
});

test('a numeric-looking string reported value is accepted as numeric', () => {
  const results = baselineResults();
  (results[0] as unknown as { reportedValue: unknown }).reportedValue = '100';
  const result = evaluatePtEvent(results, baselineConsensus(), baselineLimits());
  assert.equal(result.participantScores[0].reportedValue, 100);
});

test('evaluation is pure: it does not mutate input results, consensus, or limits', () => {
  const results = baselineResults();
  const consensus = baselineConsensus();
  const limits = baselineLimits();
  const beforeResults = JSON.stringify(results);
  const beforeConsensus = JSON.stringify(consensus);
  const beforeLimits = JSON.stringify(limits);
  evaluatePtEvent(results, consensus, limits);
  assert.equal(JSON.stringify(results), beforeResults);
  assert.equal(JSON.stringify(consensus), beforeConsensus);
  assert.equal(JSON.stringify(limits), beforeLimits);
});

test('evaluation is deterministic across repeated calls', () => {
  const results = baselineResults();
  const consensus = baselineConsensus();
  const limits = baselineLimits();
  const first = evaluatePtEvent(results, consensus, limits);
  const second = evaluatePtEvent(clone(results), clone(consensus), clone(limits));
  assert.deepEqual(first, second);
});

test('the returned result is frozen, including the participant scores and fail reasons arrays', () => {
  const result = evaluatePtEvent(baselineResults(), baselineConsensus(), baselineLimits());
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.participantScores));
  assert.ok(Object.isFrozen(result.participantScores[0]));
  assert.ok(Object.isFrozen(result.failReasons));
});

test('an outcome other than pass or fail is never produced', () => {
  const result = evaluatePtEvent(baselineResults(), baselineConsensus(), baselineLimits());
  assert.ok(['pass', 'fail'].includes(result.outcome));
});

test('every classification appears in PT_CLASSIFICATIONS', () => {
  assert.deepEqual([...PT_CLASSIFICATIONS], ALL_CLASSIFICATIONS);
});

test('a typed error message never echoes any submitted participant identifier', () => {
  const results = baselineResults();
  delete (results[0] as Partial<PtParticipantResult>).participantId;
  try {
    evaluatePtEvent(results, baselineConsensus(), baselineLimits());
    assert.fail('expected evaluatePtEvent to throw');
  } catch (error) {
    assert.ok(error instanceof PtScoringError);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch((error as Error).message, pattern);
    }
    assert.doesNotMatch((error as Error).message, /lab-synthetic/);
  }
});

test('every error code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_ERROR_CODES) {
    const message = explainPtScoringError(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /lab-synthetic/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('every classification has a non-empty, privacy-safe explanation', () => {
  for (const classification of ALL_CLASSIFICATIONS) {
    const message = explainPtClassification(classification);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('every event fail reason has a non-empty, privacy-safe explanation', () => {
  for (const reason of ALL_FAIL_REASONS) {
    const message = explainPtEventFailReason(reason);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(explainPtScoringError('results-empty'), explainPtScoringError('results-empty'));
  assert.equal(explainPtClassification('questionable'), explainPtClassification('questionable'));
  assert.equal(
    explainPtEventFailReason('unsatisfactory-count-exceeded'),
    explainPtEventFailReason('unsatisfactory-count-exceeded'),
  );
});

test('no classification, outcome, or fail reason ever uses approval, compliance, accreditation, or release language', () => {
  const outcomes: string[] = ['pass', 'fail'];
  for (const value of [...ALL_CLASSIFICATIONS, ...outcomes, ...ALL_FAIL_REASONS]) {
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(value, pattern);
    }
  }
});
