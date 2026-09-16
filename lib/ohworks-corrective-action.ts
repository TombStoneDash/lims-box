/**
 * Fail-closed synthetic OHWorks corrective action (CAPA) state machine.
 *
 * This module is a pure, dependency-free reducer over fabricated corrective
 * action events. It performs no I/O, touches no real sample, patient, or
 * customer data, and only ever moves a corrective action record between six
 * bounded states:
 *
 *   opened                -> investigating
 *   investigating         -> action_proposed
 *   action_proposed       -> action_implemented
 *   action_implemented    -> effectiveness_checked
 *   effectiveness_checked -> closed
 *   closed                -> investigating   (reopen only, with a new finding)
 *
 * Every event carries a caller-supplied timestamp and an actor role, and
 * only specific roles may record specific event kinds ("owner role check").
 * Each transition has its own required field (an investigation scope, a
 * proposed action plus its declared root cause, implementation evidence, an
 * effectiveness outcome, or a closure summary). Closing is additionally
 * gated on two independently re-checked facts: a recorded effectiveness
 * check whose outcome was "effective", and a root cause on record drawn
 * from the bounded root cause list. Reopening a closed record is rejected
 * unless it names a finding that was never used earlier in this record's
 * history.
 */

export type CorrectiveActionState =
  | 'opened'
  | 'investigating'
  | 'action_proposed'
  | 'action_implemented'
  | 'effectiveness_checked'
  | 'closed';

/** Known, bounded classes of actor that may record a corrective action event. */
export type CorrectiveActionActorRole = 'investigator' | 'action_owner' | 'qa_reviewer' | 'lab_director';

/** Known, bounded event kinds. Anything else is rejected. */
export type CorrectiveActionEventKind =
  | 'start_investigation'
  | 'propose_action'
  | 'implement_action'
  | 'check_effectiveness'
  | 'close'
  | 'reopen';

/** Bounded root cause codes this module knows how to validate. No free-text root cause is ever accepted. */
export type CorrectiveActionRootCause =
  | 'PROCEDURE_NOT_FOLLOWED'
  | 'TRAINING_GAP'
  | 'EQUIPMENT_MALFUNCTION'
  | 'DOCUMENTATION_ERROR'
  | 'COMMUNICATION_BREAKDOWN'
  | 'SUPPLIER_NONCONFORMANCE'
  | 'INADEQUATE_PROCEDURE'
  | 'ENVIRONMENTAL_FACTOR';

/** Bounded effectiveness check outcomes. Only "effective" allows a subsequent close. */
export type CorrectiveActionEffectivenessOutcome = 'effective' | 'not_effective';

export type CorrectiveActionEventInput = {
  /** Caller-supplied unique identifier for this event. */
  eventId: string;
  /** Synthetic corrective action record identifier this event applies to. */
  recordId: string;
  /** Synthetic tenant/lab identifier this event claims to belong to. */
  tenantId: string;
  kind: CorrectiveActionEventKind;
  actorRole: CorrectiveActionActorRole;
  /** Opaque synthetic actor identifier. Never a real name or email. */
  actorId: string;
  /** UTC timestamp supplied by the caller, e.g. "2026-01-01T12:00:00.000Z". Must end in "Z". Immutable once accepted. */
  occurredAt: string;
  /** Required for `start_investigation`: a non-empty description of the investigation scope. */
  investigationScope?: string;
  /** Required for `propose_action`: a non-empty description of the proposed corrective action. */
  proposedAction?: string;
  /** Required for `propose_action`: the declared root cause driving the proposed action. May be unrecognized. */
  rootCause?: string;
  /** Required for `implement_action`: a non-empty reference to evidence the action was carried out. */
  implementationEvidence?: string;
  /** Required for `check_effectiveness`: the outcome of the effectiveness check. May be unrecognized. */
  effectivenessOutcome?: string;
  /** Required for `close`: a non-empty closure summary. */
  closureSummary?: string;
  /** Required for `reopen`: a non-empty reference to the new finding driving the reopen. Must not repeat a prior finding. */
  newFinding?: string;
  /** Free-text note. Optional for every kind. Scanned and rejected if it looks like PII. */
  note?: string;
};

