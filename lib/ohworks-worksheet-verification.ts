/**
 * Fail-closed synthetic OHWorks worksheet verification state machine.
 *
 * This module is a pure, dependency-free reducer over fabricated worksheet
 * lifecycle events. It performs no I/O, touches no real sample, patient, or
 * customer data, and only ever moves a worksheet record between five bounded
 * states:
 *
 *   draft      -> prepared     (prepare)
 *   prepared   -> prepared     (edit, while still unlocked)
 *   prepared   -> verified     (verify, by an independent verifier)
 *   verified   -> signed_off   (sign_off, only for declared high-risk types)
 *   verified   -> locked       (lock, standard-risk types)
 *   signed_off -> locked       (lock, high-risk types, after sign-off)
 *   locked     -> prepared     (unlock, only with a declared reason by an
 *                                authorized role)
 *
 * Every event carries a caller-supplied timestamp and an actor role, and
 * only specific roles may record specific event kinds. Verification is
 * rejected outright if the verifier is the same actor who prepared the
 * worksheet ("self-verification"). A worksheet whose declared type is on the
 * bounded high-risk list cannot reach `locked` without a recorded
 * third-party sign-off; attempting to lock straight from `verified` on a
 * high-risk worksheet is blocked. Once `locked`, any edit is rejected unless
 * the worksheet is first unlocked with a non-empty reason by an authorized
 * role.
 */

export type WorksheetState = 'draft' | 'prepared' | 'verified' | 'signed_off' | 'locked';

/** Bounded, known worksheet types. Anything else is rejected. */
export type WorksheetType =
  | 'routine_chemistry'
  | 'routine_hematology'
  | 'microbiology_culture'
  | 'blood_bank_crossmatch'
  | 'molecular_pathology'
  | 'critical_result_panel';

/** Known, bounded classes of actor that may record a worksheet event. */
export type WorksheetActorRole = 'preparer' | 'verifier' | 'third_party_reviewer' | 'lab_director';

/** Known, bounded event kinds. Anything else is rejected. */
export type WorksheetEventKind = 'prepare' | 'edit' | 'verify' | 'sign_off' | 'lock' | 'unlock';

export type WorksheetEventInput = {
  /** Caller-supplied unique identifier for this event. */
  eventId: string;
  /** Synthetic worksheet identifier this event applies to. */
  worksheetId: string;
  /** Synthetic tenant/lab identifier this event claims to belong to. */
  tenantId: string;
  kind: WorksheetEventKind;
  actorRole: WorksheetActorRole;
  /** Opaque synthetic actor identifier. Never a real name or email. */
  actorId: string;
  /** UTC timestamp supplied by the caller, e.g. "2026-01-01T12:00:00.000Z". Must end in "Z". Immutable once accepted. */
  occurredAt: string;
  /** Required for `prepare`: a non-empty description of the preparation performed. */
  preparationNotes?: string;
  /** Required for `edit`: a non-empty description of what was edited. */
  editDescription?: string;
  /** Required for `verify`: a non-empty description of the independent verification performed. */
  verificationNotes?: string;
  /** Required for `sign_off`: a non-empty description of the third-party sign-off performed. */
  signOffNotes?: string;
  /** Required for `unlock`: a non-empty, declared reason to unlock a locked worksheet. */
  unlockReason?: string;
  /** Free-text note. Optional for every kind. Scanned and rejected if it looks like PII. */
  note?: string;
};

/** An event that has been accepted into the workflow. Frozen; never mutated after creation. */
export type WorksheetEvent = Readonly<WorksheetEventInput>;

export type WorksheetContext = {
  tenantId: string;
  worksheetId: string;
  /** Declared once, at creation, and immutable for the life of the worksheet. Drives the high-risk sign-off gate. */
  worksheetType: string;
};

/** Bounded, privacy-safe codes explaining why an event was blocked instead of applied. */
export type WorksheetBlockCode =
  | 'unsupported-event-kind'
  | 'unknown-actor-role'
  | 'role-not-allowed-for-kind'
  | 'tenant-mismatch'
  | 'worksheet-id-mismatch'
  | 'timestamp-invalid'
  | 'timestamp-not-utc'
  | 'timestamp-backwards'
  | 'duplicate-event-id-conflict'
  | 'duplicate-event-id-replay'
  | 'skipped-transition'
  | 'preparation-notes-missing'
  | 'edit-description-missing'
  | 'edit-rejected-worksheet-locked'
  | 'verification-notes-missing'
  | 'self-verification-rejected'
  | 'sign-off-notes-missing'
  | 'sign-off-not-applicable-for-standard-risk'
  | 'sign-off-required-for-high-risk'
  | 'unlock-reason-missing'
  | 'note-suspected-pii';

