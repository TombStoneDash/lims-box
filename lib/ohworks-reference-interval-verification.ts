/**
 * Deterministic, synthetic OHWorks reference interval verification.
 *
 * This module is a pure, dependency-free, total function over a caller-
 * supplied proposed reference interval and a panel of results from declared
 * healthy synthetic reference subjects. It performs no I/O, reads no system
 * clock, and touches no real instrument, patient, or customer data.
 *
 * It implements the small-sample transference verification check described
 * in CLSI EP28-A3c: given at least the declared minimum number of reference
 * subjects (never fewer than twenty), it counts how many results fall
 * strictly outside the proposed interval and, using the caller's declared
 * acceptance rule, decides:
 *
 *   verified                  - the outlier count is within the declared
 *                                "verified" limit (e.g. no more than two of
 *                                twenty)
 *   verify_with_more_subjects - the outlier count exceeds the "verified"
 *                                limit but not the declared "more subjects"
 *                                limit
 *   rejected                   - the outlier count exceeds the declared
 *                                "more subjects" limit, or the input itself
 *                                cannot be trusted (too few subjects, an
 *                                inverted interval, a unit mismatch, a
 *                                malformed rule, or a subject not declared
 *                                healthy)
 *
 * Every failure mode defaults to `rejected` rather than guessing in the
 * interval's favor.
 */

export type ReferenceIntervalBounds = {
  lowerBound: number;
  upperBound: number;
  unit: string;
};

export type ReferenceIntervalSubjectResult = {
  subjectId: string;
  result: number;
  unit: string;
  /** This protocol only accepts results from declared healthy reference subjects. */
  healthyDeclared: boolean;
};

export type ReferenceIntervalRule = {
  /** Never fewer than MINIMUM_SUBJECT_COUNT. */
  minimumSubjectCount: number;
  /** Outlier count at or below this decides 'verified'. */
  maxOutliersForVerified: number;
  /**
   * Outlier count above maxOutliersForVerified but at or below this decides
   * 'verify_with_more_subjects'; above it decides 'rejected'.
   */
  maxOutliersForMoreSubjects: number;
};

export type ReferenceIntervalDecision = 'verified' | 'verify_with_more_subjects' | 'rejected';

/** Bounded, privacy-safe codes naming the rule behind a reference interval decision. */
export type ReferenceIntervalReasonCode =
  | 'rule-malformed'
  | 'interval-unit-invalid'
  | 'interval-bound-non-finite'
  | 'interval-inverted'
  | 'insufficient-subjects'
  | 'subject-malformed'
  | 'subject-not-declared-healthy'
  | 'unit-mismatch'
  | 'outliers-within-verified-limit'
  | 'outliers-require-more-subjects'
  | 'outliers-exceed-rejection-limit';

export type ReferenceIntervalOutlierDirection = 'below' | 'above';

export type ReferenceIntervalOutlier = {
  subjectId: string;
  result: number;
  unit: string;
  direction: ReferenceIntervalOutlierDirection;
};

export type ReferenceIntervalVerification = {
  decision: ReferenceIntervalDecision;
  reasonCode: ReferenceIntervalReasonCode;
  /** Deterministic, privacy-safe human-readable explanation of reasonCode. */
  reason: string;
  totalSubjects: number;
  outsideCount: number;
  /** Deterministically ordered to match the input subject order. */
  outliers: readonly ReferenceIntervalOutlier[];
};

/** The reference interval verification protocol never accepts fewer than twenty reference subjects. */
export const MINIMUM_SUBJECT_COUNT = 20;

const REASON_DECISIONS: Record<ReferenceIntervalReasonCode, ReferenceIntervalDecision> = {
  'rule-malformed': 'rejected',
  'interval-unit-invalid': 'rejected',
  'interval-bound-non-finite': 'rejected',
  'interval-inverted': 'rejected',
  'insufficient-subjects': 'rejected',
  'subject-malformed': 'rejected',
  'subject-not-declared-healthy': 'rejected',
  'unit-mismatch': 'rejected',
  'outliers-within-verified-limit': 'verified',
  'outliers-require-more-subjects': 'verify_with_more_subjects',
  'outliers-exceed-rejection-limit': 'rejected',
};