/** An event that has been accepted into the workflow. Frozen; never mutated after creation. */
export type CorrectiveActionEvent = Readonly<CorrectiveActionEventInput>;

export type CorrectiveActionContext = {
  tenantId: string;
  recordId: string;
  /** The finding/nonconformance reference that opened this record. Counts as "used" for reopen dedup. */
  initialFindingReference: string;
};

/** Bounded, privacy-safe codes explaining why an event was blocked instead of applied. */
export type CorrectiveActionBlockCode =
  | 'unsupported-event-kind'
  | 'unknown-actor-role'
  | 'role-not-allowed-for-kind'
  | 'tenant-mismatch'
  | 'record-id-mismatch'
  | 'timestamp-invalid'
  | 'timestamp-not-utc'
  | 'timestamp-backwards'
  | 'duplicate-event-id-conflict'
  | 'duplicate-event-id-replay'
  | 'skipped-transition'
  | 'investigation-scope-missing'
  | 'proposed-action-missing'
  | 'root-cause-missing'
  | 'root-cause-unknown'
  | 'implementation-evidence-missing'
  | 'effectiveness-outcome-missing'
  | 'effectiveness-outcome-unknown'
  | 'closure-summary-missing'
  | 'effectiveness-not-confirmed'
  | 'root-cause-not-recorded'
  | 'reopen-finding-missing'
  | 'reopen-finding-reused'
  | 'note-suspected-pii';

export type CorrectiveActionTransitionResult =
  | { allowed: true; nextState: CorrectiveActionState; event: CorrectiveActionEvent }
  | { allowed: false; nextState: CorrectiveActionState; blockCode: CorrectiveActionBlockCode };

export type CorrectiveActionStepOutcome =
  | { index: number; allowed: true; priorState: CorrectiveActionState; state: CorrectiveActionState; event: CorrectiveActionEvent }
  | { index: number; allowed: false; state: CorrectiveActionState; blockCode: CorrectiveActionBlockCode };

export type CorrectiveActionRunResult = {
  recordId: string;
  tenantId: string;
  finalState: CorrectiveActionState;
  /** Only successfully applied events, in application order. Frozen. */
  history: readonly CorrectiveActionEvent[];
  /** One entry per raw event that was actually evaluated; stops at the first block. Frozen. */
  steps: readonly CorrectiveActionStepOutcome[];
  blocked: boolean;
};

export type CorrectiveActionInputErrorCode = 'events-not-array' | 'context-malformed' | 'event-malformed';

