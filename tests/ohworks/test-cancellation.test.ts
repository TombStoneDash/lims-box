import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CancellationInputError,
  decideTestCancellation,
  explainCancellationGoverningRule,
  type CancellationGoverningRule,
  type CancellationRequest,
} from '../../lib/ohworks-test-cancellation';

/**
 * All fabricated: synthetic order reference tokens only. None of this
 * represents a real test order, patient, or customer.
 */
function baselineRequest(): CancellationRequest {
  return {
    orderReferenceToken: 'order-synthetic-1',
    stage: 'ordered',
    reasonCode: 'client_requested',
    requesterRole: 'client',
  };
}

const ALL_GOVERNING_RULES: CancellationGoverningRule[] = [
  'director-full-authority',
  'role-authorized-within-stage-limit',
  'reason-not-authorized-for-role',
  'stage-exceeds-role-authority',
];

function assertRequestRejected(request: unknown, code: string) {
  assert.throws(
    () => decideTestCancellation(request),
    (error: unknown) => {
      assert.ok(error instanceof CancellationInputError);
      assert.equal((error as CancellationInputError).code, code);
      return true;
    },
  );
}

// ---------------------------------------------------------------------------
// Golden path
// ---------------------------------------------------------------------------

test('a client requesting cancellation at the ordered stage is allowed with a credit note due and no amended report', () => {
  const decision = decideTestCancellation(baselineRequest());
  assert.equal(decision.outcome, 'allowed');
  assert.equal(decision.governingRule, 'role-authorized-within-stage-limit');
  assert.equal(decision.creditNoteDue, true);
  assert.equal(decision.amendedReportRequired, false);
  assert.equal(decision.orderReferenceToken, 'order-synthetic-1');
});

test('evaluation is pure: it does not mutate the input request', () => {
  const request = baselineRequest();
  const before = JSON.stringify(request);
  decideTestCancellation(request);
  assert.equal(JSON.stringify(request), before);
});

test('evaluation is deterministic across repeated calls', () => {
  const first = decideTestCancellation(baselineRequest());
  const second = decideTestCancellation(baselineRequest());
  assert.deepEqual(first, second);
});

test('an outcome other than the two defined values is never produced', () => {
  const decision = decideTestCancellation(baselineRequest());
  assert.ok(['allowed', 'refused'].includes(decision.outcome));
});

test('a governing rule other than the four defined values is never produced', () => {
  const decision = decideTestCancellation(baselineRequest());
  assert.ok(ALL_GOVERNING_RULES.includes(decision.governingRule));
});

// ---------------------------------------------------------------------------
// LAB_DIRECTOR full authority
// ---------------------------------------------------------------------------

test('a lab_director is allowed to cancel at any stage for any declared reason', () => {
  const stages = ['ordered', 'collected', 'in_analysis', 'resulted', 'reported'];
  const reasons = [
    'client_requested',
    'duplicate_order',
    'billing_hold',
    'test_no_longer_indicated',
    'specimen_compromised',
    'incorrect_test_selected',
    'lab_processing_error',
  ];
  for (const stage of stages) {
    for (const reasonCode of reasons) {
      const decision = decideTestCancellation({
        orderReferenceToken: 'order-synthetic-director',
        stage,
        reasonCode,
        requesterRole: 'lab_director',
      });
      assert.equal(decision.outcome, 'allowed', `expected allowed for ${stage}/${reasonCode}`);
      assert.equal(decision.governingRule, 'director-full-authority');
    }
  }
});

test('a lab_director cancelling a reported order for a lab-side reason still owes a credit note', () => {
  const decision = decideTestCancellation({
    orderReferenceToken: 'order-synthetic-director-2',
    stage: 'reported',
    reasonCode: 'lab_processing_error',
    requesterRole: 'lab_director',
  });
  assert.equal(decision.outcome, 'allowed');
  assert.equal(decision.creditNoteDue, true);
  assert.equal(decision.amendedReportRequired, true);
});

// ---------------------------------------------------------------------------
// Reason authority per role
// ---------------------------------------------------------------------------

test('a client requesting a reason outside their declared authority is refused', () => {
  const decision = decideTestCancellation({
    ...baselineRequest(),
    reasonCode: 'lab_processing_error',
  });
  assert.equal(decision.outcome, 'refused');
  assert.equal(decision.governingRule, 'reason-not-authorized-for-role');
  assert.equal(decision.creditNoteDue, false);
  assert.equal(decision.amendedReportRequired, false);
});

test('a front_desk requester is refused for a specimen_compromised reason, which is outside their authority', () => {
  const decision = decideTestCancellation({
    orderReferenceToken: 'order-synthetic-2',
    stage: 'ordered',
    reasonCode: 'specimen_compromised',
    requesterRole: 'front_desk',
  });
  assert.equal(decision.outcome, 'refused');
  assert.equal(decision.governingRule, 'reason-not-authorized-for-role');
});

