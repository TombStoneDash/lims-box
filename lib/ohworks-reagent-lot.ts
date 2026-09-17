/**
 * Fail-closed, deterministic reagent lot expiry evaluator for the synthetic
 * OHWorks pilot.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated
 * reagent lot (a bounded lot identifier, a manufacturer expiry timestamp,
 * an optional first-opened timestamp, and an optional open-vial stability
 * window) plus a caller-supplied use timestamp and a declared lot registry,
 * it returns exactly one of three bounded statuses — `usable`,
 * `usable_with_flag`, or `expired` — along with the exact governing limit
 * timestamp and the rule code that decided it.
 *
 * It never reads the clock itself: every timestamp used in the evaluation
 * is supplied by the caller, which keeps the result reproducible for a
 * given input. A lot never opened, or a lot with no declared open-vial
 * window, is evaluated against its manufacturer expiry alone. A lot on the
 * caller-declared recall list is always reported `expired`, regardless of
 * where it sits relative to either expiry window.
 *
 * A missing or unparsable manufacturer expiry or use timestamp, a use
 * timestamp that precedes the first-opened timestamp (non-monotonic), an
 * invalid open-vial stability window or near-expiry window, or a lot
 * identifier absent from the caller-declared registry of known lots all
 * fail closed by throwing ReagentLotError rather than guessing at a status.
 */

/** The only external statuses this evaluator ever emits. */
export type ReagentLotStatus = 'usable' | 'usable_with_flag' | 'expired';

/**
 * Default window, in milliseconds, before a governing limit at which a lot
 * that is still usable is instead reported `usable_with_flag`. 48 hours was
 * chosen so a bench tech gets a fixed, non-negotiable two-day buffer to
 * requisition a replacement lot before the current one becomes unusable.
 * A fixed duration (rather than a fraction of elapsed time) is used because
 * a never-opened lot has no observable start of its manufacturer shelf
 * life, only its expiry.
 */
const DEFAULT_NEAR_EXPIRY_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Fabricated reagent lot profile. Never derived from a real manufacturer catalog. */
export type ReagentLotProfile = {
  /** Raw lot identifier; may be unrecognized or recalled. */
  lotId: string;
  /** Manufacturer-declared expiry timestamp, required for every lot. */
  manufacturerExpiresAt: string;
  /** Timestamp the vial was first opened, or null/undefined if never opened. */
  firstOpenedAt?: string | null;
  /**
   * Maximum time, in milliseconds, the lot remains stable after being
   * opened, or null/undefined if the lot has no declared open-vial window
   * (in which case only the manufacturer expiry governs).
   */
  openVialStabilityMs?: number | null;
  /**
   * Window, in milliseconds, before the governing limit at which a usable
   * lot is instead reported `usable_with_flag`. Defaults to
   * DEFAULT_NEAR_EXPIRY_WINDOW_MS when omitted.
   */
  nearExpiryWindowMs?: number;
};

/** Caller-declared registry of lots this evaluator is permitted to reason about. */
export type ReagentLotRegistry = {
  /** Bounded set of lot identifiers known to the caller's synthetic catalog. */
  knownLotIds: readonly string[];
  /** Bounded set of lot identifiers quarantined by a declared recall. */
  recalledLotIds?: readonly string[];
};

export type ReagentLotRuleCode =
  | 'within-manufacturer-expiry'
  | 'within-open-vial-window'
  | 'near-manufacturer-expiry'
  | 'near-open-vial-expiry'
  | 'manufacturer-expiry-exceeded'
  | 'open-vial-window-exceeded'
  | 'lot-recalled';

export type ReagentLotEvaluation =
  | {
      status: 'usable';
      ruleCode: 'within-manufacturer-expiry' | 'within-open-vial-window';
      governingLimitAt: string;
      remainingMs: number;
    }
  | {
      status: 'usable_with_flag';
      ruleCode: 'near-manufacturer-expiry' | 'near-open-vial-expiry';
      governingLimitAt: string;
      remainingMs: number;
    }
  | {
      status: 'expired';
      ruleCode: 'manufacturer-expiry-exceeded' | 'open-vial-window-exceeded';
      governingLimitAt: string;
      overdueMs: number;
    }
  | {
      status: 'expired';
      ruleCode: 'lot-recalled';
      governingLimitAt: string;
      overdueMs: 0;
    };

export type ReagentLotErrorCode =
  | 'lot-unknown'
  | 'manufacturer-expiry-missing'
  | 'manufacturer-expiry-invalid'
  | 'use-at-missing'
  | 'use-at-invalid'
  | 'first-opened-at-invalid'
  | 'open-vial-stability-invalid'
  | 'near-expiry-window-invalid'
  | 'timestamps-non-monotonic';

const ERROR_MESSAGES: Record<ReagentLotErrorCode, string> = {
  'lot-unknown': 'The lot identifier is not present in the declared registry of known lots.',
  'manufacturer-expiry-missing': 'The manufacturer expiry timestamp is missing.',
  'manufacturer-expiry-invalid': 'The manufacturer expiry timestamp could not be parsed as a UTC timestamp.',
  'use-at-missing': 'The use timestamp is missing.',
  'use-at-invalid': 'The use timestamp could not be parsed as a UTC timestamp.',
  'first-opened-at-invalid': 'The first-opened timestamp could not be parsed as a UTC timestamp.',
  'open-vial-stability-invalid': 'The open-vial stability window must be a finite number of milliseconds greater than zero.',
  'near-expiry-window-invalid': 'The near-expiry window must be a finite number of milliseconds greater than zero.',
  'timestamps-non-monotonic': 'The use timestamp precedes the first-opened timestamp.',
};

