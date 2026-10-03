import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildPilotSendoutCancellationCommentsView,
  createPilotSendoutCancellationCommentsFixtures,
  DEMO_AS_OF,
} from '../../lib/ohworks-demo-sendout-cancellation-comments-view';
import { evaluateSendout, explainSendoutReason, explainSendoutNextAction } from '../../lib/ohworks-sendout';
import { decideTestCancellation, explainCancellationGoverningRule, CancellationInputError } from '../../lib/ohworks-test-cancellation';
import { renderResultComments, renderResultComment, explainCommentRenderError, CommentRenderError } from '../../lib/ohworks-result-comments';

test('five send-out scenarios match the real evaluator on exported fixtures', () => {
  const view = buildPilotSendoutCancellationCommentsView();
  const fixtures = createPilotSendoutCancellationCommentsFixtures();
  assert.equal(view.asOf, DEMO_AS_OF);
  assert.equal(fixtures.sendouts.length, 5);

  fixtures.sendouts.forEach(({ id, input }, index) => {
    const expected = evaluateSendout(input, DEMO_AS_OF);
    const actual = view.sendoutRows[index];
    assert.equal(actual.id, id);
    assert.equal(actual.referenceLabId, expected.referenceLabId);
    assert.equal(actual.status, expected.status);
    assert.equal(actual.currentState, expected.currentState ?? null);
    assert.equal(actual.expectedResultDate, expected.expectedResultDate ?? null);
    assert.equal(actual.overdue, expected.overdue);
    assert.equal(actual.daysOverdue, expected.daysOverdue ?? null);
    assert.equal(actual.resultedLate, expected.resultedLate ?? null);
    assert.equal(actual.failureCode, expected.failure?.code ?? null);
    assert.equal(actual.explanation, expected.failure ? explainSendoutReason(expected.failure.code) : null);
    assert.equal(actual.nextAction, expected.failure ? explainSendoutNextAction(expected.failure.code) : null);
  });

  // record 1: shipped and received, not yet due
  assert.equal(view.sendoutRows[0].status, 'VALID');
  assert.equal(view.sendoutRows[0].overdue, false);
  assert.equal(view.sendoutRows[0].resultedLate, null);
  assert.ok(view.sendoutRows[0].expectedResultDate);

  // record 2: received and past the expected date as of DEMO_AS_OF
  assert.equal(view.sendoutRows[1].status, 'VALID');
  assert.equal(view.sendoutRows[1].overdue, true);
  assert.ok((view.sendoutRows[1].daysOverdue ?? 0) > 0);

  // record 3: resulted after the expected date
  assert.equal(view.sendoutRows[2].status, 'VALID');
  assert.equal(view.sendoutRows[2].resultedLate, true);
  assert.equal(view.sendoutRows[2].overdue, false);

  // record 4: prepared -> received_by_reference skips shipped
  assert.equal(view.sendoutRows[3].status, 'INVALID');
  assert.equal(view.sendoutRows[3].failureCode, 'state-skipped');

  // record 5: courier reference changes between shipped and resulted
  assert.equal(view.sendoutRows[4].status, 'INVALID');
  assert.equal(view.sendoutRows[4].failureCode, 'courier-reference-mismatch');
});

