/**
 * Fail-closed synthetic QC review contract for the OHWorks supervised demo.
 *
 * This module is a pure, dependency-free evaluator: it takes a fabricated QC
 * run (bounded control ranges, fabricated observed control values, a
 * reviewer identity, and evidence timestamps) and returns a deterministic
 * release disposition. It does not diagnose results, does not claim any
 * validation or accreditation status, does not touch real instrument or
 * customer data, and performs no I/O. It is intended purely as a contract
 * later UI code can call to decide whether a synthetic demo run may be
 * marked "released".
 */

export type QCControlRange = {
  /** Synthetic control identifier, e.g. "CTRL-LEVEL-1". Never a customer or sample identifier. */
  controlId: string;
  /** Fabricated human-readable label for the control. */
  label: string;
  lowerBound: number;
  upperBound: number;
  /** Maximum age, in milliseconds, that evidence for this control may be relative to the run's reference time. */
  maxAgeMs: number;
};

export type QCControlObservation = {
  controlId: string;
  /** Fabricated observed control value. */
  value: number;
  /** ISO 8601 timestamp the observation was captured. */
  observedAt: string;
  /** Monotonic capture order assigned by the fabricated instrument feed, used to detect reordered evidence. */
  sequence: number;
};

export type QCReviewerRole = 'technical-reviewer' | 'operator' | 'trainee' | 'observer';

export type QCReviewer = {
  reviewerId: string;
  role: QCReviewerRole;
  authorized: boolean;
};

export type QCReviewDecision = {
  reviewer: QCReviewer;
  decision: 'accepted' | 'rejected';
};

export type QCReviewRun = {
  runId: string;
  /** Synthetic identity of whoever prepared/submitted the run; ineligible to also review it. */
  submittedBy: string;
  /** ISO 8601 timestamp representing "now" for freshness evaluation. */
  referenceTime: string;
  requiredControls: QCControlRange[];
  observations: QCControlObservation[];
  review?: QCReviewDecision;
};

export type QCReleaseBlockCode =
  | 'controls-not-configured'
  | 'control-invalid-range'
  | 'control-missing'
  | 'control-duplicate'
  | 'control-mismatched'
  | 'control-non-finite'
  | 'control-out-of-range'
  | 'control-stale'
  | 'reviewer-missing'
  | 'reviewer-rejected'
  | 'reviewer-unauthorized'
  | 'reviewer-self-approved'
  | 'evidence-reordered';

export type QCReleaseBlockReason = {
  code: QCReleaseBlockCode;
  /** Present only for control-scoped reasons; always a synthetic control identifier, never a value or a name. */
  controlId?: string;
};

export type QCReleaseDisposition = {
  releasable: boolean;
  /** Deterministically ordered, privacy-safe block reasons. Empty when releasable. */
  reasons: QCReleaseBlockReason[];
};

const REASON_MESSAGES: Record<QCReleaseBlockCode, string> = {
  'controls-not-configured': 'No required controls are configured for this run.',
  'control-invalid-range': 'A required control has an invalid bounded range and can never be satisfied.',
  'control-missing': 'Required control evidence was not submitted.',
  'control-duplicate': 'More than one evidence entry was submitted for a required control.',
  'control-mismatched': 'Evidence was submitted for a control that is not required by this run.',
  'control-non-finite': 'Control evidence value is not a finite number.',
  'control-out-of-range': 'Control evidence value falls outside its bounded range.',
  'control-stale': 'Control evidence is expired, missing a valid timestamp, or dated outside the freshness window.',
  'reviewer-missing': 'No review decision has been recorded for this run.',
  'reviewer-rejected': 'The reviewer did not accept this run.',
  'reviewer-unauthorized': 'The reviewer is not an authorized technical reviewer.',
  'reviewer-self-approved': 'The reviewer is the same identity that submitted the run.',
  'evidence-reordered': 'Evidence sequence numbers or timestamps are not in strictly increasing order.',
};

/** Deterministic, privacy-safe human-readable text for a block reason, suitable for UI display. */
export function explainQCReleaseBlockReason(reason: QCReleaseBlockReason): string {
  return REASON_MESSAGES[reason.code];
}

