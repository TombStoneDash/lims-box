/**
 * Fail-closed synthetic OHWorks nonconformance lifecycle state machine.
 *
 * This module is a pure, dependency-free reducer over fabricated
 * nonconformance records. It performs no I/O, touches no real sample,
 * patient, or customer data, and only ever moves a nonconformance record
 * between seven bounded states along an explicit allowed-transition table:
 *
 *   OPEN                        -> CONTAINED
 *   CONTAINED                   -> ROOT_CAUSE_RECORDED
 *   ROOT_CAUSE_RECORDED         -> CORRECTIVE_ACTION_ASSIGNED
 *   CORRECTIVE_ACTION_ASSIGNED  -> CORRECTIVE_ACTION_ASSIGNED (additional corrective actions)
 *   CORRECTIVE_ACTION_ASSIGNED  -> EFFECTIVENESS_CHECK_DUE
 *   EFFECTIVENESS_CHECK_DUE     -> CORRECTIVE_ACTION_ASSIGNED (a failed check demands a new corrective action)
 *   EFFECTIVENESS_CHECK_DUE     -> EFFECTIVENESS_CHECK_DUE (recording a check outcome)
 *   EFFECTIVENESS_CHECK_DUE     -> CLOSED
 *   OPEN | CONTAINED | ROOT_CAUSE_RECORDED | CORRECTIVE_ACTION_ASSIGNED | EFFECTIVENESS_CHECK_DUE -> VOID
 *
 * CLOSED and VOID are terminal: no action ever leaves them.
 *
 * The exported `transitionNonconformance` function is pure: given a record,
 * a requested action, an actor role, and a caller-supplied UTC timestamp, it
 * returns either the next record with one immutable history entry appended,
 * or a bounded, privacy-safe refusal code. Closing is gated on three
 * independently re-checked facts recorded in history: a root cause, at
 * least one assigned corrective action, and a passed effectiveness check.
 * The actor who assigned a corrective action may never record an
 * effectiveness check for that same corrective action, whatever the
 * outcome. Unknown states, roles, and actions, and any timestamp that is
 * not a finite, explicit UTC instant, are all rejected rather than guessed
 * at.
 */

export type NonconformanceState =
  | 'OPEN'
  | 'CONTAINED'
  | 'ROOT_CAUSE_RECORDED'
  | 'CORRECTIVE_ACTION_ASSIGNED'
  | 'EFFECTIVENESS_CHECK_DUE'
  | 'CLOSED'
  | 'VOID';

/** Known, bounded classes of actor that may request a nonconformance lifecycle action. */
export type NonconformanceActorRole = 'investigator' | 'quality_officer' | 'lab_director' | 'effectiveness_verifier';

/** Known, bounded lifecycle actions. Anything else is rejected. */
export type NonconformanceActionKind =
  | 'CONTAIN'
  | 'RECORD_ROOT_CAUSE'
  | 'ASSIGN_CORRECTIVE_ACTION'
  | 'SCHEDULE_EFFECTIVENESS_CHECK'
  | 'RECORD_EFFECTIVENESS_CHECK'
  | 'CLOSE'
  | 'VOID';

/** Bounded root cause codes this module knows how to validate. No free-text root cause is ever accepted. */
export type NonconformanceRootCause =
  | 'PROCEDURE_NOT_FOLLOWED'
  | 'TRAINING_GAP'
  | 'EQUIPMENT_MALFUNCTION'
  | 'DOCUMENTATION_ERROR'
  | 'SUPPLIER_NONCONFORMANCE'
  | 'INADEQUATE_PROCEDURE'
  | 'ENVIRONMENTAL_FACTOR';

/** Bounded effectiveness check outcomes. Only "passed" contributes toward closing. */
export type NonconformanceEffectivenessOutcome = 'passed' | 'failed';

export type NonconformanceActionInput = {
  kind: NonconformanceActionKind;
  /** Opaque synthetic actor identifier. Never a real name or email. */
  actorId: string;
  /** Required for `CONTAIN`: a non-empty description of the containment measure taken. */
  containmentAction?: string;
  /** Required for `RECORD_ROOT_CAUSE`: the declared root cause. May be unrecognized. */
  rootCause?: string;
  /** Required for `ASSIGN_CORRECTIVE_ACTION`, `SCHEDULE_EFFECTIVENESS_CHECK`, and `RECORD_EFFECTIVENESS_CHECK`. */
  correctiveActionId?: string;
  /** Required for `ASSIGN_CORRECTIVE_ACTION`: a non-empty description of the corrective action. */
  correctiveActionDescription?: string;
  /** Required for `RECORD_EFFECTIVENESS_CHECK`: the outcome of the check. May be unrecognized. */
  effectivenessOutcome?: string;
  /** Required for `CLOSE`: a non-empty closure summary. */
  closureSummary?: string;
  /** Required for `VOID`: a non-empty reason the record is being voided. */
  voidReason?: string;
};

