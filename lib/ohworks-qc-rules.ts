/**
 * Fail-closed synthetic Westgard-style multirule QC evaluator for
 * OHWorks/SENAITE-shaped QC runs.
 *
 * This module is a pure, dependency-free evaluator: given each declared QC
 * level's fabricated target mean and standard deviation, and a
 * caller-ordered sequence of fabricated QC results (each naming its level
 * and the run it was captured in), it evaluates five declared rules and
 * returns every position where a rule fired plus an overall status. It
 * performs no I/O, reads no system clock, mutates no SENAITE or database
 * state, and touches no real instrument or customer data. It never asserts
 * approval, compliance, accreditation, or releasability.
 *
 * The five declared rules, each evaluated per QC level against that level's
 * own mean/SD (results for other levels never affect a level's own streaks):
 *
 *   - 1_3s:  a single result beyond 3 SD of its level's mean.
 *   - 2_2s:  two consecutive results for the same level, both beyond 2 SD
 *            on the same side of the mean.
 *   - 4_1s:  four consecutive results for the same level, all beyond 1 SD
 *            on the same side of the mean.
 *   - 10_x:  ten consecutive results for the same level, all on the same
 *            side of the mean (any magnitude, but not exactly on it).
 *   - R_4s:  within a single run, two results for two different levels
 *            whose SD-scaled distance from their own means (z-scores) spans
 *            more than 4 SD.
 *
 * "Consecutive" is evaluated with a sliding window over each level's own
 * ordered results, so a streak longer than a rule's window fires once for
 * every position that completes a qualifying window, not only the first.
 *
 * 1_3s, 2_2s, 4_1s, and R_4s are treated as rejecting rules (classic
 * Westgard random- and systematic-error rules). 10_x is treated as a
 * warning-only rule: a ten-point same-side run signals a trend worth
 * reviewing, but on its own is not treated as strong enough evidence to
 * reject the run. A run is `rejected` if any rejecting rule fired anywhere;
 * otherwise it is `warning` if 10_x fired anywhere; otherwise `accepted`.
 */

export type QCRuleCode = '1_3s' | '2_2s' | '4_1s' | '10_x' | 'R_4s';

export type QCRuleSeverity = 'reject' | 'warning';

const RULE_SEVERITY: Record<QCRuleCode, QCRuleSeverity> = {
  '1_3s': 'reject',
  '2_2s': 'reject',
  '4_1s': 'reject',
  'R_4s': 'reject',
  '10_x': 'warning',
};

const RULE_MESSAGES: Record<QCRuleCode, string> = {
  '1_3s': 'A single result fell beyond 3 standard deviations of its level mean.',
  '2_2s': 'Two consecutive results for the same level fell beyond 2 standard deviations on the same side of the mean.',
  '4_1s': 'Four consecutive results for the same level fell beyond 1 standard deviation on the same side of the mean.',
  '10_x': 'Ten consecutive results for the same level fell on the same side of the mean.',
  'R_4s': 'Two results for different levels in the same run spanned more than 4 standard deviations.',
};

/** Deterministic, privacy-safe human-readable text for a QC rule code, suitable for UI display. */
export function explainQCRuleCode(rule: QCRuleCode): string {
  return RULE_MESSAGES[rule];
}

export type QCRuleLevelStats = {
  /** Synthetic QC level identifier, e.g. "LEVEL-1". Never a real lot or instrument identifier. */
  levelId: string;
  /** Fabricated target mean for this level. */
  mean: number;
  /** Fabricated target standard deviation for this level; must be a positive finite number. */
  sd: number;
};

export type QCRuleResult = {
  /** Which declared level this result was captured against. */
  levelId: string;
  /** Synthetic run identifier grouping results captured together, used only by the range rule. */
  runId: string;
  /** Fabricated observed control value. */
  value: number;
};

export type QCRuleEvaluationInput = {
  levels: QCRuleLevelStats[];
  /** Caller-ordered QC results; array order is the evaluated sequence. */
  results: QCRuleResult[];
};

export type QCRuleFiring = {
  rule: QCRuleCode;
  severity: QCRuleSeverity;
  /** Index into the caller-supplied `results` array of the point that completed this rule's pattern. */
  position: number;
  levelId: string;
  /** Present only for R_4s: the index of the other level's result the range was measured against. */
  pairedPosition?: number;
  /** Present only for R_4s: the level of the paired result. */
  pairedLevelId?: string;
};

