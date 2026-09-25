/**
 * Fail-closed synthetic OHWorks critical-result repeat policy.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated first
 * result already flagged critical, a fabricated declared repeat policy for
 * that result's analyte (whether a repeat is required, the agreement
 * tolerance between the first result and a repeat, and the maximum number of
 * repeat attempts allowed), and a fabricated, caller-ordered list of
 * subsequent repeat results with caller-supplied timestamps, it decides:
 *
 *   - status:       'confirmed' | 'discordant' | 'pending'
 *   - reportValue:  the numeric value to report, or null when nothing is
 *                   safe to report yet.
 *   - notifyAllowed: whether critical-result notification may proceed.
 *
 * It performs no I/O, reads no system clock, mutates no SENAITE or database
 * state, and touches no real subject, sample, or customer data. It never
 * asserts approval, compliance, accreditation, or releasability, and it never
 * sends or triggers a notification itself -- `notifyAllowed` is a decision
 * for a caller to act on.
 *
 * Decision shape:
 *   - If the policy does not require a repeat, the first result is
 *     `confirmed` immediately and is reportable.
 *   - If a repeat is required but none has been supplied yet, the outcome is
 *     `pending`: nothing is reportable and notification is withheld.
 *   - Each supplied repeat is evaluated, in the order given, against the
 *     first result's value using the declared tolerance. The first repeat
 *     that agrees resolves the outcome to `confirmed`; later, unevaluated
 *     repeats in the list are simply not needed. A repeat that disagrees
 *     leaves the outcome `pending` if another repeat attempt is still
 *     allowed under the declared maximum, or `discordant` once the maximum
 *     is exhausted without agreement.
 *   - Anything that would require guessing at a repeat's trustworthiness --
 *     a mismatched subject or analyte, an unparsable or out-of-order
 *     timestamp, a nonnumeric value, or a missing/mismatched unit, on either
 *     the first result or any repeat -- fails closed to `discordant` with no
 *     reportable value, rather than being treated as silent agreement.
 *     `discordant` always allows notification: a repeat sequence that cannot
 *     be trusted or reconciled must be escalated, never held silently.
 *   - A structurally unusable request -- an unknown analyte, a malformed
 *     first result or repeat, an invalid policy, or more repeats supplied
 *     than the declared maximum allows -- throws
 *     CriticalRepeatPolicyInputError instead of guessing at an outcome.
 */

export type CriticalRepeatStatus = 'confirmed' | 'discordant' | 'pending';

export type CriticalRepeatResult = {
  /** Synthetic subject identifier. Never a real patient or customer identifier. */
  subjectId: string;
  /** Fabricated analyte/parameter code. */
  analyteCode: string;
  /** Raw fabricated observed value, exactly as received; may be nonnumeric. */
  value: unknown;
  unit?: string;
  /** Caller-supplied ISO 8601 timestamp the result was captured. */
  capturedAt: string;
};

export type CriticalRepeatTolerance = {
  /** Non-negative absolute agreement tolerance, or null if none is declared. */
  absolute: number | null;
  /** Non-negative percent agreement tolerance, or null if none is declared. */
  percent: number | null;
};

export type CriticalRepeatPolicy = {
  /** The analyte this policy is declared for. */
  analyteCode: string;
  /** Canonical unit this policy is declared in; must match the first result and every repeat exactly (after trim/case-fold). */
  unit: string;
  repeatRequired: boolean;
  /** How close a repeat must be to the first result's value to count as agreement. Only consulted when repeatRequired is true. */
  tolerance: CriticalRepeatTolerance;
  /** Maximum number of repeat attempts allowed. Must be a positive integer regardless of repeatRequired. */
  maxRepeats: number;
};

export type CriticalRepeatReasonCode =
  | 'repeat-not-required'
  | 'awaiting-first-repeat'
  | 'awaiting-next-repeat'
  | 'repeat-confirmed'
  | 'repeats-exhausted'
  | 'first-result-timestamp-invalid'
  | 'first-result-value-invalid'
  | 'first-result-unit-missing'
  | 'first-result-unit-mismatched'
  | 'repeat-subject-mismatch'
  | 'repeat-analyte-mismatch'
  | 'repeat-timestamp-invalid'
  | 'repeat-not-after-previous'
  | 'repeat-value-invalid'
  | 'repeat-unit-missing'
  | 'repeat-unit-mismatched';

