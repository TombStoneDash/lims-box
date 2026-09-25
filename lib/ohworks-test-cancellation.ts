/**
 * Fail-closed, deterministic OHWorks test order cancellation rules for the
 * synthetic pilot.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated test
 * order's current workflow stage, a cancellation reason code from a bounded
 * declared list, and a bounded requester role, it decides whether the
 * cancellation is `allowed` or `refused`, names the single governing rule
 * that produced the decision, and states whether a credit note is due and
 * whether an amended report is required. It performs no I/O, touches no
 * real order, patient, or customer data, and never mutates anything outside
 * its own return value.
 *
 * Authority is a strict allowlist: every requester role only has authority
 * over a bounded set of reason codes and only up to a bounded maximum
 * workflow stage, except LAB_DIRECTOR, who has full authority over every
 * reason code at every stage. Nothing is inferred beyond these declared
 * bounds. An unrecognized stage, reason code, or requester role always
 * throws a typed error instead of guessing at a decision.
 */

/** The only workflow stages this evaluator recognizes, in pipeline order. */
export type TestOrderStage = 'ordered' | 'collected' | 'in_analysis' | 'resulted' | 'reported';

/** Bounded, declared cancellation reason codes this module knows how to evaluate. */
export type CancellationReasonCode =
  | 'client_requested'
  | 'duplicate_order'
  | 'billing_hold'
  | 'test_no_longer_indicated'
  | 'specimen_compromised'
  | 'incorrect_test_selected'
  | 'lab_processing_error';

/** Bounded requester roles this module recognizes. */
export type RequesterRole = 'client' | 'front_desk' | 'billing_admin' | 'lab_supervisor' | 'lab_director';

const STAGE_INDEX: Record<TestOrderStage, number> = {
  ordered: 0,
  collected: 1,
  in_analysis: 2,
  resulted: 3,
  reported: 4,
};

const KNOWN_STAGES: ReadonlySet<string> = new Set<TestOrderStage>(Object.keys(STAGE_INDEX) as TestOrderStage[]);

const KNOWN_REASON_CODES: ReadonlySet<string> = new Set<CancellationReasonCode>([
  'client_requested',
  'duplicate_order',
  'billing_hold',
  'test_no_longer_indicated',
  'specimen_compromised',
  'incorrect_test_selected',
  'lab_processing_error',
]);

const KNOWN_ROLES: ReadonlySet<string> = new Set<RequesterRole>([
  'client',
  'front_desk',
  'billing_admin',
  'lab_supervisor',
  'lab_director',
]);

/**
 * The bounded set of reason codes each non-director role has authority to
 * request a cancellation for. LAB_DIRECTOR is listed for documentation
 * completeness only: it is never consulted, because a lab_director request
 * always short-circuits to full authority.
 */
const ROLE_REASON_AUTHORITY: Record<RequesterRole, ReadonlySet<CancellationReasonCode>> = {
  client: new Set<CancellationReasonCode>(['client_requested', 'duplicate_order', 'test_no_longer_indicated', 'incorrect_test_selected']),
  front_desk: new Set<CancellationReasonCode>(['client_requested', 'duplicate_order', 'incorrect_test_selected']),
  billing_admin: new Set<CancellationReasonCode>(['billing_hold', 'duplicate_order']),
  lab_supervisor: new Set<CancellationReasonCode>([
    'client_requested',
    'duplicate_order',
    'test_no_longer_indicated',
    'specimen_compromised',
    'incorrect_test_selected',
    'lab_processing_error',
  ]),
  lab_director: new Set<CancellationReasonCode>(KNOWN_REASON_CODES as ReadonlySet<CancellationReasonCode>),
};

/**
 * The latest workflow stage, inclusive, at which each non-director role
 * still has authority to request a cancellation. LAB_DIRECTOR is listed for
 * documentation completeness only; see ROLE_REASON_AUTHORITY.
 */
const ROLE_STAGE_LIMIT: Record<RequesterRole, TestOrderStage> = {
  client: 'collected',
  front_desk: 'ordered',
  billing_admin: 'collected',
  lab_supervisor: 'in_analysis',
  lab_director: 'reported',
};

export type CancellationOutcome = 'allowed' | 'refused';

/** The single rule that decided a cancellation outcome. */
export type CancellationGoverningRule =
  | 'director-full-authority'
  | 'role-authorized-within-stage-limit'
  | 'reason-not-authorized-for-role'
  | 'stage-exceeds-role-authority';

const GOVERNING_RULE_MESSAGES: Record<CancellationGoverningRule, string> = {
  'director-full-authority': 'A lab director has full authority to cancel a test order at any stage for any declared reason.',
  'role-authorized-within-stage-limit': 'The requester role has declared authority over this reason code and the order has not passed the stage limit for that authority.',
  'reason-not-authorized-for-role': 'The requester role does not have declared authority to request a cancellation for this reason code.',
  'stage-exceeds-role-authority': 'The order has passed the latest workflow stage at which this requester role has authority to request this cancellation.',
};

/** Deterministic, privacy-safe human-readable text for a governing rule, suitable for UI display. */
export function explainCancellationGoverningRule(rule: CancellationGoverningRule): string {
  return GOVERNING_RULE_MESSAGES[rule];
}

