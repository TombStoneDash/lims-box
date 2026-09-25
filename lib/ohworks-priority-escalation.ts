/**
 * Fail-closed synthetic OHWorks specimen priority escalation.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated list
 * of specimens (each with an initial priority and a caller-supplied receipt
 * timestamp), a declared escalation policy (after how many minutes a routine
 * specimen escalates to urgent, and after how many minutes it escalates to
 * stat), and a single caller-supplied current timestamp, it computes:
 *
 *   - effectivePriority: the priority a specimen has earned, considering both
 *     its declared initial priority and how much time has elapsed since it
 *     was received. Priority only ever escalates upward -- it never
 *     de-escalates a specimen declared urgent or stat back down to routine.
 *   - an ordered processing queue: highest effective priority first, then
 *     earliest receipt first, with a final deterministic tie-break so the
 *     order never depends on input array order or engine sort stability.
 *
 * It performs no I/O, reads no system clock (the "current" timestamp is
 * always caller-supplied), mutates no SENAITE or database state, and touches
 * no real subject, sample, or customer data. It never asserts approval,
 * compliance, accreditation, or releasability.
 *
 * Decision shape:
 *   - A specimen's elapsed-time tier is computed from its receipt timestamp
 *     and the caller-supplied current timestamp against the declared
 *     escalation thresholds. The effective priority is the higher of the
 *     specimen's declared initial priority and that elapsed-time tier.
 *   - A specimen whose receipt timestamp cannot be parsed, or whose receipt
 *     timestamp is after the caller-supplied current timestamp (a clock-skew
 *     or malformed-input condition that makes elapsed time untrustworthy),
 *     fails closed to the most urgent priority ('stat') rather than being
 *     guessed at or silently treated as routine.
 *   - A structurally unusable request -- a non-array specimen list, a
 *     specimen missing a required identity field, a specimen with an
 *     unrecognized priority value, a malformed or non-monotonic escalation
 *     policy, or an unparsable current timestamp -- throws
 *     PriorityEscalationInputError instead of guessing at an outcome.
 */

export type SpecimenPriority = 'routine' | 'urgent' | 'stat';

const PRIORITY_RANK: Record<SpecimenPriority, number> = {
  routine: 0,
  urgent: 1,
  stat: 2,
};

function isKnownPriority(value: unknown): value is SpecimenPriority {
  return value === 'routine' || value === 'urgent' || value === 'stat';
}

function higherPriority(a: SpecimenPriority, b: SpecimenPriority): SpecimenPriority {
  return PRIORITY_RANK[a] >= PRIORITY_RANK[b] ? a : b;
}

export type Specimen = {
  /** Synthetic specimen identifier. Never a real patient or customer identifier. */
  specimenId: string;
  /** The priority declared for this specimen at receipt. */
  initialPriority: SpecimenPriority;
  /** Caller-supplied ISO 8601 timestamp the specimen was received. */
  receivedAt: string;
};

export type EscalationSteps = {
  /** Minutes after receipt at which a routine specimen escalates to urgent. Must be a positive finite number. */
  routineToUrgentMinutes: number;
  /**
   * Minutes after receipt at which a specimen escalates to stat. Must be a
   * positive finite number strictly greater than routineToUrgentMinutes.
   */
  urgentToStatMinutes: number;
};

export type PriorityEscalationReasonCode =
  | 'no-escalation-needed'
  | 'escalated-to-urgent'
  | 'escalated-to-stat'
  | 'receipt-timestamp-invalid'
  | 'current-before-receipt';

const REASON_MESSAGES: Record<PriorityEscalationReasonCode, string> = {
  'no-escalation-needed': 'The elapsed time since receipt does not exceed a threshold higher than the declared initial priority.',
  'escalated-to-urgent': 'Elapsed time since receipt reached the declared routine-to-urgent threshold.',
  'escalated-to-stat': 'Elapsed time since receipt reached the declared urgent-to-stat threshold.',
  'receipt-timestamp-invalid': 'The specimen receipt timestamp could not be parsed, so it was escalated to the most urgent priority.',
  'current-before-receipt': 'The current timestamp is before the specimen receipt timestamp, so elapsed time cannot be trusted; the specimen was escalated to the most urgent priority.',
};

