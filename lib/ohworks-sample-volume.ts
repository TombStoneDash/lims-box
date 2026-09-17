/**
 * Fail-closed, deterministic OHWorks sample volume sufficiency evaluator for
 * the synthetic pilot.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated
 * specimen volume, the dead volume its container consumes before any test
 * can draw from it, and a fabricated panel of ordered tests (each with a
 * bounded test code, a required volume, a bounded priority, and a
 * caller-supplied panel sequence), it deterministically decides which tests
 * can run and which fall short.
 *
 * The usable volume is the specimen volume minus the container dead volume,
 * floored at zero. Tests are considered in priority order (`stat` before
 * `urgent` before `routine`) and, within the same priority, ascending panel
 * sequence, so the result never depends on the order tests were listed in.
 * A test whose required volume fits within what remains is allocated that
 * volume and marked `runnable`; a test that does not fit is marked `short`
 * with its exact shortfall and, critically, does NOT consume any of the
 * remaining volume, so a lower-priority test that needs less can still run.
 *
 * A negative or non-finite specimen volume, container dead volume, or test
 * required volume; an unknown test code; a duplicate test code; an unknown
 * test priority; or a non-finite test sequence all fail closed by throwing
 * SampleVolumeError rather than guessing at a decision.
 */

/** Bounded test priorities, ordered from highest to lowest precedence. */
export type SampleVolumeTestPriority = 'stat' | 'urgent' | 'routine';

const PRIORITY_RANK: Record<SampleVolumeTestPriority, number> = {
  stat: 0,
  urgent: 1,
  routine: 2,
};

/** Bounded registry of test codes this module knows how to evaluate. Never a real assay catalog. */
const KNOWN_TEST_CODES: ReadonlySet<string> = new Set<string>([
  'GLUCOSE',
  'POTASSIUM',
  'CBC',
  'TSH',
  'LACTATE',
  'BLOOD_CULTURE',
]);

/** Fabricated test request awaiting a volume-sufficiency decision. Never a real order. */
export type SampleVolumeTestRequest = {
  /** Raw test code; may be unrecognized. */
  testCode: string;
  /** Volume, in milliliters, this test requires to run. */
  requiredVolumeMl: number;
  /** Raw priority string; may be unrecognized. */
  priority: string;
  /**
   * Caller-supplied panel order. Lower values were requested earlier and
   * are preferred as a tiebreaker within the same priority.
   */
  sequence: number;
};

export type SampleVolumeTestOutcomeStatus = 'runnable' | 'short';

export type SampleVolumeTestOutcome =
  | {
      testCode: string;
      status: 'runnable';
      allocatedVolumeMl: number;
      remainingVolumeAfterMl: number;
    }
  | {
      testCode: string;
      status: 'short';
      shortfallMl: number;
      remainingVolumeAfterMl: number;
    };

export type SampleVolumeSufficiencyResult = {
  /** Usable volume after the container dead volume is removed, floored at zero. */
  availableVolumeMl: number;
  /** Per-test decisions, ordered by the same priority/sequence precedence used to compute them. */
  outcomes: SampleVolumeTestOutcome[];
  /** Test codes that can run, in the same precedence order. */
  runnableTestCodes: string[];
  /** Test codes that fell short, in the same precedence order. */
  shortTestCodes: string[];
};

export type SampleVolumeErrorCode =
  | 'specimen-volume-invalid'
  | 'container-dead-volume-invalid'
  | 'test-code-duplicate'
  | 'test-code-unknown'
  | 'test-required-volume-invalid'
  | 'test-priority-unknown'
  | 'test-sequence-invalid';

const ERROR_MESSAGES: Record<SampleVolumeErrorCode, string> = {
  'specimen-volume-invalid': 'The specimen volume must be a finite number of milliliters that is not negative.',
  'container-dead-volume-invalid':
    'The container dead volume must be a finite number of milliliters that is not negative.',
  'test-code-duplicate': 'More than one test was submitted with the same test code.',
  'test-code-unknown': 'A test code is not a recognized bounded value.',
  'test-required-volume-invalid': 'A test required volume must be a finite number of milliliters that is not negative.',
  'test-priority-unknown': 'A test priority is not a recognized bounded value.',
  'test-sequence-invalid': 'A test panel sequence must be a finite number.',
};