/** An action that has been accepted into a record's history. Frozen; never mutated after creation. */
export type NonconformanceAction = Readonly<NonconformanceActionInput>;

export type NonconformanceHistoryEntry = Readonly<{
  action: NonconformanceAction;
  actorRole: NonconformanceActorRole;
  fromState: NonconformanceState;
  toState: NonconformanceState;
  /** Caller-supplied UTC timestamp this action was accepted at, e.g. "2026-01-01T12:00:00.000Z". */
  occurredAt: string;
}>;

export type NonconformanceRecord = Readonly<{
  recordId: string;
  tenantId: string;
  state: NonconformanceState;
  /** Every accepted action in application order. Frozen. */
  history: readonly NonconformanceHistoryEntry[];
}>;

/** Bounded, privacy-safe codes explaining why a requested action was refused instead of applied. */
export type NonconformanceRefusalCode =
  | 'unknown-action'
  | 'unknown-actor-role'
  | 'unknown-state'
  | 'timestamp-invalid'
  | 'timestamp-not-utc'
  | 'timestamp-backwards'
  | 'role-not-allowed-for-action'
  | 'invalid-transition'
  | 'containment-action-missing'
  | 'root-cause-missing'
  | 'root-cause-unknown'
  | 'corrective-action-id-missing'
  | 'corrective-action-description-missing'
  | 'corrective-action-id-duplicate'
  | 'corrective-action-id-unknown'
  | 'effectiveness-outcome-missing'
  | 'effectiveness-outcome-unknown'
  | 'assigner-cannot-verify-effectiveness'
  | 'closure-summary-missing'
  | 'close-requires-root-cause'
  | 'close-requires-corrective-action'
  | 'close-requires-passed-effectiveness-check'
  | 'void-reason-missing';

export type NonconformanceTransitionResult =
  | { ok: true; record: NonconformanceRecord }
  | { ok: false; refusalCode: NonconformanceRefusalCode };

export type NonconformanceInputErrorCode = 'record-malformed' | 'action-malformed';