const INPUT_ERROR_MESSAGES: Record<CorrectiveActionInputErrorCode, string> = {
  'events-not-array': 'The corrective action event input batch is not a list of events.',
  'context-malformed': 'The corrective action workflow context has an invalid tenant, record, or finding identifier.',
  'event-malformed': 'A corrective action event is missing a required field or has the wrong shape.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a block code. */
export class CorrectiveActionInputError extends Error {
  readonly code: CorrectiveActionInputErrorCode;

  constructor(code: CorrectiveActionInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'CorrectiveActionInputError';
    this.code = code;
  }
}

const KNOWN_ACTOR_ROLES: ReadonlySet<string> = new Set<CorrectiveActionActorRole>([
  'investigator',
  'action_owner',
  'qa_reviewer',
  'lab_director',
]);

const KNOWN_EVENT_KINDS: ReadonlySet<string> = new Set<CorrectiveActionEventKind>([
  'start_investigation',
  'propose_action',
  'implement_action',
  'check_effectiveness',
  'close',
  'reopen',
]);

const KNOWN_ROOT_CAUSES: ReadonlySet<string> = new Set<CorrectiveActionRootCause>([
  'PROCEDURE_NOT_FOLLOWED',
  'TRAINING_GAP',
  'EQUIPMENT_MALFUNCTION',
  'DOCUMENTATION_ERROR',
  'COMMUNICATION_BREAKDOWN',
  'SUPPLIER_NONCONFORMANCE',
  'INADEQUATE_PROCEDURE',
  'ENVIRONMENTAL_FACTOR',
]);

const KNOWN_EFFECTIVENESS_OUTCOMES: ReadonlySet<string> = new Set<CorrectiveActionEffectivenessOutcome>([
  'effective',
  'not_effective',
]);

const ROLES_BY_KIND: Record<CorrectiveActionEventKind, ReadonlySet<CorrectiveActionActorRole>> = {
  start_investigation: new Set(['investigator']),
  propose_action: new Set(['investigator']),
  implement_action: new Set(['action_owner']),
  check_effectiveness: new Set(['qa_reviewer']),
  close: new Set(['qa_reviewer', 'lab_director']),
  reopen: new Set(['lab_director']),
};

const TRANSITIONS: Record<CorrectiveActionEventKind, Partial<Record<CorrectiveActionState, CorrectiveActionState>>> = {
  start_investigation: { opened: 'investigating' },
  propose_action: { investigating: 'action_proposed' },
  implement_action: { action_proposed: 'action_implemented' },
  check_effectiveness: { action_implemented: 'effectiveness_checked' },
  close: { effectiveness_checked: 'closed' },
  reopen: { closed: 'investigating' },
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

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isStructurallyValidEvent(raw: unknown): raw is CorrectiveActionEventInput {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.eventId) &&
    isNonEmptyString(candidate.recordId) &&
    isNonEmptyString(candidate.tenantId) &&
    isNonEmptyString(candidate.kind) &&
    isNonEmptyString(candidate.actorRole) &&
    isNonEmptyString(candidate.actorId) &&
    isNonEmptyString(candidate.occurredAt) &&
    isOptionalString(candidate.investigationScope) &&
    isOptionalString(candidate.proposedAction) &&
    isOptionalString(candidate.rootCause) &&
    isOptionalString(candidate.implementationEvidence) &&
    isOptionalString(candidate.effectivenessOutcome) &&
    isOptionalString(candidate.closureSummary) &&
    isOptionalString(candidate.newFinding) &&
    isOptionalString(candidate.note)
  );
}

function isValidContext(context: unknown): context is CorrectiveActionContext {
  if (typeof context !== 'object' || context === null) {
    return false;
  }
  const candidate = context as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.tenantId) &&
    isNonEmptyString(candidate.recordId) &&
    isNonEmptyString(candidate.initialFindingReference)
  );
}

function toFrozenEvent(input: CorrectiveActionEventInput): CorrectiveActionEvent {
  return Object.freeze({ ...input });
}

function sameEventContent(a: CorrectiveActionEventInput, b: CorrectiveActionEventInput): boolean {
  return (
    a.eventId === b.eventId &&
    a.recordId === b.recordId &&
    a.tenantId === b.tenantId &&
    a.kind === b.kind &&
    a.actorRole === b.actorRole &&
    a.actorId === b.actorId &&
    a.occurredAt === b.occurredAt &&
    (a.investigationScope ?? '') === (b.investigationScope ?? '') &&
    (a.proposedAction ?? '') === (b.proposedAction ?? '') &&
    (a.rootCause ?? '') === (b.rootCause ?? '') &&
    (a.implementationEvidence ?? '') === (b.implementationEvidence ?? '') &&
    (a.effectivenessOutcome ?? '') === (b.effectivenessOutcome ?? '') &&
    (a.closureSummary ?? '') === (b.closureSummary ?? '') &&
    (a.newFinding ?? '') === (b.newFinding ?? '') &&
    (a.note ?? '') === (b.note ?? '')
  );
}

function isUtcTimestamp(value: string): boolean {
  return value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

/** The most recently recorded root cause in this record's history, if `propose_action` has ever succeeded. */
function lastRecordedRootCause(history: readonly CorrectiveActionEvent[]): string | undefined {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].kind === 'propose_action') {
      return history[i].rootCause;
    }
  }
  return undefined;
}

/** The most recently recorded effectiveness outcome in this record's history, if `check_effectiveness` has ever succeeded. */
function lastRecordedEffectivenessOutcome(history: readonly CorrectiveActionEvent[]): string | undefined {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].kind === 'check_effectiveness') {
      return history[i].effectivenessOutcome;
    }
  }
  return undefined;
}

