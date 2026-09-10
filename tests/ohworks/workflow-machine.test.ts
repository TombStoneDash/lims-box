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
      sampleId: 'OW-SYN-S2-TEST-001',
      workflowRecordId: 'ohworks-record-test-001',
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
  assert.equal(workerReview.reason, 'only_quality_reviewer_can_review');

  const employerRelease = transitionWorkflowState(
    'Technical review',
    {
      id: 'ohworks-event-invalid-release-employer-001',
      sampleId: 'OW-SYN-S2-10065',
      workflowRecordId: 'ohworks-record-sample-006',
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
        sampleId: 'OW-SYN-S2-10065',
        workflowRecordId: 'ohworks-record-sample-006',
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
  assert.equal(employerRelease.reason, 'only_quality_reviewer_can_release');
});

test('release is blocked from pre-review states even for reviewer roles', () => {
  for (const state of ['Accessioned', 'Queued', 'Instrument result', 'Quarantined'] as const) {
    const result = transitionWorkflowState(
      state,
      {
        id: `ohworks-event-invalid-release-${state.toLowerCase().replaceAll(' ', '-')}`,
        sampleId: 'OW-SYN-S2-TEST-002',
        workflowRecordId: 'ohworks-record-test-002',
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
          sampleId: 'OW-SYN-S2-TEST-002',
          workflowRecordId: 'ohworks-record-test-002',
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
      sampleId: 'OW-SYN-S2-10065',
      workflowRecordId: 'ohworks-record-sample-006',
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

test('structured ingestion quarantines forged parser, mapping, actor, source, and cross-sample evidence', () => {
  const queued = workflowCases.find((workflowCase) => workflowCase.sampleId === 'OW-SYN-S2-10062');
  assert.ok(queued);
  const validEvent = queued.events[1];
  const history = queued.events.slice(0, 1);

  for (const forged of [
    { ...validEvent, parserVersionId: 'unapproved-parser' },
    { ...validEvent, mappingVersionId: 'unapproved-mapping' },
    { ...validEvent, actorId: 'ohworks-actor-employer-sponsor-001', actorRole: 'employer' as const },
    { ...validEvent, messageSourceId: 'unapproved-source' },
    { ...validEvent, sampleId: 'OW-SYN-S2-10065' },
  ]) {
    const result = transitionWorkflowState('Queued', forged, history);
    assert.notEqual(result.nextState, 'Instrument result');
  }
});

test('release rejects forged, cross-sample, admin, duplicate, and non-chronological review evidence', () => {
  const released = workflowCases.find((workflowCase) => workflowCase.sampleId === 'OW-SYN-S2-10065');
  assert.ok(released);
  const release = released.events[3];
  const history = released.events.slice(0, 3);

  const attacks = [
    history.map((entry) => entry.id === release.reviewReferenceId ? { ...entry, actorRole: 'worker' as const } : entry),
    history.map((entry) => entry.id === release.reviewReferenceId ? { ...entry, sampleId: 'OW-SYN-S2-OTHER' } : entry),
    history.map((entry) => entry.id === release.reviewReferenceId ? { ...entry, workflowRecordId: 'other-record' } : entry),
    history.map((entry) => entry.id === release.reviewReferenceId ? { ...entry, at: '2026-09-03T16:57:00Z' } : entry),
    [...history, history[2]],
  ];

  for (const forgedHistory of attacks) {
    const result = transitionWorkflowState('Technical review', release, forgedHistory);
    assert.equal(result.allowed, false);
  }

  const adminReview = transitionWorkflowState('Instrument result', {
    ...history[2],
    id: 'ohworks-event-admin-review-10065',
    actorId: 'ohworks-actor-admin-observer-001',
    actorRole: 'admin',
  }, history.slice(0, 2));
  assert.equal(adminReview.allowed, false);
  assert.equal(adminReview.reason, 'only_quality_reviewer_can_review');
});