/** Deterministic, human-readable text for a fail-closed error code. */
export function explainReagentLotError(code: ReagentLotErrorCode): string {
  return ERROR_MESSAGES[code];
}

/** Thrown for any input this evaluator cannot safely resolve to a reagent lot status. */
export class ReagentLotError extends Error {
  readonly code: ReagentLotErrorCode;

  constructor(code: ReagentLotErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'ReagentLotError';
    this.code = code;
  }
}

function isUtcTimestamp(value: string): boolean {
  return value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

/**
 * Evaluate whether a fabricated reagent lot is usable, usable with a
 * near-expiry flag, or expired, as of a caller-supplied use timestamp.
 *
 * Fail-closed: a lot identifier absent from `registry.knownLotIds`, a
 * missing or unparsable manufacturer expiry or use timestamp, a present but
 * unparsable first-opened timestamp, an invalid open-vial stability window
 * or near-expiry window, or a use timestamp that precedes the first-opened
 * timestamp all throw ReagentLotError instead of guessing at a status.
 */
export function evaluateReagentLot(
  lot: ReagentLotProfile,
  useAt: string,
  registry: ReagentLotRegistry,
): ReagentLotEvaluation {
  if (!registry.knownLotIds.includes(lot.lotId)) {
    throw new ReagentLotError('lot-unknown');
  }

  if (lot.manufacturerExpiresAt === undefined || lot.manufacturerExpiresAt === null || lot.manufacturerExpiresAt === '') {
    throw new ReagentLotError('manufacturer-expiry-missing');
  }
  if (!isUtcTimestamp(lot.manufacturerExpiresAt)) {
    throw new ReagentLotError('manufacturer-expiry-invalid');
  }

  if (useAt === undefined || useAt === null || useAt === '') {
    throw new ReagentLotError('use-at-missing');
  }
  if (!isUtcTimestamp(useAt)) {
    throw new ReagentLotError('use-at-invalid');
  }

  const hasFirstOpenedAt = lot.firstOpenedAt !== undefined && lot.firstOpenedAt !== null && lot.firstOpenedAt !== '';
  if (hasFirstOpenedAt && !isUtcTimestamp(lot.firstOpenedAt as string)) {
    throw new ReagentLotError('first-opened-at-invalid');
  }

  const hasOpenVialStability = lot.openVialStabilityMs !== undefined && lot.openVialStabilityMs !== null;
  if (hasOpenVialStability && (!Number.isFinite(lot.openVialStabilityMs) || (lot.openVialStabilityMs as number) <= 0)) {
    throw new ReagentLotError('open-vial-stability-invalid');
  }

  const nearExpiryWindowMs = lot.nearExpiryWindowMs ?? DEFAULT_NEAR_EXPIRY_WINDOW_MS;
  if (!Number.isFinite(nearExpiryWindowMs) || nearExpiryWindowMs <= 0) {
    throw new ReagentLotError('near-expiry-window-invalid');
  }

  const useTime = Date.parse(useAt);
  const manufacturerExpiresTime = Date.parse(lot.manufacturerExpiresAt);
  const firstOpenedTime = hasFirstOpenedAt ? Date.parse(lot.firstOpenedAt as string) : null;

  if (firstOpenedTime !== null && useTime < firstOpenedTime) {
    throw new ReagentLotError('timestamps-non-monotonic');
  }

  if (registry.recalledLotIds?.includes(lot.lotId)) {
    return {
      status: 'expired',
      ruleCode: 'lot-recalled',
      governingLimitAt: new Date(useTime).toISOString(),
      overdueMs: 0,
    };
  }

  const openVialExpiresTime =
    firstOpenedTime !== null && hasOpenVialStability ? firstOpenedTime + (lot.openVialStabilityMs as number) : null;

  const governedByOpenVialWindow = openVialExpiresTime !== null && openVialExpiresTime < manufacturerExpiresTime;
  const governingLimitTime = governedByOpenVialWindow ? (openVialExpiresTime as number) : manufacturerExpiresTime;
  const governingLimitAt = new Date(governingLimitTime).toISOString();

  if (useTime >= governingLimitTime) {
    return {
      status: 'expired',
      ruleCode: governedByOpenVialWindow ? 'open-vial-window-exceeded' : 'manufacturer-expiry-exceeded',
      governingLimitAt,
      overdueMs: useTime - governingLimitTime,
    };
  }

  const remainingMs = governingLimitTime - useTime;
  if (remainingMs <= nearExpiryWindowMs) {
    return {
      status: 'usable_with_flag',
      ruleCode: governedByOpenVialWindow ? 'near-open-vial-expiry' : 'near-manufacturer-expiry',
      governingLimitAt,
      remainingMs,
    };
  }

  return {
    status: 'usable',
    ruleCode: governedByOpenVialWindow ? 'within-open-vial-window' : 'within-manufacturer-expiry',
    governingLimitAt,
    remainingMs,
  };
}
