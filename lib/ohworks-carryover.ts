/**
 * Fail-closed synthetic OHWorks carryover check.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated,
 * position-ordered run of results and a fabricated set of declared
 * per-analyte carryover rules, it walks the run in position order and
 * decides, for every result, whether it sits close enough behind an
 * unwashed "high" result (a result at or above that analyte's declared
 * high threshold) to carry a contamination risk, and whether that risk is
 * severe enough that the result must be repeated.
 *
 * Modeling choices, made explicit rather than guessed at silently:
 *
 *   - A wash step is declared on the result that follows it (`washBefore:
 *     true`) and is treated as a whole-run event: it resets every
 *     analyte's pending carryover source, not just the analyte of the
 *     washed result. This matches a physical probe/path rinse between
 *     positions, which does not know or care which analyte runs next.
 *   - Carryover risk persists across every unwashed position that follows
 *     a high result for that analyte, not just the single next one: a
 *     contaminated flow path stays contaminated until it is washed. The
 *     most recent unwashed high result for an analyte is always the
 *     active source.
 *   - A result that is itself high becomes the new active source for its
 *     analyte once it has been assessed, regardless of whether it was
 *     itself flagged for repeat.
 *
 * It performs no I/O, reads no system clock, mutates no SENAITE or
 * database state, and touches no real instrument, sample, or customer
 * data. It never asserts approval, compliance, accreditation, or
 * releasability.
 *
 *   - clear:        no active unwashed high-result source applies.
 *   - at_risk:       an active source applies, but the computed carryover
 *                    contribution is within the declared repeat threshold.
 *   - must_repeat:   the computed carryover contribution exceeds the
 *                    declared repeat threshold.
 *
 * Fails closed instead of guessing: a run whose declared positions are
 * not strictly increasing in array order, a result whose analyte has no
 * declared rule, or a result whose value is not a finite number all throw
 * CarryoverInputError rather than being assigned a computed outcome.
 */

export type CarryoverSampleResult = {
  /** Synthetic sample/result identifier. Never a real patient or customer identifier. */
  resultId: string;
  /** Ordered position of this result within the run; must be a finite integer, strictly increasing across the array. */
  position: number;
  /** Fabricated analyte/parameter code; must match a declared carryover rule. */
  analyteCode: string;
  /** Raw fabricated observed value; must be a finite number. */
  value: unknown;
  /** Whether a declared wash/rinse step was performed immediately before this position, resetting every analyte's carryover risk. */
  washBefore: boolean;
};

export type CarryoverThresholdRule = {
  /** Fabricated analyte/parameter code this rule governs. */
  analyteCode: string;
  /** Inclusive value at or above which a result is "high" and capable of causing carryover into later, unwashed positions. */
  highThreshold: number;
  /** Fraction, in (0, 1], of a high result's value assumed to carry over into a later unwashed position for this analyte. */
  carryoverFactor: number;
  /** Inclusive computed-contribution threshold; a result whose contribution exceeds this must be repeated. */
  repeatThreshold: number;
};

export type CarryoverRun = {
  results: CarryoverSampleResult[];
  rules: ReadonlyArray<CarryoverThresholdRule>;
};

export type CarryoverStatus = 'clear' | 'at_risk' | 'must_repeat';

export type CarryoverReasonCode =
  | 'no-preceding-high'
  | 'reset-by-wash'
  | 'contribution-within-threshold'
  | 'contribution-exceeds-threshold';

const REASON_MESSAGES: Record<CarryoverReasonCode, string> = {
  'no-preceding-high': 'No unwashed high result for this analyte precedes this position.',
  'reset-by-wash': 'A declared wash step immediately before this position reset the carryover risk.',
  'contribution-within-threshold': 'The computed carryover contribution is within the declared repeat threshold.',
  'contribution-exceeds-threshold': 'The computed carryover contribution exceeds the declared repeat threshold.',
};

