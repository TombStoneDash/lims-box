/**
 * Fail-closed synthetic OHWorks method validation status gate.
 *
 * This module is a pure, dependency-free function over a fabricated method
 * registry. It performs no I/O, reads no system clock, and touches no real
 * method, sample, or customer data. Every timestamp it compares against —
 * the run timestamp and the method's validation timestamp — is supplied by
 * the caller.
 *
 * Given a registry lookup for a method plus a run timestamp and the matrix
 * a run was performed against, it decides whether results from that run may
 * be:
 *
 *   reported             - the method is validated, current, covers the
 *                           requested matrix, and carries no caveat
 *   reported_with_flag    - the method is usable but carries a caveat (an
 *                           explicit revalidation-due state, or the
 *                           revalidation interval is close to expiring)
 *   blocked               - the run cannot be trusted: unknown method,
 *                           retired method, a method never validated
 *                           (draft), a matrix outside the method's
 *                           validated scope, an expired revalidation
 *                           interval, or malformed timestamps/interval data
 *
 * Every failure mode defaults to `blocked` rather than guessing in the
 * method's favor.
 */

export type MethodValidationState = 'draft' | 'validated' | 'revalidation_due' | 'retired';

export type MethodRecordInput = {
  methodId: string;
  validationState: MethodValidationState;
  /** UTC timestamp the method was last validated, e.g. "2026-01-01T12:00:00.000Z". Caller supplied. */
  validatedAt: string;
  /** Whole days the validation remains current for before revalidation is required. Must be a positive integer. */
  revalidationIntervalDays: number;
  /** Non-empty list of matrix identifiers this validation covers. */
  validatedMatrices: string[];
};

/** Synthetic method registry keyed by method identifier. */
export type MethodValidationRegistry = Readonly<Record<string, MethodRecordInput>>;

export type MethodValidationGateOptions = {
  /**
   * How many whole days before interval expiry a still-current validation
   * is flagged instead of reported clean. Caller supplied; no default clock
   * math beyond simple day arithmetic on caller-supplied timestamps.
   * Defaults to 3. Set to 0 to disable the near-expiry flag entirely.
   */
  nearExpiryWarningDays?: number;
};

export type MethodValidationGateDecision = 'reported' | 'reported_with_flag' | 'blocked';

/** Bounded, privacy-safe codes naming the rule behind a method validation gate decision. */
export type MethodValidationReasonCode =
  | 'unknown-method'
  | 'run-timestamp-invalid'
  | 'validation-timestamp-invalid'
  | 'revalidation-interval-invalid'
  | 'run-before-validation'
  | 'method-retired'
  | 'unknown-validation-state'
  | 'method-not-yet-validated'
  | 'matrix-outside-validated-scope'
  | 'revalidation-interval-expired'
  | 'revalidation-due'
  | 'validation-near-expiry'
  | 'method-validated-and-current';

export type MethodValidationGateResult = {
  methodId: string;
  matrix: string;
  runAt: string;
  decision: MethodValidationGateDecision;
  reasonCode: MethodValidationReasonCode;
  /** Deterministic, privacy-safe human-readable explanation of reasonCode. */
  reason: string;
};

export type MethodValidationGateInputErrorCode =
  | 'registry-malformed'
  | 'method-id-malformed'
  | 'run-timestamp-malformed'
  | 'matrix-malformed'
  | 'options-malformed'
  | 'method-record-malformed';

