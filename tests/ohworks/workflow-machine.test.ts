import assert from 'node:assert/strict';
import { test } from 'node:test';

import { workflowCases } from '../../fixtures/ohworks/supervised-demo';
import { evaluateWorkflowCase, transitionWorkflowState } from '../../lib/ohworks-pilot';

test('ingest transitions from queued can only yield instrument result or quarantined', () => {
  const queuedCase = workflowCases.find((workflowCase) => workflowCase.sampleId === 'OW-SYN-S2-10062');
  assert.ok(queuedCase);

  const accepted = transitionWorkflowState('Queued', queuedCase.events[1], queuedCase.events.slice(0, 1));
  assert.deepEqual(accepted, {
    allowed: true,
    nextState: 'Instrument result',
    reason: 'approved_mapping_and_parser',
  });

  const unknownMappingCase = workflowCases.find((workflowCase) => workflowCase.sampleId === 'OW-SYN-S2-10063');
  assert.ok(unknownMappingCase);
  const quarantinedUnknown = transitionWorkflowState('Queued', unknownMappingCase.events[1], unknownMappingCase.events.slice(0, 1));
  assert.deepEqual(quarantinedUnknown, {
    allowed: true,
    nextState: 'Quarantined',
    reason: 'unknown_mapping',
  });

  const malformedCase = workflowCases.find((workflowCase) => workflowCase.sampleId === 'OW-SYN-S2-10064');
  assert.ok(malformedCase);
  const quarantinedMalformed = transitionWorkflowState('Queued', malformedCase.events[1], malformedCase.events.slice(0, 1));
  assert.deepEqual(quarantinedMalformed, {
    allowed: true,
    nextState: 'Quarantined',
    reason: 'malformed_message',
  });
});

test('worker and employer roles cannot record technical review or release', () => {
  const workerReview = transitionWorkflowState(
    'Instrument result',
    {
      id: 'ohworks-event-invalid-review-worker-001',
      kind: 'technical_review',
      at: '2026-09-03T18:00:00Z',
      actorId: 'ohworks-actor-receiving-worker-001',
      actorRole: 'worker',
      authorized: true,
      note: 'Invalid synthetic worker review attempt.',
    },
    [],
  );
  assert.equal(workerReview.allowed, false);
  assert.equal(workerReview.reason, 'only_quality_or_admin_can_review');

  const employerRelease = transitionWorkflowState(
    'Technical review',
    {
      id: 'ohworks-event-invalid-release-employer-001',
      kind: 'release',
      at: '2026-09-03T18:01:00Z',
      actorId: 'ohworks-actor-employer-sponsor-001',
      actorRole: 'employer',
      authorized: true,
      reviewReferenceId: 'ohworks-event-review-10065',
      note: 'Invalid synthetic employer release attempt.',
    },
    [
      {
        id: 'ohworks-event-review-10065',
        kind: 'technical_review',
        at: '2026-09-03T16:42:00Z',
        actorId: 'ohworks-actor-technical-reviewer-001',
        actorRole: 'quality',
        authorized: true,
        note: 'Synthetic review reference.',
      },
    ],
  );
  assert.equal(employerRelease.allowed, false);
  assert.equal(employerRelease.reason, 'only_quality_or_admin_can_release');
});

test('release is blocked from pre-review states even for reviewer roles', () => {
  for (const state of ['Accessioned', 'Queued', 'Instrument result', 'Quarantined'] as const) {
    const result = transitionWorkflowState(
      state,
      {
        id: `ohworks-event-invalid-release-${state.toLowerCase().replaceAll(' ', '-')}`,
        kind: 'release',
        at: '2026-09-03T18:02:00Z',
        actorId: 'ohworks-actor-technical-reviewer-001',
        actorRole: 'quality',
        authorized: true,
        reviewReferenceId: 'ohworks-event-review-valid-001',
        note: 'Invalid synthetic release attempt.',
      },
      [
        {
          id: 'ohworks-event-review-valid-001',
          kind: 'technical_review',
          at: '2026-09-03T17:02:00Z',
          actorId: 'ohworks-actor-technical-reviewer-001',
          actorRole: 'quality',
          authorized: true,
          note: 'Synthetic review reference.',
        },
      ],
    );

    assert.equal(result.allowed, false, state);
    assert.equal(result.reason, 'release_requires_technical_review_state', state);
  }
});

test('released sample requires a distinct prior authorized technical-review event', () => {
  const releasedCase = workflowCases.find((workflowCase) => workflowCase.sampleId === 'OW-SYN-S2-10065');
  assert.ok(releasedCase);

  const evaluation = evaluateWorkflowCase(releasedCase);
  assert.equal(evaluation.valid, true);
  assert.equal(evaluation.finalState, 'Released');
  assert.equal(evaluation.reviewEventId, 'ohworks-event-review-10065');

  const invalidRelease = transitionWorkflowState(
    'Technical review',
    {
      id: 'ohworks-event-release-missing-ref-001',
      kind: 'release',
      at: '2026-09-03T18:03:00Z',
      actorId: 'ohworks-actor-technical-reviewer-001',
      actorRole: 'quality',
      authorized: true,
      reviewReferenceId: 'ohworks-event-review-missing-001',
      note: 'Missing review reference.',
    },
    [],
  );
  assert.equal(invalidRelease.allowed, false);
  assert.equal(invalidRelease.reason, 'release_requires_distinct_prior_authorized_review');
});
