/**
 * Fail-closed, dependency-injected OHWorks-to-SENAITE sample-create contract.
 *
 * This module performs no I/O of its own. It validates a single fabricated
 * OHWorks sample-create request against a fabricated tenant context, and -
 * only once that request is structurally and semantically sound - invokes an
 * injected SENAITE adapter to attempt the create. The adapter's reported
 * outcome is then re-validated before the contract will ever call the result
 * CREATED. Every failure mode (missing identity, malformed dates, an
 * unsupported matrix, a tenant mismatch, or an adapter that returns zero,
 * ambiguous, duplicate, or otherwise untrustworthy outcomes) is rejected
 * rather than guessed at. Adapter errors are never echoed back verbatim.
 */

export type OHWorksSampleCreateRequest = {
  /** Synthetic idempotency/correlation identifier for this create attempt. */
  requestId: string;
  /** Synthetic tenant/lab identifier the request claims to belong to. */
  tenantId: string;
  /** Synthetic client identifier the sample is being created for. */
  clientId: string;
  /** Synthetic OHWorks-side sample identifier. */
  sampleId: string;
  /** Raw matrix/sample-type code; may be unsupported. */
  matrixCode: string;
  /** ISO 8601 timestamp the sample was collected. */
  dateSampled: string;
  /** ISO 8601 timestamp the sample was received. */
  dateReceived: string;
  /** Requested analysis codes; must be a non-empty list of non-empty strings. */
  analyses: string[];
};

export type SampleCreateContext = {
  /** Synthetic tenant/lab identifier this create is being performed for. */
  tenantId: string;
};

const SUPPORTED_MATRIX_CODES: ReadonlySet<string> = new Set<string>([
  'water-potable',
  'water-waste',
  'soil',
  'air-ambient',
]);

export type SenaiteSampleCreateOutcome = {
  senaiteSampleId: string;
  tenantId: string;
  matrixCode: string;
};

export interface SenaiteSampleAdapter {
  createSample(request: OHWorksSampleCreateRequest): Promise<ReadonlyArray<SenaiteSampleCreateOutcome>>;
}

export type SampleCreateStatus = 'CREATED' | 'REJECTED';

export type SampleCreateReasonCode =
  | 'tenant-mismatch'
  | 'matrix-unsupported'
  | 'date-sampled-invalid'
  | 'date-received-invalid'
  | 'date-received-before-sampled'
  | 'analyses-missing'
  | 'analyses-invalid'
  | 'adapter-error'
  | 'adapter-outcome-missing'
  | 'adapter-outcome-ambiguous'
  | 'adapter-outcome-duplicate'
  | 'adapter-outcome-tenant-mismatch'
  | 'adapter-outcome-matrix-mismatch';

export type SampleCreateReason = {
  code: SampleCreateReasonCode;
};

export type SampleCreateResult = {
  requestId: string;
  sampleId: string;
  status: SampleCreateStatus;
  /** Deterministically ordered, privacy-safe reasons. Empty when CREATED. */
  reasons: SampleCreateReason[];
  /** Only present when status is CREATED. */
  senaiteSampleId?: string;
};

const REASON_MESSAGES: Record<SampleCreateReasonCode, string> = {
  'tenant-mismatch': 'The request does not belong to the tenant this create was run for.',
  'matrix-unsupported': 'The requested sample matrix is not a supported matrix code.',
  'date-sampled-invalid': 'The sampled-date could not be parsed.',
  'date-received-invalid': 'The received-date could not be parsed.',
  'date-received-before-sampled': 'The received-date is earlier than the sampled-date.',
  'analyses-missing': 'No analyses were requested for this sample.',
  'analyses-invalid': 'One or more requested analysis codes are not valid.',
  'adapter-error': 'The SENAITE adapter failed to complete the create request.',
  'adapter-outcome-missing': 'The SENAITE adapter reported no created sample for this request.',
  'adapter-outcome-ambiguous': 'The SENAITE adapter reported more than one distinct created sample for this request.',
  'adapter-outcome-duplicate': 'The SENAITE adapter reported the same created sample more than once for this request.',
  'adapter-outcome-tenant-mismatch': 'The SENAITE adapter reported a created sample under a different tenant.',
  'adapter-outcome-matrix-mismatch': 'The SENAITE adapter reported a created sample under a different matrix.',
};

/** Deterministic, privacy-safe human-readable text for a create-result reason, suitable for UI display. */
export function explainSampleCreateReason(reason: SampleCreateReason): string {
  return REASON_MESSAGES[reason.code];
}

export type SampleCreateInputErrorCode = 'request-invalid' | 'request-missing-identity' | 'invalid-context';

const INPUT_ERROR_MESSAGES: Record<SampleCreateInputErrorCode, string> = {
  'request-invalid': 'The OHWorks sample-create request is not a valid request object.',
  'request-missing-identity': 'The OHWorks sample-create request is missing a required identity field.',
  'invalid-context': 'The sample-create evaluation context has an invalid tenant identifier.',
};

/** Thrown for structurally unusable input that cannot be safely evaluated at all. */
export class SampleCreateInputError extends Error {
  readonly code: SampleCreateInputErrorCode;

  constructor(code: SampleCreateInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'SampleCreateInputError';
    this.code = code;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function hasRequiredIdentity(
  request: unknown,
): request is OHWorksSampleCreateRequest {
  if (typeof request !== 'object' || request === null) {
    return false;
  }
  const candidate = request as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.requestId) &&
    isNonEmptyString(candidate.tenantId) &&
    isNonEmptyString(candidate.clientId) &&
    isNonEmptyString(candidate.sampleId)
  );
}

