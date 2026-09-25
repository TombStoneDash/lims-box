/**
 * Fail-closed synthetic OHWorks equipment qualification tracker.
 *
 * This module is a pure, dependency-free function over a fabricated
 * instrument qualification registry. It performs no I/O, reads no system
 * clock, and touches no real instrument, sample, or customer data. Every
 * timestamp it compares against — the run timestamp, each qualification
 * stage's completion timestamp, and each change event's occurrence
 * timestamp — is supplied by the caller.
 *
 * An instrument passes through three ordered qualification stages before it
 * may be used:
 *
 *   installation  (IQ) - the instrument is correctly installed
 *   operational   (OQ) - the instrument operates as specified
 *   performance   (PQ) - the instrument performs as specified under
 *                        real-world conditions; anchors the
 *                        requalification interval
 *
 * Given a registry lookup for an instrument plus a run timestamp, this
 * module decides whether the instrument is `qualified` or `not_qualified`
 * for use at that instant, and reports exactly which stage is missing,
 * malformed, out of order, invalidated by a change event, or expired.
 *
 * A change event (relocation, major repair, or a software update — the
 * only three declared kinds) invalidates the qualification stages it is
 * known to affect whenever it occurs after that stage was completed and at
 * or before the run timestamp. An unrecognized change event kind is fail
 * closed to `not_qualified` rather than assumed harmless.
 *
 * Every failure mode defaults to `not_qualified` rather than guessing in
 * the instrument's favor.
 */

export type QualificationStageName = 'installation' | 'operational' | 'performance';

export type ApproverRole =
  | 'quality-manager'
  | 'lab-director'
  | 'metrology-engineer'
  | 'department-supervisor';

export type QualificationStageInput = {
  /** UTC timestamp the stage was completed, e.g. "2026-01-01T12:00:00.000Z". Caller supplied. */
  completedAt: string;
  approverRole: ApproverRole;
};

/** The only change event kinds this module recognizes. Anything else fails closed. */
export type DeclaredChangeEventKind = 'relocation' | 'major-repair' | 'software-update';

export type ChangeEventInput = {
  kind: DeclaredChangeEventKind;
  /** UTC timestamp the change occurred, e.g. "2026-01-01T12:00:00.000Z". Caller supplied. */
  occurredAt: string;
};

export type InstrumentQualificationInput = {
  instrumentId: string;
  installation?: QualificationStageInput;
  operational?: QualificationStageInput;
  performance?: QualificationStageInput;
  /** Whole days the performance qualification remains valid for. Must be a positive integer. */
  requalificationIntervalDays: number;
  changeEvents?: ReadonlyArray<ChangeEventInput>;
};

/** Synthetic instrument qualification registry keyed by instrument identifier. */
export type InstrumentQualificationRegistry = Readonly<Record<string, InstrumentQualificationInput>>;

export type QualificationDecision = 'qualified' | 'not_qualified';

/** Bounded, privacy-safe codes explaining a qualification decision. */
export type QualificationReasonCode =
  | 'unknown-instrument'
  | 'run-timestamp-invalid'
  | 'requalification-interval-invalid'
  | 'installation-stage-missing'
  | 'installation-timestamp-invalid'
  | 'installation-approver-invalid'
  | 'operational-stage-missing'
  | 'operational-timestamp-invalid'
  | 'operational-approver-invalid'
  | 'operational-before-installation'
  | 'performance-stage-missing'
  | 'performance-timestamp-invalid'
  | 'performance-approver-invalid'
  | 'performance-before-operational'
  | 'change-event-timestamp-invalid'
  | 'unknown-change-event-kind'
  | 'run-before-installation'
  | 'run-before-operational'
  | 'run-before-performance'
  | 'installation-invalidated-by-change-event'
  | 'operational-invalidated-by-change-event'
  | 'performance-invalidated-by-change-event'
  | 'requalification-interval-expired'
  | 'fully-qualified';

export type QualificationGateResult = {
  instrumentId: string;
  runAt: string;
  decision: QualificationDecision;
  reasonCode: QualificationReasonCode;
  /** Deterministic, privacy-safe human-readable explanation of reasonCode. */
  reason: string;
};

export type QualificationInputErrorCode =
  | 'registry-malformed'
  | 'instrument-id-malformed'
  | 'run-timestamp-malformed'
  | 'instrument-record-malformed';