function isValidControlRange(control: QCControlRange): boolean {
  return (
    Number.isFinite(control.lowerBound) &&
    Number.isFinite(control.upperBound) &&
    control.lowerBound <= control.upperBound &&
    Number.isFinite(control.maxAgeMs) &&
    control.maxAgeMs >= 0
  );
}

function isReorderedEvidence(observations: QCControlObservation[]): boolean {
  let previousSequence = -Infinity;
  let previousTime = -Infinity;
  for (const observation of observations) {
    const time = Date.parse(observation.observedAt);
    if (!Number.isFinite(observation.sequence) || observation.sequence <= previousSequence) {
      return true;
    }
    if (!Number.isFinite(time) || time < previousTime) {
      return true;
    }
    previousSequence = observation.sequence;
    previousTime = time;
  }
  return false;
}

function compareReasons(a: QCReleaseBlockReason, b: QCReleaseBlockReason): number {
  if (a.code !== b.code) {
    return a.code < b.code ? -1 : 1;
  }
  const aId = a.controlId ?? '';
  const bId = b.controlId ?? '';
  return aId < bId ? -1 : aId > bId ? 1 : 0;
}

/**
 * Evaluate whether a fabricated QC run may be released.
 *
 * Fail-closed: any missing, stale, duplicate, mismatched, non-finite,
 * out-of-range, unauthorized, self-approved, or reordered evidence blocks
 * release, along with deterministic privacy-safe reasons describing why.
 */
export function evaluateQCReleaseDisposition(run: QCReviewRun): QCReleaseDisposition {
  const reasons: QCReleaseBlockReason[] = [];

  if (isReorderedEvidence(run.observations)) {
    reasons.push({ code: 'evidence-reordered' });
  }

  if (run.requiredControls.length === 0) {
    reasons.push({ code: 'controls-not-configured' });
  }

  const requiredControlIds = new Set<string>();
  for (const control of run.requiredControls) {
    if (requiredControlIds.has(control.controlId)) {
      continue;
    }
    requiredControlIds.add(control.controlId);

    if (!isValidControlRange(control)) {
      reasons.push({ code: 'control-invalid-range', controlId: control.controlId });
      continue;
    }

    const matches = run.observations.filter((observation) => observation.controlId === control.controlId);

    if (matches.length === 0) {
      reasons.push({ code: 'control-missing', controlId: control.controlId });
      continue;
    }
    if (matches.length > 1) {
      reasons.push({ code: 'control-duplicate', controlId: control.controlId });
      continue;
    }

    const [observation] = matches;

    if (!Number.isFinite(observation.value)) {
      reasons.push({ code: 'control-non-finite', controlId: control.controlId });
      continue;
    }
    if (observation.value < control.lowerBound || observation.value > control.upperBound) {
      reasons.push({ code: 'control-out-of-range', controlId: control.controlId });
      continue;
    }

    const observedTime = Date.parse(observation.observedAt);
    const referenceTime = Date.parse(run.referenceTime);
    const age = referenceTime - observedTime;
    if (!Number.isFinite(observedTime) || !Number.isFinite(referenceTime) || age < 0 || age > control.maxAgeMs) {
      reasons.push({ code: 'control-stale', controlId: control.controlId });
    }
  }

  const mismatchedControlIds = new Set<string>();
  for (const observation of run.observations) {
    if (!requiredControlIds.has(observation.controlId)) {
      mismatchedControlIds.add(observation.controlId);
    }
  }
  for (const controlId of mismatchedControlIds) {
    reasons.push({ code: 'control-mismatched', controlId });
  }

  if (!run.review) {
    reasons.push({ code: 'reviewer-missing' });
  } else {
    const { reviewer, decision } = run.review;
    if (!reviewer.authorized || reviewer.role !== 'technical-reviewer') {
      reasons.push({ code: 'reviewer-unauthorized' });
    }
    if (reviewer.reviewerId === run.submittedBy) {
      reasons.push({ code: 'reviewer-self-approved' });
    }
    if (decision !== 'accepted') {
      reasons.push({ code: 'reviewer-rejected' });
    }
  }

  reasons.sort(compareReasons);

  return {
    releasable: reasons.length === 0,
    reasons,
  };
}