test('six cancellation scenarios match the real decision function, including a thrown unresolved role', () => {
  const view = buildPilotSendoutCancellationCommentsView();
  const fixtures = createPilotSendoutCancellationCommentsFixtures();
  assert.equal(fixtures.cancellations.length, 6);

  fixtures.cancellations.slice(0, 5).forEach((request, index) => {
    const expected = decideTestCancellation(request);
    const actual = view.cancellationRows[index];
    assert.equal(actual.token, request.orderReferenceToken);
    assert.equal(actual.stage, request.stage);
    assert.equal(actual.reason, request.reasonCode);
    assert.equal(actual.role, request.requesterRole);
    assert.equal(actual.outcome, expected.outcome);
    assert.equal(actual.governingRule, expected.governingRule);
    assert.equal(actual.explanation, explainCancellationGoverningRule(expected.governingRule));
    assert.equal(actual.creditNoteDue, expected.creditNoteDue);
    assert.equal(actual.amendedReportRequired, expected.amendedReportRequired);
    assert.equal(actual.errorCode, null);
  });

  // request 1: allowed front-line cancellation early in the workflow
  assert.equal(view.cancellationRows[0].outcome, 'allowed');
  assert.equal(view.cancellationRows[0].governingRule, 'role-authorized-within-stage-limit');

  // request 2: refused because the stage is past that role's limit
  assert.equal(view.cancellationRows[1].outcome, 'refused');
  assert.equal(view.cancellationRows[1].governingRule, 'stage-exceeds-role-authority');

  // request 3: refused because the reason is outside that role's allowlist
  assert.equal(view.cancellationRows[2].outcome, 'refused');
  assert.equal(view.cancellationRows[2].governingRule, 'reason-not-authorized-for-role');

  // request 4: lab_director cancellation at reported
  assert.equal(view.cancellationRows[3].outcome, 'allowed');
  assert.equal(view.cancellationRows[3].governingRule, 'director-full-authority');
  assert.equal(view.cancellationRows[3].amendedReportRequired, true);
  assert.equal(view.cancellationRows[3].creditNoteDue, false);

  // request 5: allowed request where creditNoteDue is true
  assert.equal(view.cancellationRows[4].outcome, 'allowed');
  assert.equal(view.cancellationRows[4].creditNoteDue, true);
  assert.equal(view.cancellationRows[4].amendedReportRequired, false);

  // request 6: unknown role string -> unresolved row, not a crash
  const unresolvedRequest = fixtures.cancellations[5];
  const unresolved = view.cancellationRows[5];
  assert.equal(unresolved.token, unresolvedRequest.orderReferenceToken);
  assert.equal(unresolved.outcome, 'unresolved');
  assert.equal(unresolved.governingRule, null);
  assert.equal(unresolved.creditNoteDue, null);
  assert.equal(unresolved.amendedReportRequired, null);
  assert.throws(() => decideTestCancellation(unresolvedRequest), (error: unknown) => {
    assert.ok(error instanceof CancellationInputError);
    assert.equal(unresolved.errorCode, error.code);
    assert.equal(unresolved.explanation, error.message);
    return true;
  });
});

test('coded comments render in priority order and three refused requests surface typed errors, not crashes', () => {
  const view = buildPilotSendoutCancellationCommentsView();
  const fixtures = createPilotSendoutCancellationCommentsFixtures();

  const expectedRendered = renderResultComments(fixtures.commentTable, fixtures.commentRequests);
  assert.deepEqual(view.commentRows, expectedRendered.map((rendered) => ({
    code: rendered.code, priority: rendered.priority, text: rendered.text, errorCode: null, explanation: null,
  })));
  assert.deepEqual(view.commentRows.map((row) => row.priority), [...view.commentRows.map((row) => row.priority)].sort((a, b) => (a ?? 0) - (b ?? 0)));
  assert.deepEqual(view.commentRows.map((row) => row.code), ['REPEAT-CONFIRMED', 'DILUTION-APPLIED', 'SENDOUT-PERFORMED', 'HEMOLYSIS-NOTED']);

  assert.equal(fixtures.refusedCommentRequests.length, 3);
  const expectedErrorCodes: string[] = [];
  fixtures.refusedCommentRequests.forEach((request, index) => {
    assert.throws(() => renderResultComment(fixtures.commentTable, request), (error: unknown) => {
      assert.ok(error instanceof CommentRenderError);
      const actual = view.refusedCommentRows[index];
      assert.equal(actual.code, request.code);
      assert.equal(actual.priority, null);
      assert.equal(actual.text, null);
      assert.equal(actual.errorCode, error.code);
      assert.equal(actual.explanation, explainCommentRenderError(error.code));
      expectedErrorCodes.push(error.code);
      return true;
    });
  });
  assert.deepEqual(expectedErrorCodes, ['unknown-code', 'missing-placeholder-value', 'rendered-comment-too-long']);
});

