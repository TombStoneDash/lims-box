/**
 * Fail-closed synthetic OHWorks accession state machine.
 *
 * This module is a pure, dependency-free reducer over fabricated accession
 * events. It performs no I/O, touches no real sample, patient, or customer
 * data, and only ever moves a sample between five bounded states:
 *
 *   RECEIVED -> ACCESSIONED | HOLD | REJECTED | CANCELLED
 *   HOLD     -> ACCESSIONED | REJECTED | CANCELLED
 *
 * ACCESSIONED, REJECTED, and CANCELLED are terminal for this model. This
 * module has no concept of "testing" or "release" states or events; any
 * attempt to smuggle one in through an event kind or a free-text note is
 * rejected rather than treated as an accession.
 */

export type AccessionState = 'RECEIVED' | 'ACCESSIONED' | 'HOLD' | 'REJECTED' | 'CANCELLED';

/** Known, bounded classes of actor that may record an accession event. */
export type AccessionActorClass = 'submitter' | 'accessioner' | 'quality-reviewer' | 'system';

/** Known, bounded event kinds. Anything else (e.g. "testing", "release") is rejected. */
export type AccessionEventKind = 'receive' | 'accession' | 'hold' | 'reject' | 'cancel';

/** Known, bounded reason codes. No free-text reason is ever accepted. */
export type AccessionReasonCode =
  | 'sample-intake-logged'
  | 'requisition-verified'
  | 'hold-cleared'
  | 'missing-requisition'
  | 'sample-integrity-compromised'
  | 'insufficient-sample-volume'
  | 'chain-of-custody-broken'
  | 'duplicate-submission'
  | 'customer-requested-cancellation'
  | 'submitted-in-error'
  | 'testing-or-release-out-of-scope';

export type AccessionEventInput = {
  /** Caller-supplied unique identifier for this event. */
  eventId: string;
  /** Synthetic sample identifier this event applies to. */
  sampleId: string;
  /** Synthetic tenant/lab identifier this event claims to belong to. */
  tenantId: string;
  kind: AccessionEventKind;
  actorClass: AccessionActorClass;
  reasonCode: AccessionReasonCode;
  /** UTC timestamp, e.g. "2026-01-01T12:00:00.000Z". Must end in "Z". */
  occurredAt: string;
  /** Optional fabricated operational note. Scanned and rejected if it looks like PII. */
  note?: string;
};

/** An event that has been accepted into the workflow. Frozen; never mutated after creation. */
export type AccessionEvent = Readonly<AccessionEventInput>;

export type AccessionContext = {
  tenantId: string;
  sampleId: string;
};

/** Bounded, privacy-safe codes explaining why an event was blocked instead of applied. */
export type AccessionBlockCode =
  | 'unsupported-event-kind'
  | 'unknown-actor-class'
  | 'unknown-reason-code'
  | 'reason-code-not-allowed-for-kind'
  | 'accession-scope-violation'
  | 'tenant-mismatch'
  | 'sample-id-mismatch'
  | 'timestamp-invalid'
  | 'timestamp-not-utc'
  | 'timestamp-backwards'
  | 'duplicate-event-id-conflict'
  | 'duplicate-event-id-replay'
  | 'note-suspected-pii'
  | 'terminal-state'
  | 'skipped-transition';

export type AccessionTransitionResult =
  | { allowed: true; nextState: AccessionState; event: AccessionEvent }
  | { allowed: false; nextState: AccessionState; blockCode: AccessionBlockCode };

export type AccessionStepOutcome =
  | { index: number; allowed: true; state: AccessionState; event: AccessionEvent }
  | { index: number; allowed: false; state: AccessionState; blockCode: AccessionBlockCode };

export type AccessionRunResult = {
  sampleId: string;
  tenantId: string;
  finalState: AccessionState;
  /** Only successfully applied events, in application order. Frozen. */
  history: readonly AccessionEvent[];
  /** One entry per raw event that was actually evaluated; stops at the first block. Frozen. */
  steps: readonly AccessionStepOutcome[];
  blocked: boolean;
};

export type AccessionInputErrorCode = 'events-not-array' | 'context-malformed' | 'event-malformed';

