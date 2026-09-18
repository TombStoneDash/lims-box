/**
 * Fail-closed, deterministic OHWorks autoverification decision.
 *
 * This module is a pure, dependency-free evaluator: given one fabricated
 * result (its analyte code, numeric value, unit, and raw instrument flag
 * codes), the QC state declared for the run it was captured in, a
 * caller-computed delta-check outcome, and a caller-declared analytical
 * measurement range and critical limits, it decides whether the result may
 * be released automatically or must be held for human review.
 *
 * It performs no I/O, reads no system clock, mutates no SENAITE or database
 * state, and touches no real instrument, sample, or customer data. It never
 * asserts approval, compliance, accreditation, or releasability beyond the
 * single AUTO_RELEASE / HOLD_FOR_REVIEW decision it documents, and it never
 * throws: every input, however malformed, resolves to a decision rather than
 * an exception, because a fielded verification gate must always produce a
 * disposition. Every returned reason is a stable code drawn from a fixed,
 * declared vocabulary -- the submitted analyte code, value, unit, and flags
 * are never echoed into a reason or message.
 *
 * Decision shape -- every applicable reason is collected (not just the
 * first), then returned in one fixed declared order regardless of the order
 * in which the underlying checks ran:
 *
 *   - Any missing, unknown, non-finite, or structurally contradictory input
 *     (an unparsable value, a missing unit, malformed instrument flags, an
 *     unrecognized QC state or delta-check status, an invalid or inverted
 *     measurement range, invalid critical limits, or a unit that does not
 *     match across the result/range/limits) holds the result.
 *   - Any QC state other than 'in-control' -- 'warning', 'out-of-control', or
 *     'missing' -- holds the result. This mirrors the Westgard-style QC
 *     evaluator elsewhere in this codebase, where only a fully clean run is
 *     treated as good and 'warning' is never folded into a pass.
 *     'out-of-control' and 'missing' hold unconditionally, with or without
 *     any other signal.
 *   - Any instrument flag present on the result holds it: an instrument
 *     exception is a review signal regardless of what else the result shows.
 *   - A delta-check outcome of 'flag' or 'block' holds the result; only
 *     'pass' does not.
 *   - A value outside the declared analytical measurement range holds the
 *     result, but only once the result's unit is confirmed to match the
 *     range's declared unit -- a unit mismatch holds on its own, without
 *     also guessing at an in/out-of-range comparison across scales.
 *   - A value at or beyond either declared critical limit holds the result
 *     unconditionally, following the same unit-confirmed-before-compared
 *     rule as the measurement range.
 *
 * The decision is AUTO_RELEASE only when none of the above fire; otherwise
 * it is HOLD_FOR_REVIEW with every fired reason code, sorted into the one
 * fixed order declared by REASON_ORDER.
 */

export type AutoVerificationDecisionStatus = 'AUTO_RELEASE' | 'HOLD_FOR_REVIEW';

export type AutoVerificationQCState = 'in-control' | 'warning' | 'out-of-control' | 'missing';

export type AutoVerificationDeltaCheckStatus = 'pass' | 'flag' | 'block';

const KNOWN_QC_STATES: ReadonlySet<string> = new Set<AutoVerificationQCState>([
  'in-control',
  'warning',
  'out-of-control',
  'missing',
]);

const KNOWN_DELTA_CHECK_STATUSES: ReadonlySet<string> = new Set<AutoVerificationDeltaCheckStatus>([
  'pass',
  'flag',
  'block',
]);

/** Fabricated result identity and observation. Every field is caller-supplied and may be malformed. */
export type AutoVerificationResultInput = {
  /** Fabricated analyte/parameter code. */
  analyteCode: unknown;
  /** Raw fabricated observed value, exactly as received; may be nonnumeric. */
  value: unknown;
  unit: unknown;
  /** Raw fabricated instrument flag codes attached to this result; an empty array means no flags. */
  instrumentFlags: unknown;
};

/** Caller-declared analytical measurement range (AMR) for this analyte and unit. */
export type AutoVerificationMeasurementRangeInput = {
  lowerBound: unknown;
  upperBound: unknown;
  unit: unknown;
};

/** Caller-declared critical limits for this analyte and unit. Either bound may be null, but not both. */
export type AutoVerificationCriticalLimitsInput = {
  lower: unknown;
  upper: unknown;
  unit: unknown;
};

/** The full fabricated request this module decides over. Every field may be malformed; the function never throws. */
export type AutoVerificationRequest = {
  result: AutoVerificationResultInput;
  /** Raw declared QC state of the run this result was captured in. */
  qcState: unknown;
  /** Raw declared delta-check outcome, as produced by a caller's own delta-check evaluation. */
  deltaCheckStatus: unknown;
  measurementRange: AutoVerificationMeasurementRangeInput;
  criticalLimits: AutoVerificationCriticalLimitsInput;
};

