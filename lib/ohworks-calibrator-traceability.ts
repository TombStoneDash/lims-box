/**
 * Fail-closed synthetic OHWorks calibrator lot traceability gate.
 *
 * This module is a pure, dependency-free function over a fabricated
 * calibrator lot registry. It performs no I/O, reads no system clock, and
 * touches no real calibrator, instrument, sample, or customer data. Every
 * timestamp it compares against — the run timestamp and each lot's
 * certificate expiry — is supplied by the caller.
 *
 * Each lot in the registry cites the identifier of the parent reference
 * material its assigned value was derived from, except a lot explicitly
 * declared as the terminal, top-of-chain reference. Given a working
 * calibrator lot and a run timestamp, this module walks that parent chain
 * and decides whether a result produced against the calibrator at that
 * timestamp is:
 *
 *   traceable      - every lot from the working calibrator up to and
 *                     including the declared reference has a current
 *                     certificate and a usable assigned value and
 *                     uncertainty, with no broken link and no cycle
 *   not_traceable  - the chain is unknown, broken, cyclic, too long, or any
 *                     lot along it has an expired certificate or a missing
 *                     or unusable assigned value / uncertainty
 *
 * When traceable, the combined standard uncertainty along the chain is
 * computed as the root-sum-of-squares of each lot's assigned-value
 * uncertainty, the standard approach for combining independent uncertainty
 * contributions in a calibration hierarchy.
 *
 * Every failure mode defaults to `not_traceable` rather than guessing in
 * the calibrator's favor.
 */

export type CalibratorLotRecordInput = {
  lotId: string;
  /** Identifier of the parent reference material this lot's assigned value was derived from. Omitted only on a lot explicitly declared as the terminal reference. */
  parentReferenceId?: string;
  /** True only for a lot explicitly declared as the terminal, top-of-chain reference (e.g. a certified reference material traceable to a national metrology institute). */
  isDeclaredReference?: boolean;
  /** UTC timestamp the calibration certificate expires, e.g. "2026-01-01T00:00:00.000Z". Caller supplied. */
  certificateExpiresAt: string;
  /** The value assigned to this lot by its certificate, in whatever consistent unit the chain uses. */
  assignedValue?: number;
  /** Standard uncertainty of assignedValue, same units as assignedValue. Must be non-negative. */
  assignedValueUncertainty?: number;
};

/** Synthetic calibrator lot registry keyed by lot identifier. */
export type CalibratorLotRegistry = Readonly<Record<string, CalibratorLotRecordInput>>;

export type CalibratorTraceabilityOptions = {
  /**
   * Maximum number of lots (inclusive of the working calibrator and the
   * declared reference) permitted along a single chain before it is
   * rejected as too long to trust. Guards against pathologically long,
   * cycle-free chains. Defaults to 25.
   */
  maxChainDepth?: number;
};

export type TraceabilityDecision = 'traceable' | 'not_traceable';

/** Bounded, privacy-safe codes explaining a traceability decision. */
export type TraceabilityReasonCode =
  | 'unknown-lot'
  | 'run-timestamp-invalid'
  | 'certificate-timestamp-invalid'
  | 'certificate-expired'
  | 'assigned-value-missing'
  | 'assigned-value-invalid'
  | 'uncertainty-missing'
  | 'uncertainty-invalid'
  | 'missing-parent'
  | 'undeclared-terminal-lot'
  | 'cycle-detected'
  | 'chain-too-long'
  | 'chain-traceable';

export type TraceabilityResult = {
  lotId: string;
  runAt: string;
  decision: TraceabilityDecision;
  reasonCode: TraceabilityReasonCode;
  /** Deterministic, privacy-safe human-readable explanation of reasonCode. */
  reason: string;
  /** Lot identifiers walked from the working calibrator toward the reference, in traversal order, up to and including the lot that caused the outcome. */
  chain: readonly string[];
  /** Identifier of the declared reference the chain resolved to. Null unless decision is 'traceable'. */
  referenceLotId: string | null;
  /** Root-sum-of-squares combined standard uncertainty across the resolved chain. Null unless decision is 'traceable'. */
  combinedUncertainty: number | null;
};

export type CalibratorTraceabilityInputErrorCode =
  | 'registry-malformed'
  | 'lot-id-malformed'
  | 'run-timestamp-malformed'
  | 'options-malformed'
  | 'lot-record-malformed';

