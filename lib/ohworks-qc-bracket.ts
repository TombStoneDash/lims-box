/**
 * Fail-closed synthetic QC bracket validation for OHWorks/SENAITE-shaped runs.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated
 * executed run (a caller-declared bracketing window, a series of QC results
 * with pass/fail outcomes and caller-supplied timestamps, and a series of
 * patient results in sequence) it decides, per patient result, whether that
 * result sits between a passing QC before it and a passing QC after it, both
 * within the declared window. It performs no I/O, touches no real
 * instrument or customer data, and never asserts approval, compliance, or
 * accreditation. Every patient result resolves to exactly one of:
 *
 *   - releasable: bracketed by passing QC on both sides within the window.
 *   - held_for_repeat_qc: the trailing bracket has not closed yet, but the
 *     run is still in progress so a qualifying QC result may still arrive.
 *   - rejected: the bracket is broken (missing, failing, or out-of-window
 *     QC) in a way no future QC result for this run could repair.
 */

export type QCLevel = 'low' | 'normal' | 'high';

const KNOWN_QC_LEVELS: ReadonlySet<string> = new Set<string>(['low', 'normal', 'high']);

export type QCBracketOutcome = 'pass' | 'fail';

const KNOWN_QC_OUTCOMES: ReadonlySet<string> = new Set<string>(['pass', 'fail']);

export type QCBracketQCResult = {
  /** Synthetic QC event identifier. Never a real instrument or lot identifier. */
  qcId: string;
  /** Raw QC level string; may be unrecognized. */
  level: string;
  /** Raw QC outcome string; may be unrecognized. */
  outcome: string;
  /** ISO 8601 timestamp the QC event was recorded, caller-supplied. */
  timestamp: string;
};

export type QCBracketPatientResult = {
  /** Synthetic patient result identifier. Never a real sample or patient identifier. */
  resultId: string;
  /** ISO 8601 timestamp the result was recorded, caller-supplied. */
  timestamp: string;
};

export type QCBracketRunStatus = 'in-progress' | 'complete';

export type QCBracketRun = {
  /** Synthetic run identifier. */
  runId: string;
  /** Whether more QC results could still be appended to this run. */
  status: QCBracketRunStatus;
  /** Maximum allowed gap, in milliseconds, between a patient result and its bracketing QC on either side. */
  windowMs: number;
  qcResults: QCBracketQCResult[];
  patientResults: QCBracketPatientResult[];
};

export type QCBracketDisposition = 'releasable' | 'held_for_repeat_qc' | 'rejected';

export type QCBracketRuleCode =
  | 'bracketed-by-passing-qc'
  | 'no-preceding-qc'
  | 'preceding-qc-failed'
  | 'preceding-qc-window-exceeded'
  | 'trailing-qc-failed'
  | 'trailing-qc-window-exceeded'
  | 'trailing-qc-never-arrived'
  | 'awaiting-trailing-qc';

/** Single source of truth mapping every governing rule to its disposition. */
const RULE_DISPOSITIONS: Record<QCBracketRuleCode, QCBracketDisposition> = {
  'bracketed-by-passing-qc': 'releasable',
  'no-preceding-qc': 'rejected',
  'preceding-qc-failed': 'rejected',
  'preceding-qc-window-exceeded': 'rejected',
  'trailing-qc-failed': 'rejected',
  'trailing-qc-window-exceeded': 'rejected',
  'trailing-qc-never-arrived': 'rejected',
  'awaiting-trailing-qc': 'held_for_repeat_qc',
};

const RULE_MESSAGES: Record<QCBracketRuleCode, string> = {
  'bracketed-by-passing-qc': 'A passing QC event exists on both sides of the result within the declared window.',
  'no-preceding-qc': 'No QC event of any outcome was recorded before this result.',
  'preceding-qc-failed': 'The nearest QC event before this result failed.',
  'preceding-qc-window-exceeded': 'The nearest passing QC event before this result falls outside the declared window.',
  'trailing-qc-failed': 'The nearest QC event after this result failed.',
  'trailing-qc-window-exceeded': 'The nearest passing QC event after this result falls outside the declared window.',
  'trailing-qc-never-arrived': 'The run is complete and no QC event was ever recorded after this result.',
  'awaiting-trailing-qc': 'No QC event has been recorded after this result yet, but the run is still in progress.',
};