export type AutoVerificationHoldReasonCode =
  | 'analyte-code-invalid'
  | 'value-invalid'
  | 'unit-invalid'
  | 'instrument-flags-invalid'
  | 'instrument-flag-present'
  | 'qc-state-invalid'
  | 'qc-missing'
  | 'qc-out-of-control'
  | 'qc-warning'
  | 'delta-check-invalid'
  | 'delta-check-blocked'
  | 'delta-check-flagged'
  | 'measurement-range-invalid'
  | 'measurement-range-unit-mismatch'
  | 'value-outside-measurement-range'
  | 'critical-limits-invalid'
  | 'critical-limits-unit-mismatch'
  | 'value-critical';

/**
 * The one fixed order every returned reason list is sorted into, regardless
 * of the order the underlying checks ran in. Declared once, here, so the
 * order is stable across changes to the evaluation logic below.
 */
const REASON_ORDER: ReadonlyArray<AutoVerificationHoldReasonCode> = [
  'analyte-code-invalid',
  'value-invalid',
  'unit-invalid',
  'instrument-flags-invalid',
  'instrument-flag-present',
  'qc-state-invalid',
  'qc-missing',
  'qc-out-of-control',
  'qc-warning',
  'delta-check-invalid',
  'delta-check-blocked',
  'delta-check-flagged',
  'measurement-range-invalid',
  'measurement-range-unit-mismatch',
  'value-outside-measurement-range',
  'critical-limits-invalid',
  'critical-limits-unit-mismatch',
  'value-critical',
];

const REASON_RANK: ReadonlyMap<AutoVerificationHoldReasonCode, number> = new Map(
  REASON_ORDER.map((code, index) => [code, index]),
);

/** Static, privacy-safe messages keyed only by code -- never by anything submitted in a request. */
const REASON_MESSAGES: Record<AutoVerificationHoldReasonCode, string> = {
  'analyte-code-invalid': 'The result has no valid analyte code.',
  'value-invalid': 'The result value is not a finite number.',
  'unit-invalid': 'The result has no valid unit.',
  'instrument-flags-invalid': 'The submitted instrument flags are not a valid list of flag codes.',
  'instrument-flag-present': 'The result carries at least one instrument flag.',
  'qc-state-invalid': 'The declared QC state for this run is not a recognized value.',
  'qc-missing': 'No QC has been run for this run.',
  'qc-out-of-control': 'QC for this run is out of control.',
  'qc-warning': 'QC for this run is in a warning state.',
  'delta-check-invalid': 'The declared delta-check outcome is not a recognized value.',
  'delta-check-blocked': 'The delta-check outcome is blocked.',
  'delta-check-flagged': 'The delta-check outcome is flagged.',
  'measurement-range-invalid': 'The declared analytical measurement range is not a valid bounded range.',
  'measurement-range-unit-mismatch': 'The result unit does not match the declared measurement range unit.',
  'value-outside-measurement-range': 'The result value falls outside the declared analytical measurement range.',
  'critical-limits-invalid': 'The declared critical limits are not structurally valid.',
  'critical-limits-unit-mismatch': 'The result unit does not match the declared critical limits unit.',
  'value-critical': 'The result value is at or beyond a declared critical limit.',
};

/** Deterministic, privacy-safe human-readable text for a hold reason code, suitable for UI display. */
export function explainAutoVerificationReason(code: AutoVerificationHoldReasonCode): string {
  return REASON_MESSAGES[code];
}

