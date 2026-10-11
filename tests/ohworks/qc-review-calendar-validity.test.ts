import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateQCReleaseDisposition, type QCReviewRun } from '../../lib/ohworks-qc-review';

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
    ],
    observations: [{ controlId: 'CTRL-LEVEL-1', value: 15, observedAt: '2026-01-01T11:30:00.000Z', sequence: 1 }],
    review: {
      reviewer: { reviewerId: 'reviewer-synthetic-9', role: 'technical-reviewer', authorized: true },
      decision: 'accepted',
    },
  };
}

test('an impossible observedAt calendar date blocks release as stale and reordered, not rolled-over fresh', () => {
  const run = baselineRun();
  run.referenceTime = '2026-03-02T12:00:00Z';
  run.requiredControls[0].maxAgeMs = 2 * 60 * 60 * 1000;
  run.observations[0].observedAt = '2026-02-30T11:00:00Z';
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.ok(disposition.reasons.some((r) => r.code === 'control-stale' && r.controlId === 'CTRL-LEVEL-1'));
  assert.ok(disposition.reasons.some((r) => r.code === 'evidence-reordered'));
});

test('an impossible referenceTime calendar date blocks release as stale', () => {
  const run = baselineRun();
  run.referenceTime = '2026-04-31T12:00:00Z';
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, false);
  assert.ok(disposition.reasons.some((r) => r.code === 'control-stale' && r.controlId === 'CTRL-LEVEL-1'));
});

test('a valid run with evidence dated on a leap day is releasable', () => {
  const run = baselineRun();
  run.referenceTime = '2028-02-29T12:30:00.000Z';
  run.observations[0].observedAt = '2028-02-29T12:00:00.000Z';
  const disposition = evaluateQCReleaseDisposition(run);
  assert.equal(disposition.releasable, true);
  assert.deepEqual(disposition.reasons, []);
});