const REASON_MESSAGES: Record<CriticalRepeatReasonCode, string> = {
  'repeat-not-required': 'The declared policy for this analyte does not require a repeat, so the first result is confirmed.',
  'awaiting-first-repeat': 'A repeat is required and none has been supplied yet.',
  'awaiting-next-repeat': 'The most recent repeat did not agree with the first result, and another repeat attempt is still allowed.',
  'repeat-confirmed': 'A repeat agreed with the first result within the declared tolerance.',
  'repeats-exhausted': 'No repeat agreed with the first result within the declared tolerance before the maximum number of repeats was reached.',
  'first-result-timestamp-invalid': 'The first result capture timestamp could not be parsed.',
  'first-result-value-invalid': 'The first result value is not a finite number.',
  'first-result-unit-missing': 'The first result has no unit.',
  'first-result-unit-mismatched': 'The first result unit does not match the declared policy unit.',
  'repeat-subject-mismatch': 'A repeat belongs to a different subject than the first result.',
  'repeat-analyte-mismatch': 'A repeat is for a different analyte than the first result.',
  'repeat-timestamp-invalid': 'A repeat capture timestamp could not be parsed.',
  'repeat-not-after-previous': 'A repeat is not strictly later than the result before it.',
  'repeat-value-invalid': 'A repeat value is not a finite number.',
  'repeat-unit-missing': 'A repeat has no unit.',
  'repeat-unit-mismatched': 'A repeat unit does not match the declared policy unit.',
};

/** Deterministic, privacy-safe human-readable text for a critical repeat reason code, suitable for UI display. */
export function explainCriticalRepeatReason(code: CriticalRepeatReasonCode): string {
  return REASON_MESSAGES[code];
}

export type CriticalRepeatInputErrorCode =
  | 'first-malformed'
  | 'repeat-malformed'
  | 'policy-malformed'
  | 'policy-unit-missing'
  | 'policy-max-repeats-invalid'
  | 'policy-tolerance-invalid'
  | 'policy-tolerance-empty'
  | 'unknown-analyte'
  | 'repeats-not-array'
  | 'repeats-exceed-maximum';

const INPUT_ERROR_MESSAGES: Record<CriticalRepeatInputErrorCode, string> = {
  'first-malformed': 'The first result is missing a required identity field.',
  'repeat-malformed': 'A repeat result is missing a required identity field.',
  'policy-malformed': 'The declared repeat policy is not structurally valid.',
  'policy-unit-missing': 'The declared repeat policy has no unit.',
  'policy-max-repeats-invalid': 'The declared maximum number of repeats is not a positive integer.',
  'policy-tolerance-invalid': 'The declared agreement tolerance is not structurally valid.',
  'policy-tolerance-empty': 'The declared policy requires a repeat but declares no agreement tolerance.',
  'unknown-analyte': 'The first result analyte does not match the declared policy analyte.',
  'repeats-not-array': 'The supplied repeats are not a list.',
  'repeats-exceed-maximum': 'More repeats were supplied than the declared policy allows.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a critical repeat outcome. */
export class CriticalRepeatPolicyInputError extends Error {
  readonly code: CriticalRepeatInputErrorCode;

  constructor(code: CriticalRepeatInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'CriticalRepeatPolicyInputError';
    this.code = code;
  }
}

export type CriticalRepeatOutcome = {
  status: CriticalRepeatStatus;
  reasonCode: CriticalRepeatReasonCode;
  /** The value to report, or null when nothing is safe to report yet. */
  reportValue: number | null;
  /** How many supplied repeats were evaluated to reach this outcome. */
  repeatsEvaluated: number;
  /** Whether critical-result notification may proceed. Never true while status is 'pending'. */
  notifyAllowed: boolean;
};

export type CriticalRepeatInput = {
  first: CriticalRepeatResult;
  /** Subsequent repeat results, in the chronological order they were captured. */
  repeats: ReadonlyArray<CriticalRepeatResult>;
  policy: CriticalRepeatPolicy;
};

function hasRequiredIdentity(
  value: unknown,
): value is { subjectId: string; analyteCode: string; capturedAt: string } & Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.subjectId === 'string' &&
    candidate.subjectId.length > 0 &&
    typeof candidate.analyteCode === 'string' &&
    candidate.analyteCode.length > 0 &&
    typeof candidate.capturedAt === 'string'
  );
}

