import { evaluateSendout, explainSendoutReason, explainSendoutNextAction, type SendoutInput, type SendoutReasonCode, type SendoutState, type SendoutStatus } from './ohworks-sendout';
import { decideTestCancellation, explainCancellationGoverningRule, CancellationInputError, type CancellationRequest, type CancellationGoverningRule, type CancellationInputErrorCode } from './ohworks-test-cancellation';
import { renderResultComments, renderResultComment, explainCommentRenderError, CommentRenderError, type CommentTable, type ResultCommentRequest, type CommentRenderErrorCode } from './ohworks-result-comments';

export const DEMO_AS_OF = '2026-09-19T12:00:00.000Z';

export type PilotSendoutFixture = { id: string; input: SendoutInput };

/** Every reference lab, order token, comment code and timestamp is fabricated. No I/O. */
export function createPilotSendoutCancellationCommentsFixtures(): {
  sendouts: PilotSendoutFixture[];
  cancellations: CancellationRequest[];
  commentTable: CommentTable;
  commentRequests: ResultCommentRequest[];
  refusedCommentRequests: ResultCommentRequest[];
} {
  return {
    sendouts: [
      {
        id: 'SYNTHETIC-SENDOUT-001',
        input: {
          referenceLabId: 'REFLAB_ALPHA', declaredTurnaroundDays: 5,
          events: [
            { state: 'prepared', occurredAt: '2026-09-15T08:00:00.000Z' },
            { state: 'shipped', occurredAt: '2026-09-15T10:00:00.000Z', courierReference: 'SYNTHETIC-CR-001' },
            { state: 'received_by_reference', occurredAt: '2026-09-18T08:00:00.000Z', courierReference: 'SYNTHETIC-CR-001' },
          ],
        },
      },
      {
        id: 'SYNTHETIC-SENDOUT-002',
        input: {
          referenceLabId: 'REFLAB_BRAVO', declaredTurnaroundDays: 3,
          events: [
            { state: 'prepared', occurredAt: '2026-09-08T08:00:00.000Z' },
            { state: 'shipped', occurredAt: '2026-09-08T10:00:00.000Z', courierReference: 'SYNTHETIC-CR-002' },
            { state: 'received_by_reference', occurredAt: '2026-09-10T08:00:00.000Z', courierReference: 'SYNTHETIC-CR-002' },
          ],
        },
      },
      {
        id: 'SYNTHETIC-SENDOUT-003',
        input: {
          referenceLabId: 'REFLAB_CHARLIE', declaredTurnaroundDays: 2,
          events: [
            { state: 'prepared', occurredAt: '2026-09-08T08:00:00.000Z' },
            { state: 'shipped', occurredAt: '2026-09-08T10:00:00.000Z', courierReference: 'SYNTHETIC-CR-003' },
            { state: 'received_by_reference', occurredAt: '2026-09-10T08:00:00.000Z', courierReference: 'SYNTHETIC-CR-003' },
            { state: 'resulted', occurredAt: '2026-09-14T08:00:00.000Z', courierReference: 'SYNTHETIC-CR-003' },
          ],
        },
      },
      {
        id: 'SYNTHETIC-SENDOUT-004',
        input: {
          referenceLabId: 'REFLAB_DELTA', declaredTurnaroundDays: 5,
          events: [
            { state: 'prepared', occurredAt: '2026-09-08T08:00:00.000Z' },
            { state: 'received_by_reference', occurredAt: '2026-09-09T08:00:00.000Z' },
          ],
        },
      },
      {
        id: 'SYNTHETIC-SENDOUT-005',
        input: {
          referenceLabId: 'REFLAB_ALPHA', declaredTurnaroundDays: 4,
          events: [
            { state: 'prepared', occurredAt: '2026-09-08T08:00:00.000Z' },
            { state: 'shipped', occurredAt: '2026-09-08T10:00:00.000Z', courierReference: 'SYNTHETIC-CR-005A' },
            { state: 'received_by_reference', occurredAt: '2026-09-10T08:00:00.000Z', courierReference: 'SYNTHETIC-CR-005A' },
            { state: 'resulted', occurredAt: '2026-09-12T08:00:00.000Z', courierReference: 'SYNTHETIC-CR-005B' },
          ],
        },
      },
    ],
    cancellations: [
      { orderReferenceToken: 'SYNTHETIC-ORDER-001', stage: 'ordered', reasonCode: 'client_requested', requesterRole: 'front_desk' },
      { orderReferenceToken: 'SYNTHETIC-ORDER-002', stage: 'collected', reasonCode: 'client_requested', requesterRole: 'front_desk' },
      { orderReferenceToken: 'SYNTHETIC-ORDER-003', stage: 'collected', reasonCode: 'specimen_compromised', requesterRole: 'billing_admin' },
      { orderReferenceToken: 'SYNTHETIC-ORDER-004', stage: 'reported', reasonCode: 'client_requested', requesterRole: 'lab_director' },
      { orderReferenceToken: 'SYNTHETIC-ORDER-005', stage: 'in_analysis', reasonCode: 'specimen_compromised', requesterRole: 'lab_supervisor' },
      { orderReferenceToken: 'SYNTHETIC-ORDER-006', stage: 'ordered', reasonCode: 'client_requested', requesterRole: 'intern' },
    ],
    commentTable: [
      { code: 'DILUTION-APPLIED', template: 'Result diluted {factor}x prior to analysis.', placeholders: ['factor'], maxLength: 60, priority: 10 },
      { code: 'HEMOLYSIS-NOTED', template: 'Specimen showed hemolysis; interpret with caution.', placeholders: [], maxLength: 80, priority: 20 },
      { code: 'REPEAT-CONFIRMED', template: 'Result confirmed on repeat testing.', placeholders: [], maxLength: 60, priority: 5 },
      { code: 'SENDOUT-PERFORMED', template: 'Testing performed at reference laboratory {referenceLab}.', placeholders: ['referenceLab'], maxLength: 70, priority: 15 },
    ],
    commentRequests: [
      { code: 'SENDOUT-PERFORMED', values: { referenceLab: 'SYNTHETIC-REFLAB-A' } },
      { code: 'DILUTION-APPLIED', values: { factor: '10' } },
      { code: 'HEMOLYSIS-NOTED', values: {} },
      { code: 'REPEAT-CONFIRMED', values: {} },
    ],
    refusedCommentRequests: [
      { code: 'SYNTHETIC-UNKNOWN-CODE', values: {} },
      { code: 'DILUTION-APPLIED', values: {} },
      { code: 'DILUTION-APPLIED', values: { factor: 'X'.repeat(80) } },
    ],
  };
}