export type AutoVerificationOutcome = {
  decision: AutoVerificationDecisionStatus;
  /** Every fired hold reason, sorted into the fixed order declared by REASON_ORDER. Empty when AUTO_RELEASE. */
  reasons: ReadonlyArray<AutoVerificationHoldReasonCode>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read a key off a value that might not even be an object, without ever throwing. */
function safeField(value: unknown, key: string): unknown {
  return isPlainObject(value) ? value[key] : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Like toFiniteNumber, but null is a valid, distinct outcome from "invalid". Undefined means invalid. */
function toNullableFiniteNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  return toFiniteNumber(value);
}

/** Canonicalize a unit for comparison only: trim outer whitespace and case-fold. Never infers or performs a unit conversion. */
function canonicalizeUnit(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : undefined;
}

function isValidInstrumentFlagList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function sortReasons(reasons: AutoVerificationHoldReasonCode[]): AutoVerificationHoldReasonCode[] {
  return [...reasons].sort((a, b) => (REASON_RANK.get(a) ?? 0) - (REASON_RANK.get(b) ?? 0));
}

/**
 * Decide whether one fabricated result may be auto-released or must be held
 * for review, and return every fired hold reason in a fixed order.
 *
 * Pure and total: this function never throws. Every field of `request`,
 * however missing, malformed, non-finite, unrecognized, or contradictory,
 * is treated as a hold signal rather than an exception. See the module doc
 * above for the full decision shape.
 */
export function evaluateAutoVerification(request: unknown): AutoVerificationOutcome {
  const reasons: AutoVerificationHoldReasonCode[] = [];
  const flag = (code: AutoVerificationHoldReasonCode) => reasons.push(code);

  const result = safeField(request, 'result');
  const analyteCode = safeField(result, 'analyteCode');
  const rawValue = safeField(result, 'value');
  const rawUnit = safeField(result, 'unit');
  const rawInstrumentFlags = safeField(result, 'instrumentFlags');

  if (!isNonEmptyString(analyteCode)) {
    flag('analyte-code-invalid');
  }

  const value = toFiniteNumber(rawValue);
  if (value === undefined) {
    flag('value-invalid');
  }

  const resultUnit = canonicalizeUnit(rawUnit);
  if (resultUnit === undefined) {
    flag('unit-invalid');
  }

  if (!isValidInstrumentFlagList(rawInstrumentFlags)) {
    flag('instrument-flags-invalid');
  } else if (rawInstrumentFlags.length > 0) {
    flag('instrument-flag-present');
  }

  const rawQcState = safeField(request, 'qcState');
  if (typeof rawQcState !== 'string' || !KNOWN_QC_STATES.has(rawQcState)) {
    flag('qc-state-invalid');
  } else if (rawQcState === 'missing') {
    flag('qc-missing');
  } else if (rawQcState === 'out-of-control') {
    flag('qc-out-of-control');
  } else if (rawQcState === 'warning') {
    flag('qc-warning');
  }

  const rawDeltaCheckStatus = safeField(request, 'deltaCheckStatus');
  if (typeof rawDeltaCheckStatus !== 'string' || !KNOWN_DELTA_CHECK_STATUSES.has(rawDeltaCheckStatus)) {
    flag('delta-check-invalid');
  } else if (rawDeltaCheckStatus === 'block') {
    flag('delta-check-blocked');
  } else if (rawDeltaCheckStatus === 'flag') {
    flag('delta-check-flagged');
  }

  const measurementRange = safeField(request, 'measurementRange');
  const rangeLower = toFiniteNumber(safeField(measurementRange, 'lowerBound'));
  const rangeUpper = toFiniteNumber(safeField(measurementRange, 'upperBound'));
  const rangeUnit = canonicalizeUnit(safeField(measurementRange, 'unit'));
  const rangeValid = rangeLower !== undefined && rangeUpper !== undefined && rangeUnit !== undefined && rangeLower <= rangeUpper;

  if (!rangeValid) {
    flag('measurement-range-invalid');
  } else if (resultUnit !== undefined) {
    if (resultUnit !== rangeUnit) {
      flag('measurement-range-unit-mismatch');
    } else if (value !== undefined && (value < rangeLower! || value > rangeUpper!)) {
      flag('value-outside-measurement-range');
    }
  }

  const criticalLimits = safeField(request, 'criticalLimits');
  const limitsLower = toNullableFiniteNumber(safeField(criticalLimits, 'lower'));
  const limitsUpper = toNullableFiniteNumber(safeField(criticalLimits, 'upper'));
  const limitsUnit = canonicalizeUnit(safeField(criticalLimits, 'unit'));
  const limitsValid =
    limitsLower !== undefined &&
    limitsUpper !== undefined &&
    limitsUnit !== undefined &&
    !(limitsLower === null && limitsUpper === null) &&
    !(limitsLower !== null && limitsUpper !== null && limitsLower >= limitsUpper);

  if (!limitsValid) {
    flag('critical-limits-invalid');
  } else if (resultUnit !== undefined) {
    if (resultUnit !== limitsUnit) {
      flag('critical-limits-unit-mismatch');
    } else if (
      value !== undefined &&
      ((limitsLower !== null && value <= limitsLower) || (limitsUpper !== null && value >= limitsUpper))
    ) {
      flag('value-critical');
    }
  }

  const orderedReasons = Object.freeze(sortReasons(reasons));
  const decision: AutoVerificationDecisionStatus = orderedReasons.length > 0 ? 'HOLD_FOR_REVIEW' : 'AUTO_RELEASE';

  return Object.freeze({ decision, reasons: orderedReasons });
}