function toFiniteNumber(rawValue: unknown): number | undefined {
  if (typeof rawValue === 'number') {
    return Number.isFinite(rawValue) ? rawValue : undefined;
  }
  if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Canonicalize a unit for comparison only: trim outer whitespace and case-fold. Never infers or performs a unit conversion. */
function canonicalizeUnit(unit: unknown): string | undefined {
  if (typeof unit !== 'string') {
    return undefined;
  }
  const trimmed = unit.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : undefined;
}

function isValidToleranceValue(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isValidTolerance(tolerance: unknown): tolerance is CriticalRepeatTolerance {
  if (typeof tolerance !== 'object' || tolerance === null) {
    return false;
  }
  const candidate = tolerance as Record<string, unknown>;
  return isValidToleranceValue(candidate.absolute) && isValidToleranceValue(candidate.percent);
}

/** Validate the declared policy and return its canonicalized unit. Throws on any structural defect. */
function validatePolicy(policy: CriticalRepeatPolicy): string {
  if (typeof policy !== 'object' || policy === null) {
    throw new CriticalRepeatPolicyInputError('policy-malformed');
  }
  const candidate = policy as Record<string, unknown>;
  if (typeof candidate.analyteCode !== 'string' || candidate.analyteCode.length === 0) {
    throw new CriticalRepeatPolicyInputError('policy-malformed');
  }
  if (typeof candidate.repeatRequired !== 'boolean') {
    throw new CriticalRepeatPolicyInputError('policy-malformed');
  }

  const policyUnit = canonicalizeUnit(candidate.unit);
  if (policyUnit === undefined) {
    throw new CriticalRepeatPolicyInputError('policy-unit-missing');
  }

  if (
    typeof candidate.maxRepeats !== 'number' ||
    !Number.isFinite(candidate.maxRepeats) ||
    !Number.isInteger(candidate.maxRepeats) ||
    candidate.maxRepeats < 1
  ) {
    throw new CriticalRepeatPolicyInputError('policy-max-repeats-invalid');
  }

  if (!isValidTolerance(candidate.tolerance)) {
    throw new CriticalRepeatPolicyInputError('policy-tolerance-invalid');
  }
  const tolerance = candidate.tolerance as CriticalRepeatTolerance;
  if (policy.repeatRequired && tolerance.absolute === null && tolerance.percent === null) {
    throw new CriticalRepeatPolicyInputError('policy-tolerance-empty');
  }

  return policyUnit;
}

function outcome(
  status: CriticalRepeatStatus,
  reasonCode: CriticalRepeatReasonCode,
  reportValue: number | null,
  repeatsEvaluated: number,
  notifyAllowed: boolean,
): CriticalRepeatOutcome {
  return Object.freeze({ status, reasonCode, reportValue, repeatsEvaluated, notifyAllowed });
}

/**
 * Evaluate a fabricated first critical result, a declared per-analyte repeat
 * policy, and a fabricated, chronologically-ordered list of repeat results,
 * and return a single conservative outcome.
 *
 * Fail-closed: any repeat (or the first result itself) with an unparsable
 * timestamp, a nonnumeric value, a missing or mismatched unit, a mismatched
 * subject or analyte, or a timestamp that is not strictly after the result
 * before it resolves the outcome to `discordant` with no reportable value
 * and notification allowed, rather than being treated as agreement. A
 * structurally unusable request (unknown analyte, malformed first result or
 * repeat, invalid policy, or more repeats than the declared maximum allows)
 * throws CriticalRepeatPolicyInputError instead of guessing at an outcome.
 */
export function evaluateCriticalRepeat(input: CriticalRepeatInput): CriticalRepeatOutcome {
  const policyUnit = validatePolicy(input.policy);

  if (!hasRequiredIdentity(input.first)) {
    throw new CriticalRepeatPolicyInputError('first-malformed');
  }
  const first = input.first;

  if (first.analyteCode !== input.policy.analyteCode) {
    throw new CriticalRepeatPolicyInputError('unknown-analyte');
  }

  if (!Array.isArray(input.repeats)) {
    throw new CriticalRepeatPolicyInputError('repeats-not-array');
  }
  if (input.repeats.length > input.policy.maxRepeats) {
    throw new CriticalRepeatPolicyInputError('repeats-exceed-maximum');
  }

  const firstTime = Date.parse(first.capturedAt);
  const firstValue = toFiniteNumber(first.value);
  const firstUnit = canonicalizeUnit(first.unit);

  if (!Number.isFinite(firstTime)) {
    return outcome('discordant', 'first-result-timestamp-invalid', null, 0, true);
  }
  if (firstValue === undefined) {
    return outcome('discordant', 'first-result-value-invalid', null, 0, true);
  }
  if (firstUnit === undefined) {
    return outcome('discordant', 'first-result-unit-missing', null, 0, true);
  }
  if (firstUnit !== policyUnit) {
    return outcome('discordant', 'first-result-unit-mismatched', null, 0, true);
  }

  if (!input.policy.repeatRequired) {
    return outcome('confirmed', 'repeat-not-required', firstValue, 0, true);
  }

  if (input.repeats.length === 0) {
    return outcome('pending', 'awaiting-first-repeat', null, 0, false);
  }

  const tolerance = input.policy.tolerance;
  let previousTime = firstTime;

  for (let i = 0; i < input.repeats.length; i += 1) {
    const repeat = input.repeats[i];
    const attemptNumber = i + 1;

    if (!hasRequiredIdentity(repeat)) {
      throw new CriticalRepeatPolicyInputError('repeat-malformed');
    }

    if (repeat.subjectId !== first.subjectId) {
      return outcome('discordant', 'repeat-subject-mismatch', null, attemptNumber, true);
    }
    if (repeat.analyteCode !== first.analyteCode) {
      return outcome('discordant', 'repeat-analyte-mismatch', null, attemptNumber, true);
    }

    const repeatTime = Date.parse(repeat.capturedAt);
    const repeatValue = toFiniteNumber(repeat.value);
    const repeatUnit = canonicalizeUnit(repeat.unit);

    if (!Number.isFinite(repeatTime)) {
      return outcome('discordant', 'repeat-timestamp-invalid', null, attemptNumber, true);
    }
    if (repeatTime <= previousTime) {
      return outcome('discordant', 'repeat-not-after-previous', null, attemptNumber, true);
    }
    if (repeatValue === undefined) {
      return outcome('discordant', 'repeat-value-invalid', null, attemptNumber, true);
    }
    if (repeatUnit === undefined) {
      return outcome('discordant', 'repeat-unit-missing', null, attemptNumber, true);
    }
    if (repeatUnit !== policyUnit) {
      return outcome('discordant', 'repeat-unit-mismatched', null, attemptNumber, true);
    }

    previousTime = repeatTime;

    const absoluteDelta = Math.abs(repeatValue - firstValue);
    const percentDelta = firstValue !== 0 ? (absoluteDelta / Math.abs(firstValue)) * 100 : null;

    const agrees =
      (tolerance.absolute !== null && absoluteDelta <= tolerance.absolute) ||
      (tolerance.percent !== null && percentDelta !== null && percentDelta <= tolerance.percent);

    if (agrees) {
      return outcome('confirmed', 'repeat-confirmed', firstValue, attemptNumber, true);
    }

    if (attemptNumber >= input.policy.maxRepeats) {
      return outcome('discordant', 'repeats-exhausted', null, attemptNumber, true);
    }
  }

  return outcome('pending', 'awaiting-next-repeat', null, input.repeats.length, false);
}
