/**
 * Pure synthetic OHWorks ingest-idempotency contract.
 *
 * This module accepts only opaque, bounded, synthetic identifiers plus an
 * injected UTC clock and a canonical fingerprint. It never sees, stores, or
 * logs patient/employee/specimen/person data, credentials, endpoints, raw
 * instrument payloads, free text, or instrument-network details. Any field
 * outside the fixed synthetic schema below is rejected before any decision
 * logic runs.
 *
 * This is a discovery/demo artifact only. It does not prove vendor
 * acknowledgement, exactly-once delivery, validation, compliance, or
 * customer readiness. See docs/clients/ohworks/INGEST_IDEMPOTENCY_CONTRACT.md.
 */

export type IngestDecisionKind = 'new' | 'idempotent_replay' | 'conflict' | 'stale' | 'quarantined';

/** The only fields this contract will ever accept. All are opaque synthetic tokens. */
export interface IngestAttempt {
  tenantId: string;
  messageSourceId: string;
  correlationId: string;
  parserVersionId: string;
  mappingVersionId: string;
  observedAtUtc: string;
  fingerprint: string;
}

const ALLOWED_KEYS: readonly (keyof IngestAttempt)[] = [
  'tenantId',
  'messageSourceId',
  'correlationId',
  'parserVersionId',
  'mappingVersionId',
  'observedAtUtc',
  'fingerprint',
];

/** Field names that must never appear on an ingest attempt, even with a valid-looking value. */
const SENSITIVE_KEY_DENYLIST = [
  'patientId',
  'patientName',
  'employeeId',
  'employeeName',
  'specimenId',
  'personId',
  'ssn',
  'dob',
  'dateOfBirth',
  'email',
  'phone',
  'address',
  'credential',
  'password',
  'apiKey',
  'token',
  'secret',
  'endpoint',
  'url',
  'hostname',
  'ipAddress',
  'macAddress',
  'payload',
  'rawPayload',
  'rawMessage',
  'note',
  'notes',
  'comment',
  'freeText',
  'text',
] as const;

const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,62}[A-Za-z0-9]$/;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
const STRICT_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export interface IngestPolicy {
  readonly allowedParserVersionIds: readonly string[];
  readonly allowedMappingVersionIds: readonly string[];
  readonly maxFieldLength: number;
  readonly maxFutureSkewMs: number;
}

export const DEFAULT_INGEST_POLICY: IngestPolicy = {
  allowedParserVersionIds: ['ohworks-parser-v1-synthetic'],
  allowedMappingVersionIds: ['ohworks-mapping-v1-synthetic'],
  maxFieldLength: 128,
  maxFutureSkewMs: 5 * 60 * 1000,
};

/** The durable state this contract binds per identity. Holds no content beyond opaque tokens. */
export interface IngestBinding {
  readonly identityKey: string;
  readonly parserVersionId: string;
  readonly mappingVersionId: string;
  readonly fingerprint: string;
  readonly observedAtUtc: string;
}

export type PriorBindings = ReadonlyMap<string, IngestBinding>;

export interface IngestDecision {
  readonly kind: IngestDecisionKind;
  readonly identityKey: string;
  readonly reason: string;
  readonly fingerprint?: string;
  readonly observedAtUtc?: string;
}

function identityKeyOf(attempt: Pick<IngestAttempt, 'tenantId' | 'messageSourceId' | 'correlationId'>): string {
  return `${attempt.tenantId}:${attempt.messageSourceId}:${attempt.correlationId}`;
}