export type WorksheetTransitionResult =
  | { allowed: true; nextState: WorksheetState; event: WorksheetEvent }
  | { allowed: false; nextState: WorksheetState; blockCode: WorksheetBlockCode };

export type WorksheetStepOutcome =
  | { index: number; allowed: true; priorState: WorksheetState; state: WorksheetState; event: WorksheetEvent }
  | { index: number; allowed: false; state: WorksheetState; blockCode: WorksheetBlockCode };

export type WorksheetRunResult = {
  worksheetId: string;
  tenantId: string;
  finalState: WorksheetState;
  /** Only successfully applied events, in application order. Frozen. */
  history: readonly WorksheetEvent[];
  /** One entry per raw event that was actually evaluated; stops at the first block. Frozen. */
  steps: readonly WorksheetStepOutcome[];
  blocked: boolean;
};

export type WorksheetInputErrorCode = 'events-not-array' | 'context-malformed' | 'event-malformed';

const INPUT_ERROR_MESSAGES: Record<WorksheetInputErrorCode, string> = {
  'events-not-array': 'The worksheet verification event input batch is not a list of events.',
  'context-malformed': 'The worksheet verification workflow context has an invalid tenant, worksheet, or worksheet type identifier.',
  'event-malformed': 'A worksheet verification event is missing a required field or has the wrong shape.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a block code. */
export class WorksheetVerificationInputError extends Error {
  readonly code: WorksheetInputErrorCode;

  constructor(code: WorksheetInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'WorksheetVerificationInputError';
    this.code = code;
  }
}

const KNOWN_ACTOR_ROLES: ReadonlySet<string> = new Set<WorksheetActorRole>([
  'preparer',
  'verifier',
  'third_party_reviewer',
  'lab_director',
]);

const KNOWN_EVENT_KINDS: ReadonlySet<string> = new Set<WorksheetEventKind>([
  'prepare',
  'edit',
  'verify',
  'sign_off',
  'lock',
  'unlock',
]);

const KNOWN_WORKSHEET_TYPES: ReadonlySet<string> = new Set<WorksheetType>([
  'routine_chemistry',
  'routine_hematology',
  'microbiology_culture',
  'blood_bank_crossmatch',
  'molecular_pathology',
  'critical_result_panel',
]);

/** Worksheet types that must be independently reviewed by a third party before they may be locked. */
const HIGH_RISK_WORKSHEET_TYPES: ReadonlySet<string> = new Set<WorksheetType>([
  'blood_bank_crossmatch',
  'molecular_pathology',
  'critical_result_panel',
]);

/** Whether a declared worksheet type requires a third-party sign-off before it can be locked. */
export function isHighRiskWorksheetType(worksheetType: string): boolean {
  return HIGH_RISK_WORKSHEET_TYPES.has(worksheetType);
}

const ROLES_BY_KIND: Record<WorksheetEventKind, ReadonlySet<WorksheetActorRole>> = {
  prepare: new Set(['preparer']),
  edit: new Set(['preparer']),
  verify: new Set(['verifier']),
  sign_off: new Set(['third_party_reviewer']),
  lock: new Set(['verifier', 'lab_director']),
  unlock: new Set(['lab_director']),
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

function isStructurallyValidEvent(raw: unknown): raw is WorksheetEventInput {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.eventId) &&
    isNonEmptyString(candidate.worksheetId) &&
    isNonEmptyString(candidate.tenantId) &&
    isNonEmptyString(candidate.kind) &&
    isNonEmptyString(candidate.actorRole) &&
    isNonEmptyString(candidate.actorId) &&
    isNonEmptyString(candidate.occurredAt) &&
    isOptionalString(candidate.preparationNotes) &&
    isOptionalString(candidate.editDescription) &&
    isOptionalString(candidate.verificationNotes) &&
    isOptionalString(candidate.signOffNotes) &&
    isOptionalString(candidate.unlockReason) &&
    isOptionalString(candidate.note)
  );
}

function isValidContext(context: unknown): context is WorksheetContext {
  if (typeof context !== 'object' || context === null) {
    return false;
  }
  const candidate = context as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.tenantId) &&
    isNonEmptyString(candidate.worksheetId) &&
    isNonEmptyString(candidate.worksheetType) &&
    KNOWN_WORKSHEET_TYPES.has(candidate.worksheetType)
  );
}

function toFrozenEvent(input: WorksheetEventInput): WorksheetEvent {
  return Object.freeze({ ...input });
}