const INPUT_ERROR_MESSAGES: Record<CalibratorTraceabilityInputErrorCode, string> = {
  'registry-malformed': 'The calibrator lot registry is not a valid lookup object.',
  'lot-id-malformed': 'The requested calibrator lot identifier is not a non-empty string.',
  'run-timestamp-malformed': 'The supplied run timestamp is not a non-empty string.',
  'options-malformed': 'The traceability options are invalid.',
  'lot-record-malformed': 'A registry entry along the chain is missing a required field or has the wrong shape.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a reason code. */
export class CalibratorTraceabilityInputError extends Error {
  readonly code: CalibratorTraceabilityInputErrorCode;

  constructor(code: CalibratorTraceabilityInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'CalibratorTraceabilityInputError';
    this.code = code;
  }
}

const DEFAULT_MAX_CHAIN_DEPTH = 25;

const REASON_DECISIONS: Record<TraceabilityReasonCode, TraceabilityDecision> = {
  'unknown-lot': 'not_traceable',
  'run-timestamp-invalid': 'not_traceable',
  'certificate-timestamp-invalid': 'not_traceable',
  'certificate-expired': 'not_traceable',
  'assigned-value-missing': 'not_traceable',
  'assigned-value-invalid': 'not_traceable',
  'uncertainty-missing': 'not_traceable',
  'uncertainty-invalid': 'not_traceable',
  'missing-parent': 'not_traceable',
  'undeclared-terminal-lot': 'not_traceable',
  'cycle-detected': 'not_traceable',
  'chain-too-long': 'not_traceable',
  'chain-traceable': 'traceable',
};

const REASON_MESSAGES: Record<TraceabilityReasonCode, string> = {
  'unknown-lot': 'No calibrator lot record exists for this identifier.',
  'run-timestamp-invalid': 'The run timestamp could not be parsed as an explicit UTC timestamp.',
  'certificate-timestamp-invalid': 'A certificate expiry timestamp along the chain could not be parsed as an explicit UTC timestamp.',
  'certificate-expired': 'A certificate along the chain has expired as of the run timestamp.',
  'assigned-value-missing': 'A lot along the chain has no assigned value on record.',
  'assigned-value-invalid': 'A lot along the chain has an assigned value that is not a finite number.',
  'uncertainty-missing': 'A lot along the chain has no assigned-value uncertainty on record.',
  'uncertainty-invalid': 'A lot along the chain has an assigned-value uncertainty that is not a finite, non-negative number.',
  'missing-parent': 'A lot along the chain cites a parent reference identifier with no matching registry record.',
  'undeclared-terminal-lot': 'The chain ends at a lot with no parent and no declaration as the top-of-chain reference.',
  'cycle-detected': 'The chain revisits a lot it has already traversed, forming a cycle.',
  'chain-too-long': 'The chain exceeds the maximum permitted number of lots without resolving to a declared reference.',
  'chain-traceable': 'Every lot from the working calibrator to the declared reference has a current certificate and a usable assigned value.',
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isUtcTimestamp(value: string): boolean {
  return value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

function isStructurallyValidLotRecord(raw: unknown): raw is CalibratorLotRecordInput {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  if (!isNonEmptyString(candidate.lotId) || !isNonEmptyString(candidate.certificateExpiresAt)) {
    return false;
  }
  if (candidate.parentReferenceId !== undefined && !isNonEmptyString(candidate.parentReferenceId)) {
    return false;
  }
  if (candidate.isDeclaredReference !== undefined && typeof candidate.isDeclaredReference !== 'boolean') {
    return false;
  }
  if (candidate.assignedValue !== undefined && typeof candidate.assignedValue !== 'number') {
    return false;
  }
  if (candidate.assignedValueUncertainty !== undefined && typeof candidate.assignedValueUncertainty !== 'number') {
    return false;
  }
  return true;
}

function isStructurallyValidOptions(raw: unknown): raw is CalibratorTraceabilityOptions {
  if (raw === undefined) {
    return true;
  }
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  if (candidate.maxChainDepth === undefined) {
    return true;
  }
  return (
    typeof candidate.maxChainDepth === 'number' &&
    Number.isInteger(candidate.maxChainDepth) &&
    candidate.maxChainDepth > 0
  );
}

function toResult(
  lotId: string,
  runAt: string,
  reasonCode: TraceabilityReasonCode,
  chain: string[],
  referenceLotId: string | null,
  combinedUncertainty: number | null,
): TraceabilityResult {
  return Object.freeze({
    lotId,
    runAt,
    decision: REASON_DECISIONS[reasonCode],
    reasonCode,
    reason: REASON_MESSAGES[reasonCode],
    chain: Object.freeze([...chain]),
    referenceLotId,
    combinedUncertainty,
  });
}

/**
 * Evaluate whether a result run against a working calibrator lot, at a
 * caller-supplied run timestamp, is traceable to a declared reference.
 *
 * Walks the registry's parentReferenceId chain from `lotId` toward a lot
 * declared with `isDeclaredReference: true`. Fails closed to
 * `not_traceable` on: an unknown lot, a cycle, a chain exceeding
 * `maxChainDepth`, a chain that dead-ends without a declared reference, a
 * missing parent record, a malformed or expired certificate timestamp on
 * any lot along the chain, or a missing/invalid assigned value or
 * uncertainty on any lot along the chain. Only a fully resolved,
 * unexpired, fully valued chain resolves to `traceable`, carrying the
 * root-sum-of-squares combined uncertainty across the chain.
 *
 * Structurally unusable input (a malformed registry, lot id, run
 * timestamp, options, or a malformed registry entry encountered along the
 * chain) throws CalibratorTraceabilityInputError instead of guessing at a
 * reason code.
 */
export function evaluateCalibratorLotTraceability(
  registry: CalibratorLotRegistry,
  lotId: string,
  runAt: string,
  options?: CalibratorTraceabilityOptions,
): TraceabilityResult {
  if (typeof registry !== 'object' || registry === null || Array.isArray(registry)) {
    throw new CalibratorTraceabilityInputError('registry-malformed');
  }
  if (!isNonEmptyString(lotId)) {
    throw new CalibratorTraceabilityInputError('lot-id-malformed');
  }
  if (!isNonEmptyString(runAt)) {
    throw new CalibratorTraceabilityInputError('run-timestamp-malformed');
  }
  if (!isStructurallyValidOptions(options)) {
    throw new CalibratorTraceabilityInputError('options-malformed');
  }

  if (!isUtcTimestamp(runAt)) {
    return toResult(lotId, runAt, 'run-timestamp-invalid', [], null, null);
  }
  const runAtMs = Date.parse(runAt);
  const maxChainDepth = options?.maxChainDepth ?? DEFAULT_MAX_CHAIN_DEPTH;

  const registryMap = registry as Record<string, unknown>;
  const visited = new Set<string>();
  const chain: string[] = [];
  const uncertainties: number[] = [];

  let current = lotId;
  for (;;) {
    if (visited.has(current)) {
      return toResult(lotId, runAt, 'cycle-detected', chain, null, null);
    }
    if (chain.length >= maxChainDepth) {
      return toResult(lotId, runAt, 'chain-too-long', chain, null, null);
    }
    visited.add(current);
    chain.push(current);

    const raw = registryMap[current];
    if (raw === undefined) {
      return toResult(lotId, runAt, current === lotId ? 'unknown-lot' : 'missing-parent', chain, null, null);
    }
    if (!isStructurallyValidLotRecord(raw)) {
      throw new CalibratorTraceabilityInputError('lot-record-malformed');
    }

    if (!isUtcTimestamp(raw.certificateExpiresAt)) {
      return toResult(lotId, runAt, 'certificate-timestamp-invalid', chain, null, null);
    }
    const expiresAtMs = Date.parse(raw.certificateExpiresAt);
    if (runAtMs >= expiresAtMs) {
      return toResult(lotId, runAt, 'certificate-expired', chain, null, null);
    }

    if (raw.assignedValue === undefined) {
      return toResult(lotId, runAt, 'assigned-value-missing', chain, null, null);
    }
    if (!Number.isFinite(raw.assignedValue)) {
      return toResult(lotId, runAt, 'assigned-value-invalid', chain, null, null);
    }

    if (raw.assignedValueUncertainty === undefined) {
      return toResult(lotId, runAt, 'uncertainty-missing', chain, null, null);
    }
    if (!Number.isFinite(raw.assignedValueUncertainty) || raw.assignedValueUncertainty < 0) {
      return toResult(lotId, runAt, 'uncertainty-invalid', chain, null, null);
    }

    uncertainties.push(raw.assignedValueUncertainty);

    if (raw.isDeclaredReference === true) {
      const combinedUncertainty = Math.sqrt(uncertainties.reduce((sum, u) => sum + u * u, 0));
      return toResult(lotId, runAt, 'chain-traceable', chain, current, combinedUncertainty);
    }

    if (!isNonEmptyString(raw.parentReferenceId)) {
      return toResult(lotId, runAt, 'undeclared-terminal-lot', chain, null, null);
    }
    current = raw.parentReferenceId;
  }
}

/** Deterministic, privacy-safe human-readable text for a reason code, suitable for UI display. */
export function explainTraceabilityReason(reasonCode: TraceabilityReasonCode): string {
  return REASON_MESSAGES[reasonCode];
}