const INPUT_ERROR_MESSAGES: Record<MethodValidationGateInputErrorCode, string> = {
  'registry-malformed': 'The method validation registry is not a valid lookup object.',
  'method-id-malformed': 'The requested method identifier is not a non-empty string.',
  'run-timestamp-malformed': 'The supplied run timestamp is not a non-empty string.',
  'matrix-malformed': 'The supplied matrix is not a non-empty string.',
  'options-malformed': 'The method validation gate options are invalid.',
  'method-record-malformed': 'The registry entry for this method is missing a required field or has the wrong shape.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a reason code. */
export class MethodValidationGateInputError extends Error {
  readonly code: MethodValidationGateInputErrorCode;

  constructor(code: MethodValidationGateInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'MethodValidationGateInputError';
    this.code = code;
  }
}

const DEFAULT_NEAR_EXPIRY_WARNING_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const KNOWN_VALIDATION_STATES: ReadonlySet<string> = new Set<MethodValidationState>([
  'draft',
  'validated',
  'revalidation_due',
  'retired',
]);

const REASON_DECISIONS: Record<MethodValidationReasonCode, MethodValidationGateDecision> = {
  'unknown-method': 'blocked',
  'run-timestamp-invalid': 'blocked',
  'validation-timestamp-invalid': 'blocked',
  'revalidation-interval-invalid': 'blocked',
  'run-before-validation': 'blocked',
  'method-retired': 'blocked',
  'unknown-validation-state': 'blocked',
  'method-not-yet-validated': 'blocked',
  'matrix-outside-validated-scope': 'blocked',
  'revalidation-interval-expired': 'blocked',
  'revalidation-due': 'reported_with_flag',
  'validation-near-expiry': 'reported_with_flag',
  'method-validated-and-current': 'reported',
};

const REASON_MESSAGES: Record<MethodValidationReasonCode, string> = {
  'unknown-method': 'No validation record exists for this method identifier.',
  'run-timestamp-invalid': 'The run timestamp could not be parsed as an explicit UTC timestamp.',
  'validation-timestamp-invalid': 'The method validation timestamp could not be parsed as an explicit UTC timestamp.',
  'revalidation-interval-invalid': 'The revalidation interval is not a positive whole number of days.',
  'run-before-validation': 'The run timestamp comes before the method was last validated.',
  'method-retired': 'This method has been retired and can no longer be used to report results.',
  'unknown-validation-state': 'The recorded validation state is not a recognized bounded value.',
  'method-not-yet-validated': 'This method is still in draft and has not completed validation.',
  'matrix-outside-validated-scope': 'The requested matrix is outside this method\'s validated scope.',
  'revalidation-interval-expired': 'The revalidation interval has expired as of the run timestamp.',
  'revalidation-due': 'The method is marked as due for revalidation.',
  'validation-near-expiry': 'The method is validated but the revalidation interval is close to expiring.',
  'method-validated-and-current': 'The method is validated, current, and covers the requested matrix.',
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isUtcTimestamp(value: string): boolean {
  return value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

function isStructurallyValidMatrixList(raw: unknown): raw is string[] {
  return Array.isArray(raw) && raw.length > 0 && raw.every((entry) => isNonEmptyString(entry));
}

function isStructurallyValidRecord(raw: unknown): raw is MethodRecordInput {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.methodId) &&
    isNonEmptyString(candidate.validationState) &&
    isNonEmptyString(candidate.validatedAt) &&
    typeof candidate.revalidationIntervalDays === 'number' &&
    Number.isFinite(candidate.revalidationIntervalDays) &&
    isStructurallyValidMatrixList(candidate.validatedMatrices)
  );
}

function isStructurallyValidOptions(raw: unknown): raw is MethodValidationGateOptions {
  if (raw === undefined) {
    return true;
  }
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  if (candidate.nearExpiryWarningDays === undefined) {
    return true;
  }
  return typeof candidate.nearExpiryWarningDays === 'number' && Number.isFinite(candidate.nearExpiryWarningDays) && candidate.nearExpiryWarningDays >= 0;
}

function toResult(
  methodId: string,
  matrix: string,
  runAt: string,
  reasonCode: MethodValidationReasonCode,
): MethodValidationGateResult {
  return Object.freeze({
    methodId,
    matrix,
    runAt,
    decision: REASON_DECISIONS[reasonCode],
    reasonCode,
    reason: REASON_MESSAGES[reasonCode],
  });
}

/**
 * Evaluate whether results from a run against a given method and matrix may
 * be reported, reported with a flag, or blocked.
 *
 * Fail-closed: a method missing from the registry, a retired method, a
 * method still in draft, a matrix outside the method's validated scope, a
 * malformed or out-of-order timestamp, a non-positive revalidation
 * interval, an unrecognized validation state, or an expired revalidation
 * interval all resolve to `blocked`. Only a currently valid, in-scope
 * `validated` method resolves to `reported`; an explicit
 * `revalidation_due` state, or a `validated` method inside the near-expiry
 * warning window, resolves to `reported_with_flag`.
 *
 * Structurally unusable input (a malformed registry, method id, run
 * timestamp, matrix, options, or registry entry) throws
 * MethodValidationGateInputError instead of guessing at a reason code.
 */
export function evaluateMethodValidationGate(
  registry: MethodValidationRegistry,
  methodId: string,
  runAt: string,
  matrix: string,
  options?: MethodValidationGateOptions,
): MethodValidationGateResult {
  if (typeof registry !== 'object' || registry === null || Array.isArray(registry)) {
    throw new MethodValidationGateInputError('registry-malformed');
  }
  if (!isNonEmptyString(methodId)) {
    throw new MethodValidationGateInputError('method-id-malformed');
  }
  if (!isNonEmptyString(runAt)) {
    throw new MethodValidationGateInputError('run-timestamp-malformed');
  }
  if (!isNonEmptyString(matrix)) {
    throw new MethodValidationGateInputError('matrix-malformed');
  }
  if (!isStructurallyValidOptions(options)) {
    throw new MethodValidationGateInputError('options-malformed');
  }

  const raw = (registry as Record<string, unknown>)[methodId];
  if (raw === undefined) {
    return toResult(methodId, matrix, runAt, 'unknown-method');
  }
  if (!isStructurallyValidRecord(raw)) {
    throw new MethodValidationGateInputError('method-record-malformed');
  }

  if (!isUtcTimestamp(runAt)) {
    return toResult(methodId, matrix, runAt, 'run-timestamp-invalid');
  }
  if (!isUtcTimestamp(raw.validatedAt)) {
    return toResult(methodId, matrix, runAt, 'validation-timestamp-invalid');
  }
  if (!Number.isInteger(raw.revalidationIntervalDays) || raw.revalidationIntervalDays <= 0) {
    return toResult(methodId, matrix, runAt, 'revalidation-interval-invalid');
  }

  const runAtMs = Date.parse(runAt);
  const validatedAtMs = Date.parse(raw.validatedAt);
  if (runAtMs < validatedAtMs) {
    return toResult(methodId, matrix, runAt, 'run-before-validation');
  }

  if (!KNOWN_VALIDATION_STATES.has(raw.validationState)) {
    return toResult(methodId, matrix, runAt, 'unknown-validation-state');
  }
  if (raw.validationState === 'retired') {
    return toResult(methodId, matrix, runAt, 'method-retired');
  }
  if (raw.validationState === 'draft') {
    return toResult(methodId, matrix, runAt, 'method-not-yet-validated');
  }

  if (!raw.validatedMatrices.includes(matrix)) {
    return toResult(methodId, matrix, runAt, 'matrix-outside-validated-scope');
  }

  const expiresAtMs = validatedAtMs + raw.revalidationIntervalDays * MS_PER_DAY;
  if (runAtMs >= expiresAtMs) {
    return toResult(methodId, matrix, runAt, 'revalidation-interval-expired');
  }

  if (raw.validationState === 'revalidation_due') {
    return toResult(methodId, matrix, runAt, 'revalidation-due');
  }

  const nearExpiryWarningDays = options?.nearExpiryWarningDays ?? DEFAULT_NEAR_EXPIRY_WARNING_DAYS;
  if (nearExpiryWarningDays > 0 && expiresAtMs - runAtMs <= nearExpiryWarningDays * MS_PER_DAY) {
    return toResult(methodId, matrix, runAt, 'validation-near-expiry');
  }

  return toResult(methodId, matrix, runAt, 'method-validated-and-current');
}

/** Deterministic, privacy-safe human-readable text for a reason code, suitable for UI display. */
export function explainMethodValidationGateReason(reasonCode: MethodValidationReasonCode): string {
  return REASON_MESSAGES[reasonCode];
}
