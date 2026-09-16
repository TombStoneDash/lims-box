/**
 * Fail-closed synthetic OHWorks result-review state machine.
 *
 * This module is a pure, dependency-free reducer over fabricated
 * result-review events. It performs no I/O, touches no real sample,
 * patient, or customer data, and only ever moves a result between five
 * bounded states:
 *
 *   draft             -> ready_for_review
 *   ready_for_review  -> approved | rejected
 *   rejected          -> draft
 *   approved          -> corrected
 *
 * `corrected` is terminal for this model. A correction may only be
 * recorded against an `approved` result, must carry both a bounded reason
 * code and a non-empty free-text reason, and never overwrites or discards
 * the approval it corrects: the prior decision is preserved in the run
 * result and in the append-only event history.
 */

export type ResultReviewState = 'draft' | 'ready_for_review' | 'approved' | 'rejected' | 'corrected';

/** Known, bounded classes of actor that may record a result-review event. */
export type ResultReviewActorRole = 'submitter' | 'reviewer';

/** Known, bounded event kinds. Anything else is rejected. */
export type ResultReviewEventKind = 'submit_for_review' | 'approve' | 'reject' | 'revise' | 'correct';

/** Known, bounded reason codes. No free-text reason code is ever accepted. */
export type ResultReviewReasonCode =
  | 'ready-for-review'
  | 'meets-acceptance-criteria'
  | 'out-of-range-unexplained'
  | 'incomplete-documentation'
  | 'qc-failure'
  | 'resubmitted-after-revision'
  | 'transcription-error'
  | 'unit-conversion-error'
  | 'reference-range-updated'
  | 'analyte-mislabeled';

export type ResultReviewEventInput = {
  /** Caller-supplied unique identifier for this event. */
  eventId: string;
  /** Synthetic result identifier this event applies to. */
  resultId: string;
  /** Synthetic tenant/lab identifier this event claims to belong to. */
  tenantId: string;
  kind: ResultReviewEventKind;
  actorRole: ResultReviewActorRole;
  /** Opaque synthetic actor identifier. Never a real name or email. */
  actorId: string;
  reasonCode: ResultReviewReasonCode;
  /** UTC timestamp supplied by the caller, e.g. "2026-01-01T12:00:00.000Z". Must end in "Z". Immutable once accepted. */
  occurredAt: string;
  /**
   * Free-text reason narrative. Required and non-empty for `correct` events;
   * optional for all other kinds. Scanned and rejected if it looks like PII.
   */
  note?: string;
};

/** An event that has been accepted into the workflow. Frozen; never mutated after creation. */
export type ResultReviewEvent = Readonly<ResultReviewEventInput>;

export type ResultReviewContext = {
  tenantId: string;
  resultId: string;
};

/** Bounded, privacy-safe codes explaining why an event was blocked instead of applied. */
export type ResultReviewBlockCode =
  | 'unsupported-event-kind'
  | 'unknown-actor-role'
  | 'unknown-reason-code'
  | 'role-not-allowed-for-kind'
  | 'reason-code-not-allowed-for-kind'
  | 'tenant-mismatch'
  | 'result-id-mismatch'
  | 'timestamp-invalid'
  | 'timestamp-not-utc'
  | 'timestamp-backwards'
  | 'duplicate-event-id-conflict'
  | 'duplicate-event-id-replay'
  | 'correction-reason-missing'
  | 'note-suspected-pii'
  | 'terminal-state'
  | 'skipped-transition';

export type ResultReviewTransitionResult =
  | { allowed: true; nextState: ResultReviewState; event: ResultReviewEvent }
  | { allowed: false; nextState: ResultReviewState; blockCode: ResultReviewBlockCode };

export type ResultReviewStepOutcome =
  | { index: number; allowed: true; priorState: ResultReviewState; state: ResultReviewState; event: ResultReviewEvent }
  | { index: number; allowed: false; state: ResultReviewState; blockCode: ResultReviewBlockCode };

