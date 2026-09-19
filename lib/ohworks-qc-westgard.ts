/**
 * Fail-closed synthetic Westgard multirule QC evaluator for
 * OHWorks/SENAITE-shaped QC runs.
 *
 * This module is a pure, dependency-free evaluator: given each declared QC
 * level's fabricated target mean and standard deviation, and a
 * caller-ordered sequence of timestamped fabricated QC results (each naming
 * its level and the run it was captured in), it evaluates the full
 * Westgard multirule set per run and returns, per run, an overall
 * accepted/rejected/warning status, every rule that violated, and
 * privacy-safe evidence. It also returns a Standard Deviation Index (SDI)
 * for every point. It performs no I/O, reads no system clock, mutates no
 * SENAITE or database state, and touches no real instrument or customer
 * data. It never asserts approval, compliance, accreditation, or
 * releasability.
 *
 * The declared rules:
 *
 *   - 1_2s:               a single result beyond 2 SD of its level's mean.
 *                          Classic Westgard screening/warning rule: it does
 *                          not reject on its own.
 *   - 1_3s:                a single result beyond 3 SD of its level's mean.
 *   - 2_2s_within_level:   two consecutive results for the same level,
 *                          across runs, both beyond 2 SD on the same side.
 *   - 2_2s_across_levels:  two results for two different levels within the
 *                          same run, both beyond 2 SD on the same side.
 *   - R_4s:                within a single run, two results for two
 *                          different levels whose SDI values span more
 *                          than 4 SD.
 *   - 4_1s:                four consecutive results for the same level,
 *                          across runs, all beyond 1 SD on the same side.
 *   - 10_x:                ten consecutive results for the same level,
 *                          across runs, all on the same side of the mean
 *                          (any magnitude, but not exactly on it).
 *
 * "Consecutive" is evaluated per level over that level's own ordered
 * results (results for other levels never affect a level's own streaks).
 * A rule that needs more history than currently exists for its level (or,
 * for the run-scoped rules, more distinct levels than are present in the
 * run) is reported as `not-evaluable` for that run -- it is never reported
 * as satisfied, because there is not enough evidence to say so.
 *
 * 1_2s is a warning-only rule; every other declared rule rejects. A run's
 * status is `rejected` if any rejecting rule violated in that run,
 * otherwise `warning` if 1_2s violated in that run, otherwise `accepted`.
 */

export type QCWestgardRuleCode =
  | '1_2s'
  | '1_3s'
  | '2_2s_within_level'
  | '2_2s_across_levels'
  | 'R_4s'
  | '4_1s'
  | '10_x';

export type QCWestgardRuleSeverity = 'reject' | 'warning';

const RULE_SEVERITY: Record<QCWestgardRuleCode, QCWestgardRuleSeverity> = {
  '1_2s': 'warning',
  '1_3s': 'reject',
  '2_2s_within_level': 'reject',
  '2_2s_across_levels': 'reject',
  R_4s: 'reject',
  '4_1s': 'reject',
  '10_x': 'reject',
};

const RULE_MESSAGES: Record<QCWestgardRuleCode, string> = {
  '1_2s': 'A single result fell beyond 2 standard deviations of its level mean (warning).',
  '1_3s': 'A single result fell beyond 3 standard deviations of its level mean.',
  '2_2s_within_level':
    'Two consecutive results for the same level, across runs, fell beyond 2 standard deviations on the same side of the mean.',
  '2_2s_across_levels':
    'Two results for different levels within the same run fell beyond 2 standard deviations on the same side of the mean.',
  R_4s: 'Two results for different levels in the same run spanned more than 4 standard deviations.',
  '4_1s':
    'Four consecutive results for the same level, across runs, fell beyond 1 standard deviation on the same side of the mean.',
  '10_x': 'Ten consecutive results for the same level, across runs, fell on the same side of the mean.',
};

/** Deterministic, privacy-safe human-readable text for a Westgard rule code, suitable for UI display. */
export function explainQCWestgardRuleCode(rule: QCWestgardRuleCode): string {
  return RULE_MESSAGES[rule];
}

export type QCWestgardLevelStats = {
  /** Synthetic QC level identifier, e.g. "LEVEL-1". Never a real lot or instrument identifier. */
  levelId: string;
  /** Fabricated target mean for this level. */
  mean: number;
  /** Fabricated target standard deviation for this level; must be a positive finite number. */
  sd: number;
};

export type QCWestgardResult = {
  /** Which declared level this result was captured against. */
  levelId: string;
  /** Synthetic run identifier grouping results captured together. */
  runId: string;
  /** Fabricated observed control value. */
  value: number;
  /** ISO 8601 timestamp the result was captured, caller-supplied. */
  timestamp: string;
};