test('a billing_admin requester is allowed for billing_hold at the ordered stage', () => {
  const decision = decideTestCancellation({
    orderReferenceToken: 'order-synthetic-3',
    stage: 'ordered',
    reasonCode: 'billing_hold',
    requesterRole: 'billing_admin',
  });
  assert.equal(decision.outcome, 'allowed');
  assert.equal(decision.governingRule, 'role-authorized-within-stage-limit');
});

test('a billing_admin requester is refused for client_requested, which is outside their authority', () => {
  const decision = decideTestCancellation({
    orderReferenceToken: 'order-synthetic-4',
    stage: 'ordered',
    reasonCode: 'client_requested',
    requesterRole: 'billing_admin',
  });
  assert.equal(decision.outcome, 'refused');
  assert.equal(decision.governingRule, 'reason-not-authorized-for-role');
});

test('a lab_supervisor requester is allowed for lab_processing_error at the in_analysis stage', () => {
  const decision = decideTestCancellation({
    orderReferenceToken: 'order-synthetic-5',
    stage: 'in_analysis',
    reasonCode: 'lab_processing_error',
    requesterRole: 'lab_supervisor',
  });
  assert.equal(decision.outcome, 'allowed');
  assert.equal(decision.governingRule, 'role-authorized-within-stage-limit');
});

test('a lab_supervisor requester is refused for billing_hold, which is outside their authority', () => {
  const decision = decideTestCancellation({
    orderReferenceToken: 'order-synthetic-6',
    stage: 'ordered',
    reasonCode: 'billing_hold',
    requesterRole: 'lab_supervisor',
  });
  assert.equal(decision.outcome, 'refused');
  assert.equal(decision.governingRule, 'reason-not-authorized-for-role');
});

// ---------------------------------------------------------------------------
// Stage limit per role
// ---------------------------------------------------------------------------

test('a front_desk requester is allowed at the exact ordered stage boundary', () => {
  const decision = decideTestCancellation({
    orderReferenceToken: 'order-synthetic-7',
    stage: 'ordered',
    reasonCode: 'duplicate_order',
    requesterRole: 'front_desk',
  });
  assert.equal(decision.outcome, 'allowed');
});

test('a front_desk requester is refused one stage past their limit', () => {
  const decision = decideTestCancellation({
    orderReferenceToken: 'order-synthetic-8',
    stage: 'collected',
    reasonCode: 'duplicate_order',
    requesterRole: 'front_desk',
  });
  assert.equal(decision.outcome, 'refused');
  assert.equal(decision.governingRule, 'stage-exceeds-role-authority');
  assert.equal(decision.creditNoteDue, false);
  assert.equal(decision.amendedReportRequired, false);
});

test('a client requester is allowed at the exact collected stage boundary', () => {
  const decision = decideTestCancellation({
    orderReferenceToken: 'order-synthetic-9',
    stage: 'collected',
    reasonCode: 'client_requested',
    requesterRole: 'client',
  });
  assert.equal(decision.outcome, 'allowed');
});

test('a client requester is refused one stage past their limit', () => {
  const decision = decideTestCancellation({
    orderReferenceToken: 'order-synthetic-10',
    stage: 'in_analysis',
    reasonCode: 'client_requested',
    requesterRole: 'client',
  });
  assert.equal(decision.outcome, 'refused');
  assert.equal(decision.governingRule, 'stage-exceeds-role-authority');
});

test('a lab_supervisor requester is allowed at the exact in_analysis stage boundary', () => {
  const decision = decideTestCancellation({
    orderReferenceToken: 'order-synthetic-11',
    stage: 'in_analysis',
    reasonCode: 'specimen_compromised',
    requesterRole: 'lab_supervisor',
  });
  assert.equal(decision.outcome, 'allowed');
});

test('a lab_supervisor requester is refused one stage past their limit', () => {
  const decision = decideTestCancellation({
    orderReferenceToken: 'order-synthetic-12',
    stage: 'resulted',
    reasonCode: 'specimen_compromised',
    requesterRole: 'lab_supervisor',
  });
  assert.equal(decision.outcome, 'refused');
  assert.equal(decision.governingRule, 'stage-exceeds-role-authority');
});

test('a billing_admin requester is refused one stage past their limit', () => {
  const decision = decideTestCancellation({
    orderReferenceToken: 'order-synthetic-13',
    stage: 'in_analysis',
    reasonCode: 'billing_hold',
    requesterRole: 'billing_admin',
  });
  assert.equal(decision.outcome, 'refused');
  assert.equal(decision.governingRule, 'stage-exceeds-role-authority');
});

// ---------------------------------------------------------------------------
// Credit note and amended report consequences
// ---------------------------------------------------------------------------