export type QCRuleStatus = 'rejected' | 'warning' | 'accepted';

export type QCRuleEvaluationOutcome = {
  status: QCRuleStatus;
  /** Every firing, ordered by rule evaluation order and then by position. Empty when accepted. */
  firings: QCRuleFiring[];
};

export type QCRuleEvaluationInputErrorCode =
  | 'levels-not-array'
  | 'no-levels'
  | 'level-malformed'
  | 'duplicate-level-id'
  | 'level-mean-non-finite'
  | 'level-sd-invalid'
  | 'results-not-array'
  | 'result-malformed'
  | 'unknown-level'
  | 'result-value-non-finite'
  | 'duplicate-level-run-pair';

const INPUT_ERROR_MESSAGES: Record<QCRuleEvaluationInputErrorCode, string> = {
  'levels-not-array': 'The declared QC levels are not a list.',
  'no-levels': 'No QC levels were declared at all.',
  'level-malformed': 'A declared QC level is missing a required identity field.',
  'duplicate-level-id': 'More than one declared QC level uses the same level identifier.',
  'level-mean-non-finite': 'A declared QC level target mean is not a finite number.',
  'level-sd-invalid': 'A declared QC level standard deviation is not a positive finite number.',
  'results-not-array': 'The QC results are not a list.',
  'result-malformed': 'A QC result is missing a required identity field.',
  'unknown-level': 'A QC result declares a level that was not declared in the level list.',
  'result-value-non-finite': 'A QC result value is not a finite number.',
  'duplicate-level-run-pair': 'More than one QC result was submitted for the same level within the same run.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a rule evaluation. */
export class QCRuleEvaluationInputError extends Error {
  readonly code: QCRuleEvaluationInputErrorCode;

  constructor(code: QCRuleEvaluationInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'QCRuleEvaluationInputError';
    this.code = code;
  }
}

function hasLevelIdentity(value: unknown): value is { levelId: string; mean: unknown; sd: unknown } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.levelId === 'string' && candidate.levelId.length > 0;
}

function hasResultIdentity(value: unknown): value is { levelId: string; runId: string; value: unknown } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.levelId === 'string' &&
    candidate.levelId.length > 0 &&
    typeof candidate.runId === 'string' &&
    candidate.runId.length > 0
  );
}

type ParsedPoint = {
  position: number;
  levelId: string;
  runId: string;
  z: number;
};

type Side = 'above' | 'below' | null;

function sideBeyond(z: number, threshold: number): Side {
  if (z > threshold) {
    return 'above';
  }
  if (z < -threshold) {
    return 'below';
  }
  return null;
}

/**
 * Slide a fixed-size window over one level's own ordered points and record a
 * firing at every position that completes a window where every point in it
 * is on the same side per `sideTest`. A window containing any point that
 * fails `sideTest` (returns null, or a side that breaks the run) does not
 * fire.
 */
function evaluateConsecutiveRule(
  levelId: string,
  points: ParsedPoint[],
  windowSize: number,
  rule: QCRuleCode,
  sideTest: (z: number) => Side,
): QCRuleFiring[] {
  const firings: QCRuleFiring[] = [];
  const severity = RULE_SEVERITY[rule];

  for (let end = windowSize - 1; end < points.length; end += 1) {
    const start = end - windowSize + 1;
    const commonSide = sideTest(points[start].z);
    let allSameSide = commonSide !== null;
    for (let i = start + 1; allSameSide && i <= end; i += 1) {
      if (sideTest(points[i].z) !== commonSide) {
        allSameSide = false;
      }
    }
    if (allSameSide) {
      firings.push({ rule, severity, position: points[end].position, levelId });
    }
  }

  return firings;
}

/**
 * Evaluate a fabricated declared QC level set and a fabricated ordered QC
 * result sequence against the five declared Westgard-style rules, and
 * return every position each rule fired plus the overall run status.
 *
 * Fail-closed: a declared level with a non-finite mean or a non-finite,
 * zero, or negative standard deviation; a result with a non-finite value,
 * a level not present in the declared level list, or more than one result
 * for the same level within the same run all throw
 * QCRuleEvaluationInputError instead of guessing at an evaluation.
 */