const INPUT_ERROR_MESSAGES: Record<AccessionInputErrorCode, string> = {
  'events-not-array': 'The accession event input batch is not a list of events.',
  'context-malformed': 'The accession workflow context has an invalid tenant or sample identifier.',
  'event-malformed': 'An accession event is missing a required field or has the wrong shape.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a block code. */
export class AccessionInputError extends Error {
  readonly code: AccessionInputErrorCode;

  constructor(code: AccessionInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'AccessionInputError';
    this.code = code;
  }
}

const KNOWN_ACTOR_CLASSES: ReadonlySet<string> = new Set<AccessionActorClass>([
  'submitter',
  'accessioner',
  'quality-reviewer',
  'system',
]);

const KNOWN_EVENT_KINDS: ReadonlySet<string> = new Set<AccessionEventKind>([
  'receive',
  'accession',
  'hold',
  'reject',
  'cancel',
]);

const KNOWN_REASON_CODES: ReadonlySet<string> = new Set<AccessionReasonCode>([
  'sample-intake-logged',
  'requisition-verified',
  'hold-cleared',
  'missing-requisition',
  'sample-integrity-compromised',
  'insufficient-sample-volume',
  'chain-of-custody-broken',
  'duplicate-submission',
  'customer-requested-cancellation',
  'submitted-in-error',
  'testing-or-release-out-of-scope',
]);

const REASON_CODES_BY_KIND: Record<AccessionEventKind, ReadonlySet<AccessionReasonCode>> = {
  receive: new Set(['sample-intake-logged']),
  accession: new Set(['requisition-verified', 'hold-cleared']),
  hold: new Set(['missing-requisition', 'sample-integrity-compromised', 'insufficient-sample-volume']),
  reject: new Set([
    'sample-integrity-compromised',
    'chain-of-custody-broken',
    'duplicate-submission',
    'testing-or-release-out-of-scope',
  ]),
  cancel: new Set(['customer-requested-cancellation', 'submitted-in-error']),
};

const TERMINAL_STATES: ReadonlySet<AccessionState> = new Set<AccessionState>([
  'ACCESSIONED',
  'REJECTED',
  'CANCELLED',
]);

const TRANSITIONS: Record<AccessionEventKind, Partial<Record<AccessionState, AccessionState>>> = {
  receive: { RECEIVED: 'RECEIVED' },
  accession: { RECEIVED: 'ACCESSIONED', HOLD: 'ACCESSIONED' },
  hold: { RECEIVED: 'HOLD' },
  reject: { RECEIVED: 'REJECTED', HOLD: 'REJECTED' },
  cancel: { RECEIVED: 'CANCELLED', HOLD: 'CANCELLED' },
};

const TESTING_OR_RELEASE_PATTERN = /\btest(?:ing)?\b|\brelease(?:d|s|ing)?\b/i;

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

function isStructurallyValidEvent(raw: unknown): raw is AccessionEventInput {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.eventId) &&
    isNonEmptyString(candidate.sampleId) &&
    isNonEmptyString(candidate.tenantId) &&
    isNonEmptyString(candidate.kind) &&
    isNonEmptyString(candidate.actorClass) &&
    isNonEmptyString(candidate.reasonCode) &&
    isNonEmptyString(candidate.occurredAt) &&
    (candidate.note === undefined || typeof candidate.note === 'string')
  );
}

function isValidContext(context: unknown): context is AccessionContext {
  if (typeof context !== 'object' || context === null) {
    return false;
  }
  const candidate = context as Record<string, unknown>;
  return isNonEmptyString(candidate.tenantId) && isNonEmptyString(candidate.sampleId);
}

function toFrozenEvent(input: AccessionEventInput): AccessionEvent {
  return Object.freeze({
    eventId: input.eventId,
    sampleId: input.sampleId,
    tenantId: input.tenantId,
    kind: input.kind,
    actorClass: input.actorClass,
    reasonCode: input.reasonCode,
    occurredAt: input.occurredAt,
    note: input.note,
  });
}

