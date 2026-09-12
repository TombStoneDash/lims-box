import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateQCReleaseDisposition,
  explainQCReleaseBlockReason,
  type QCReleaseBlockCode,
  type QCReviewRun,
} from '../../lib/ohworks-qc-review';

/**
 * All fabricated: synthetic control ids, synthetic operator/reviewer ids,
 * and made-up numeric values. None of this represents a real instrument,
 * customer, or lab result.
 */
function baselineRun(): QCReviewRun {
  return {
    runId: 'run-synthetic-001',
    submittedBy: 'operator-synthetic-1',
    referenceTime: '2026-01-01T12:00:00.000Z',
    requiredControls: [
      {
        controlId: 'CTRL-LEVEL-1',
        label: 'Synthetic Level 1 Control',
        lowerBound: 10,
        upperBound: 20,
        maxAgeMs: 60 * 60 * 1000,
      },
      {
        controlId: 'CTRL-LEVEL-2',
        label: 'Synthetic Level 2 Control',
        lowerBound: 50,
        upperBound: 60,
        maxAgeMs: 60 * 60 * 1000,
      },
    ],
    observations: [
      { controlId: 'CTRL-LEVEL-1', value: 15, observedAt: '2026-01-01T11:30:00.000Z', sequence: 1 },
      { controlId: 'CTRL-LEVEL-2', value: 55, observedAt: '2026-01-01T11:45:00.000Z', sequence: 2 },
    ],
    review: {
      reviewer: { reviewerId: 'reviewer-synthetic-9', role: 'technical-reviewer', authorized: true },
      decision: 'accepted',
    },
  };
}

function clone(run: QCReviewRun): QCReviewRun {
  return JSON.parse(JSON.stringify(run));
}

const ALL_CODES: QCReleaseBlockCode[] = [
  'controls-not-configured',
  'control-invalid-range',
  'control-missing',
  'control-duplicate',
  'control-mismatched',
  'control-non-finite',
  'control-out-of-range',
  'control-stale',
  'reviewer-missing',
  'reviewer-rejected',
  'reviewer-unauthorized',
  'reviewer-self-approved',
  'evidence-reordered',
];

test('a fully compliant fabricated run is releasable with no reasons', () => {
  const disposition = evaluateQCReleaseDisposition(baselineRun());
  assert.equal(disposition.releasable, true);
  assert.deepEqual(disposition.reasons, []);
});

test('evaluation is pure: it does not mutate the input run', () => {
  const run = baselineRun();
  const before = JSON.stringify(run);
  evaluateQCReleaseDisposition(run);
  assert.equal(JSON.stringify(run), before);
});

test('evaluation is deterministic across repeated calls', () => {
  const run = baselineRun();
  const first = evaluateQCReleaseDisposition(run);
  const second = evaluateQCReleaseDisposition(clone(run));
  assert.deepEqual(first, second);
});

test('missing control evidence blocks release', () => {
  const run = baselineRun();
  run.observations = run.observations.filter((o) => o.controlId !== 'CTRL-LEVEL-2');
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.deepEqual(disposition.reasons, [{ code: 'control-missing', controlId: 'CTRL-LEVEL-2' }]);
});

test('duplicate evidence for a single control blocks release, even if identical', () => {
  const run = baselineRun();
  run.observations.push({ controlId: 'CTRL-LEVEL-1', value: 15, observedAt: '2026-01-01T11:46:00.000Z', sequence: 3 });
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.ok(disposition.reasons.some((r) => r.code === 'control-duplicate' && r.controlId === 'CTRL-LEVEL-1'));
});

test('evidence for an unrequired control is reported as mismatched exactly once', () => {
  const run = baselineRun();
  run.observations.push({ controlId: 'CTRL-UNKNOWN', value: 1, observedAt: '2026-01-01T11:46:00.000Z', sequence: 3 });
  run.observations.push({ controlId: 'CTRL-UNKNOWN', value: 2, observedAt: '2026-01-01T11:47:00.000Z', sequence: 4 });
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  const mismatches = disposition.reasons.filter((r) => r.code === 'control-mismatched');
  assert.deepEqual(mismatches, [{ code: 'control-mismatched', controlId: 'CTRL-UNKNOWN' }]);
});

test('a NaN control value is rejected as non-finite', () => {
  const run = baselineRun();
  run.observations[0].value = NaN;
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.ok(disposition.reasons.some((r) => r.code === 'control-non-finite' && r.controlId === 'CTRL-LEVEL-1'));
});

test('an Infinity control value is rejected as non-finite', () => {
  const run = baselineRun();
  run.observations[1].value = Infinity;
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.ok(disposition.reasons.some((r) => r.code === 'control-non-finite' && r.controlId === 'CTRL-LEVEL-2'));
});

test('a value below the lower bound is out of range', () => {
  const run = baselineRun();
  run.observations[0].value = 9.999;
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.ok(disposition.reasons.some((r) => r.code === 'control-out-of-range' && r.controlId === 'CTRL-LEVEL-1'));
});

test('a value above the upper bound is out of range', () => {
  const run = baselineRun();
  run.observations[1].value = 60.001;
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.ok(disposition.reasons.some((r) => r.code === 'control-out-of-range' && r.controlId === 'CTRL-LEVEL-2'));
});

test('values exactly at the bounds are in range', () => {
  const run = baselineRun();
  run.observations[0].value = 10;
  run.observations[1].value = 60;
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, true);
});

test('evidence older than the freshness window is stale', () => {
  const run = baselineRun();
  run.observations[0].observedAt = '2026-01-01T10:00:00.000Z'; // 2h before reference, window is 1h
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.ok(disposition.reasons.some((r) => r.code === 'control-stale' && r.controlId === 'CTRL-LEVEL-1'));
});

