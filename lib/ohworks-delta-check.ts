/**
 * Fail-closed synthetic OHWorks result delta check.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated
 * current result, an optional fabricated prior result for the same subject
 * and analyte, and a fabricated set of declared delta limit rules (absolute
 * and percent thresholds for a "flag" tier and a stricter "block" tier, each
 * scoped to a maximum elapsed-time window), it classifies the current result
 * as one of three dispositions and returns the computed delta and the rule
 * that was applied.
 *
 * It performs no I/O, reads no system clock, mutates no SENAITE or database
 * state, and touches no real subject, sample, or customer data. It never
 * asserts approval, compliance, accreditation, or releasability.
 *
 *   - pass:  no prior result was comparable, or the delta is within limits.
 *   - flag:  the delta exceeds a declared "flag" threshold.
 *   - block: the delta exceeds a declared "block" threshold, or the
 *            comparison itself cannot be trusted (unit mismatch, invalid
 *            timestamp, invalid value, mismatched subject/analyte, or a
 *            prior result that is not strictly before the current one).
 *
 * A missing prior result, or a prior result older than every declared
 * window, is not an error: there is nothing to compare against, so the
 * result passes with no rule applied. Anything that would require guessing
 * -- an untrustworthy comparison, or a structurally unusable request --
 * fails closed instead: either the outcome is `block`, or, for requests too
 * malformed to classify at all, this module throws DeltaCheckInputError.
 */

export type DeltaCheckStatus = 'pass' | 'flag' | 'block';

export type DeltaCheckSampleResult = {
  /** Synthetic subject identifier. Never a real patient or customer identifier. */
  subjectId: string;
  /** Fabricated analyte/parameter code. */
  analyteCode: string;
  /** Raw fabricated observed value, exactly as received; may be nonnumeric. */
  value: unknown;
  unit?: string;
  /** ISO 8601 timestamp the result was captured. */
  capturedAt: string;
};

export type DeltaLimitTier = {
  /** Non-negative absolute delta threshold, or null if this tier declares no absolute limit. */
  absolute: number | null;
  /** Non-negative percent delta threshold, or null if this tier declares no percent limit. */
  percent: number | null;
};

export type DeltaLimitRule = {
  /** Inclusive upper bound, in milliseconds, of elapsed time between prior and current capture for this rule to apply. */
  windowMs: number;
  /** Canonical unit these limits are declared in; must match the current and prior result unit exactly (after trim/case-fold). */
  unit: string;
  flag: DeltaLimitTier;
  block: DeltaLimitTier;
};

export type DeltaCheckReasonCode =
  | 'no-prior-result'
  | 'prior-outside-window'
  | 'prior-subject-mismatch'
  | 'prior-analyte-mismatch'
  | 'current-timestamp-invalid'
  | 'prior-timestamp-invalid'
  | 'prior-not-before-current'
  | 'current-value-invalid'
  | 'prior-value-invalid'
  | 'current-unit-missing'
  | 'prior-unit-missing'
  | 'current-unit-mismatched'
  | 'prior-unit-mismatched'
  | 'within-limits'
  | 'delta-flagged'
  | 'delta-blocked';

export type DeltaCheckComputedDelta = {
  /** current.value - prior.value, signed. */
  absolute: number;
  /** Signed percent change relative to |prior.value|; null when prior.value is 0 (percent is undefined). */
  percent: number | null;
};

export type DeltaCheckOutcome = {
  status: DeltaCheckStatus;
  reasonCode: DeltaCheckReasonCode;
  /** Null only when there is no comparable prior result at all (no-prior-result or prior-outside-window). */
  delta: DeltaCheckComputedDelta | null;
  /** The declared rule applied to reach this outcome; null when no rule was applicable. */
  rule: DeltaLimitRule | null;
};

const REASON_MESSAGES: Record<DeltaCheckReasonCode, string> = {
  'no-prior-result': 'There is no prior result to compare against, so no delta could be computed.',
  'prior-outside-window': 'The prior result is older than every declared delta window, so no rule applies.',
  'prior-subject-mismatch': 'The prior result belongs to a different subject than the current result.',
  'prior-analyte-mismatch': 'The prior result is for a different analyte than the current result.',
  'current-timestamp-invalid': 'The current result capture timestamp could not be parsed.',
  'prior-timestamp-invalid': 'The prior result capture timestamp could not be parsed.',
  'prior-not-before-current': 'The prior result is not strictly earlier than the current result.',
  'current-value-invalid': 'The current result value is not a finite number.',
  'prior-value-invalid': 'The prior result value is not a finite number.',
  'current-unit-missing': 'The current result has no unit.',
  'prior-unit-missing': 'The prior result has no unit.',
  'current-unit-mismatched': 'The current result unit does not match the declared delta rule unit.',
  'prior-unit-mismatched': 'The prior result unit does not match the declared delta rule unit.',
  'within-limits': 'The computed delta is within every declared limit for the applicable rule.',
  'delta-flagged': 'The computed delta exceeds a declared flag threshold for the applicable rule.',
  'delta-blocked': 'The computed delta exceeds a declared block threshold for the applicable rule.',
};