/** Deterministic, privacy-safe human-readable text for a carryover reason code, suitable for UI display. */
export function explainCarryoverReason(code: CarryoverReasonCode): string {
  return REASON_MESSAGES[code];
}

export type CarryoverAssessment = {
  resultId: string;
  status: CarryoverStatus;
  reasonCode: CarryoverReasonCode;
  /** The computed carryover contribution from the active unwashed high-result source for this analyte, or null when there is none. */
  contribution: number | null;
  /** The position of the high result this assessment is attributed to, or null. */
  sourcePosition: number | null;
};

export type CarryoverInputErrorCode =
  | 'run-not-object'
  | 'results-not-array'
  | 'rules-not-array'
  | 'rules-empty'
  | 'rules-invalid'
  | 'rules-duplicate-analyte'
  | 'result-missing-identity'
  | 'duplicate-result-id'
  | 'invalid-position'
  | 'positions-out-of-order'
  | 'unknown-analyte'
  | 'non-finite-value';

const INPUT_ERROR_MESSAGES: Record<CarryoverInputErrorCode, string> = {
  'run-not-object': 'The carryover run is not a valid object.',
  'results-not-array': 'The carryover run results are not a list.',
  'rules-not-array': 'The declared carryover rules are not a list.',
  'rules-empty': 'No carryover rules were declared.',
  'rules-invalid': 'A declared carryover rule is not structurally valid.',
  'rules-duplicate-analyte': 'More than one declared carryover rule shares the same analyte.',
  'result-missing-identity': 'A result is missing a required identity field.',
  'duplicate-result-id': 'More than one result was submitted with the same result identifier.',
  'invalid-position': 'A result position is not a finite integer.',
  'positions-out-of-order': 'Results are not given in strictly increasing position order.',
  'unknown-analyte': 'A result declares an analyte with no declared carryover rule.',
  'non-finite-value': 'A result value is not a finite number.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a carryover outcome. */
export class CarryoverInputError extends Error {
  readonly code: CarryoverInputErrorCode;

  constructor(code: CarryoverInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'CarryoverInputError';
    this.code = code;
  }
}

function hasResultIdentity(
  value: unknown,
): value is { resultId: string; position: unknown; analyteCode: string; value: unknown; washBefore: unknown } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.resultId === 'string' &&
    candidate.resultId.length > 0 &&
    typeof candidate.analyteCode === 'string' &&
    candidate.analyteCode.length > 0 &&
    typeof candidate.washBefore === 'boolean' &&
    'position' in candidate &&
    'value' in candidate
  );
}

function findDuplicateKey(keys: string[]): string | undefined {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      return key;
    }
    seen.add(key);
  }
  return undefined;
}

function isValidRule(rule: unknown): rule is CarryoverThresholdRule {
  if (typeof rule !== 'object' || rule === null) {
    return false;
  }
  const candidate = rule as Record<string, unknown>;
  return (
    typeof candidate.analyteCode === 'string' &&
    candidate.analyteCode.length > 0 &&
    typeof candidate.highThreshold === 'number' &&
    Number.isFinite(candidate.highThreshold) &&
    typeof candidate.carryoverFactor === 'number' &&
    Number.isFinite(candidate.carryoverFactor) &&
    candidate.carryoverFactor > 0 &&
    candidate.carryoverFactor <= 1 &&
    typeof candidate.repeatThreshold === 'number' &&
    Number.isFinite(candidate.repeatThreshold) &&
    candidate.repeatThreshold >= 0
  );
}

function validateRules(rules: ReadonlyArray<CarryoverThresholdRule>): Map<string, CarryoverThresholdRule> {
  if (!Array.isArray(rules)) {
    throw new CarryoverInputError('rules-not-array');
  }
  if (rules.length === 0) {
    throw new CarryoverInputError('rules-empty');
  }
  for (const rule of rules) {
    if (!isValidRule(rule)) {
      throw new CarryoverInputError('rules-invalid');
    }
  }

  const duplicateAnalyte = findDuplicateKey(rules.map((rule) => rule.analyteCode));
  if (duplicateAnalyte !== undefined) {
    throw new CarryoverInputError('rules-duplicate-analyte');
  }

  return new Map(rules.map((rule) => [rule.analyteCode, rule]));
}