/** Every finding reference already used by this record: the opening finding plus every accepted reopen's finding. */
function usedFindingReferences(history: readonly CorrectiveActionEvent[], context: CorrectiveActionContext): ReadonlySet<string> {
  const used = new Set<string>([context.initialFindingReference]);
  for (const event of history) {
    if (event.kind === 'reopen' && event.newFinding !== undefined) {
      used.add(event.newFinding);
    }
  }
  return used;
}

/**
 * Evaluate a single candidate event against the current state and prior
 * history, and either accept it or return a bounded reason it was blocked.
 *
 * Fail-closed: a skipped or invalid transition, a duplicate event
 * identifier (whether an exact replay or a conflicting rewrite), backwards
 * or non-UTC timestamps, a role not permitted for the event kind, a missing
 * or unrecognized kind-specific required field, suspected PII in the note,
 * closing without a recorded "effective" effectiveness check or a bounded
 * root cause on record, and reopening with a finding already used earlier
 * in this record's history are all blocked rather than applied.
 * Structurally unusable input throws CorrectiveActionInputError instead of
 * guessing at a block code.
 */
export function applyCorrectiveActionEvent(
  currentState: CorrectiveActionState,
  rawEvent: unknown,
  history: readonly CorrectiveActionEvent[],
  context: CorrectiveActionContext,
): CorrectiveActionTransitionResult {
  if (!isStructurallyValidEvent(rawEvent)) {
    throw new CorrectiveActionInputError('event-malformed');
  }
  if (!isValidContext(context)) {
    throw new CorrectiveActionInputError('context-malformed');
  }

  const block = (blockCode: CorrectiveActionBlockCode): CorrectiveActionTransitionResult => ({
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
  if (rawEvent.tenantId !== context.tenantId) {
    return block('tenant-mismatch');
  }
  if (rawEvent.recordId !== context.recordId) {
    return block('record-id-mismatch');
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

  if (!ROLES_BY_KIND[rawEvent.kind].has(rawEvent.actorRole)) {
    return block('role-not-allowed-for-kind');
  }

  const nextState = TRANSITIONS[rawEvent.kind][currentState];
  if (!nextState) {
    return block('skipped-transition');
  }

  if (rawEvent.kind === 'start_investigation') {
    if (!isNonEmptyString(rawEvent.investigationScope)) {
      return block('investigation-scope-missing');
    }
  }

  if (rawEvent.kind === 'propose_action') {
    if (!isNonEmptyString(rawEvent.proposedAction)) {
      return block('proposed-action-missing');
    }
    if (!isNonEmptyString(rawEvent.rootCause)) {
      return block('root-cause-missing');
    }
    if (!KNOWN_ROOT_CAUSES.has(rawEvent.rootCause)) {
      return block('root-cause-unknown');
    }
  }

  if (rawEvent.kind === 'implement_action') {
    if (!isNonEmptyString(rawEvent.implementationEvidence)) {
      return block('implementation-evidence-missing');
    }
  }

  if (rawEvent.kind === 'check_effectiveness') {
    if (!isNonEmptyString(rawEvent.effectivenessOutcome)) {
      return block('effectiveness-outcome-missing');
    }
    if (!KNOWN_EFFECTIVENESS_OUTCOMES.has(rawEvent.effectivenessOutcome)) {
      return block('effectiveness-outcome-unknown');
    }
  }

  if (rawEvent.kind === 'close') {
    if (!isNonEmptyString(rawEvent.closureSummary)) {
      return block('closure-summary-missing');
    }
    const recordedRootCause = lastRecordedRootCause(history);
    if (!isNonEmptyString(recordedRootCause) || !KNOWN_ROOT_CAUSES.has(recordedRootCause)) {
      return block('root-cause-not-recorded');
    }
    const recordedOutcome = lastRecordedEffectivenessOutcome(history);
    if (recordedOutcome !== 'effective') {
      return block('effectiveness-not-confirmed');
    }
  }

  if (rawEvent.kind === 'reopen') {
    if (!isNonEmptyString(rawEvent.newFinding)) {
      return block('reopen-finding-missing');
    }
    if (usedFindingReferences(history, context).has(rawEvent.newFinding)) {
      return block('reopen-finding-reused');
    }
  }

  if (rawEvent.note !== undefined && looksLikePII(rawEvent.note)) {
    return block('note-suspected-pii');
  }

  return { allowed: true, nextState, event: toFrozenEvent(rawEvent) };
}

/**
 * Fold a full sequence of candidate events through the corrective action
 * state machine, starting from `opened`. Processing stops at the first
 * blocked event: fail-closed means a bad event halts the workflow rather
 * than letting later events run against a state that never legitimately
 * advanced past it.
 */
export function runCorrectiveActionWorkflow(context: CorrectiveActionContext, rawEvents: unknown): CorrectiveActionRunResult {
  if (!isValidContext(context)) {
    throw new CorrectiveActionInputError('context-malformed');
  }
  if (!Array.isArray(rawEvents)) {
    throw new CorrectiveActionInputError('events-not-array');
  }

  let state: CorrectiveActionState = 'opened';
  const history: CorrectiveActionEvent[] = [];
  const steps: CorrectiveActionStepOutcome[] = [];

  for (let index = 0; index < rawEvents.length; index += 1) {
    const result = applyCorrectiveActionEvent(state, rawEvents[index], history, context);
    if (result.allowed === true) {
      const priorState = state;
      history.push(result.event);
      state = result.nextState;
      steps.push({ index, allowed: true, priorState, state, event: result.event });
      continue;
    }
    steps.push({ index, allowed: false, state, blockCode: result.blockCode });
    return {
      recordId: context.recordId,
      tenantId: context.tenantId,
      finalState: state,
      history: Object.freeze([...history]),
      steps: Object.freeze(steps),
      blocked: true,
    };
  }

  return {
    recordId: context.recordId,
    tenantId: context.tenantId,
    finalState: state,
    history: Object.freeze([...history]),
    steps: Object.freeze(steps),
    blocked: false,
  };
}

const BLOCK_MESSAGES: Record<CorrectiveActionBlockCode, string> = {
  'unsupported-event-kind': 'The event kind is not one of the bounded corrective action transitions this model supports.',
  'unknown-actor-role': 'The actor role is not a recognized bounded value.',
  'role-not-allowed-for-kind': 'The actor role is not permitted to record this event kind.',
  'tenant-mismatch': 'The event does not belong to the tenant this workflow is running for.',
  'record-id-mismatch': 'The event does not belong to the corrective action record this workflow is running for.',
  'timestamp-invalid': 'The event timestamp could not be parsed.',
  'timestamp-not-utc': 'The event timestamp is not an explicit UTC timestamp.',
  'timestamp-backwards': 'The event timestamp does not come after the prior event in this workflow.',
  'duplicate-event-id-conflict': 'This event identifier was already used by a different, conflicting event.',
  'duplicate-event-id-replay': 'This event identifier was already applied and cannot be replayed.',
  'skipped-transition': 'This event would skip a required corrective action transition.',
  'investigation-scope-missing': 'Starting an investigation requires a non-empty investigation scope.',
  'proposed-action-missing': 'Proposing an action requires a non-empty proposed action description.',
  'root-cause-missing': 'Proposing an action requires a declared root cause.',
  'root-cause-unknown': 'The declared root cause is not on the bounded root cause list.',
  'implementation-evidence-missing': 'Implementing an action requires non-empty implementation evidence.',
  'effectiveness-outcome-missing': 'Checking effectiveness requires a recorded outcome.',
  'effectiveness-outcome-unknown': 'The declared effectiveness outcome is not a recognized bounded value.',
  'closure-summary-missing': 'Closing requires a non-empty closure summary.',
  'effectiveness-not-confirmed': 'Closing requires a recorded effectiveness check whose outcome was "effective".',
  'root-cause-not-recorded': 'Closing requires a root cause on record from the bounded root cause list.',
  'reopen-finding-missing': 'Reopening a closed record requires a non-empty new finding reference.',
  'reopen-finding-reused': 'Reopening a closed record requires a finding that was not already used in this record.',
  'note-suspected-pii': 'The note field appears to contain personal information.',
};

/** Deterministic, privacy-safe human-readable text for a block code, suitable for UI display. */
export function explainCorrectiveActionBlock(blockCode: CorrectiveActionBlockCode): string {
  return BLOCK_MESSAGES[blockCode];
}