/** Deterministic, privacy-safe human-readable text for a priority escalation reason code, suitable for UI display. */
export function explainPriorityEscalationReason(code: PriorityEscalationReasonCode): string {
  return REASON_MESSAGES[code];
}

export type PriorityEscalationInputErrorCode =
  | 'specimens-not-array'
  | 'specimen-malformed'
  | 'unknown-priority'
  | 'steps-malformed'
  | 'steps-non-positive'
  | 'steps-non-monotonic'
  | 'current-timestamp-invalid';

const INPUT_ERROR_MESSAGES: Record<PriorityEscalationInputErrorCode, string> = {
  'specimens-not-array': 'The supplied specimens are not a list.',
  'specimen-malformed': 'A specimen is missing a required identity field.',
  'unknown-priority': 'A specimen declares a priority that is not one of the recognized values.',
  'steps-malformed': 'The declared escalation steps are not structurally valid.',
  'steps-non-positive': 'The declared escalation thresholds must be positive numbers of minutes.',
  'steps-non-monotonic': 'The declared urgent-to-stat threshold must be strictly greater than the routine-to-urgent threshold.',
  'current-timestamp-invalid': 'The supplied current timestamp could not be parsed.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a priority escalation outcome. */
export class PriorityEscalationInputError extends Error {
  readonly code: PriorityEscalationInputErrorCode;

  constructor(code: PriorityEscalationInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'PriorityEscalationInputError';
    this.code = code;
  }
}

export type SpecimenEscalationResult = {
  specimenId: string;
  initialPriority: SpecimenPriority;
  effectivePriority: SpecimenPriority;
  reasonCode: PriorityEscalationReasonCode;
  /** Minutes elapsed between receipt and the current timestamp, or null when elapsed time could not be trusted. */
  elapsedMinutes: number | null;
};

export type PriorityEscalationQueueEntry = SpecimenEscalationResult & {
  /** 0-based position in the ordered processing queue. */
  queuePosition: number;
};

export type PriorityEscalationOutcome = {
  queue: ReadonlyArray<PriorityEscalationQueueEntry>;
};

export type PriorityEscalationInput = {
  specimens: ReadonlyArray<Specimen>;
  steps: EscalationSteps;
  /** Caller-supplied ISO 8601 timestamp treated as "now". Never read from a system clock. */
  currentAt: string;
};

function hasRequiredIdentity(
  value: unknown,
): value is { specimenId: string; initialPriority: unknown; receivedAt: string } & Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.specimenId === 'string' &&
    candidate.specimenId.length > 0 &&
    typeof candidate.receivedAt === 'string' &&
    candidate.receivedAt.length > 0
  );
}

/** Validate the declared escalation steps. Throws on any structural defect. */
function validateSteps(steps: EscalationSteps): void {
  if (typeof steps !== 'object' || steps === null) {
    throw new PriorityEscalationInputError('steps-malformed');
  }
  const candidate = steps as Record<string, unknown>;
  if (
    typeof candidate.routineToUrgentMinutes !== 'number' ||
    !Number.isFinite(candidate.routineToUrgentMinutes) ||
    typeof candidate.urgentToStatMinutes !== 'number' ||
    !Number.isFinite(candidate.urgentToStatMinutes)
  ) {
    throw new PriorityEscalationInputError('steps-malformed');
  }
  if (candidate.routineToUrgentMinutes <= 0 || candidate.urgentToStatMinutes <= 0) {
    throw new PriorityEscalationInputError('steps-non-positive');
  }
  if (candidate.urgentToStatMinutes <= candidate.routineToUrgentMinutes) {
    throw new PriorityEscalationInputError('steps-non-monotonic');
  }
}