function assessment(
  resultId: string,
  status: CarryoverStatus,
  reasonCode: CarryoverReasonCode,
  contribution: number | null,
  sourcePosition: number | null,
): CarryoverAssessment {
  return Object.freeze({ resultId, status, reasonCode, contribution, sourcePosition });
}

type PendingSource = { value: number; position: number };

/**
 * Evaluate a fabricated, position-ordered carryover run against declared
 * per-analyte carryover rules and return one conservative assessment per
 * result, in the same order the results were given.
 *
 * Fail-closed: results whose declared positions are not strictly
 * increasing in array order, a result whose analyte has no declared rule,
 * or a result whose value is not a finite number all throw
 * CarryoverInputError instead of guessing at a per-result outcome. A
 * declared wash step resets every analyte's carryover risk from that
 * position forward, regardless of which analyte the washed result itself
 * belongs to.
 */
export function evaluateCarryoverRisk(run: CarryoverRun): CarryoverAssessment[] {
  if (typeof run !== 'object' || run === null) {
    throw new CarryoverInputError('run-not-object');
  }

  const rulesByAnalyte = validateRules(run.rules);

  if (!Array.isArray(run.results)) {
    throw new CarryoverInputError('results-not-array');
  }

  for (const result of run.results) {
    if (!hasResultIdentity(result)) {
      throw new CarryoverInputError('result-missing-identity');
    }
  }

  const duplicateResultId = findDuplicateKey(run.results.map((result) => result.resultId));
  if (duplicateResultId !== undefined) {
    throw new CarryoverInputError('duplicate-result-id');
  }

  for (const result of run.results) {
    if (typeof result.position !== 'number' || !Number.isFinite(result.position) || !Number.isInteger(result.position)) {
      throw new CarryoverInputError('invalid-position');
    }
  }

  for (let i = 1; i < run.results.length; i += 1) {
    if (run.results[i].position <= run.results[i - 1].position) {
      throw new CarryoverInputError('positions-out-of-order');
    }
  }

  for (const result of run.results) {
    if (!rulesByAnalyte.has(result.analyteCode)) {
      throw new CarryoverInputError('unknown-analyte');
    }
  }

  for (const result of run.results) {
    if (typeof result.value !== 'number' || !Number.isFinite(result.value)) {
      throw new CarryoverInputError('non-finite-value');
    }
  }

  const pendingByAnalyte = new Map<string, PendingSource>();

  return run.results.map((result) => {
    const hadPendingForAnalyte = pendingByAnalyte.has(result.analyteCode);
    if (result.washBefore) {
      pendingByAnalyte.clear();
    }

    const rule = rulesByAnalyte.get(result.analyteCode) as CarryoverThresholdRule;
    const pending = pendingByAnalyte.get(result.analyteCode);

    let outcome: CarryoverAssessment;
    if (!pending) {
      outcome = assessment(
        result.resultId,
        'clear',
        result.washBefore && hadPendingForAnalyte ? 'reset-by-wash' : 'no-preceding-high',
        null,
        null,
      );
    } else {
      const contribution = pending.value * rule.carryoverFactor;
      if (contribution > rule.repeatThreshold) {
        outcome = assessment(result.resultId, 'must_repeat', 'contribution-exceeds-threshold', contribution, pending.position);
      } else {
        outcome = assessment(result.resultId, 'at_risk', 'contribution-within-threshold', contribution, pending.position);
      }
    }

    if ((result.value as number) >= rule.highThreshold) {
      pendingByAnalyte.set(result.analyteCode, { value: result.value as number, position: result.position });
    }

    return outcome;
  });
}