function quarantined(identityKey: string, reason: string): IngestDecision {
  return { kind: 'quarantined', identityKey, reason };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWellFormedBinding(binding: IngestBinding): boolean {
  return (
    OPAQUE_ID_PATTERN.test(binding.parserVersionId) &&
    OPAQUE_ID_PATTERN.test(binding.mappingVersionId) &&
    FINGERPRINT_PATTERN.test(binding.fingerprint) &&
    STRICT_UTC_PATTERN.test(binding.observedAtUtc)
  );
}

/**
 * Evaluate a single synthetic ingest attempt against prior bindings.
 * Pure and deterministic: identical inputs always produce a byte-identical
 * (structurally equal, JSON-stable) decision. Never mutates `priorBindings`.
 */
export function evaluateIngestAttempt(
  raw: unknown,
  nowUtc: string,
  priorBindings: PriorBindings,
  policy: IngestPolicy = DEFAULT_INGEST_POLICY,
): IngestDecision {
  if (!isPlainObject(raw)) {
    return quarantined('unknown', 'malformed_input_not_an_object');
  }

  for (const denied of SENSITIVE_KEY_DENYLIST) {
    if (denied in raw) {
      return quarantined('unknown', 'sensitive_field_rejected');
    }
  }

  const presentKeys = Object.keys(raw);
  for (const key of presentKeys) {
    if (!(ALLOWED_KEYS as readonly string[]).includes(key)) {
      const fallbackKey = isPlainObject(raw) && typeof raw.tenantId === 'string' && typeof raw.messageSourceId === 'string' && typeof raw.correlationId === 'string'
        ? identityKeyOf(raw as unknown as IngestAttempt)
        : 'unknown';
      return quarantined(fallbackKey, 'unexpected_field_rejected');
    }
  }
  for (const key of ALLOWED_KEYS) {
    if (typeof raw[key] !== 'string') {
      return quarantined('unknown', 'malformed_field_type');
    }
  }

  const attempt = raw as unknown as IngestAttempt;
  const identityKey = identityKeyOf(attempt);

  for (const key of ALLOWED_KEYS) {
    if (attempt[key].length === 0 || attempt[key].length > policy.maxFieldLength) {
      return quarantined(identityKey, 'oversize_field');
    }
  }

  if (
    !OPAQUE_ID_PATTERN.test(attempt.tenantId) ||
    !OPAQUE_ID_PATTERN.test(attempt.messageSourceId) ||
    !OPAQUE_ID_PATTERN.test(attempt.correlationId) ||
    !OPAQUE_ID_PATTERN.test(attempt.parserVersionId) ||
    !OPAQUE_ID_PATTERN.test(attempt.mappingVersionId)
  ) {
    return quarantined(identityKey, 'malformed_opaque_id');
  }

  if (!FINGERPRINT_PATTERN.test(attempt.fingerprint)) {
    return quarantined(identityKey, 'malformed_fingerprint');
  }

  if (!STRICT_UTC_PATTERN.test(nowUtc)) {
    return quarantined(identityKey, 'malformed_injected_clock');
  }
  if (!STRICT_UTC_PATTERN.test(attempt.observedAtUtc)) {
    return quarantined(identityKey, 'malformed_observed_at');
  }

  const nowMs = Date.parse(nowUtc);
  const observedMs = Date.parse(attempt.observedAtUtc);
  if (!Number.isFinite(nowMs) || !Number.isFinite(observedMs)) {
    return quarantined(identityKey, 'unparseable_time');
  }
  if (observedMs - nowMs > policy.maxFutureSkewMs) {
    return quarantined(identityKey, 'time_drift_future_skew');
  }

  if (
    !policy.allowedParserVersionIds.includes(attempt.parserVersionId) ||
    !policy.allowedMappingVersionIds.includes(attempt.mappingVersionId)
  ) {
    return quarantined(identityKey, 'unknown_mapping');
  }

  const prior = priorBindings.get(identityKey);
  if (!prior) {
    return {
      kind: 'new',
      identityKey,
      reason: 'no_prior_binding',
      fingerprint: attempt.fingerprint,
      observedAtUtc: attempt.observedAtUtc,
    };
  }

  if (prior.identityKey !== identityKey || !isWellFormedBinding(prior)) {
    return quarantined(identityKey, 'broken_prior_binding');
  }

  if (prior.parserVersionId !== attempt.parserVersionId || prior.mappingVersionId !== attempt.mappingVersionId) {
    return quarantined(identityKey, 'binding_version_drift');
  }

  const priorMs = Date.parse(prior.observedAtUtc);
  if (observedMs < priorMs) {
    return {
      kind: 'stale',
      identityKey,
      reason: 'observed_before_prior_binding',
      fingerprint: attempt.fingerprint,
      observedAtUtc: attempt.observedAtUtc,
    };
  }

  if (prior.fingerprint === attempt.fingerprint) {
    return {
      kind: 'idempotent_replay',
      identityKey,
      reason: 'identity_and_fingerprint_match_prior_binding',
      fingerprint: attempt.fingerprint,
      observedAtUtc: prior.observedAtUtc,
    };
  }

  return {
    kind: 'conflict',
    identityKey,
    reason: 'fingerprint_mismatch_for_bound_identity',
    fingerprint: attempt.fingerprint,
    observedAtUtc: attempt.observedAtUtc,
  };
}

/**
 * Apply a decision to the prior-binding table. Only `new` establishes a
 * binding; every other decision is fail-closed and leaves prior state
 * untouched so a conflicting or malformed attempt can never overwrite a
 * previously accepted binding.
 */
export function applyIngestDecision(
  decision: IngestDecision,
  priorBindings: PriorBindings,
  attempt?: Pick<IngestAttempt, 'parserVersionId' | 'mappingVersionId'>,
): PriorBindings {
  if (decision.kind !== 'new' || !decision.fingerprint || !decision.observedAtUtc || !attempt) {
    return priorBindings;
  }

  const next = new Map(priorBindings);
  next.set(decision.identityKey, {
    identityKey: decision.identityKey,
    parserVersionId: attempt.parserVersionId,
    mappingVersionId: attempt.mappingVersionId,
    fingerprint: decision.fingerprint,
    observedAtUtc: decision.observedAtUtc,
  });
  return next;
}