export type QCWestgardEvaluationInput = {
  levels: QCWestgardLevelStats[];
  /** Caller-ordered QC results; array order is the evaluated sequence. */
  results: QCWestgardResult[];
};

export type QCWestgardRuleFiring = {
  rule: QCWestgardRuleCode;
  severity: QCWestgardRuleSeverity;
  /** Index into the caller-supplied `results` array of the point that completed this rule's pattern. */
  position: number;
  levelId: string;
  /** Present only for run-scoped rules (R_4s, 2_2s_across_levels): the index of the paired result. */
  pairedPosition?: number;
  /** Present only for run-scoped rules (R_4s, 2_2s_across_levels): the level of the paired result. */
  pairedLevelId?: string;
};

export type QCWestgardRuleEvaluationStatus = 'violated' | 'satisfied' | 'not-evaluable';

export type QCWestgardRuleEvaluation = {
  rule: QCWestgardRuleCode;
  /** The level this evaluation was scoped to; null for rules scoped to the whole run. */
  levelId: string | null;
  status: QCWestgardRuleEvaluationStatus;
};

export type QCWestgardRunStatus = 'accepted' | 'rejected' | 'warning';

export type QCWestgardRunEvaluation = {
  runId: string;
  status: QCWestgardRunStatus;
  /** Every rule violation attributed to this run, ordered by rule evaluation order and then by level. */
  violatedRules: QCWestgardRuleFiring[];
  evidence: {
    /** The status of every rule considered for this run, including rules that could not yet be evaluated. */
    ruleEvaluations: QCWestgardRuleEvaluation[];
  };
};

export type QCWestgardPointSDI = {
  /** Index into the caller-supplied `results` array. */
  position: number;
  runId: string;
  levelId: string;
  value: number;
  /** Standard Deviation Index: (value - level mean) / level SD. */
  sdi: number;
};

export type QCWestgardEvaluationOutcome = {
  /** One entry per distinct run, ordered by first appearance in `results`. */
  runs: QCWestgardRunEvaluation[];
  /** One entry per input result, in input order. */
  points: QCWestgardPointSDI[];
};

export type QCWestgardInputErrorCode =
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
  | 'result-timestamp-invalid'
  | 'duplicate-level-run-pair'
  | 'timestamps-out-of-order';