function outcome(
  specimenId: string,
  initialPriority: SpecimenPriority,
  effectivePriority: SpecimenPriority,
  reasonCode: PriorityEscalationReasonCode,
  elapsedMinutes: number | null,
): SpecimenEscalationResult {
  return Object.freeze({ specimenId, initialPriority, effectivePriority, reasonCode, elapsedMinutes });
}

type SortableResult = {
  result: SpecimenEscalationResult;
  sortMillis: number;
  originalIndex: number;
};

/**
 * Evaluate a fabricated list of specimens, a declared escalation policy, and
 * a single caller-supplied current timestamp, and return each specimen's
 * effective priority alongside a fully ordered processing queue.
 *
 * Fail-closed: a specimen with an unparsable receipt timestamp, or a receipt
 * timestamp after the supplied current timestamp, is escalated to 'stat'
 * rather than being guessed at. A structurally unusable request (non-array
 * specimens, a malformed specimen, an unrecognized priority, a malformed or
 * non-monotonic escalation policy, or an unparsable current timestamp)
 * throws PriorityEscalationInputError instead of guessing at an outcome.
 */
export function escalateSpecimenPriorities(input: PriorityEscalationInput): PriorityEscalationOutcome {
  validateSteps(input.steps);

  const currentTime = Date.parse(input.currentAt);
  if (!Number.isFinite(currentTime)) {
    throw new PriorityEscalationInputError('current-timestamp-invalid');
  }

  if (!Array.isArray(input.specimens)) {
    throw new PriorityEscalationInputError('specimens-not-array');
  }

  const sortable: SortableResult[] = input.specimens.map((specimen, originalIndex) => {
    if (!hasRequiredIdentity(specimen)) {
      throw new PriorityEscalationInputError('specimen-malformed');
    }
    if (!isKnownPriority(specimen.initialPriority)) {
      throw new PriorityEscalationInputError('unknown-priority');
    }

    const initialPriority = specimen.initialPriority;
    const receivedTime = Date.parse(specimen.receivedAt);

    if (!Number.isFinite(receivedTime)) {
      return {
        result: outcome(specimen.specimenId, initialPriority, 'stat', 'receipt-timestamp-invalid', null),
        sortMillis: -Infinity,
        originalIndex,
      };
    }

    if (currentTime < receivedTime) {
      return {
        result: outcome(specimen.specimenId, initialPriority, 'stat', 'current-before-receipt', null),
        sortMillis: receivedTime,
        originalIndex,
      };
    }

    const elapsedMinutes = (currentTime - receivedTime) / 60000;
    const elapsedTier: SpecimenPriority =
      elapsedMinutes >= input.steps.urgentToStatMinutes
        ? 'stat'
        : elapsedMinutes >= input.steps.routineToUrgentMinutes
          ? 'urgent'
          : 'routine';

    const effectivePriority = higherPriority(initialPriority, elapsedTier);
    const reasonCode: PriorityEscalationReasonCode =
      effectivePriority === initialPriority
        ? 'no-escalation-needed'
        : effectivePriority === 'urgent'
          ? 'escalated-to-urgent'
          : 'escalated-to-stat';

    return {
      result: outcome(specimen.specimenId, initialPriority, effectivePriority, reasonCode, elapsedMinutes),
      sortMillis: receivedTime,
      originalIndex,
    };
  });

  const ordered = [...sortable].sort((a, b) => {
    const rankDelta = PRIORITY_RANK[b.result.effectivePriority] - PRIORITY_RANK[a.result.effectivePriority];
    if (rankDelta !== 0) {
      return rankDelta;
    }
    if (a.sortMillis !== b.sortMillis) {
      return a.sortMillis - b.sortMillis;
    }
    return a.originalIndex - b.originalIndex;
  });

  const queue = ordered.map((entry, queuePosition) =>
    Object.freeze({ ...entry.result, queuePosition }),
  );

  return Object.freeze({ queue: Object.freeze(queue) });
}