/** A fabricated test order cancellation request. Never a real order, patient, or customer identifier. */
export type CancellationRequest = {
  /** Synthetic, opaque order reference token. */
  orderReferenceToken: string;
  /** Raw workflow stage string; may be unrecognized. */
  stage: string;
  /** Raw cancellation reason code string; may be unrecognized. */
  reasonCode: string;
  /** Raw requester role string; may be unrecognized. */
  requesterRole: string;
};

export type CancellationDecision = {
  orderReferenceToken: string;
  outcome: CancellationOutcome;
  governingRule: CancellationGoverningRule;
  /** Whether a credit note is due to the client as a result of this decision. Always false when refused. */
  creditNoteDue: boolean;
  /** Whether an already-issued report must be amended as a result of this decision. Always false when refused. */
  amendedReportRequired: boolean;
};

export type CancellationInputErrorCode =
  | 'request-malformed'
  | 'order-reference-token-invalid'
  | 'stage-unknown'
  | 'reason-code-unknown'
  | 'role-unknown';

const INPUT_ERROR_MESSAGES: Record<CancellationInputErrorCode, string> = {
  'request-malformed': 'The cancellation request is not a valid request object.',
  'order-reference-token-invalid': 'The order reference token is invalid.',
  'stage-unknown': 'The order stage is not on the declared bounded stage list.',
  'reason-code-unknown': 'The cancellation reason code is not on the declared bounded reason code list.',
  'role-unknown': 'The requester role is not on the declared bounded role list.',
};

/** Thrown for a structurally invalid request or an unrecognized stage, reason code, or role, rather than guessing at a decision. */
export class CancellationInputError extends Error {
  readonly code: CancellationInputErrorCode;

  constructor(code: CancellationInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'CancellationInputError';
    this.code = code;
  }
}

function fail(code: CancellationInputErrorCode): never {
  throw new CancellationInputError(code);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateRequest(rawRequest: unknown): { orderReferenceToken: string; stage: TestOrderStage; reasonCode: CancellationReasonCode; requesterRole: RequesterRole } {
  if (!isPlainObject(rawRequest)) {
    fail('request-malformed');
  }

  const { orderReferenceToken, stage, reasonCode, requesterRole } = rawRequest;

  if (!isNonEmptyString(orderReferenceToken)) {
    fail('order-reference-token-invalid');
  }
  if (!isNonEmptyString(stage) || !KNOWN_STAGES.has(stage)) {
    fail('stage-unknown');
  }
  if (!isNonEmptyString(reasonCode) || !KNOWN_REASON_CODES.has(reasonCode)) {
    fail('reason-code-unknown');
  }
  if (!isNonEmptyString(requesterRole) || !KNOWN_ROLES.has(requesterRole)) {
    fail('role-unknown');
  }

  return {
    orderReferenceToken,
    stage: stage as TestOrderStage,
    reasonCode: reasonCode as CancellationReasonCode,
    requesterRole: requesterRole as RequesterRole,
  };
}

function buildDecision(
  orderReferenceToken: string,
  outcome: CancellationOutcome,
  governingRule: CancellationGoverningRule,
  stage: TestOrderStage,
  reasonCode: CancellationReasonCode,
): CancellationDecision {
  const allowed = outcome === 'allowed';
  return {
    orderReferenceToken,
    outcome,
    governingRule,
    // A cancellation already fully delivered to the client as a final report, cancelled only
    // because the client changed their mind, is the one allowed case that owes no refund: the
    // service was completely rendered. Every other allowed cancellation (an earlier stage, or a
    // lab-side/billing-side reason even at the reported stage) owes a credit note.
    creditNoteDue: allowed && !(stage === 'reported' && reasonCode === 'client_requested'),
    // An amended report is only ever required when a final report had already been issued.
    amendedReportRequired: allowed && stage === 'reported',
  };
}

/**
 * Decide whether a fabricated test order cancellation request is allowed or
 * refused, naming the single governing rule, and state whether a credit
 * note is due and whether an amended report is required.
 *
 * Fail-closed: LAB_DIRECTOR always has full authority. Every other role is
 * refused with `reason-not-authorized-for-role` if the reason code is
 * outside its declared authority, or `stage-exceeds-role-authority` if the
 * order has passed the latest stage at which it has authority for that
 * reason. A structurally invalid request, or an unrecognized stage, reason
 * code, or requester role, throws CancellationInputError instead of
 * guessing at a decision.
 */
export function decideTestCancellation(rawRequest: unknown): CancellationDecision {
  const { orderReferenceToken, stage, reasonCode, requesterRole } = validateRequest(rawRequest);

  if (requesterRole === 'lab_director') {
    return buildDecision(orderReferenceToken, 'allowed', 'director-full-authority', stage, reasonCode);
  }

  const allowedReasons = ROLE_REASON_AUTHORITY[requesterRole];
  if (!allowedReasons.has(reasonCode)) {
    return buildDecision(orderReferenceToken, 'refused', 'reason-not-authorized-for-role', stage, reasonCode);
  }

  const roleStageLimitIndex = STAGE_INDEX[ROLE_STAGE_LIMIT[requesterRole]];
  const stageIndex = STAGE_INDEX[stage];
  if (stageIndex > roleStageLimitIndex) {
    return buildDecision(orderReferenceToken, 'refused', 'stage-exceeds-role-authority', stage, reasonCode);
  }

  return buildDecision(orderReferenceToken, 'allowed', 'role-authorized-within-stage-limit', stage, reasonCode);
}