/** Deterministic, privacy-safe human-readable text for a delta check reason code, suitable for UI display. */
export function explainDeltaCheckReason(code: DeltaCheckReasonCode): string {
  return REASON_MESSAGES[code];
}

export type DeltaCheckInputErrorCode =
  | 'current-malformed'
  | 'prior-malformed'
  | 'rules-not-array'
  | 'rules-empty'
  | 'rules-invalid'
  | 'rules-unit-inconsistent'
  | 'rules-duplicate-window';

const INPUT_ERROR_MESSAGES: Record<DeltaCheckInputErrorCode, string> = {
  'current-malformed': 'The current result is missing a required identity field.',
  'prior-malformed': 'The prior result is missing a required identity field.',
  'rules-not-array': 'The declared delta limit rules are not a list.',
  'rules-empty': 'No delta limit rules were declared.',
  'rules-invalid': 'A declared delta limit rule is not structurally valid.',
  'rules-unit-inconsistent': 'The declared delta limit rules do not all share the same unit.',
  'rules-duplicate-window': 'More than one declared delta limit rule shares the same time window.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a delta check outcome. */
export class DeltaCheckInputError extends Error {
  readonly code: DeltaCheckInputErrorCode;

  constructor(code: DeltaCheckInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'DeltaCheckInputError';
    this.code = code;
  }
}

export type DeltaCheckInput = {
  current: DeltaCheckSampleResult;
  /** The most recent prior result for the same subject and analyte, or null if none exists. */
  prior: DeltaCheckSampleResult | null;
  rules: ReadonlyArray<DeltaLimitRule>;
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

function isValidLimitValue(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isValidTier(tier: unknown): tier is DeltaLimitTier {
  if (typeof tier !== 'object' || tier === null) {
    return false;
  }
  const candidate = tier as Record<string, unknown>;
  return isValidLimitValue(candidate.absolute) && isValidLimitValue(candidate.percent);
}

function ruleHasAnyLimit(rule: DeltaLimitRule): boolean {
  return (
    rule.flag.absolute !== null ||
    rule.flag.percent !== null ||
    rule.block.absolute !== null ||
    rule.block.percent !== null
  );
}

function isValidRule(rule: unknown): rule is DeltaLimitRule {
  if (typeof rule !== 'object' || rule === null) {
    return false;
  }
  const candidate = rule as Record<string, unknown>;
  if (typeof candidate.windowMs !== 'number' || !Number.isFinite(candidate.windowMs) || candidate.windowMs <= 0) {
    return false;
  }
  if (canonicalizeUnit(candidate.unit) === undefined) {
    return false;
  }
  if (!isValidTier(candidate.flag) || !isValidTier(candidate.block)) {
    return false;
  }
  return ruleHasAnyLimit(rule as DeltaLimitRule);
}

function validateRules(rules: ReadonlyArray<DeltaLimitRule>): string {
  if (!Array.isArray(rules)) {
    throw new DeltaCheckInputError('rules-not-array');
  }
  if (rules.length === 0) {
    throw new DeltaCheckInputError('rules-empty');
  }
  for (const rule of rules) {
    if (!isValidRule(rule)) {
      throw new DeltaCheckInputError('rules-invalid');
    }
  }

  const canonicalUnits = new Set(rules.map((rule) => canonicalizeUnit(rule.unit)));
  if (canonicalUnits.size > 1) {
    throw new DeltaCheckInputError('rules-unit-inconsistent');
  }

  const windows = new Set<number>();
  for (const rule of rules) {
    if (windows.has(rule.windowMs)) {
      throw new DeltaCheckInputError('rules-duplicate-window');
    }
    windows.add(rule.windowMs);
  }

  return canonicalUnits.values().next().value as string;
}

function outcome(
  status: DeltaCheckStatus,
  reasonCode: DeltaCheckReasonCode,
  delta: DeltaCheckComputedDelta | null,
  rule: DeltaLimitRule | null,
): DeltaCheckOutcome {
  return Object.freeze({ status, reasonCode, delta, rule });
}

/**
 * Evaluate a fabricated current result against an optional fabricated prior
 * result for the same subject and analyte, using declared per-window delta
 * limit rules, and return a single conservative outcome.
 *
 * Fail-closed: a missing or unparsable timestamp, a nonnumeric value, a
 * missing or mismatched unit, a mismatched subject or analyte on the prior
 * result, or a prior result that is not strictly before the current one all
 * resolve to `block` rather than a guessed delta. A missing prior result, or
 * a prior result older than every declared window, resolves to `pass` with
 * no rule applied, since there is nothing to compare against. A structurally
 * unusable request (missing identity fields, or invalid/empty/inconsistent
 * rules) throws DeltaCheckInputError instead of guessing at an outcome.
 */
export function evaluateResultDelta(input: DeltaCheckInput): DeltaCheckOutcome {
  const ruleUnit = validateRules(input.rules);

  if (!hasRequiredIdentity(input.current)) {
    throw new DeltaCheckInputError('current-malformed');
  }
  const current = input.current;

  const currentTime = Date.parse(current.capturedAt);
  const currentValue = toFiniteNumber(current.value);
  const currentUnit = canonicalizeUnit(current.unit);

  if (!Number.isFinite(currentTime)) {
    return outcome('block', 'current-timestamp-invalid', null, null);
  }
  if (currentValue === undefined) {
    return outcome('block', 'current-value-invalid', null, null);
  }
  if (currentUnit === undefined) {
    return outcome('block', 'current-unit-missing', null, null);
  }
  if (currentUnit !== ruleUnit) {
    return outcome('block', 'current-unit-mismatched', null, null);
  }

  if (input.prior == null) {
    return outcome('pass', 'no-prior-result', null, null);
  }
  if (!hasRequiredIdentity(input.prior)) {
    throw new DeltaCheckInputError('prior-malformed');
  }
  const prior = input.prior;

  if (prior.subjectId !== current.subjectId) {
    return outcome('block', 'prior-subject-mismatch', null, null);
  }
  if (prior.analyteCode !== current.analyteCode) {
    return outcome('block', 'prior-analyte-mismatch', null, null);
  }

  const priorTime = Date.parse(prior.capturedAt);
  const priorValue = toFiniteNumber(prior.value);
  const priorUnit = canonicalizeUnit(prior.unit);

  if (!Number.isFinite(priorTime)) {
    return outcome('block', 'prior-timestamp-invalid', null, null);
  }
  if (priorValue === undefined) {
    return outcome('block', 'prior-value-invalid', null, null);
  }
  if (priorUnit === undefined) {
    return outcome('block', 'prior-unit-missing', null, null);
  }
  if (priorUnit !== ruleUnit) {
    return outcome('block', 'prior-unit-mismatched', null, null);
  }
  if (priorTime >= currentTime) {
    return outcome('block', 'prior-not-before-current', null, null);
  }

  const absoluteDelta = currentValue - priorValue;
  const percentDelta = priorValue !== 0 ? (absoluteDelta / Math.abs(priorValue)) * 100 : null;
  const delta: DeltaCheckComputedDelta = { absolute: absoluteDelta, percent: percentDelta };

  const elapsedMs = currentTime - priorTime;
  const candidates = input.rules.filter((rule) => elapsedMs <= rule.windowMs);
  if (candidates.length === 0) {
    return outcome('pass', 'prior-outside-window', delta, null);
  }

  const matchedRule = candidates.reduce((narrowest, rule) =>
    rule.windowMs < narrowest.windowMs ? rule : narrowest,
  );

  const absMagnitude = Math.abs(absoluteDelta);
  const percentMagnitude = percentDelta === null ? null : Math.abs(percentDelta);

  const blockTriggered =
    (matchedRule.block.absolute !== null && absMagnitude > matchedRule.block.absolute) ||
    (matchedRule.block.percent !== null && percentMagnitude !== null && percentMagnitude > matchedRule.block.percent);

  const flagTriggered =
    !blockTriggered &&
    ((matchedRule.flag.absolute !== null && absMagnitude > matchedRule.flag.absolute) ||
      (matchedRule.flag.percent !== null && percentMagnitude !== null && percentMagnitude > matchedRule.flag.percent));

  if (blockTriggered) {
    return outcome('block', 'delta-blocked', delta, matchedRule);
  }
  if (flagTriggered) {
    return outcome('flag', 'delta-flagged', delta, matchedRule);
  }
  return outcome('pass', 'within-limits', delta, matchedRule);
}