const INPUT_ERROR_MESSAGES: Record<QualificationInputErrorCode, string> = {
  'registry-malformed': 'The equipment qualification registry is not a valid lookup object.',
  'instrument-id-malformed': 'The requested instrument identifier is not a non-empty string.',
  'run-timestamp-malformed': 'The supplied run timestamp is not a non-empty string.',
  'instrument-record-malformed': 'The registry entry for this instrument is missing a required field or has the wrong shape.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a reason code. */
export class QualificationInputError extends Error {
  readonly code: QualificationInputErrorCode;

  constructor(code: QualificationInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'QualificationInputError';
    this.code = code;
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const KNOWN_APPROVER_ROLES: ReadonlySet<string> = new Set<ApproverRole>([
  'quality-manager',
  'lab-director',
  'metrology-engineer',
  'department-supervisor',
]);

const DECLARED_CHANGE_EVENT_KINDS: ReadonlySet<string> = new Set<DeclaredChangeEventKind>([
  'relocation',
  'major-repair',
  'software-update',
]);

/** Which qualification stages a given change event kind is known to invalidate. */
const CHANGE_EVENT_INVALIDATES: Record<DeclaredChangeEventKind, ReadonlyArray<QualificationStageName>> = {
  relocation: ['installation', 'operational', 'performance'],
  'major-repair': ['operational', 'performance'],
  'software-update': ['performance'],
};

const REASON_DECISIONS: Record<QualificationReasonCode, QualificationDecision> = {
  'unknown-instrument': 'not_qualified',
  'run-timestamp-invalid': 'not_qualified',
  'requalification-interval-invalid': 'not_qualified',
  'installation-stage-missing': 'not_qualified',
  'installation-timestamp-invalid': 'not_qualified',
  'installation-approver-invalid': 'not_qualified',
  'operational-stage-missing': 'not_qualified',
  'operational-timestamp-invalid': 'not_qualified',
  'operational-approver-invalid': 'not_qualified',
  'operational-before-installation': 'not_qualified',
  'performance-stage-missing': 'not_qualified',
  'performance-timestamp-invalid': 'not_qualified',
  'performance-approver-invalid': 'not_qualified',
  'performance-before-operational': 'not_qualified',
  'change-event-timestamp-invalid': 'not_qualified',
  'unknown-change-event-kind': 'not_qualified',
  'run-before-installation': 'not_qualified',
  'run-before-operational': 'not_qualified',
  'run-before-performance': 'not_qualified',
  'installation-invalidated-by-change-event': 'not_qualified',
  'operational-invalidated-by-change-event': 'not_qualified',
  'performance-invalidated-by-change-event': 'not_qualified',
  'requalification-interval-expired': 'not_qualified',
  'fully-qualified': 'qualified',
};

const REASON_MESSAGES: Record<QualificationReasonCode, string> = {
  'unknown-instrument': 'No qualification record exists for this instrument identifier.',
  'run-timestamp-invalid': 'The run timestamp could not be parsed as an explicit UTC timestamp.',
  'requalification-interval-invalid': 'The requalification interval is not a positive whole number of days.',
  'installation-stage-missing': 'No installation qualification (IQ) has been recorded for this instrument.',
  'installation-timestamp-invalid': 'The installation qualification completion timestamp could not be parsed as an explicit UTC timestamp.',
  'installation-approver-invalid': 'The installation qualification approver role is not a recognized bounded value.',
  'operational-stage-missing': 'No operational qualification (OQ) has been recorded for this instrument.',
  'operational-timestamp-invalid': 'The operational qualification completion timestamp could not be parsed as an explicit UTC timestamp.',
  'operational-approver-invalid': 'The operational qualification approver role is not a recognized bounded value.',
  'operational-before-installation': 'Operational qualification was completed before installation qualification.',
  'performance-stage-missing': 'No performance qualification (PQ) has been recorded for this instrument.',
  'performance-timestamp-invalid': 'The performance qualification completion timestamp could not be parsed as an explicit UTC timestamp.',
  'performance-approver-invalid': 'The performance qualification approver role is not a recognized bounded value.',
  'performance-before-operational': 'Performance qualification was completed before operational qualification.',
  'change-event-timestamp-invalid': 'A recorded change event timestamp could not be parsed as an explicit UTC timestamp.',
  'unknown-change-event-kind': 'A recorded change event is not a recognized declared kind.',
  'run-before-installation': 'The run timestamp comes before installation qualification was completed.',
  'run-before-operational': 'The run timestamp comes before operational qualification was completed.',
  'run-before-performance': 'The run timestamp comes before performance qualification was completed.',
  'installation-invalidated-by-change-event': 'A change event occurred after installation qualification was completed and invalidates it.',
  'operational-invalidated-by-change-event': 'A change event occurred after operational qualification was completed and invalidates it.',
  'performance-invalidated-by-change-event': 'A change event occurred after performance qualification was completed and invalidates it.',
  'requalification-interval-expired': 'The requalification interval has expired as of the run timestamp.',
  'fully-qualified': 'All qualification stages are complete, correctly ordered, unaffected by any change event, and within the requalification interval.',
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isUtcTimestamp(value: string): boolean {
  return value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

function isStructurallyValidStage(raw: unknown): raw is QualificationStageInput {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return isNonEmptyString(candidate.completedAt) && isNonEmptyString(candidate.approverRole);
}

function isStructurallyValidChangeEvent(raw: unknown): raw is ChangeEventInput {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return isNonEmptyString(candidate.kind) && isNonEmptyString(candidate.occurredAt);
}

function isStructurallyValidRecord(raw: unknown): raw is InstrumentQualificationInput {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  if (!isNonEmptyString(candidate.instrumentId)) {
    return false;
  }
  if (typeof candidate.requalificationIntervalDays !== 'number' || !Number.isFinite(candidate.requalificationIntervalDays)) {
    return false;
  }
  for (const stageKey of ['installation', 'operational', 'performance'] as const) {
    const stageRaw = candidate[stageKey];
    if (stageRaw !== undefined && !isStructurallyValidStage(stageRaw)) {
      return false;
    }
  }
  if (candidate.changeEvents !== undefined) {
    if (!Array.isArray(candidate.changeEvents)) {
      return false;
    }
    for (const eventRaw of candidate.changeEvents) {
      if (!isStructurallyValidChangeEvent(eventRaw)) {
        return false;
      }
    }
  }
  return true;
}

function toResult(
  instrumentId: string,
  runAt: string,
  reasonCode: QualificationReasonCode,
): QualificationGateResult {
  return Object.freeze({
    instrumentId,
    runAt,
    decision: REASON_DECISIONS[reasonCode],
    reasonCode,
    reason: REASON_MESSAGES[reasonCode],
  });
}

/**
 * Evaluate whether an instrument is qualified for use at a given run
 * timestamp.
 *
 * Fail-closed: an instrument missing from the registry, a missing or
 * malformed qualification stage, an unrecognized approver role, stages
 * completed out of order, a run timestamp preceding any completed stage, a
 * malformed or unrecognized change event, a change event that invalidates
 * a previously completed stage, a non-positive requalification interval,
 * or an expired requalification interval all resolve to `not_qualified`.
 * Only a fully complete, correctly ordered, unaffected, and current chain
 * of stages resolves to `qualified`.
 *
 * Structurally unusable input (a malformed registry, instrument id, run
 * timestamp, or registry entry) throws QualificationInputError instead of
 * guessing at a reason code.
 */
export function evaluateEquipmentQualificationGate(
  registry: InstrumentQualificationRegistry,
  instrumentId: string,
  runAt: string,
): QualificationGateResult {
  if (typeof registry !== 'object' || registry === null || Array.isArray(registry)) {
    throw new QualificationInputError('registry-malformed');
  }
  if (!isNonEmptyString(instrumentId)) {
    throw new QualificationInputError('instrument-id-malformed');
  }
  if (!isNonEmptyString(runAt)) {
    throw new QualificationInputError('run-timestamp-malformed');
  }

  const raw = (registry as Record<string, unknown>)[instrumentId];
  if (raw === undefined) {
    return toResult(instrumentId, runAt, 'unknown-instrument');
  }
  if (!isStructurallyValidRecord(raw)) {
    throw new QualificationInputError('instrument-record-malformed');
  }

  if (!isUtcTimestamp(runAt)) {
    return toResult(instrumentId, runAt, 'run-timestamp-invalid');
  }
  if (!Number.isInteger(raw.requalificationIntervalDays) || raw.requalificationIntervalDays <= 0) {
    return toResult(instrumentId, runAt, 'requalification-interval-invalid');
  }

  if (raw.installation === undefined) {
    return toResult(instrumentId, runAt, 'installation-stage-missing');
  }
  if (!isUtcTimestamp(raw.installation.completedAt)) {
    return toResult(instrumentId, runAt, 'installation-timestamp-invalid');
  }
  if (!KNOWN_APPROVER_ROLES.has(raw.installation.approverRole)) {
    return toResult(instrumentId, runAt, 'installation-approver-invalid');
  }

  if (raw.operational === undefined) {
    return toResult(instrumentId, runAt, 'operational-stage-missing');
  }
  if (!isUtcTimestamp(raw.operational.completedAt)) {
    return toResult(instrumentId, runAt, 'operational-timestamp-invalid');
  }
  if (!KNOWN_APPROVER_ROLES.has(raw.operational.approverRole)) {
    return toResult(instrumentId, runAt, 'operational-approver-invalid');
  }
  const installationAtMs = Date.parse(raw.installation.completedAt);
  const operationalAtMs = Date.parse(raw.operational.completedAt);
  if (operationalAtMs < installationAtMs) {
    return toResult(instrumentId, runAt, 'operational-before-installation');
  }

  if (raw.performance === undefined) {
    return toResult(instrumentId, runAt, 'performance-stage-missing');
  }
  if (!isUtcTimestamp(raw.performance.completedAt)) {
    return toResult(instrumentId, runAt, 'performance-timestamp-invalid');
  }
  if (!KNOWN_APPROVER_ROLES.has(raw.performance.approverRole)) {
    return toResult(instrumentId, runAt, 'performance-approver-invalid');
  }
  const performanceAtMs = Date.parse(raw.performance.completedAt);
  if (performanceAtMs < operationalAtMs) {
    return toResult(instrumentId, runAt, 'performance-before-operational');
  }

  const changeEvents = raw.changeEvents ?? [];
  for (const event of changeEvents) {
    if (!isUtcTimestamp(event.occurredAt)) {
      return toResult(instrumentId, runAt, 'change-event-timestamp-invalid');
    }
  }
  for (const event of changeEvents) {
    if (!DECLARED_CHANGE_EVENT_KINDS.has(event.kind)) {
      return toResult(instrumentId, runAt, 'unknown-change-event-kind');
    }
  }

  const runAtMs = Date.parse(runAt);
  if (runAtMs < installationAtMs) {
    return toResult(instrumentId, runAt, 'run-before-installation');
  }
  if (runAtMs < operationalAtMs) {
    return toResult(instrumentId, runAt, 'run-before-operational');
  }
  if (runAtMs < performanceAtMs) {
    return toResult(instrumentId, runAt, 'run-before-performance');
  }

  const STAGE_COMPLETED_AT_MS: Record<QualificationStageName, number> = {
    installation: installationAtMs,
    operational: operationalAtMs,
    performance: performanceAtMs,
  };

  for (const stage of ['installation', 'operational', 'performance'] as const) {
    const stageCompletedAtMs = STAGE_COMPLETED_AT_MS[stage];
    const invalidatedByChangeEvent = changeEvents.some((event) => {
      const eventAtMs = Date.parse(event.occurredAt);
      return (
        CHANGE_EVENT_INVALIDATES[event.kind].includes(stage) &&
        eventAtMs > stageCompletedAtMs &&
        eventAtMs <= runAtMs
      );
    });
    if (invalidatedByChangeEvent) {
      return toResult(instrumentId, runAt, `${stage}-invalidated-by-change-event` as QualificationReasonCode);
    }
  }

  const expiresAtMs = performanceAtMs + raw.requalificationIntervalDays * MS_PER_DAY;
  if (runAtMs >= expiresAtMs) {
    return toResult(instrumentId, runAt, 'requalification-interval-expired');
  }

  return toResult(instrumentId, runAt, 'fully-qualified');
}

/** Deterministic, privacy-safe human-readable text for a reason code, suitable for UI display. */
export function explainQualificationGateReason(reasonCode: QualificationReasonCode): string {
  return REASON_MESSAGES[reasonCode];
}