/** Deterministic, privacy-safe human-readable text for a governing rule, suitable for UI display. */
export function explainQCBracketRule(rule: QCBracketRuleCode): string {
  return RULE_MESSAGES[rule];
}

export type QCBracketDecision = {
  resultId: string;
  disposition: QCBracketDisposition;
  rule: QCBracketRuleCode;
};

export type QCBracketInputErrorCode =
  | 'run-not-object'
  | 'invalid-status'
  | 'invalid-window'
  | 'qc-results-not-array'
  | 'patient-results-not-array'
  | 'no-qc-results'
  | 'qc-result-missing-identity'
  | 'patient-result-missing-identity'
  | 'duplicate-qc-id'
  | 'duplicate-result-id'
  | 'unknown-qc-level'
  | 'unknown-qc-outcome'
  | 'timestamp-invalid'
  | 'timestamps-out-of-order';

const INPUT_ERROR_MESSAGES: Record<QCBracketInputErrorCode, string> = {
  'run-not-object': 'The QC bracket run is not a valid object.',
  'invalid-status': 'The QC bracket run status is not a recognized value.',
  'invalid-window': 'The declared bracketing window is not a finite, non-negative number of milliseconds.',
  'qc-results-not-array': 'The QC bracket run QC results are not a list.',
  'patient-results-not-array': 'The QC bracket run patient results are not a list.',
  'no-qc-results': 'The run has no QC results at all, so no patient result can be bracketed.',
  'qc-result-missing-identity': 'A QC result is missing a required identity field.',
  'patient-result-missing-identity': 'A patient result is missing a required identity field.',
  'duplicate-qc-id': 'More than one QC result was submitted with the same QC identifier.',
  'duplicate-result-id': 'More than one patient result was submitted with the same result identifier.',
  'unknown-qc-level': 'A QC result declares a level that is not a recognized value.',
  'unknown-qc-outcome': 'A QC result declares an outcome that is not a recognized value.',
  'timestamp-invalid': 'A QC or patient result timestamp could not be parsed.',
  'timestamps-out-of-order': 'QC results or patient results are not given in non-decreasing timestamp order.',
};

/** Thrown for structurally unusable runs that cannot be safely bracketed. */
export class QCBracketInputError extends Error {
  readonly code: QCBracketInputErrorCode;

  constructor(code: QCBracketInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'QCBracketInputError';
    this.code = code;
  }
}

function hasQCIdentity(
  record: unknown,
): record is { qcId: string; level: string; outcome: string; timestamp: string } {
  if (typeof record !== 'object' || record === null) {
    return false;
  }
  const candidate = record as Record<string, unknown>;
  return (
    typeof candidate.qcId === 'string' &&
    candidate.qcId.length > 0 &&
    typeof candidate.level === 'string' &&
    typeof candidate.outcome === 'string' &&
    typeof candidate.timestamp === 'string'
  );
}