const REASON_MESSAGES: Record<ReferenceIntervalReasonCode, string> = {
  'rule-malformed': `The declared acceptance rule is missing a required field, has the wrong shape, or sets a minimum subject count below ${MINIMUM_SUBJECT_COUNT}.`,
  'interval-unit-invalid': 'The proposed reference interval unit is not a non-blank string.',
  'interval-bound-non-finite': 'The proposed reference interval lower or upper bound is not a finite number.',
  'interval-inverted': 'The proposed reference interval lower bound is greater than its upper bound.',
  'insufficient-subjects': `Fewer than the declared minimum (never fewer than ${MINIMUM_SUBJECT_COUNT}) reference subject results were supplied.`,
  'subject-malformed': 'A subject result entry is missing a required field or has the wrong shape.',
  'subject-not-declared-healthy': 'A subject result is not declared from a healthy reference subject.',
  'unit-mismatch': "A subject result's unit does not match the proposed reference interval's unit.",
  'outliers-within-verified-limit': 'The outlier count is within the declared verified limit.',
  'outliers-require-more-subjects': 'The outlier count exceeds the declared verified limit but not the declared more-subjects limit.',
  'outliers-exceed-rejection-limit': 'The outlier count exceeds the declared more-subjects limit.',
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Canonicalize a unit for comparison only: trim outer whitespace and
 * case-fold. Never infers or performs a unit conversion. Returns undefined
 * for anything that is not a non-blank string.
 */
function canonicalizeUnit(unit: unknown): string | undefined {
  if (typeof unit !== 'string') {
    return undefined;
  }
  const trimmed = unit.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : undefined;
}

function isStructurallyValidRule(raw: unknown): raw is ReferenceIntervalRule {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    isFiniteNumber(candidate.minimumSubjectCount) &&
    Number.isInteger(candidate.minimumSubjectCount) &&
    candidate.minimumSubjectCount >= MINIMUM_SUBJECT_COUNT &&
    isFiniteNumber(candidate.maxOutliersForVerified) &&
    Number.isInteger(candidate.maxOutliersForVerified) &&
    candidate.maxOutliersForVerified >= 0 &&
    isFiniteNumber(candidate.maxOutliersForMoreSubjects) &&
    Number.isInteger(candidate.maxOutliersForMoreSubjects) &&
    candidate.maxOutliersForMoreSubjects >= candidate.maxOutliersForVerified
  );
}

function isStructurallyValidSubject(raw: unknown): raw is ReferenceIntervalSubjectResult {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.subjectId) &&
    isFiniteNumber(candidate.result) &&
    typeof candidate.unit === 'string' &&
    typeof candidate.healthyDeclared === 'boolean'
  );
}

function toResult(
  reasonCode: ReferenceIntervalReasonCode,
  totalSubjects: number,
  outsideCount: number,
  outliers: ReferenceIntervalOutlier[],
): ReferenceIntervalVerification {
  return Object.freeze({
    decision: REASON_DECISIONS[reasonCode],
    reasonCode,
    reason: REASON_MESSAGES[reasonCode],
    totalSubjects,
    outsideCount,
    outliers: Object.freeze(outliers.map((entry) => Object.freeze({ ...entry }))),
  });
}

function rejected(reasonCode: ReferenceIntervalReasonCode, totalSubjects = 0): ReferenceIntervalVerification {
  return toResult(reasonCode, totalSubjects, 0, []);
}

/**
 * Evaluate a panel of declared-healthy reference subject results against a
 * proposed reference interval and a declared acceptance rule.
 *
 * Checks run in a fixed order and the first failure wins: the rule's shape,
 * the interval's unit, the interval's bounds, interval inversion, subject
 * count against the declared (never-below-twenty) minimum, each subject's
 * shape, each subject's declared-healthy flag, then each subject's unit
 * against the interval's unit. Only once every check passes are outliers
 * counted and the declared acceptance rule applied to decide verified,
 * verify_with_more_subjects, or rejected.
 */
export function evaluateReferenceIntervalVerification(
  interval: ReferenceIntervalBounds,
  subjects: ReferenceIntervalSubjectResult[],
  rule: ReferenceIntervalRule,
): ReferenceIntervalVerification {
  if (!isStructurallyValidRule(rule)) {
    return rejected('rule-malformed');
  }

  const intervalUnit = canonicalizeUnit(interval?.unit);
  if (intervalUnit === undefined) {
    return rejected('interval-unit-invalid');
  }

  const lowerBound = interval?.lowerBound;
  const upperBound = interval?.upperBound;
  if (!isFiniteNumber(lowerBound) || !isFiniteNumber(upperBound)) {
    return rejected('interval-bound-non-finite');
  }
  if (lowerBound > upperBound) {
    return rejected('interval-inverted');
  }

  if (!Array.isArray(subjects) || subjects.length < rule.minimumSubjectCount) {
    return rejected('insufficient-subjects', Array.isArray(subjects) ? subjects.length : 0);
  }

  for (const subject of subjects) {
    if (!isStructurallyValidSubject(subject)) {
      return rejected('subject-malformed', subjects.length);
    }
  }

  const validatedSubjects = subjects as ReferenceIntervalSubjectResult[];

  for (const subject of validatedSubjects) {
    if (subject.healthyDeclared !== true) {
      return rejected('subject-not-declared-healthy', subjects.length);
    }
  }

  for (const subject of validatedSubjects) {
    if (canonicalizeUnit(subject.unit) !== intervalUnit) {
      return rejected('unit-mismatch', subjects.length);
    }
  }

  const outliers: ReferenceIntervalOutlier[] = [];
  for (const subject of validatedSubjects) {
    if (subject.result < lowerBound) {
      outliers.push({ subjectId: subject.subjectId, result: subject.result, unit: subject.unit, direction: 'below' });
    } else if (subject.result > upperBound) {
      outliers.push({ subjectId: subject.subjectId, result: subject.result, unit: subject.unit, direction: 'above' });
    }
  }

  const outsideCount = outliers.length;
  if (outsideCount <= rule.maxOutliersForVerified) {
    return toResult('outliers-within-verified-limit', subjects.length, outsideCount, outliers);
  }
  if (outsideCount <= rule.maxOutliersForMoreSubjects) {
    return toResult('outliers-require-more-subjects', subjects.length, outsideCount, outliers);
  }
  return toResult('outliers-exceed-rejection-limit', subjects.length, outsideCount, outliers);
}