const INPUT_ERROR_MESSAGES: Record<QCWestgardInputErrorCode, string> = {
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
  'result-timestamp-invalid': 'A QC result timestamp could not be parsed.',
  'duplicate-level-run-pair': 'More than one QC result was submitted for the same level within the same run.',
  'timestamps-out-of-order': 'QC results are not given in non-decreasing timestamp order.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a rule evaluation. */
export class QCWestgardInputError extends Error {
  readonly code: QCWestgardInputErrorCode;

  constructor(code: QCWestgardInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'QCWestgardInputError';
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

function hasResultIdentity(
  value: unknown,
): value is { levelId: string; runId: string; value: unknown; timestamp: unknown } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.levelId === 'string' &&
    candidate.levelId.length > 0 &&
    typeof candidate.runId === 'string' &&
    candidate.runId.length > 0 &&
    typeof candidate.timestamp === 'string'
  );
}

type ParsedPoint = {
  position: number;
  levelId: string;
  runId: string;
  value: number;
  sdi: number;
  parsedTime: number;
};

type Side = 'above' | 'below' | null;

function sideBeyond(sdi: number, threshold: number): Side {
  if (sdi > threshold) {
    return 'above';
  }
  if (sdi < -threshold) {
    return 'below';
  }
  return null;
}

/**
 * Evaluate one level-scoped consecutive-window rule (2_2s_within_level,
 * 4_1s, 10_x) at the point where `levelIndex` sits within that level's own
 * ordered points. Returns `not-evaluable` when the level does not yet have
 * enough history, otherwise `violated` or `satisfied`.
 */
function evaluateWindowAtIndex(
  levelPoints: ParsedPoint[],
  levelIndex: number,
  windowSize: number,
  sideTest: (sdi: number) => Side,
): QCWestgardRuleEvaluationStatus {
  if (levelIndex + 1 < windowSize) {
    return 'not-evaluable';
  }
  const start = levelIndex - windowSize + 1;
  const commonSide = sideTest(levelPoints[start].sdi);
  let allSameSide = commonSide !== null;
  for (let i = start + 1; allSameSide && i <= levelIndex; i += 1) {
    if (sideTest(levelPoints[i].sdi) !== commonSide) {
      allSameSide = false;
    }
  }
  return allSameSide ? 'violated' : 'satisfied';
}

function compareFirings(a: QCWestgardRuleFiring, b: QCWestgardRuleFiring): number {
  return a.position - b.position || a.rule.localeCompare(b.rule) || a.levelId.localeCompare(b.levelId);
}

/**
 * Evaluate a fabricated declared QC level set and a fabricated,
 * timestamp-ordered QC result sequence against the full Westgard multirule
 * set, and return, per run, the overall status, every rule violation, and
 * the status of every rule considered (including rules that could not yet
 * be evaluated), plus an SDI for every point.
 *
 * Fail-closed: a declared level with a non-finite mean or a non-finite,
 * zero, or negative standard deviation; a result with a non-finite value,
 * an unparsable timestamp, a level not present in the declared level list,
 * or more than one result for the same level within the same run; or
 * results not supplied in non-decreasing timestamp order all throw
 * QCWestgardInputError instead of guessing at an evaluation. A rule that
 * does not yet have enough points to evaluate is reported as
 * `not-evaluable`, never as `satisfied`.
 */
export function evaluateQCWestgardMultirule(input: QCWestgardEvaluationInput): QCWestgardEvaluationOutcome {
  if (!Array.isArray(input.levels)) {
    throw new QCWestgardInputError('levels-not-array');
  }
  if (input.levels.length === 0) {
    throw new QCWestgardInputError('no-levels');
  }

  const levelStats = new Map<string, { mean: number; sd: number }>();
  for (const level of input.levels) {
    if (!hasLevelIdentity(level)) {
      throw new QCWestgardInputError('level-malformed');
    }
    if (levelStats.has(level.levelId)) {
      throw new QCWestgardInputError('duplicate-level-id');
    }
    if (typeof level.mean !== 'number' || !Number.isFinite(level.mean)) {
      throw new QCWestgardInputError('level-mean-non-finite');
    }
    if (typeof level.sd !== 'number' || !Number.isFinite(level.sd) || level.sd <= 0) {
      throw new QCWestgardInputError('level-sd-invalid');
    }
    levelStats.set(level.levelId, { mean: level.mean, sd: level.sd });
  }

  if (!Array.isArray(input.results)) {
    throw new QCWestgardInputError('results-not-array');
  }

  for (const result of input.results) {
    if (!hasResultIdentity(result)) {
      throw new QCWestgardInputError('result-malformed');
    }
    if (!levelStats.has(result.levelId)) {
      throw new QCWestgardInputError('unknown-level');
    }
    if (typeof result.value !== 'number' || !Number.isFinite(result.value)) {
      throw new QCWestgardInputError('result-value-non-finite');
    }
  }

  const levelRunSeen = new Set<string>();
  for (const result of input.results) {
    const key = `${result.levelId} ${result.runId}`;
    if (levelRunSeen.has(key)) {
      throw new QCWestgardInputError('duplicate-level-run-pair');
    }
    levelRunSeen.add(key);
  }

  const parsedTimes = input.results.map((result) => Date.parse(result.timestamp));
  for (const parsedTime of parsedTimes) {
    if (!Number.isFinite(parsedTime)) {
      throw new QCWestgardInputError('result-timestamp-invalid');
    }
  }
  for (let i = 1; i < parsedTimes.length; i += 1) {
    if (parsedTimes[i] < parsedTimes[i - 1]) {
      throw new QCWestgardInputError('timestamps-out-of-order');
    }
  }

  const points: ParsedPoint[] = input.results.map((result, position) => {
    const stats = levelStats.get(result.levelId)!;
    return {
      position,
      levelId: result.levelId,
      runId: result.runId,
      value: result.value,
      sdi: (result.value - stats.mean) / stats.sd,
      parsedTime: parsedTimes[position],
    };
  });

  const pointsByLevel = new Map<string, ParsedPoint[]>();
  for (const point of points) {
    const existing = pointsByLevel.get(point.levelId);
    if (existing) {
      existing.push(point);
    } else {
      pointsByLevel.set(point.levelId, [point]);
    }
  }
  const levelIndexOf = new Map<number, number>();
  for (const levelPoints of pointsByLevel.values()) {
    levelPoints.forEach((point, index) => levelIndexOf.set(point.position, index));
  }

  const runOrder: string[] = [];
  const pointsByRun = new Map<string, ParsedPoint[]>();
  for (const point of points) {
    let existing = pointsByRun.get(point.runId);
    if (!existing) {
      existing = [];
      pointsByRun.set(point.runId, existing);
      runOrder.push(point.runId);
    }
    existing.push(point);
  }

  const runs: QCWestgardRunEvaluation[] = runOrder.map((runId) => {
    const runPoints = pointsByRun.get(runId)!;
    const violatedRules: QCWestgardRuleFiring[] = [];
    const ruleEvaluations: QCWestgardRuleEvaluation[] = [];

    for (const point of runPoints) {
      const levelPoints = pointsByLevel.get(point.levelId)!;
      const levelIndex = levelIndexOf.get(point.position)!;

      const status12s: QCWestgardRuleEvaluationStatus = sideBeyond(point.sdi, 2) !== null ? 'violated' : 'satisfied';
      ruleEvaluations.push({ rule: '1_2s', levelId: point.levelId, status: status12s });
      if (status12s === 'violated') {
        violatedRules.push({
          rule: '1_2s',
          severity: RULE_SEVERITY['1_2s'],
          position: point.position,
          levelId: point.levelId,
        });
      }

      const status13s: QCWestgardRuleEvaluationStatus = sideBeyond(point.sdi, 3) !== null ? 'violated' : 'satisfied';
      ruleEvaluations.push({ rule: '1_3s', levelId: point.levelId, status: status13s });
      if (status13s === 'violated') {
        violatedRules.push({
          rule: '1_3s',
          severity: RULE_SEVERITY['1_3s'],
          position: point.position,
          levelId: point.levelId,
        });
      }

      const status22sWithin = evaluateWindowAtIndex(levelPoints, levelIndex, 2, (sdi) => sideBeyond(sdi, 2));
      ruleEvaluations.push({ rule: '2_2s_within_level', levelId: point.levelId, status: status22sWithin });
      if (status22sWithin === 'violated') {
        violatedRules.push({
          rule: '2_2s_within_level',
          severity: RULE_SEVERITY['2_2s_within_level'],
          position: point.position,
          levelId: point.levelId,
        });
      }

      const status41s = evaluateWindowAtIndex(levelPoints, levelIndex, 4, (sdi) => sideBeyond(sdi, 1));
      ruleEvaluations.push({ rule: '4_1s', levelId: point.levelId, status: status41s });
      if (status41s === 'violated') {
        violatedRules.push({
          rule: '4_1s',
          severity: RULE_SEVERITY['4_1s'],
          position: point.position,
          levelId: point.levelId,
        });
      }

      const status10x = evaluateWindowAtIndex(levelPoints, levelIndex, 10, (sdi) => sideBeyond(sdi, 0));
      ruleEvaluations.push({ rule: '10_x', levelId: point.levelId, status: status10x });
      if (status10x === 'violated') {
        violatedRules.push({
          rule: '10_x',
          severity: RULE_SEVERITY['10_x'],
          position: point.position,
          levelId: point.levelId,
        });
      }
    }

    if (runPoints.length < 2) {
      ruleEvaluations.push({ rule: '2_2s_across_levels', levelId: null, status: 'not-evaluable' });
      ruleEvaluations.push({ rule: 'R_4s', levelId: null, status: 'not-evaluable' });
    } else {
      let across2_2sFired = false;
      let r4sFired = false;
      for (let i = 0; i < runPoints.length; i += 1) {
        for (let j = i + 1; j < runPoints.length; j += 1) {
          const a = runPoints[i];
          const b = runPoints[j];
          const sideA = sideBeyond(a.sdi, 2);
          const sideB = sideBeyond(b.sdi, 2);
          if (sideA !== null && sideA === sideB) {
            across2_2sFired = true;
            violatedRules.push({
              rule: '2_2s_across_levels',
              severity: RULE_SEVERITY['2_2s_across_levels'],
              position: b.position,
              levelId: b.levelId,
              pairedPosition: a.position,
              pairedLevelId: a.levelId,
            });
          }
          if (Math.abs(a.sdi - b.sdi) > 4) {
            r4sFired = true;
            violatedRules.push({
              rule: 'R_4s',
              severity: RULE_SEVERITY.R_4s,
              position: b.position,
              levelId: b.levelId,
              pairedPosition: a.position,
              pairedLevelId: a.levelId,
            });
          }
        }
      }
      ruleEvaluations.push({
        rule: '2_2s_across_levels',
        levelId: null,
        status: across2_2sFired ? 'violated' : 'satisfied',
      });
      ruleEvaluations.push({ rule: 'R_4s', levelId: null, status: r4sFired ? 'violated' : 'satisfied' });
    }

    violatedRules.sort(compareFirings);

    const status: QCWestgardRunStatus = violatedRules.some((firing) => firing.severity === 'reject')
      ? 'rejected'
      : violatedRules.some((firing) => firing.severity === 'warning')
        ? 'warning'
        : 'accepted';

    return { runId, status, violatedRules, evidence: { ruleEvaluations } };
  });

  const sdiPoints: QCWestgardPointSDI[] = points.map((point) => ({
    position: point.position,
    runId: point.runId,
    levelId: point.levelId,
    value: point.value,
    sdi: point.sdi,
  }));

  return { runs, points: sdiPoints };
}