function sameEventContent(a: AccessionEventInput, b: AccessionEventInput): boolean {
  return (
    a.eventId === b.eventId &&
    a.sampleId === b.sampleId &&
    a.tenantId === b.tenantId &&
    a.kind === b.kind &&
    a.actorClass === b.actorClass &&
    a.reasonCode === b.reasonCode &&
    a.occurredAt === b.occurredAt &&
    (a.note ?? '') === (b.note ?? '')
  );
}

function isUtcTimestamp(value: string): boolean {
  return value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

/**
 * Evaluate a single candidate event against the current state and prior
 * history, and either accept it or return a bounded reason it was blocked.
 *
 * Fail-closed: a skipped or invalid transition, a duplicate event
 * identifier (whether an exact replay or a conflicting rewrite), backwards
 * or non-UTC timestamps, suspected PII in the reason code or note, a
 * tenant/sample mismatch, or any attempt to route a "testing" or "release"
 * event kind (or an accession event whose note describes one) through this
 * model is blocked rather than applied. Structurally unusable input throws
 * AccessionInputError instead of guessing at a block code.
 */
export function applyAccessionEvent(
  currentState: AccessionState,
  rawEvent: unknown,
  history: readonly AccessionEvent[],
  context: AccessionContext,
): AccessionTransitionResult {
  if (!isStructurallyValidEvent(rawEvent)) {
    throw new AccessionInputError('event-malformed');
  }
  if (!isValidContext(context)) {
    throw new AccessionInputError('context-malformed');
  }

  const block = (blockCode: AccessionBlockCode): AccessionTransitionResult => ({
    allowed: false,
    nextState: currentState,
    blockCode,
  });

  if (!KNOWN_EVENT_KINDS.has(rawEvent.kind)) {
    return block('unsupported-event-kind');
  }
  if (!KNOWN_ACTOR_CLASSES.has(rawEvent.actorClass)) {
    return block('unknown-actor-class');
  }
  if (!KNOWN_REASON_CODES.has(rawEvent.reasonCode)) {
    return block('unknown-reason-code');
  }
  if (rawEvent.tenantId !== context.tenantId) {
    return block('tenant-mismatch');
  }
  if (rawEvent.sampleId !== context.sampleId) {
    return block('sample-id-mismatch');
  }
  if (!Number.isFinite(Date.parse(rawEvent.occurredAt))) {
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

  if (rawEvent.note !== undefined && looksLikePII(rawEvent.note)) {
    return block('note-suspected-pii');
  }

  if (rawEvent.kind === 'accession' && rawEvent.note !== undefined && TESTING_OR_RELEASE_PATTERN.test(rawEvent.note)) {
    return block('accession-scope-violation');
  }

  if (!REASON_CODES_BY_KIND[rawEvent.kind].has(rawEvent.reasonCode)) {
    return block('reason-code-not-allowed-for-kind');
  }

  if (TERMINAL_STATES.has(currentState)) {
    return block('terminal-state');
  }

  if (rawEvent.kind === 'receive' && history.length > 0) {
    return block('skipped-transition');
  }

  const nextState = TRANSITIONS[rawEvent.kind][currentState];
  if (!nextState) {
    return block('skipped-transition');
  }

  return { allowed: true, nextState, event: toFrozenEvent(rawEvent) };
}

/**
 * Fold a full sequence of candidate events through the accession state
 * machine, starting from RECEIVED. Processing stops at the first blocked
 * event: fail-closed means a bad event halts the workflow rather than
 * letting later events run against a state that never legitimately
 * advanced past it.
 */
export function runAccessionWorkflow(context: AccessionContext, rawEvents: unknown): AccessionRunResult {
  if (!isValidContext(context)) {
    throw new AccessionInputError('context-malformed');
  }
  if (!Array.isArray(rawEvents)) {
    throw new AccessionInputError('events-not-array');
  }

  let state: AccessionState = 'RECEIVED';
  const history: AccessionEvent[] = [];
  const steps: AccessionStepOutcome[] = [];

  for (let index = 0; index < rawEvents.length; index += 1) {
    const result = applyAccessionEvent(state, rawEvents[index], history, context);
    if (result.allowed === true) {
      history.push(result.event);
      state = result.nextState;
      steps.push({ index, allowed: true, state, event: result.event });
      continue;
    }
    steps.push({ index, allowed: false, state, blockCode: result.blockCode });
    return {
      sampleId: context.sampleId,
      tenantId: context.tenantId,
      finalState: state,
      history: Object.freeze([...history]),
      steps: Object.freeze(steps),
      blocked: true,
    };
  }

  return {
    sampleId: context.sampleId,
    tenantId: context.tenantId,
    finalState: state,
    history: Object.freeze([...history]),
    steps: Object.freeze(steps),
    blocked: false,
  };
}

const BLOCK_MESSAGES: Record<AccessionBlockCode, string> = {
  'unsupported-event-kind': 'The event kind is not one of the bounded accession transitions this model supports.',
  'unknown-actor-class': 'The actor class is not a recognized bounded value.',
  'unknown-reason-code': 'The reason code is not a recognized bounded value.',
  'reason-code-not-allowed-for-kind': 'The reason code is not permitted for this event kind.',
  'accession-scope-violation': 'An accession event described a testing or release action, which this model never performs.',
  'tenant-mismatch': 'The event does not belong to the tenant this workflow is running for.',
  'sample-id-mismatch': 'The event does not belong to the sample this workflow is running for.',
  'timestamp-invalid': 'The event timestamp could not be parsed.',
  'timestamp-not-utc': 'The event timestamp is not an explicit UTC timestamp.',
  'timestamp-backwards': 'The event timestamp does not come after the prior event in this workflow.',
  'duplicate-event-id-conflict': 'This event identifier was already used by a different, conflicting event.',
  'duplicate-event-id-replay': 'This event identifier was already applied and cannot be replayed.',
  'note-suspected-pii': 'The note field appears to contain personal information.',
  'terminal-state': 'The sample is already in a terminal state and accepts no further events.',
  'skipped-transition': 'This event would skip a required accession transition.',
};

/** Deterministic, privacy-safe human-readable text for a block code, suitable for UI display. */
export function explainAccessionBlock(blockCode: AccessionBlockCode): string {
  return BLOCK_MESSAGES[blockCode];
}

/** The concrete corrective step a caller can take to move a blocked event forward, keyed by block code. */
const BLOCK_NEXT_ACTIONS: Record<AccessionBlockCode, string> = {
  'unsupported-event-kind': 'Resubmit using one of the supported event kinds: receive, accession, hold, reject, or cancel.',
  'unknown-actor-class': 'Resubmit the event with a recognized actor class: submitter, accessioner, quality-reviewer, or system.',
  'unknown-reason-code': 'Resubmit the event with one of the reason codes defined for this workflow.',
  'reason-code-not-allowed-for-kind': 'Choose a reason code that is permitted for this event kind, or change the event kind to match the reason.',
  'accession-scope-violation': 'Remove any testing or release language from the note and resubmit as a plain accession event.',
  'tenant-mismatch': 'Confirm the tenant identifier matches the workflow context and resubmit under the correct tenant.',
  'sample-id-mismatch': 'Confirm the sample identifier matches the workflow context and resubmit for the correct sample.',
  'timestamp-invalid': 'Resupply a parsable timestamp for the event.',
  'timestamp-not-utc': 'Resupply the timestamp as an explicit UTC value ending in "Z".',
  'timestamp-backwards': 'Resupply a timestamp that comes after the most recent event already recorded for this sample.',
  'duplicate-event-id-conflict': 'Use a new, unused event identifier and resubmit.',
  'duplicate-event-id-replay': 'This event was already applied; no resubmission is needed.',
  'note-suspected-pii': 'Remove personal information from the note field and resubmit.',
  'terminal-state': 'This sample has reached a terminal state; open a new accession record if further action is required.',
  'skipped-transition': 'Resubmit an event kind that matches the sample\'s current state instead of skipping a required transition.',
};

/** Deterministic, privacy-safe next corrective action for a block code, suitable for UI display alongside the explanation. */
export function explainAccessionBlockNextAction(blockCode: AccessionBlockCode): string {
  return BLOCK_NEXT_ACTIONS[blockCode];
}
