import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateQCBracketing,
  explainQCBracketRule,
  QCBracketInputError,
  type QCBracketDecision,
  type QCBracketRuleCode,
  type QCBracketRun,
} from '../../lib/ohworks-qc-bracket';

/**
 * All fabricated: synthetic run/QC/result identifiers and made-up
 * timestamps. None of this represents a real instrument, patient, or
 * customer result.
 */
function baselineRun(): QCBracketRun {
  return {
    runId: 'run-synthetic-1',
    status: 'complete',
    windowMs: 30 * 60 * 1000,
    qcResults: [
      { qcId: 'qc-synthetic-1', level: 'normal', outcome: 'pass', timestamp: '2026-01-01T08:00:00.000Z' },
      { qcId: 'qc-synthetic-2', level: 'normal', outcome: 'pass', timestamp: '2026-01-01T09:00:00.000Z' },
    ],
    patientResults: [{ resultId: 'result-synthetic-1', timestamp: '2026-01-01T08:30:00.000Z' }],
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function decisionFor(decisions: QCBracketDecision[], resultId: string): QCBracketDecision {
  const found = decisions.find((d) => d.resultId === resultId);
  assert.ok(found, `expected a decision for ${resultId}`);
  return found;
}

const ALL_RULE_CODES: QCBracketRuleCode[] = [
  'bracketed-by-passing-qc',
  'no-preceding-qc',
  'preceding-qc-failed',
  'preceding-qc-window-exceeded',
  'trailing-qc-failed',
  'trailing-qc-window-exceeded',
  'trailing-qc-never-arrived',
  'awaiting-trailing-qc',
];

test('a result bracketed by passing QC on both sides within the window is releasable', () => {
  const decisions = evaluateQCBracketing(baselineRun());
  const decision = decisionFor(decisions, 'result-synthetic-1');
  assert.equal(decision.disposition, 'releasable');
  assert.equal(decision.rule, 'bracketed-by-passing-qc');
});

test('evaluation is pure: it does not mutate the input run', () => {
  const run = baselineRun();
  const before = JSON.stringify(run);
  evaluateQCBracketing(run);
  assert.equal(JSON.stringify(run), before);
});

test('evaluation is deterministic across repeated calls', () => {
  const run = baselineRun();
  const first = evaluateQCBracketing(run);
  const second = evaluateQCBracketing(clone(run));
  assert.deepEqual(first, second);
});

test('decisions are returned in the same order patient results were given', () => {
  const run = baselineRun();
  run.patientResults = [
    { resultId: 'result-synthetic-zzz', timestamp: '2026-01-01T08:15:00.000Z' },
    { resultId: 'result-synthetic-aaa', timestamp: '2026-01-01T08:45:00.000Z' },
  ];
  const decisions = evaluateQCBracketing(run);
  assert.deepEqual(
    decisions.map((d) => d.resultId),
    ['result-synthetic-zzz', 'result-synthetic-aaa'],
  );
});

test('a disposition other than the three defined values is never produced', () => {
  const decisions = evaluateQCBracketing(baselineRun());
  for (const decision of decisions) {
    assert.ok(['releasable', 'held_for_repeat_qc', 'rejected'].includes(decision.disposition));
  }
});

test('a result exactly at the window boundary on both sides is still releasable', () => {
  const run = baselineRun();
  run.windowMs = 30 * 60 * 1000;
  run.patientResults = [{ resultId: 'result-synthetic-1', timestamp: '2026-01-01T08:30:00.000Z' }];
  const decisions = evaluateQCBracketing(run);
  assert.equal(decisionFor(decisions, 'result-synthetic-1').disposition, 'releasable');
});

test('a result before any QC event has run is rejected with no-preceding-qc', () => {
  const run = baselineRun();
  run.patientResults = [{ resultId: 'result-synthetic-1', timestamp: '2026-01-01T07:00:00.000Z' }];
  const decisions = evaluateQCBracketing(run);
  const decision = decisionFor(decisions, 'result-synthetic-1');
  assert.equal(decision.disposition, 'rejected');
  assert.equal(decision.rule, 'no-preceding-qc');
});

test('a result whose nearest preceding QC failed is rejected with preceding-qc-failed', () => {
  const run = baselineRun();
  run.qcResults[0].outcome = 'fail';
  const decisions = evaluateQCBracketing(run);
  const decision = decisionFor(decisions, 'result-synthetic-1');
  assert.equal(decision.disposition, 'rejected');
  assert.equal(decision.rule, 'preceding-qc-failed');
});

test('a passing preceding QC outside the window is rejected with preceding-qc-window-exceeded', () => {
  const run = baselineRun();
  run.windowMs = 10 * 60 * 1000; // 10 minutes; the preceding QC is 30 minutes before
  const decisions = evaluateQCBracketing(run);
  const decision = decisionFor(decisions, 'result-synthetic-1');
  assert.equal(decision.disposition, 'rejected');
  assert.equal(decision.rule, 'preceding-qc-window-exceeded');
});

test('a result whose nearest following QC failed is rejected with trailing-qc-failed', () => {
  const run = baselineRun();
  run.qcResults[1].outcome = 'fail';
  const decisions = evaluateQCBracketing(run);
  const decision = decisionFor(decisions, 'result-synthetic-1');
  assert.equal(decision.disposition, 'rejected');
  assert.equal(decision.rule, 'trailing-qc-failed');
});

test('a passing following QC outside the window is rejected with trailing-qc-window-exceeded', () => {
  const run = baselineRun();
  run.qcResults[1].timestamp = '2026-01-01T09:30:00.000Z'; // 60 minutes after the result
  const decisions = evaluateQCBracketing(run);
  const decision = decisionFor(decisions, 'result-synthetic-1');
  assert.equal(decision.disposition, 'rejected');
  assert.equal(decision.rule, 'trailing-qc-window-exceeded');
});

test('a missing trailing QC on a run still in progress is held for repeat QC', () => {
  const run = baselineRun();
  run.status = 'in-progress';
  run.qcResults = [run.qcResults[0]];
  const decisions = evaluateQCBracketing(run);
  const decision = decisionFor(decisions, 'result-synthetic-1');
  assert.equal(decision.disposition, 'held_for_repeat_qc');
  assert.equal(decision.rule, 'awaiting-trailing-qc');
});

test('a missing trailing QC on a completed run is rejected, not held', () => {
  const run = baselineRun();
  run.status = 'complete';
  run.qcResults = [run.qcResults[0]];
  const decisions = evaluateQCBracketing(run);
  const decision = decisionFor(decisions, 'result-synthetic-1');
  assert.equal(decision.disposition, 'rejected');
  assert.equal(decision.rule, 'trailing-qc-never-arrived');
});

test('a broken preceding bracket outranks a broken trailing bracket', () => {
  const run = baselineRun();
  run.qcResults[0].outcome = 'fail';
  run.qcResults[1].outcome = 'fail';
  const decisions = evaluateQCBracketing(run);
  const decision = decisionFor(decisions, 'result-synthetic-1');
  assert.equal(decision.disposition, 'rejected');
  assert.equal(decision.rule, 'preceding-qc-failed');
});

test('an earlier failing QC superseded by a later passing QC before the result still brackets it', () => {
  const run = baselineRun();
  run.qcResults = [
    { qcId: 'qc-synthetic-0', level: 'normal', outcome: 'fail', timestamp: '2026-01-01T07:00:00.000Z' },
    { qcId: 'qc-synthetic-1', level: 'normal', outcome: 'pass', timestamp: '2026-01-01T08:00:00.000Z' },
    { qcId: 'qc-synthetic-2', level: 'normal', outcome: 'pass', timestamp: '2026-01-01T09:00:00.000Z' },
  ];
  const decisions = evaluateQCBracketing(run);
  assert.equal(decisionFor(decisions, 'result-synthetic-1').disposition, 'releasable');
});

test('multiple patient results are each evaluated against their own nearest bracket', () => {
  const run = baselineRun();
  run.qcResults = [
    { qcId: 'qc-synthetic-1', level: 'normal', outcome: 'pass', timestamp: '2026-01-01T08:00:00.000Z' },
    { qcId: 'qc-synthetic-2', level: 'normal', outcome: 'fail', timestamp: '2026-01-01T08:20:00.000Z' },
    { qcId: 'qc-synthetic-3', level: 'normal', outcome: 'pass', timestamp: '2026-01-01T08:40:00.000Z' },
  ];
  run.patientResults = [
    { resultId: 'result-synthetic-before', timestamp: '2026-01-01T08:10:00.000Z' },
    { resultId: 'result-synthetic-after', timestamp: '2026-01-01T08:30:00.000Z' },
  ];
  const decisions = evaluateQCBracketing(run);
  assert.equal(decisionFor(decisions, 'result-synthetic-before').disposition, 'rejected');
  assert.equal(decisionFor(decisions, 'result-synthetic-before').rule, 'trailing-qc-failed');
  assert.equal(decisionFor(decisions, 'result-synthetic-after').disposition, 'rejected');
  assert.equal(decisionFor(decisions, 'result-synthetic-after').rule, 'preceding-qc-failed');
});

test('a QC event whose timestamp exactly matches the result brackets it on both sides', () => {
  const run = baselineRun();
  run.patientResults = [{ resultId: 'result-synthetic-1', timestamp: '2026-01-01T08:00:00.000Z' }];
  const decisions = evaluateQCBracketing(run);
  assert.equal(decisionFor(decisions, 'result-synthetic-1').disposition, 'releasable');
});

test('an empty patient result list produces no decisions and does not throw', () => {
  const run = baselineRun();
  run.patientResults = [];
  assert.deepEqual(evaluateQCBracketing(run), []);
});

test('a run with no QC results at all fails closed with a typed error', () => {
  const run = baselineRun();
  run.qcResults = [];
  assert.throws(
    () => evaluateQCBracketing(run),
    (error: unknown) => {
      assert.ok(error instanceof QCBracketInputError);
      assert.equal((error as QCBracketInputError).code, 'no-qc-results');
      return true;
    },
  );
});

test('out-of-order QC timestamps fail closed with a typed error', () => {
  const run = baselineRun();
  run.qcResults = [
    { qcId: 'qc-synthetic-1', level: 'normal', outcome: 'pass', timestamp: '2026-01-01T09:00:00.000Z' },
    { qcId: 'qc-synthetic-2', level: 'normal', outcome: 'pass', timestamp: '2026-01-01T08:00:00.000Z' },
  ];
  assert.throws(
    () => evaluateQCBracketing(run),
    (error: unknown) => {
      assert.ok(error instanceof QCBracketInputError);
      assert.equal((error as QCBracketInputError).code, 'timestamps-out-of-order');
      return true;
    },
  );
});

test('out-of-order patient result timestamps fail closed with a typed error', () => {
  const run = baselineRun();
  run.patientResults = [
    { resultId: 'result-synthetic-1', timestamp: '2026-01-01T08:45:00.000Z' },
    { resultId: 'result-synthetic-2', timestamp: '2026-01-01T08:15:00.000Z' },
  ];
  assert.throws(
    () => evaluateQCBracketing(run),
    (error: unknown) => {
      assert.ok(error instanceof QCBracketInputError);
      assert.equal((error as QCBracketInputError).code, 'timestamps-out-of-order');
      return true;
    },
  );
});

test('equal consecutive timestamps are not treated as out of order', () => {
  const run = baselineRun();
  run.qcResults[1].timestamp = run.qcResults[0].timestamp;
  run.patientResults = [{ resultId: 'result-synthetic-1', timestamp: run.qcResults[0].timestamp }];
  const decisions = evaluateQCBracketing(run);
  assert.equal(decisionFor(decisions, 'result-synthetic-1').disposition, 'releasable');
});

test('an unknown QC level fails closed with a typed error', () => {
  const run = baselineRun();
  run.qcResults[0].level = 'ultra-high';
  assert.throws(
    () => evaluateQCBracketing(run),
    (error: unknown) => {
      assert.ok(error instanceof QCBracketInputError);
      assert.equal((error as QCBracketInputError).code, 'unknown-qc-level');
      return true;
    },
  );
});

test('an unknown QC outcome fails closed with a typed error', () => {
  const run = baselineRun();
  (run.qcResults[0] as { outcome: string }).outcome = 'inconclusive';
  assert.throws(
    () => evaluateQCBracketing(run),
    (error: unknown) => {
      assert.ok(error instanceof QCBracketInputError);
      assert.equal((error as QCBracketInputError).code, 'unknown-qc-outcome');
      return true;
    },
  );
});

test('an unparsable QC timestamp fails closed with a typed error', () => {
  const run = baselineRun();
  run.qcResults[0].timestamp = 'not-a-timestamp';
  assert.throws(
    () => evaluateQCBracketing(run),
    (error: unknown) => {
      assert.ok(error instanceof QCBracketInputError);
      assert.equal((error as QCBracketInputError).code, 'timestamp-invalid');
      return true;
    },
  );
});

test('an unparsable patient result timestamp fails closed with a typed error', () => {
  const run = baselineRun();
  run.patientResults[0].timestamp = 'not-a-timestamp';
  assert.throws(
    () => evaluateQCBracketing(run),
    (error: unknown) => {
      assert.ok(error instanceof QCBracketInputError);
      assert.equal((error as QCBracketInputError).code, 'timestamp-invalid');
      return true;
    },
  );
});

test('an invalid run status fails closed with a typed error', () => {
  const run = baselineRun();
  (run as { status: string }).status = 'archived';
  assert.throws(
    () => evaluateQCBracketing(run),
    (error: unknown) => {
      assert.ok(error instanceof QCBracketInputError);
      assert.equal((error as QCBracketInputError).code, 'invalid-status');
      return true;
    },
  );
});

test('a negative window fails closed with a typed error', () => {
  const run = baselineRun();
  run.windowMs = -1;
  assert.throws(
    () => evaluateQCBracketing(run),
    (error: unknown) => {
      assert.ok(error instanceof QCBracketInputError);
      assert.equal((error as QCBracketInputError).code, 'invalid-window');
      return true;
    },
  );
});

test('a non-finite window fails closed with a typed error', () => {
  const run = baselineRun();
  run.windowMs = Infinity;
  assert.throws(
    () => evaluateQCBracketing(run),
    (error: unknown) => {
      assert.ok(error instanceof QCBracketInputError);
      assert.equal((error as QCBracketInputError).code, 'invalid-window');
      return true;
    },
  );
});

test('QC results that are not an array fail closed with a typed error', () => {
  const run = baselineRun();
  (run as unknown as { qcResults: unknown }).qcResults = 'not-an-array';
  assert.throws(
    () => evaluateQCBracketing(run),
    (error: unknown) => {
      assert.ok(error instanceof QCBracketInputError);
      assert.equal((error as QCBracketInputError).code, 'qc-results-not-array');
      return true;
    },
  );
});

test('patient results that are not an array fail closed with a typed error', () => {
  const run = baselineRun();
  (run as unknown as { patientResults: unknown }).patientResults = 'not-an-array';
  assert.throws(
    () => evaluateQCBracketing(run),
    (error: unknown) => {
      assert.ok(error instanceof QCBracketInputError);
      assert.equal((error as QCBracketInputError).code, 'patient-results-not-array');
      return true;
    },
  );
});

test('a non-object run fails closed with a typed error', () => {
  assert.throws(
    () => evaluateQCBracketing(null as unknown as QCBracketRun),
    (error: unknown) => {
      assert.ok(error instanceof QCBracketInputError);
      assert.equal((error as QCBracketInputError).code, 'run-not-object');
      return true;
    },
  );
});

test('a QC result missing its identifier fails closed with a typed error', () => {
  const run = baselineRun();
  delete (run.qcResults[0] as Partial<QCBracketRun['qcResults'][number]>).qcId;
  assert.throws(
    () => evaluateQCBracketing(run),
    (error: unknown) => {
      assert.ok(error instanceof QCBracketInputError);
      assert.equal((error as QCBracketInputError).code, 'qc-result-missing-identity');
      return true;
    },
  );
});

test('a patient result missing its identifier fails closed with a typed error', () => {
  const run = baselineRun();
  delete (run.patientResults[0] as Partial<QCBracketRun['patientResults'][number]>).resultId;
  assert.throws(
    () => evaluateQCBracketing(run),
    (error: unknown) => {
      assert.ok(error instanceof QCBracketInputError);
      assert.equal((error as QCBracketInputError).code, 'patient-result-missing-identity');
      return true;
    },
  );
});

test('duplicate QC identifiers fail closed with a typed error', () => {
  const run = baselineRun();
  run.qcResults[1].qcId = run.qcResults[0].qcId;
  assert.throws(
    () => evaluateQCBracketing(run),
    (error: unknown) => {
      assert.ok(error instanceof QCBracketInputError);
      assert.equal((error as QCBracketInputError).code, 'duplicate-qc-id');
      return true;
    },
  );
});

test('duplicate patient result identifiers fail closed with a typed error', () => {
  const run = baselineRun();
  run.patientResults.push({ resultId: 'result-synthetic-1', timestamp: '2026-01-01T08:35:00.000Z' });
  assert.throws(
    () => evaluateQCBracketing(run),
    (error: unknown) => {
      assert.ok(error instanceof QCBracketInputError);
      assert.equal((error as QCBracketInputError).code, 'duplicate-result-id');
      return true;
    },
  );
});

test('a typed input error message never echoes submitted identifiers', () => {
  const run = baselineRun();
  run.qcResults = [];
  try {
    evaluateQCBracketing(run);
    assert.fail('expected evaluateQCBracketing to throw');
  } catch (error) {
    assert.ok(error instanceof QCBracketInputError);
    assert.doesNotMatch((error as Error).message, /run-synthetic|result-synthetic|qc-synthetic/);
  }
});

test('every governing rule has a non-empty, privacy-safe explanation', () => {
  for (const rule of ALL_RULE_CODES) {
    const message = explainQCBracketRule(rule);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /run-synthetic|result-synthetic|qc-synthetic/);
  }
});

test('explanations are stable across repeated calls for the same rule', () => {
  assert.equal(
    explainQCBracketRule('preceding-qc-failed'),
    explainQCBracketRule('preceding-qc-failed'),
  );
});