test('an allowed cancellation before the reported stage never requires an amended report', () => {
  const stages = ['ordered', 'collected', 'in_analysis', 'resulted'];
  for (const stage of stages) {
    const decision = decideTestCancellation({
      orderReferenceToken: 'order-synthetic-14',
      stage,
      reasonCode: 'lab_processing_error',
      requesterRole: 'lab_director',
    });
    assert.equal(decision.amendedReportRequired, false, `expected no amended report at ${stage}`);
  }
});

test('an allowed cancellation at the reported stage always requires an amended report', () => {
  const decision = decideTestCancellation({
    orderReferenceToken: 'order-synthetic-15',
    stage: 'reported',
    reasonCode: 'duplicate_order',
    requesterRole: 'lab_director',
  });
  assert.equal(decision.amendedReportRequired, true);
});

test('a director-approved client_requested cancellation at the reported stage owes no credit note', () => {
  const decision = decideTestCancellation({
    orderReferenceToken: 'order-synthetic-16',
    stage: 'reported',
    reasonCode: 'client_requested',
    requesterRole: 'lab_director',
  });
  assert.equal(decision.outcome, 'allowed');
  assert.equal(decision.creditNoteDue, false);
  assert.equal(decision.amendedReportRequired, true);
});

test('a director-approved billing_hold cancellation at the reported stage still owes a credit note', () => {
  const decision = decideTestCancellation({
    orderReferenceToken: 'order-synthetic-17',
    stage: 'reported',
    reasonCode: 'billing_hold',
    requesterRole: 'lab_director',
  });
  assert.equal(decision.outcome, 'allowed');
  assert.equal(decision.creditNoteDue, true);
});

test('a client_requested cancellation before the reported stage always owes a credit note', () => {
  const decision = decideTestCancellation(baselineRequest());
  assert.equal(decision.creditNoteDue, true);
});

test('a refused cancellation never owes a credit note or requires an amended report', () => {
  const decision = decideTestCancellation({
    orderReferenceToken: 'order-synthetic-18',
    stage: 'reported',
    reasonCode: 'client_requested',
    requesterRole: 'client',
  });
  assert.equal(decision.outcome, 'refused');
  assert.equal(decision.creditNoteDue, false);
  assert.equal(decision.amendedReportRequired, false);
});

// ---------------------------------------------------------------------------
// Fail-closed input validation
// ---------------------------------------------------------------------------

test('a non-object request throws a sanitized typed error', () => {
  assertRequestRejected('not-a-request', 'request-malformed');
});

test('a null request throws a sanitized typed error', () => {
  assertRequestRejected(null, 'request-malformed');
});

test('an array request throws a sanitized typed error', () => {
  assertRequestRejected(['not', 'a', 'request'], 'request-malformed');
});

test('a request missing an order reference token throws a sanitized typed error', () => {
  const request = baselineRequest() as unknown as Record<string, unknown>;
  delete request.orderReferenceToken;
  assertRequestRejected(request, 'order-reference-token-invalid');
});

test('a request with an empty-string order reference token throws a sanitized typed error', () => {
  assertRequestRejected({ ...baselineRequest(), orderReferenceToken: '' }, 'order-reference-token-invalid');
});

test('an unknown stage throws a sanitized typed error', () => {
  assertRequestRejected({ ...baselineRequest(), stage: 'archived' }, 'stage-unknown');
});

test('a missing stage throws a sanitized typed error', () => {
  const request = baselineRequest() as unknown as Record<string, unknown>;
  delete request.stage;
  assertRequestRejected(request, 'stage-unknown');
});

test('an unknown reason code throws a sanitized typed error', () => {
  assertRequestRejected({ ...baselineRequest(), reasonCode: 'client_changed_mind' }, 'reason-code-unknown');
});

test('an unknown requester role throws a sanitized typed error', () => {
  assertRequestRejected({ ...baselineRequest(), requesterRole: 'admin' }, 'role-unknown');
});

test('a request input error message never echoes submitted request data', () => {
  try {
    decideTestCancellation('garbage-request-with-secret-token-abc123');
    assert.fail('expected decideTestCancellation to throw');
  } catch (error) {
    assert.ok(error instanceof CancellationInputError);
    assert.doesNotMatch((error as Error).message, /garbage-request-with-secret-token-abc123/);
  }
});

// ---------------------------------------------------------------------------
// Explanations
// ---------------------------------------------------------------------------

test('every governing rule has a non-empty, privacy-safe explanation', () => {
  for (const rule of ALL_GOVERNING_RULES) {
    const message = explainCancellationGoverningRule(rule);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /order-synthetic/);
  }
});

test('governing rule explanations are stable across repeated calls', () => {
  assert.equal(
    explainCancellationGoverningRule('stage-exceeds-role-authority'),
    explainCancellationGoverningRule('stage-exceeds-role-authority'),
  );
});