test('evidence timestamped after the reference time is treated as stale, not trusted', () => {
  const run = baselineRun();
  run.requiredControls = [run.requiredControls[0]];
  run.observations = [
    { controlId: 'CTRL-LEVEL-1', value: 15, observedAt: '2026-01-01T13:00:00.000Z', sequence: 1 },
  ];
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.deepEqual(disposition.reasons, [{ code: 'control-stale', controlId: 'CTRL-LEVEL-1' }]);
});

test('an unparsable evidence timestamp fails closed as stale and reordered', () => {
  const run = baselineRun();
  run.observations[0].observedAt = 'not-a-timestamp';
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.ok(disposition.reasons.some((r) => r.code === 'control-stale' && r.controlId === 'CTRL-LEVEL-1'));
  assert.ok(disposition.reasons.some((r) => r.code === 'evidence-reordered'));
});

test('evidence out of sequence order is reordered', () => {
  const run = baselineRun();
  run.observations[0].sequence = 2;
  run.observations[1].sequence = 1;
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.ok(disposition.reasons.some((r) => r.code === 'evidence-reordered'));
});

test('evidence whose timestamps regress relative to declared order is reordered', () => {
  const run = baselineRun();
  run.observations[0].observedAt = '2026-01-01T11:45:00.000Z';
  run.observations[1].observedAt = '2026-01-01T11:30:00.000Z';
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.ok(disposition.reasons.some((r) => r.code === 'evidence-reordered'));
});

test('a missing review blocks release', () => {
  const run = baselineRun();
  delete run.review;
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.deepEqual(disposition.reasons, [{ code: 'reviewer-missing' }]);
});

test('a reviewer who rejects the run blocks release', () => {
  const run = baselineRun();
  run.review!.decision = 'rejected';
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.ok(disposition.reasons.some((r) => r.code === 'reviewer-rejected'));
});

test('an unauthorized reviewer blocks release', () => {
  const run = baselineRun();
  run.review!.reviewer.authorized = false;
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.ok(disposition.reasons.some((r) => r.code === 'reviewer-unauthorized'));
});

test('a reviewer without the technical-reviewer role blocks release', () => {
  const run = baselineRun();
  run.review!.reviewer.role = 'operator';
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.ok(disposition.reasons.some((r) => r.code === 'reviewer-unauthorized'));
});

test('a reviewer who is also the submitter is a self-approval and blocks release', () => {
  const run = baselineRun();
  run.review!.reviewer.reviewerId = run.submittedBy;
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.ok(disposition.reasons.some((r) => r.code === 'reviewer-self-approved'));
});

test('a run with no required controls configured fails closed', () => {
  const run = baselineRun();
  run.requiredControls = [];
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.ok(disposition.reasons.some((r) => r.code === 'controls-not-configured'));
});

test('an invalid bounded range (lower bound above upper bound) fails closed', () => {
  const run = baselineRun();
  run.requiredControls[0].lowerBound = 25;
  run.requiredControls[0].upperBound = 20;
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.ok(disposition.reasons.some((r) => r.code === 'control-invalid-range' && r.controlId === 'CTRL-LEVEL-1'));
  assert.ok(!disposition.reasons.some((r) => r.controlId === 'CTRL-LEVEL-1' && r.code !== 'control-invalid-range'));
});

test('a non-finite bound fails closed as an invalid range', () => {
  const run = baselineRun();
  run.requiredControls[0].upperBound = NaN;
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.ok(disposition.reasons.some((r) => r.code === 'control-invalid-range' && r.controlId === 'CTRL-LEVEL-1'));
});

test('a negative freshness window fails closed as an invalid range', () => {
  const run = baselineRun();
  run.requiredControls[0].maxAgeMs = -1;
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.ok(disposition.reasons.some((r) => r.code === 'control-invalid-range' && r.controlId === 'CTRL-LEVEL-1'));
});

test('duplicate required-control definitions with the same id are de-duplicated, not double-counted', () => {
  const run = baselineRun();
  run.requiredControls.push({ ...run.requiredControls[0] });
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, true);
});

test('reasons are reported in deterministic, sorted order regardless of failure order', () => {
  const run = baselineRun();
  run.review!.reviewer.role = 'operator';
  run.observations[0].value = NaN;
  const disposition = evaluateQCReleaseDisposition(run);
  const codes = disposition.reasons.map((r) => r.code);
  const sortedCodes = [...codes].sort();
  assert.deepEqual(codes, sortedCodes);
});

test('a run with many independent defects reports every one, deterministically', () => {
  const brokenRun = baselineRun();
  brokenRun.observations = [
    { controlId: 'CTRL-LEVEL-1', value: NaN, observedAt: '2026-01-01T11:30:00.000Z', sequence: 1 },
    { controlId: 'CTRL-STRAY', value: 1, observedAt: '2026-01-01T11:31:00.000Z', sequence: 2 },
  ];
  delete brokenRun.review;
  const disposition = evaluateQCReleaseDisposition(brokenRun);
  assert.equal(disposition.releasable, false);
  const codes = disposition.reasons.map((r) => r.code).sort();
  assert.deepEqual(codes, [
    'control-mismatched',
    'control-missing',
    'control-non-finite',
    'reviewer-missing',
  ].sort());
});

test('every release block code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_CODES) {
    const message = explainQCReleaseBlockReason({ code, controlId: 'CTRL-LEVEL-1' });
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /CTRL-LEVEL-1/);
    assert.doesNotMatch(message, /operator-synthetic|reviewer-synthetic/);
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(
    explainQCReleaseBlockReason({ code: 'control-stale', controlId: 'CTRL-LEVEL-1' }),
    explainQCReleaseBlockReason({ code: 'control-stale', controlId: 'CTRL-LEVEL-2' }),
  );
});