export type PilotSendoutRow = {
  id: string;
  referenceLabId: string;
  status: SendoutStatus;
  currentState: SendoutState | null;
  expectedResultDate: string | null;
  overdue: boolean;
  daysOverdue: number | null;
  resultedLate: boolean | null;
  failureCode: SendoutReasonCode | null;
  explanation: string | null;
  nextAction: string | null;
};

export type PilotCancellationRow = {
  token: string;
  stage: string;
  reason: string;
  role: string;
  outcome: 'allowed' | 'refused' | 'unresolved';
  governingRule: CancellationGoverningRule | null;
  explanation: string | null;
  creditNoteDue: boolean | null;
  amendedReportRequired: boolean | null;
  errorCode: CancellationInputErrorCode | null;
};

export type PilotCommentRow = {
  code: string;
  priority: number | null;
  text: string | null;
  errorCode: CommentRenderErrorCode | null;
  explanation: string | null;
};

export type PilotSendoutCancellationCommentsView = {
  asOf: string;
  sendoutRows: PilotSendoutRow[];
  cancellationRows: PilotCancellationRow[];
  commentRows: PilotCommentRow[];
  refusedCommentRows: PilotCommentRow[];
  counts: { sendoutsOverdueOrInvalid: number; cancellationsRefusedOrUnresolved: number; commentsRefused: number };
};

/** Read-only synthetic evaluation of send-out tracking, cancellation authority and coded comments; no backing server or persistence. */
export function buildPilotSendoutCancellationCommentsView(): PilotSendoutCancellationCommentsView {
  const fixtures = createPilotSendoutCancellationCommentsFixtures();

  const sendoutRows: PilotSendoutRow[] = fixtures.sendouts.map(({ id, input }) => {
    const result = evaluateSendout(input, DEMO_AS_OF);
    return {
      id,
      referenceLabId: result.referenceLabId,
      status: result.status,
      currentState: result.currentState ?? null,
      expectedResultDate: result.expectedResultDate ?? null,
      overdue: result.overdue,
      daysOverdue: result.daysOverdue ?? null,
      resultedLate: result.resultedLate ?? null,
      failureCode: result.failure?.code ?? null,
      explanation: result.failure ? explainSendoutReason(result.failure.code) : null,
      nextAction: result.failure ? explainSendoutNextAction(result.failure.code) : null,
    };
  });

  const cancellationRows: PilotCancellationRow[] = fixtures.cancellations.map((request) => {
    try {
      const decision = decideTestCancellation(request);
      return {
        token: request.orderReferenceToken, stage: request.stage, reason: request.reasonCode, role: request.requesterRole,
        outcome: decision.outcome, governingRule: decision.governingRule,
        explanation: explainCancellationGoverningRule(decision.governingRule),
        creditNoteDue: decision.creditNoteDue, amendedReportRequired: decision.amendedReportRequired, errorCode: null,
      };
    } catch (error) {
      if (!(error instanceof CancellationInputError)) throw error;
      return {
        token: request.orderReferenceToken, stage: request.stage, reason: request.reasonCode, role: request.requesterRole,
        outcome: 'unresolved', governingRule: null, explanation: error.message,
        creditNoteDue: null, amendedReportRequired: null, errorCode: error.code,
      };
    }
  });

  const commentRows: PilotCommentRow[] = renderResultComments(fixtures.commentTable, fixtures.commentRequests).map((rendered) => ({
    code: rendered.code, priority: rendered.priority, text: rendered.text, errorCode: null, explanation: null,
  }));

  const refusedCommentRows: PilotCommentRow[] = fixtures.refusedCommentRequests.map((request) => {
    try {
      const rendered = renderResultComment(fixtures.commentTable, request);
      return { code: rendered.code, priority: rendered.priority, text: rendered.text, errorCode: null, explanation: null };
    } catch (error) {
      if (!(error instanceof CommentRenderError)) throw error;
      return { code: request.code, priority: null, text: null, errorCode: error.code, explanation: explainCommentRenderError(error.code) };
    }
  });

  return {
    asOf: DEMO_AS_OF, sendoutRows, cancellationRows, commentRows, refusedCommentRows,
    counts: {
      sendoutsOverdueOrInvalid: sendoutRows.filter((row) => row.status === 'INVALID' || row.overdue).length,
      cancellationsRefusedOrUnresolved: cancellationRows.filter((row) => row.outcome === 'refused' || row.outcome === 'unresolved').length,
      commentsRefused: refusedCommentRows.length,
    },
  };
}