function sameEventContent(a: WorksheetEventInput, b: WorksheetEventInput): boolean {
  return (
    a.eventId === b.eventId &&
    a.worksheetId === b.worksheetId &&
    a.tenantId === b.tenantId &&
    a.kind === b.kind &&
    a.actorRole === b.actorRole &&
    a.actorId === b.actorId &&
    a.occurredAt === b.occurredAt &&
    (a.preparationNotes ?? '') === (b.preparationNotes ?? '') &&
    (a.editDescription ?? '') === (b.editDescription ?? '') &&
    (a.verificationNotes ?? '') === (b.verificationNotes ?? '') &&
    (a.signOffNotes ?? '') === (b.signOffNotes ?? '') &&
    (a.unlockReason ?? '') === (b.unlockReason ?? '') &&
    (a.note ?? '') === (b.note ?? '')
  );
}

function isUtcTimestamp(value: string): boolean {
  return value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

/** The actor id that recorded this worksheet's (unique, non-recurring) `prepare` event, if any. */
function recordedPreparerId(history: readonly WorksheetEvent[]): string | undefined {
  return history.find((entry) => entry.kind === 'prepare')?.actorId;
}

/**
 * The state a given event kind would move to from `currentState`, or
 * `undefined` if that transition is not defined. `lock` branches on the
 * worksheet's declared risk level: high-risk worksheets must pass through
 * `signed_off`, standard-risk worksheets lock directly from `verified`.
 */
function computeNextState(
  kind: WorksheetEventKind,
  currentState: WorksheetState,
  isHighRisk: boolean,
): WorksheetState | undefined {
  switch (kind) {
    case 'prepare':
      return currentState === 'draft' ? 'prepared' : undefined;
    case 'edit':
      return currentState === 'prepared' ? 'prepared' : undefined;
    case 'verify':
      return currentState === 'prepared' ? 'verified' : undefined;
    case 'sign_off':
      return currentState === 'verified' ? 'signed_off' : undefined;
    case 'lock':
      return currentState === (isHighRisk ? 'signed_off' : 'verified') ? 'locked' : undefined;
    case 'unlock':
      return currentState === 'locked' ? 'prepared' : undefined;
    default:
      return undefined;
  }
}

/**
 * Evaluate a single candidate event against the current state and prior
 * history, and either accept it or return a bounded reason it was blocked.
 *
 * Fail-closed: a skipped or invalid transition, a duplicate event
 * identifier (whether an exact replay or a conflicting rewrite), backwards
 * or non-UTC timestamps, a role not permitted for the event kind, a missing
 * kind-specific required field, suspected PII in the note, a verifier who is
 * the same actor as the preparer ("self-verification"), an attempt to lock
 * a high-risk worksheet without a recorded sign-off, an attempt to sign off
 * a standard-risk worksheet, and an edit attempted while the worksheet is
 * locked are all blocked rather than applied. Structurally unusable input
 * throws WorksheetVerificationInputError instead of guessing at a block
 * code.
 */
export function applyWorksheetVerificationEvent(
  currentState: WorksheetState,
  rawEvent: unknown,
  history: readonly WorksheetEvent[],
  context: WorksheetContext,
): WorksheetTransitionResult {
  if (!isStructurallyValidEvent(rawEvent)) {
    throw new WorksheetVerificationInputError('event-malformed');
  }
  if (!isValidContext(context)) {
    throw new WorksheetVerificationInputError('context-malformed');
  }

  const block = (blockCode: WorksheetBlockCode): WorksheetTransitionResult => ({
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
  if (rawEvent.worksheetId !== context.worksheetId) {
    return block('worksheet-id-mismatch');
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

  const isHighRisk = isHighRiskWorksheetType(context.worksheetType);

  if (rawEvent.kind === 'edit' && currentState === 'locked') {
    return block('edit-rejected-worksheet-locked');
  }

  if (rawEvent.kind === 'lock' && isHighRisk && currentState === 'verified') {
    return block('sign-off-required-for-high-risk');
  }

  if (rawEvent.kind === 'sign_off' && !isHighRisk) {
    return block('sign-off-not-applicable-for-standard-risk');
  }

  const nextState = computeNextState(rawEvent.kind, currentState, isHighRisk);
  if (!nextState) {
    return block('skipped-transition');
  }

  if (rawEvent.kind === 'prepare') {
    if (!isNonEmptyString(rawEvent.preparationNotes)) {
      return block('preparation-notes-missing');
    }
  }

  if (rawEvent.kind === 'edit') {
    if (!isNonEmptyString(rawEvent.editDescription)) {
      return block('edit-description-missing');
    }
  }

  if (rawEvent.kind === 'verify') {
    if (!isNonEmptyString(rawEvent.verificationNotes)) {
      return block('verification-notes-missing');
    }
    const preparerId = recordedPreparerId(history);
    if (preparerId !== undefined && preparerId === rawEvent.actorId) {
      return block('self-verification-rejected');
    }
  }

  if (rawEvent.kind === 'sign_off') {
    if (!isNonEmptyString(rawEvent.signOffNotes)) {
      return block('sign-off-notes-missing');
    }
  }

  if (rawEvent.kind === 'unlock') {
    if (!isNonEmptyString(rawEvent.unlockReason)) {
      return block('unlock-reason-missing');
    }
  }

  if (rawEvent.note !== undefined && looksLikePII(rawEvent.note)) {
    return block('note-suspected-pii');
  }

  return { allowed: true, nextState, event: toFrozenEvent(rawEvent) };
}

/**
 * Fold a full sequence of candidate events through the worksheet
 * verification state machine, starting from `draft`. Processing stops at
 * the first blocked event: fail-closed means a bad event halts the workflow
 * rather than letting later events run against a state that never
 * legitimately advanced past it.
 */
export function runWorksheetVerificationWorkflow(context: WorksheetContext, rawEvents: unknown): WorksheetRunResult {
  if (!isValidContext(context)) {
    throw new WorksheetVerificationInputError('context-malformed');
  }
  if (!Array.isArray(rawEvents)) {
    throw new WorksheetVerificationInputError('events-not-array');
  }

  let state: WorksheetState = 'draft';
  const history: WorksheetEvent[] = [];
  const steps: WorksheetStepOutcome[] = [];

  for (let index = 0; index < rawEvents.length; index += 1) {
    const result = applyWorksheetVerificationEvent(state, rawEvents[index], history, context);
    if (result.allowed === true) {
      const priorState = state;
      history.push(result.event);
      state = result.nextState;
      steps.push({ index, allowed: true, priorState, state, event: result.event });
      continue;
    }
    steps.push({ index, allowed: false, state, blockCode: result.blockCode });
    return {
      worksheetId: context.worksheetId,
      tenantId: context.tenantId,
      finalState: state,
      history: Object.freeze([...history]),
      steps: Object.freeze(steps),
      blocked: true,
    };
  }

  return {
    worksheetId: context.worksheetId,
    tenantId: context.tenantId,
    finalState: state,
    history: Object.freeze([...history]),
    steps: Object.freeze(steps),
    blocked: false,
  };
}

const BLOCK_MESSAGES: Record<WorksheetBlockCode, string> = {
  'unsupported-event-kind': 'The event kind is not one of the bounded worksheet verification transitions this model supports.',
  'unknown-actor-role': 'The actor role is not a recognized bounded value.',
  'role-not-allowed-for-kind': 'The actor role is not permitted to record this event kind.',
  'tenant-mismatch': 'The event does not belong to the tenant this workflow is running for.',
  'worksheet-id-mismatch': 'The event does not belong to the worksheet this workflow is running for.',
  'timestamp-invalid': 'The event timestamp could not be parsed.',
  'timestamp-not-utc': 'The event timestamp is not an explicit UTC timestamp.',
  'timestamp-backwards': 'The event timestamp does not come after the prior event in this workflow.',
  'duplicate-event-id-conflict': 'This event identifier was already used by a different, conflicting event.',
  'duplicate-event-id-replay': 'This event identifier was already applied and cannot be replayed.',
  'skipped-transition': 'This event would skip a required worksheet verification transition.',
  'preparation-notes-missing': 'Preparing a worksheet requires non-empty preparation notes.',
  'edit-description-missing': 'Editing a worksheet requires a non-empty edit description.',
  'edit-rejected-worksheet-locked': 'The worksheet is locked and cannot be edited until it is unlocked with a declared reason.',
  'verification-notes-missing': 'Verifying a worksheet requires non-empty verification notes.',
  'self-verification-rejected': 'The verifier must be a different actor than the preparer.',
  'sign-off-notes-missing': 'Signing off a worksheet requires non-empty sign-off notes.',
  'sign-off-not-applicable-for-standard-risk': 'Sign-off only applies to declared high-risk worksheet types.',
  'sign-off-required-for-high-risk': 'This high-risk worksheet type requires a recorded third-party sign-off before it can be locked.',
  'unlock-reason-missing': 'Unlocking a worksheet requires a non-empty declared reason.',
  'note-suspected-pii': 'The note field appears to contain personal information.',
};

/** Deterministic, privacy-safe human-readable text for a block code, suitable for UI display. */
export function explainWorksheetVerificationBlock(blockCode: WorksheetBlockCode): string {
  return BLOCK_MESSAGES[blockCode];
}