function hasPatientIdentity(record: unknown): record is { resultId: string; timestamp: string } {
  if (typeof record !== 'object' || record === null) {
    return false;
  }
  const candidate = record as Record<string, unknown>;
  return (
    typeof candidate.resultId === 'string' &&
    candidate.resultId.length > 0 &&
    typeof candidate.timestamp === 'string'
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

type ParsedQCResult = {
  qcId: string;
  outcome: QCBracketOutcome;
  parsedTime: number;
};

function findPriorQC(qcAscending: ParsedQCResult[], parsedTime: number): ParsedQCResult | undefined {
  let candidate: ParsedQCResult | undefined;
  for (const qc of qcAscending) {
    if (qc.parsedTime <= parsedTime) {
      candidate = qc;
    } else {
      break;
    }
  }
  return candidate;
}

function findNextQC(qcAscending: ParsedQCResult[], parsedTime: number): ParsedQCResult | undefined {
  for (const qc of qcAscending) {
    if (qc.parsedTime >= parsedTime) {
      return qc;
    }
  }
  return undefined;
}

function decideBracket(
  parsedTime: number,
  qcAscending: ParsedQCResult[],
  windowMs: number,
  runComplete: boolean,
): QCBracketRuleCode {
  const prior = findPriorQC(qcAscending, parsedTime);
  if (!prior) {
    return 'no-preceding-qc';
  }
  if (prior.outcome === 'fail') {
    return 'preceding-qc-failed';
  }
  if (parsedTime - prior.parsedTime > windowMs) {
    return 'preceding-qc-window-exceeded';
  }

  const next = findNextQC(qcAscending, parsedTime);
  if (!next) {
    return runComplete ? 'trailing-qc-never-arrived' : 'awaiting-trailing-qc';
  }
  if (next.outcome === 'fail') {
    return 'trailing-qc-failed';
  }
  if (next.parsedTime - parsedTime > windowMs) {
    return 'trailing-qc-window-exceeded';
  }

  return 'bracketed-by-passing-qc';
}

/**
 * Evaluate a fabricated executed run and return one conservative bracketing
 * decision per patient result, in the same order the patient results were
 * given.
 *
 * Fail-closed: a run with no QC results at all, QC or patient results whose
 * declared timestamps are not in non-decreasing order, or any QC result
 * with an unrecognized level or outcome throws QCBracketInputError instead
 * of guessing at a per-result decision. A structurally broken bracket
 * (missing, failing, or out-of-window QC on either side) is rejected; a
 * bracket only missing its trailing QC in a still-running run is held for
 * repeat QC instead.
 */
export function evaluateQCBracketing(run: QCBracketRun): QCBracketDecision[] {
  if (typeof run !== 'object' || run === null) {
    throw new QCBracketInputError('run-not-object');
  }

  if (run.status !== 'in-progress' && run.status !== 'complete') {
    throw new QCBracketInputError('invalid-status');
  }

  if (!Number.isFinite(run.windowMs) || run.windowMs < 0) {
    throw new QCBracketInputError('invalid-window');
  }

  if (!Array.isArray(run.qcResults)) {
    throw new QCBracketInputError('qc-results-not-array');
  }

  if (!Array.isArray(run.patientResults)) {
    throw new QCBracketInputError('patient-results-not-array');
  }

  if (run.qcResults.length === 0) {
    throw new QCBracketInputError('no-qc-results');
  }

  for (const qc of run.qcResults) {
    if (!hasQCIdentity(qc)) {
      throw new QCBracketInputError('qc-result-missing-identity');
    }
  }

  for (const result of run.patientResults) {
    if (!hasPatientIdentity(result)) {
      throw new QCBracketInputError('patient-result-missing-identity');
    }
  }

  const duplicateQcId = findDuplicateKey(run.qcResults.map((qc) => qc.qcId));
  if (duplicateQcId !== undefined) {
    throw new QCBracketInputError('duplicate-qc-id');
  }

  const duplicateResultId = findDuplicateKey(run.patientResults.map((result) => result.resultId));
  if (duplicateResultId !== undefined) {
    throw new QCBracketInputError('duplicate-result-id');
  }

  for (const qc of run.qcResults) {
    if (!KNOWN_QC_LEVELS.has(qc.level)) {
      throw new QCBracketInputError('unknown-qc-level');
    }
    if (!KNOWN_QC_OUTCOMES.has(qc.outcome)) {
      throw new QCBracketInputError('unknown-qc-outcome');
    }
  }

  const parsedQC: ParsedQCResult[] = run.qcResults.map((qc) => ({
    qcId: qc.qcId,
    outcome: qc.outcome as QCBracketOutcome,
    parsedTime: Date.parse(qc.timestamp),
  }));

  const parsedPatient = run.patientResults.map((result) => ({
    resultId: result.resultId,
    parsedTime: Date.parse(result.timestamp),
  }));

  for (const qc of parsedQC) {
    if (!Number.isFinite(qc.parsedTime)) {
      throw new QCBracketInputError('timestamp-invalid');
    }
  }

  for (const result of parsedPatient) {
    if (!Number.isFinite(result.parsedTime)) {
      throw new QCBracketInputError('timestamp-invalid');
    }
  }

  for (let i = 1; i < parsedQC.length; i += 1) {
    if (parsedQC[i].parsedTime < parsedQC[i - 1].parsedTime) {
      throw new QCBracketInputError('timestamps-out-of-order');
    }
  }

  for (let i = 1; i < parsedPatient.length; i += 1) {
    if (parsedPatient[i].parsedTime < parsedPatient[i - 1].parsedTime) {
      throw new QCBracketInputError('timestamps-out-of-order');
    }
  }

  const runComplete = run.status === 'complete';

  return parsedPatient.map((result) => {
    const rule = decideBracket(result.parsedTime, parsedQC, run.windowMs, runComplete);
    return { resultId: result.resultId, disposition: RULE_DISPOSITIONS[rule], rule };
  });
}