const INPUT_ERROR_MESSAGES: Record<NonconformanceInputErrorCode, string> = {
  'record-malformed': 'The nonconformance record has an invalid identifier, state, or history shape.',
  'action-malformed': 'The requested nonconformance action is missing a required field or has the wrong shape.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a refusal code. */
export class NonconformanceInputError extends Error {
  readonly code: NonconformanceInputErrorCode;

  constructor(code: NonconformanceInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'NonconformanceInputError';
    this.code = code;
  }
}

const KNOWN_STATES: ReadonlySet<string> = new Set<NonconformanceState>([
  'OPEN',
  'CONTAINED',
  'ROOT_CAUSE_RECORDED',
  'CORRECTIVE_ACTION_ASSIGNED',
  'EFFECTIVENESS_CHECK_DUE',
  'CLOSED',
  'VOID',
]);

const KNOWN_ACTOR_ROLES: ReadonlySet<string> = new Set<NonconformanceActorRole>([
  'investigator',
  'quality_officer',
  'lab_director',
  'effectiveness_verifier',
]);

const KNOWN_ACTION_KINDS: ReadonlySet<string> = new Set<NonconformanceActionKind>([
  'CONTAIN',
  'RECORD_ROOT_CAUSE',
  'ASSIGN_CORRECTIVE_ACTION',
  'SCHEDULE_EFFECTIVENESS_CHECK',
  'RECORD_EFFECTIVENESS_CHECK',
  'CLOSE',
  'VOID',
]);

const KNOWN_ROOT_CAUSES: ReadonlySet<string> = new Set<NonconformanceRootCause>([
  'PROCEDURE_NOT_FOLLOWED',
  'TRAINING_GAP',
  'EQUIPMENT_MALFUNCTION',
  'DOCUMENTATION_ERROR',
  'SUPPLIER_NONCONFORMANCE',
  'INADEQUATE_PROCEDURE',
  'ENVIRONMENTAL_FACTOR',
]);

const KNOWN_EFFECTIVENESS_OUTCOMES: ReadonlySet<string> = new Set<NonconformanceEffectivenessOutcome>([
  'passed',
  'failed',
]);

/** Explicit allowed-transition table: action kind -> current state -> next state. */
export const NONCONFORMANCE_TRANSITIONS: Readonly<
  Record<NonconformanceActionKind, Partial<Record<NonconformanceState, NonconformanceState>>>
> = Object.freeze({
  CONTAIN: Object.freeze({ OPEN: 'CONTAINED' }),
  RECORD_ROOT_CAUSE: Object.freeze({ CONTAINED: 'ROOT_CAUSE_RECORDED' }),
  ASSIGN_CORRECTIVE_ACTION: Object.freeze({
    ROOT_CAUSE_RECORDED: 'CORRECTIVE_ACTION_ASSIGNED',
    CORRECTIVE_ACTION_ASSIGNED: 'CORRECTIVE_ACTION_ASSIGNED',
    EFFECTIVENESS_CHECK_DUE: 'CORRECTIVE_ACTION_ASSIGNED',
  }),
  SCHEDULE_EFFECTIVENESS_CHECK: Object.freeze({ CORRECTIVE_ACTION_ASSIGNED: 'EFFECTIVENESS_CHECK_DUE' }),
  RECORD_EFFECTIVENESS_CHECK: Object.freeze({ EFFECTIVENESS_CHECK_DUE: 'EFFECTIVENESS_CHECK_DUE' }),
  CLOSE: Object.freeze({ EFFECTIVENESS_CHECK_DUE: 'CLOSED' }),
  VOID: Object.freeze({
    OPEN: 'VOID',
    CONTAINED: 'VOID',
    ROOT_CAUSE_RECORDED: 'VOID',
    CORRECTIVE_ACTION_ASSIGNED: 'VOID',
    EFFECTIVENESS_CHECK_DUE: 'VOID',
  }),
});

const ROLES_BY_ACTION: Record<NonconformanceActionKind, ReadonlySet<NonconformanceActorRole>> = {
  CONTAIN: new Set(['investigator', 'quality_officer']),
  RECORD_ROOT_CAUSE: new Set(['investigator']),
  ASSIGN_CORRECTIVE_ACTION: new Set(['quality_officer', 'lab_director']),
  SCHEDULE_EFFECTIVENESS_CHECK: new Set(['quality_officer']),
  RECORD_EFFECTIVENESS_CHECK: new Set(['effectiveness_verifier', 'lab_director']),
  CLOSE: new Set(['quality_officer', 'lab_director']),
  VOID: new Set(['lab_director']),
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isUtcTimestamp(value: string): boolean {
  return value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

function isStructurallyValidAction(raw: unknown): raw is NonconformanceActionInput {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.kind) &&
    isNonEmptyString(candidate.actorId) &&
    isOptionalString(candidate.containmentAction) &&
    isOptionalString(candidate.rootCause) &&
    isOptionalString(candidate.correctiveActionId) &&
    isOptionalString(candidate.correctiveActionDescription) &&
    isOptionalString(candidate.effectivenessOutcome) &&
    isOptionalString(candidate.closureSummary) &&
    isOptionalString(candidate.voidReason)
  );
}

function isStructurallyValidHistoryEntry(raw: unknown): raw is NonconformanceHistoryEntry {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    isStructurallyValidAction(candidate.action) &&
    isNonEmptyString(candidate.actorRole) &&
    isNonEmptyString(candidate.fromState) &&
    isNonEmptyString(candidate.toState) &&
    isNonEmptyString(candidate.occurredAt)
  );
}

function isStructurallyValidRecord(raw: unknown): raw is NonconformanceRecord {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.recordId) &&
    isNonEmptyString(candidate.tenantId) &&
    isNonEmptyString(candidate.state) &&
    Array.isArray(candidate.history) &&
    candidate.history.every(isStructurallyValidHistoryEntry)
  );
}

function toFrozenAction(input: NonconformanceActionInput): NonconformanceAction {
  return Object.freeze({ ...input });
}

/** The synthetic actor id that assigned a given corrective action, if it was ever assigned in this history. */
function assignerOf(history: readonly NonconformanceHistoryEntry[], correctiveActionId: string): string | undefined {
  for (const entry of history) {
    if (entry.action.kind === 'ASSIGN_CORRECTIVE_ACTION' && entry.action.correctiveActionId === correctiveActionId) {
      return entry.action.actorId;
    }
  }
  return undefined;
}

function hasAnyCorrectiveAction(history: readonly NonconformanceHistoryEntry[]): boolean {
  return history.some((entry) => entry.action.kind === 'ASSIGN_CORRECTIVE_ACTION');
}