export type ResultReviewRunResult = {
  resultId: string;
  tenantId: string;
  finalState: ResultReviewState;
  /** Only successfully applied events, in application order. Frozen. */
  history: readonly ResultReviewEvent[];
  /** One entry per raw event that was actually evaluated; stops at the first block. Frozen. */
  steps: readonly ResultReviewStepOutcome[];
  blocked: boolean;
  /**
   * The decision state immediately before the most recent `correct` event
   * was applied, if one has been applied. Preserved rather than overwritten
   * so a correction never erases what it corrected.
   */
  priorDecision?: ResultReviewState;
};

export type ResultReviewInputErrorCode = 'events-not-array' | 'context-malformed' | 'event-malformed';

const INPUT_ERROR_MESSAGES: Record<ResultReviewInputErrorCode, string> = {
  'events-not-array': 'The result-review event input batch is not a list of events.',
  'context-malformed': 'The result-review workflow context has an invalid tenant or result identifier.',
  'event-malformed': 'A result-review event is missing a required field or has the wrong shape.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a block code. */
export class ResultReviewInputError extends Error {
  readonly code: ResultReviewInputErrorCode;

  constructor(code: ResultReviewInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'ResultReviewInputError';
    this.code = code;
  }
}

const KNOWN_ACTOR_ROLES: ReadonlySet<string> = new Set<ResultReviewActorRole>(['submitter', 'reviewer']);

const KNOWN_EVENT_KINDS: ReadonlySet<string> = new Set<ResultReviewEventKind>([
  'submit_for_review',
  'approve',
  'reject',
  'revise',
  'correct',
]);

const KNOWN_REASON_CODES: ReadonlySet<string> = new Set<ResultReviewReasonCode>([
  'ready-for-review',
  'meets-acceptance-criteria',
  'out-of-range-unexplained',
  'incomplete-documentation',
  'qc-failure',
  'resubmitted-after-revision',
  'transcription-error',
  'unit-conversion-error',
  'reference-range-updated',
  'analyte-mislabeled',
]);

const ROLES_BY_KIND: Record<ResultReviewEventKind, ReadonlySet<ResultReviewActorRole>> = {
  submit_for_review: new Set(['submitter']),
  approve: new Set(['reviewer']),
  reject: new Set(['reviewer']),
  revise: new Set(['submitter']),
  correct: new Set(['reviewer']),
};

const REASON_CODES_BY_KIND: Record<ResultReviewEventKind, ReadonlySet<ResultReviewReasonCode>> = {
  submit_for_review: new Set(['ready-for-review']),
  approve: new Set(['meets-acceptance-criteria']),
  reject: new Set(['out-of-range-unexplained', 'incomplete-documentation', 'qc-failure']),
  revise: new Set(['resubmitted-after-revision']),
  correct: new Set(['transcription-error', 'unit-conversion-error', 'reference-range-updated', 'analyte-mislabeled']),
};

const TERMINAL_STATES: ReadonlySet<ResultReviewState> = new Set<ResultReviewState>(['corrected']);

const TRANSITIONS: Record<ResultReviewEventKind, Partial<Record<ResultReviewState, ResultReviewState>>> = {
  submit_for_review: { draft: 'ready_for_review' },
  approve: { ready_for_review: 'approved' },
  reject: { ready_for_review: 'rejected' },
  revise: { rejected: 'draft' },
  correct: { approved: 'corrected' },
};

const PII_PATTERNS: readonly RegExp[] = [
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  /\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b(?:ssn|social security|date of birth|d\.?o\.?b\.?|patient name|home address)\b/i,
];

function looksLikePII(value: string): boolean {
  return PII_PATTERNS.some((pattern) => pattern.test(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isStructurallyValidEvent(raw: unknown): raw is ResultReviewEventInput {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.eventId) &&
    isNonEmptyString(candidate.resultId) &&
    isNonEmptyString(candidate.tenantId) &&
    isNonEmptyString(candidate.kind) &&
    isNonEmptyString(candidate.actorRole) &&
    isNonEmptyString(candidate.actorId) &&
    isNonEmptyString(candidate.reasonCode) &&
    isNonEmptyString(candidate.occurredAt) &&
    (candidate.note === undefined || typeof candidate.note === 'string')
  );
}

function isValidContext(context: unknown): context is ResultReviewContext {
  if (typeof context !== 'object' || context === null) {
    return false;
  }
  const candidate = context as Record<string, unknown>;
  return isNonEmptyString(candidate.tenantId) && isNonEmptyString(candidate.resultId);
}

function toFrozenEvent(input: ResultReviewEventInput): ResultReviewEvent {
  return Object.freeze({
    eventId: input.eventId,
    resultId: input.resultId,
    tenantId: input.tenantId,
    kind: input.kind,
    actorRole: input.actorRole,
    actorId: input.actorId,
    reasonCode: input.reasonCode,
    occurredAt: input.occurredAt,
    note: input.note,
  });
}

function sameEventContent(a: ResultReviewEventInput, b: ResultReviewEventInput): boolean {
  return (
    a.eventId === b.eventId &&
    a.resultId === b.resultId &&
    a.tenantId === b.tenantId &&
    a.kind === b.kind &&
    a.actorRole === b.actorRole &&
    a.actorId === b.actorId &&
    a.reasonCode === b.reasonCode &&
    a.occurredAt === b.occurredAt &&
    (a.note ?? '') === (b.note ?? '')
  );
}

function isUtcTimestamp(value: string): boolean {
  return value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

/** Rejects impossible calendar dates that `Date.parse` silently rolls forward instead of rejecting (e.g. 2026-02-30, non-leap 2026-02-29, 2026-04-31). */
function isValidGregorianCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
  if (!match) {
    return true;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return true;
  }
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

/**
 * Evaluate a single candidate event against the current state and prior
 * history, and either accept it or return a bounded reason it was blocked.
 *
 * Fail-closed: a skipped or invalid transition, a duplicate event
 * identifier (whether an exact replay or a conflicting rewrite), backwards
 * or non-UTC timestamps, a role or reason code not permitted for the event
 * kind, suspected PII in the note, a missing correction reason, or a
 * tenant/result mismatch is blocked rather than applied. Structurally
 * unusable input throws ResultReviewInputError instead of guessing at a
 * block code.
 */
export function applyResultReviewEvent(
  currentState: ResultReviewState,
  rawEvent: unknown,
  history: readonly ResultReviewEvent[],
  context: ResultReviewContext,
): ResultReviewTransitionResult {
  if (!isStructurallyValidEvent(rawEvent)) {
    throw new ResultReviewInputError('event-malformed');
  }
  if (!isValidContext(context)) {
    throw new ResultReviewInputError('context-malformed');
  }

  const block = (blockCode: ResultReviewBlockCode): ResultReviewTransitionResult => ({
    allowed: false,
    nextState: currentState,
    blockCode,
  });

  if (!KNOWN_EVENT_KINDS.has(rawEvent.kind)) {
    return block('unsupported-event-kind');
  }
  if (!KNOWN_ACTOR_ROLES.has(rawEvent.actorRole)) {
    return block('unknown-actor-role');
  }
  if (!KNOWN_REASON_CODES.has(rawEvent.reasonCode)) {
    return block('unknown-reason-code');
  }
  if (rawEvent.tenantId !== context.tenantId) {
    return block('tenant-mismatch');
  }
  if (rawEvent.resultId !== context.resultId) {
    return block('result-id-mismatch');
  }
  if (!Number.isFinite(Date.parse(rawEvent.occurredAt)) || !isValidGregorianCalendarDate(rawEvent.occurredAt)) {
    return block('timestamp-invalid');
  }
  if (!isUtcTimestamp(rawEvent.occurredAt)) {
    return block('timestamp-not-utc');
  }

  const duplicate = history.find((entry) => entry.eventId === rawEvent.eventId);
  if (duplicate) {
    return block(sameEventContent(duplicate, rawEvent) ? 'duplicate-event-id-replay' : 'duplicate-event-id-conflict');
  }

  const previous = history.at(-1);
  if (previous && Date.parse(rawEvent.occurredAt) <= Date.parse(previous.occurredAt)) {
    return block('timestamp-backwards');
  }

  if (!ROLES_BY_KIND[rawEvent.kind].has(rawEvent.actorRole)) {
    return block('role-not-allowed-for-kind');
  }
  if (!REASON_CODES_BY_KIND[rawEvent.kind].has(rawEvent.reasonCode)) {
    return block('reason-code-not-allowed-for-kind');
  }

  if (rawEvent.kind === 'correct' && (rawEvent.note === undefined || rawEvent.note.trim().length === 0)) {
    return block('correction-reason-missing');
  }

  if (rawEvent.note !== undefined && looksLikePII(rawEvent.note)) {
    return block('note-suspected-pii');
  }

  if (TERMINAL_STATES.has(currentState)) {
    return block('terminal-state');
  }

  const nextState = TRANSITIONS[rawEvent.kind][currentState];
  if (!nextState) {
    return block('skipped-transition');
  }

  return { allowed: true, nextState, event: toFrozenEvent(rawEvent) };
}

/**
 * Fold a full sequence of candidate events through the result-review state
 * machine, starting from `draft`. Processing stops at the first blocked
 * event: fail-closed means a bad event halts the workflow rather than
 * letting later events run against a state that never legitimately
 * advanced past it. When a `correct` event is applied, the decision state
 * it corrected (always `approved`) is captured in `priorDecision` and the
 * approval event itself remains untouched in `history`.
 */
export function runResultReviewWorkflow(context: ResultReviewContext, rawEvents: unknown): ResultReviewRunResult {
  if (!isValidContext(context)) {
    throw new ResultReviewInputError('context-malformed');
  }
  if (!Array.isArray(rawEvents)) {
    throw new ResultReviewInputError('events-not-array');
  }

  let state: ResultReviewState = 'draft';
  const history: ResultReviewEvent[] = [];
  const steps: ResultReviewStepOutcome[] = [];
  let priorDecision: ResultReviewState | undefined;

  for (let index = 0; index < rawEvents.length; index += 1) {
    const result = applyResultReviewEvent(state, rawEvents[index], history, context);
    if (result.allowed === true) {
      const priorState = state;
      history.push(result.event);
      state = result.nextState;
      steps.push({ index, allowed: true, priorState, state, event: result.event });
      if (result.event.kind === 'correct') {
        priorDecision = priorState;
      }
      continue;
    }
    steps.push({ index, allowed: false, state, blockCode: result.blockCode });
    return {
      resultId: context.resultId,
      tenantId: context.tenantId,
      finalState: state,
      history: Object.freeze([...history]),
      steps: Object.freeze(steps),
      blocked: true,
      priorDecision,
    };
  }

  return {
    resultId: context.resultId,
    tenantId: context.tenantId,
    finalState: state,
    history: Object.freeze([...history]),
    steps: Object.freeze(steps),
    blocked: false,
    priorDecision,
  };
}

const BLOCK_MESSAGES: Record<ResultReviewBlockCode, string> = {
  'unsupported-event-kind': 'The event kind is not one of the bounded result-review transitions this model supports.',
  'unknown-actor-role': 'The actor role is not a recognized bounded value.',
  'unknown-reason-code': 'The reason code is not a recognized bounded value.',
  'role-not-allowed-for-kind': 'The actor role is not permitted to record this event kind.',
  'reason-code-not-allowed-for-kind': 'The reason code is not permitted for this event kind.',
  'tenant-mismatch': 'The event does not belong to the tenant this workflow is running for.',
  'result-id-mismatch': 'The event does not belong to the result this workflow is running for.',
  'timestamp-invalid': 'The event timestamp could not be parsed.',
  'timestamp-not-utc': 'The event timestamp is not an explicit UTC timestamp.',
  'timestamp-backwards': 'The event timestamp does not come after the prior event in this workflow.',
  'duplicate-event-id-conflict': 'This event identifier was already used by a different, conflicting event.',
  'duplicate-event-id-replay': 'This event identifier was already applied and cannot be replayed.',
  'correction-reason-missing': 'A correction event must carry a non-empty free-text reason.',
  'note-suspected-pii': 'The note field appears to contain personal information.',
  'terminal-state': 'The result is already in a terminal state and accepts no further events.',
  'skipped-transition': 'This event would skip a required result-review transition.',
};

/** Deterministic, privacy-safe human-readable text for a block code, suitable for UI display. */
export function explainResultReviewBlock(blockCode: ResultReviewBlockCode): string {
  return BLOCK_MESSAGES[blockCode];
}