test('headline counts, explanations and synthetic identifiers cover every fixture and row', () => {
  const view = buildPilotSendoutCancellationCommentsView();
  const fixtures = createPilotSendoutCancellationCommentsFixtures();

  assert.equal(view.counts.sendoutsOverdueOrInvalid, view.sendoutRows.filter((row) => row.status === 'INVALID' || row.overdue).length);
  assert.equal(view.counts.cancellationsRefusedOrUnresolved, view.cancellationRows.filter((row) => row.outcome === 'refused' || row.outcome === 'unresolved').length);
  assert.equal(view.counts.commentsRefused, view.refusedCommentRows.length);
  assert.equal(view.counts.sendoutsOverdueOrInvalid, 3);
  assert.equal(view.counts.cancellationsRefusedOrUnresolved, 3);
  assert.equal(view.counts.commentsRefused, 3);

  for (const row of [...view.sendoutRows, ...view.cancellationRows]) {
    if (row.explanation !== null) assert.ok(row.explanation.trim());
  }
  for (const row of view.refusedCommentRows) assert.ok(row.explanation && row.explanation.trim());

  for (const { id } of fixtures.sendouts) assert.match(id, /^SYNTHETIC-/);
  for (const { orderReferenceToken } of fixtures.cancellations) assert.match(orderReferenceToken, /^SYNTHETIC-/);
  for (const row of view.sendoutRows) assert.match(row.id, /^SYNTHETIC-/);
  for (const row of view.cancellationRows) assert.match(row.token, /^SYNTHETIC-/);
});

test('builder is deterministic, isolated from fixture mutation, and reads no ambient inputs', () => {
  const first = buildPilotSendoutCancellationCommentsView();
  assert.deepEqual(first, buildPilotSendoutCancellationCommentsView());
  const fixtures = createPilotSendoutCancellationCommentsFixtures();
  fixtures.sendouts[0].input.declaredTurnaroundDays = 999 as never;
  fixtures.cancellations[0].stage = 'reported';
  assert.deepEqual(first, buildPilotSendoutCancellationCommentsView());

  const source = readFileSync('lib/ohworks-demo-sendout-cancellation-comments-view.ts', 'utf8');
  assert.doesNotMatch(source, /Date\.now\s*\(|new Date\s*\(\s*\)|Math\.random|process\.env|fetch\s*\(/);
});

test('panel is a read-only server component that renders the builder with required disclosure language', () => {
  const source = readFileSync('app/pilot/ohworks/_components/sendout-cancellation-comments-panel.tsx', 'utf8');
  assert.doesNotMatch(source, /use client/);
  assert.match(source, /fabricated/);
  assert.match(source, /buildPilotSendoutCancellationCommentsView/);
  assert.doesNotMatch(source, /production-ready/i);
  assert.doesNotMatch(source, /live integration is supported/i);
  assert.doesNotMatch(source, /\b(is|are|now)\s+(accredited|certified|validated)\b/i);
});

test('reports page imports and renders SendoutCancellationCommentsPanel exactly once', () => {
  const source = readFileSync('app/pilot/ohworks/reports/page.tsx', 'utf8');
  assert.equal((source.match(/import\s*\{\s*SendoutCancellationCommentsPanel\s*\}\s*from\s*['"]@\/app\/pilot\/ohworks\/_components\/sendout-cancellation-comments-panel['"]/g) ?? []).length, 1);
  assert.equal((source.match(/<SendoutCancellationCommentsPanel\s*\/>/g) ?? []).length, 1);
});