export function evaluateQCRules(input: QCRuleEvaluationInput): QCRuleEvaluationOutcome {
  if (!Array.isArray(input.levels)) {
    throw new QCRuleEvaluationInputError('levels-not-array');
  }
  if (input.levels.length === 0) {
    throw new QCRuleEvaluationInputError('no-levels');
  }

  const levelStats = new Map<string, { mean: number; sd: number }>();
  for (const level of input.levels) {
    if (!hasLevelIdentity(level)) {
      throw new QCRuleEvaluationInputError('level-malformed');
    }
    if (levelStats.has(level.levelId)) {
      throw new QCRuleEvaluationInputError('duplicate-level-id');
    }
    if (typeof level.mean !== 'number' || !Number.isFinite(level.mean)) {
      throw new QCRuleEvaluationInputError('level-mean-non-finite');
    }
    if (typeof level.sd !== 'number' || !Number.isFinite(level.sd) || level.sd <= 0) {
      throw new QCRuleEvaluationInputError('level-sd-invalid');
    }
    levelStats.set(level.levelId, { mean: level.mean, sd: level.sd });
  }

  if (!Array.isArray(input.results)) {
    throw new QCRuleEvaluationInputError('results-not-array');
  }

  for (const result of input.results) {
    if (!hasResultIdentity(result)) {
      throw new QCRuleEvaluationInputError('result-malformed');
    }
    if (!levelStats.has(result.levelId)) {
      throw new QCRuleEvaluationInputError('unknown-level');
    }
    if (typeof result.value !== 'number' || !Number.isFinite(result.value)) {
      throw new QCRuleEvaluationInputError('result-value-non-finite');
    }
  }

  const levelRunSeen = new Set<string>();
  for (const result of input.results) {
    const key = `${result.levelId} ${result.runId}`;
    if (levelRunSeen.has(key)) {
      throw new QCRuleEvaluationInputError('duplicate-level-run-pair');
    }
    levelRunSeen.add(key);
  }

  const parsedPoints: ParsedPoint[] = input.results.map((result, position) => {
    const stats = levelStats.get(result.levelId)!;
    return {
      position,
      levelId: result.levelId,
      runId: result.runId,
      z: (result.value - stats.mean) / stats.sd,
    };
  });

  const pointsByLevel = new Map<string, ParsedPoint[]>();
  for (const point of parsedPoints) {
    const existing = pointsByLevel.get(point.levelId);
    if (existing) {
      existing.push(point);
    } else {
      pointsByLevel.set(point.levelId, [point]);
    }
  }

  const firings: QCRuleFiring[] = [];

  for (const point of parsedPoints) {
    if (Math.abs(point.z) > 3) {
      firings.push({ rule: '1_3s', severity: RULE_SEVERITY['1_3s'], position: point.position, levelId: point.levelId });
    }
  }

  for (const [levelId, points] of pointsByLevel) {
    firings.push(...evaluateConsecutiveRule(levelId, points, 2, '2_2s', (z) => sideBeyond(z, 2)));
    firings.push(...evaluateConsecutiveRule(levelId, points, 4, '4_1s', (z) => sideBeyond(z, 1)));
    firings.push(...evaluateConsecutiveRule(levelId, points, 10, '10_x', (z) => sideBeyond(z, 0)));
  }

  const pointsByRun = new Map<string, ParsedPoint[]>();
  for (const point of parsedPoints) {
    const existing = pointsByRun.get(point.runId);
    if (existing) {
      existing.push(point);
    } else {
      pointsByRun.set(point.runId, [point]);
    }
  }

  for (const points of pointsByRun.values()) {
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        if (Math.abs(points[i].z - points[j].z) > 4) {
          firings.push({
            rule: 'R_4s',
            severity: RULE_SEVERITY['R_4s'],
            position: points[j].position,
            levelId: points[j].levelId,
            pairedPosition: points[i].position,
            pairedLevelId: points[i].levelId,
          });
        }
      }
    }
  }

  firings.sort((a, b) => a.position - b.position || a.rule.localeCompare(b.rule));

  const status: QCRuleStatus = firings.some((firing) => firing.severity === 'reject')
    ? 'rejected'
    : firings.some((firing) => firing.severity === 'warning')
      ? 'warning'
      : 'accepted';

  return { status, firings };
}