function compareReasons(a: SampleCreateReason, b: SampleCreateReason): number {
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

function validateRequest(request: OHWorksSampleCreateRequest, context: SampleCreateContext): SampleCreateReason[] {
  const reasons: SampleCreateReason[] = [];
  const flag = (code: SampleCreateReasonCode) => reasons.push({ code });

  if (request.tenantId !== context.tenantId) {
    flag('tenant-mismatch');
  }

  if (!SUPPORTED_MATRIX_CODES.has(request.matrixCode)) {
    flag('matrix-unsupported');
  }

  const sampledTime = Date.parse(request.dateSampled);
  const sampledValid = Number.isFinite(sampledTime);
  if (!sampledValid) {
    flag('date-sampled-invalid');
  }

  const receivedTime = Date.parse(request.dateReceived);
  const receivedValid = Number.isFinite(receivedTime);
  if (!receivedValid) {
    flag('date-received-invalid');
  }

  if (sampledValid && receivedValid && receivedTime < sampledTime) {
    flag('date-received-before-sampled');
  }

  if (!Array.isArray(request.analyses) || request.analyses.length === 0) {
    flag('analyses-missing');
  } else if (request.analyses.some((analysis) => !isNonEmptyString(analysis))) {
    flag('analyses-invalid');
  }

  reasons.sort(compareReasons);
  return reasons;
}

function evaluateAdapterOutcomes(
  outcomes: ReadonlyArray<SenaiteSampleCreateOutcome>,
  request: OHWorksSampleCreateRequest,
  context: SampleCreateContext,
): { reasons: SampleCreateReason[]; senaiteSampleId?: string } {
  const reasons: SampleCreateReason[] = [];
  const flag = (code: SampleCreateReasonCode) => reasons.push({ code });

  if (outcomes.length === 0) {
    flag('adapter-outcome-missing');
    return { reasons };
  }

  const idCounts = new Map<string, number>();
  for (const outcome of outcomes) {
    idCounts.set(outcome.senaiteSampleId, (idCounts.get(outcome.senaiteSampleId) ?? 0) + 1);
  }

  const hasRepeatedId = [...idCounts.values()].some((count) => count > 1);
  if (hasRepeatedId) {
    flag('adapter-outcome-duplicate');
    reasons.sort(compareReasons);
    return { reasons };
  }

  if (idCounts.size > 1) {
    flag('adapter-outcome-ambiguous');
    reasons.sort(compareReasons);
    return { reasons };
  }

  const [outcome] = outcomes;

  if (outcome.tenantId !== context.tenantId) {
    flag('adapter-outcome-tenant-mismatch');
  }

  if (outcome.matrixCode !== request.matrixCode) {
    flag('adapter-outcome-matrix-mismatch');
  }

  reasons.sort(compareReasons);
  if (reasons.length > 0) {
    return { reasons };
  }

  return { reasons: [], senaiteSampleId: outcome.senaiteSampleId };
}

/**
 * Evaluate and, only if sound, submit a single fabricated OHWorks sample-create
 * request to an injected SENAITE adapter.
 *
 * Fail-closed: a tenant mismatch, unsupported matrix, malformed or
 * out-of-order date, or missing/invalid analyses list rejects the request
 * before the adapter is ever called. An adapter that throws, or that
 * reports zero, ambiguous, duplicate, or mismatched outcomes, is also
 * rejected. A structurally unusable request or context throws
 * SampleCreateInputError instead of guessing at a result, and no adapter
 * error text is ever included in the returned result.
 */
export async function createOHWorksSenaiteSample(
  request: OHWorksSampleCreateRequest,
  context: SampleCreateContext,
  adapter: SenaiteSampleAdapter,
): Promise<SampleCreateResult> {
  if (typeof request !== 'object' || request === null) {
    throw new SampleCreateInputError('request-invalid');
  }

  if (!isNonEmptyString(context?.tenantId)) {
    throw new SampleCreateInputError('invalid-context');
  }

  if (!hasRequiredIdentity(request)) {
    throw new SampleCreateInputError('request-missing-identity');
  }

  const preCallReasons = validateRequest(request, context);
  if (preCallReasons.length > 0) {
    return {
      requestId: request.requestId,
      sampleId: request.sampleId,
      status: 'REJECTED',
      reasons: preCallReasons,
    };
  }

  let outcomes: ReadonlyArray<SenaiteSampleCreateOutcome>;
  try {
    outcomes = await adapter.createSample(request);
  } catch {
    return {
      requestId: request.requestId,
      sampleId: request.sampleId,
      status: 'REJECTED',
      reasons: [{ code: 'adapter-error' }],
    };
  }

  if (!Array.isArray(outcomes)) {
    return {
      requestId: request.requestId,
      sampleId: request.sampleId,
      status: 'REJECTED',
      reasons: [{ code: 'adapter-outcome-missing' }],
    };
  }

  const { reasons: outcomeReasons, senaiteSampleId } = evaluateAdapterOutcomes(outcomes, request, context);

  if (outcomeReasons.length > 0) {
    return {
      requestId: request.requestId,
      sampleId: request.sampleId,
      status: 'REJECTED',
      reasons: outcomeReasons,
    };
  }

  return {
    requestId: request.requestId,
    sampleId: request.sampleId,
    status: 'CREATED',
    reasons: [],
    senaiteSampleId,
  };
}