function hasRecordedRootCause(history: readonly NonconformanceHistoryEntry[]): boolean {
  return history.some((entry) => entry.action.kind === 'RECORD_ROOT_CAUSE');
}

function hasPassedEffectivenessCheck(history: readonly NonconformanceHistoryEntry[]): boolean {
  return history.some(
    (entry) => entry.action.kind === 'RECORD_EFFECTIVENESS_CHECK' && entry.action.effectivenessOutcome === 'passed',
  );
}

/**
 * Create a brand-new synthetic nonconformance record in the OPEN state with
 * an empty, frozen history. Fixture helper only; performs no I/O.
 */
export function createNonconformanceRecord(recordId: string, tenantId: string): NonconformanceRecord {
  if (!isNonEmptyString(recordId) || !isNonEmptyString(tenantId)) {
    throw new NonconformanceInputError('record-malformed');
  }
  return Object.freeze({ recordId, tenantId, state: 'OPEN', history: Object.freeze([]) });
}

/**
 * Pure transition: evaluate a requested action against the current record,
 * an actor role, and a caller-supplied UTC timestamp, and either accept it
 * (returning the next record with one new immutable history entry) or
 * refuse it with a bounded, privacy-safe reason.
 *
 * Fail-closed: an unrecognized action kind, actor role, or record state; a
 * non-finite, unparseable, non-UTC, or non-monotonic timestamp; a role not
 * permitted for the requested action; a transition the allowed-transition
 * table does not define from the record's current state; a missing or
 * unrecognized kind-specific required field; and closing without a
 * recorded root cause, at least one assigned corrective action, or a
 * passed effectiveness check verified by someone other than the corrective
 * action's assigner, are all refused rather than applied. Structurally
 * unusable input throws NonconformanceInputError instead of guessing at a
 * refusal code.
 */
export function transitionNonconformance(
  record: NonconformanceRecord,
  action: NonconformanceActionInput,
  actorRole: NonconformanceActorRole,
  occurredAt: string,
): NonconformanceTransitionResult {
  if (!isStructurallyValidRecord(record)) {
    throw new NonconformanceInputError('record-malformed');
  }
  if (!isStructurallyValidAction(action)) {
    throw new NonconformanceInputError('action-malformed');
  }

  const refuse = (refusalCode: NonconformanceRefusalCode): NonconformanceTransitionResult => ({
    ok: false,
    refusalCode,
  });

  if (!KNOWN_ACTION_KINDS.has(action.kind)) {
    return refuse('unknown-action');
  }
  if (!KNOWN_ACTOR_ROLES.has(actorRole)) {
    return refuse('unknown-actor-role');
  }
  if (!KNOWN_STATES.has(record.state)) {
    return refuse('unknown-state');
  }
  if (typeof occurredAt !== 'string' || !Number.isFinite(Date.parse(occurredAt))) {
    return refuse('timestamp-invalid');
  }
  if (!isUtcTimestamp(occurredAt)) {
    return refuse('timestamp-not-utc');
  }

  const previous = record.history.at(-1);
  if (previous && Date.parse(occurredAt) <= Date.parse(previous.occurredAt)) {
    return refuse('timestamp-backwards');
  }

  if (!ROLES_BY_ACTION[action.kind].has(actorRole)) {
    return refuse('role-not-allowed-for-action');
  }

  const nextState = NONCONFORMANCE_TRANSITIONS[action.kind][record.state];
  if (!nextState) {
    return refuse('invalid-transition');
  }

  if (action.kind === 'CONTAIN') {
    if (!isNonEmptyString(action.containmentAction)) {
      return refuse('containment-action-missing');
    }
  }

  if (action.kind === 'RECORD_ROOT_CAUSE') {
    if (!isNonEmptyString(action.rootCause)) {
      return refuse('root-cause-missing');
    }
    if (!KNOWN_ROOT_CAUSES.has(action.rootCause)) {
      return refuse('root-cause-unknown');
    }
  }

  if (action.kind === 'ASSIGN_CORRECTIVE_ACTION') {
    if (!isNonEmptyString(action.correctiveActionId)) {
      return refuse('corrective-action-id-missing');
    }
    if (!isNonEmptyString(action.correctiveActionDescription)) {
      return refuse('corrective-action-description-missing');
    }
    if (assignerOf(record.history, action.correctiveActionId) !== undefined) {
      return refuse('corrective-action-id-duplicate');
    }
  }

  if (action.kind === 'SCHEDULE_EFFECTIVENESS_CHECK') {
    if (!isNonEmptyString(action.correctiveActionId)) {
      return refuse('corrective-action-id-missing');
    }
    if (assignerOf(record.history, action.correctiveActionId) === undefined) {
      return refuse('corrective-action-id-unknown');
    }
  }

  if (action.kind === 'RECORD_EFFECTIVENESS_CHECK') {
    if (!isNonEmptyString(action.correctiveActionId)) {
      return refuse('corrective-action-id-missing');
    }
    const assignerActorId = assignerOf(record.history, action.correctiveActionId);
    if (assignerActorId === undefined) {
      return refuse('corrective-action-id-unknown');
    }
    if (!isNonEmptyString(action.effectivenessOutcome)) {
      return refuse('effectiveness-outcome-missing');
    }
    if (!KNOWN_EFFECTIVENESS_OUTCOMES.has(action.effectivenessOutcome)) {
      return refuse('effectiveness-outcome-unknown');
    }
    if (action.actorId === assignerActorId) {
      return refuse('assigner-cannot-verify-effectiveness');
    }
  }

  if (action.kind === 'CLOSE') {
    if (!isNonEmptyString(action.closureSummary)) {
      return refuse('closure-summary-missing');
    }
    if (!hasRecordedRootCause(record.history)) {
      return refuse('close-requires-root-cause');
    }
    if (!hasAnyCorrectiveAction(record.history)) {
      return refuse('close-requires-corrective-action');
    }
    if (!hasPassedEffectivenessCheck(record.history)) {
      return refuse('close-requires-passed-effectiveness-check');
    }
  }

  if (action.kind === 'VOID') {
    if (!isNonEmptyString(action.voidReason)) {
      return refuse('void-reason-missing');
    }
  }

  const entry: NonconformanceHistoryEntry = Object.freeze({
    action: toFrozenAction(action),
    actorRole,
    fromState: record.state,
    toState: nextState,
    occurredAt,
  });

  return {
    ok: true,
    record: Object.freeze({
      recordId: record.recordId,
      tenantId: record.tenantId,
      state: nextState,
      history: Object.freeze([...record.history, entry]),
    }),
  };
}