/** Deterministic, human-readable text for a fail-closed error code. */
export function explainSampleVolumeError(code: SampleVolumeErrorCode): string {
  return ERROR_MESSAGES[code];
}

/** Thrown for any input this evaluator cannot safely resolve to a deterministic sufficiency decision. */
export class SampleVolumeError extends Error {
  readonly code: SampleVolumeErrorCode;

  constructor(code: SampleVolumeErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'SampleVolumeError';
    this.code = code;
  }
}

function isKnownPriority(value: string): value is SampleVolumeTestPriority {
  return Object.prototype.hasOwnProperty.call(PRIORITY_RANK, value);
}

function validateTests(tests: ReadonlyArray<SampleVolumeTestRequest>): void {
  const seenTestCodes = new Set<string>();
  for (const test of tests) {
    if (seenTestCodes.has(test.testCode)) {
      throw new SampleVolumeError('test-code-duplicate');
    }
    seenTestCodes.add(test.testCode);

    if (!KNOWN_TEST_CODES.has(test.testCode)) {
      throw new SampleVolumeError('test-code-unknown');
    }

    if (!Number.isFinite(test.requiredVolumeMl) || test.requiredVolumeMl < 0) {
      throw new SampleVolumeError('test-required-volume-invalid');
    }

    if (!isKnownPriority(test.priority)) {
      throw new SampleVolumeError('test-priority-unknown');
    }

    if (!Number.isFinite(test.sequence)) {
      throw new SampleVolumeError('test-sequence-invalid');
    }
  }
}

function comparePrecedence(a: SampleVolumeTestRequest, b: SampleVolumeTestRequest): number {
  const rankDelta = PRIORITY_RANK[a.priority as SampleVolumeTestPriority] - PRIORITY_RANK[b.priority as SampleVolumeTestPriority];
  if (rankDelta !== 0) {
    return rankDelta;
  }
  if (a.sequence !== b.sequence) {
    return a.sequence - b.sequence;
  }
  return a.testCode < b.testCode ? -1 : a.testCode > b.testCode ? 1 : 0;
}

/**
 * Deterministically decide, for a fabricated specimen, which fabricated
 * tests in its panel can run and which fall short, in priority order (stat,
 * then urgent, then routine) and, within the same priority, ascending panel
 * sequence.
 *
 * Fail-closed: a negative or non-finite specimen volume or container dead
 * volume, an unrecognized or duplicate test code, a negative or non-finite
 * test required volume, an unrecognized test priority, or a non-finite test
 * sequence all throw SampleVolumeError instead of guessing at a decision.
 */
export function evaluateSampleVolumeSufficiency(
  specimenVolumeMl: number,
  containerDeadVolumeMl: number,
  tests: ReadonlyArray<SampleVolumeTestRequest>,
): SampleVolumeSufficiencyResult {
  if (!Number.isFinite(specimenVolumeMl) || specimenVolumeMl < 0) {
    throw new SampleVolumeError('specimen-volume-invalid');
  }

  if (!Number.isFinite(containerDeadVolumeMl) || containerDeadVolumeMl < 0) {
    throw new SampleVolumeError('container-dead-volume-invalid');
  }

  validateTests(tests);

  const availableVolumeMl = Math.max(0, specimenVolumeMl - containerDeadVolumeMl);

  const orderedTests = [...tests].sort(comparePrecedence);

  const outcomes: SampleVolumeTestOutcome[] = [];
  const runnableTestCodes: string[] = [];
  const shortTestCodes: string[] = [];

  let remainingVolumeMl = availableVolumeMl;

  for (const test of orderedTests) {
    if (remainingVolumeMl >= test.requiredVolumeMl) {
      remainingVolumeMl -= test.requiredVolumeMl;
      outcomes.push({
        testCode: test.testCode,
        status: 'runnable',
        allocatedVolumeMl: test.requiredVolumeMl,
        remainingVolumeAfterMl: remainingVolumeMl,
      });
      runnableTestCodes.push(test.testCode);
    } else {
      outcomes.push({
        testCode: test.testCode,
        status: 'short',
        shortfallMl: test.requiredVolumeMl - remainingVolumeMl,
        remainingVolumeAfterMl: remainingVolumeMl,
      });
      shortTestCodes.push(test.testCode);
    }
  }

  return {
    availableVolumeMl,
    outcomes,
    runnableTestCodes,
    shortTestCodes,
  };
}