const REFUSAL_MESSAGES: Record<NonconformanceRefusalCode, string> = {
  'unknown-action': 'The requested action is not one of the bounded nonconformance lifecycle actions this model supports.',
  'unknown-actor-role': 'The actor role is not a recognized bounded value.',
  'unknown-state': 'The record is in a state this model does not recognize.',
  'timestamp-invalid': 'The supplied timestamp could not be parsed.',
  'timestamp-not-utc': 'The supplied timestamp is not an explicit UTC timestamp.',
  'timestamp-backwards': 'The supplied timestamp does not come after the record\'s most recent history entry.',
  'role-not-allowed-for-action': 'The actor role is not permitted to request this action.',
  'invalid-transition': 'This action is not defined from the record\'s current state.',
  'containment-action-missing': 'Containing the nonconformance requires a non-empty containment action.',
  'root-cause-missing': 'Recording a root cause requires a declared root cause.',
  'root-cause-unknown': 'The declared root cause is not on the bounded root cause list.',
  'corrective-action-id-missing': 'This action requires a non-empty corrective action identifier.',
  'corrective-action-description-missing': 'Assigning a corrective action requires a non-empty description.',
  'corrective-action-id-duplicate': 'This corrective action identifier has already been assigned on this record.',
  'corrective-action-id-unknown': 'This corrective action identifier was never assigned on this record.',
  'effectiveness-outcome-missing': 'Recording an effectiveness check requires an outcome.',
  'effectiveness-outcome-unknown': 'The declared effectiveness outcome is not a recognized bounded value.',
  'assigner-cannot-verify-effectiveness':
    'The actor who assigned this corrective action may not record its effectiveness check.',
  'closure-summary-missing': 'Closing requires a non-empty closure summary.',
  'close-requires-root-cause': 'Closing requires a root cause recorded on this record.',
  'close-requires-corrective-action': 'Closing requires at least one corrective action assigned on this record.',
  'close-requires-passed-effectiveness-check': 'Closing requires a passed effectiveness check recorded on this record.',
  'void-reason-missing': 'Voiding requires a non-empty reason.',
};

/** Deterministic, privacy-safe human-readable text for a refusal code, suitable for UI display. */
export function explainNonconformanceRefusal(refusalCode: NonconformanceRefusalCode): string {
  return REFUSAL_MESSAGES[refusalCode];
}
