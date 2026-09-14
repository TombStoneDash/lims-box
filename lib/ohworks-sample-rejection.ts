/**
 * Fail-closed synthetic OHWorks sample acceptance policy for environmental-lab intake.
 *
 * This module is a pure, dependency-free evaluator: given a caller-supplied,
 * fully bounded acceptance policy (approved matrix/container pairings, a
 * volume rule and a temperature range per matrix, an accepted seal state
 * list, a duplicate-replay disposition, a set of always-hold conditions, a
 * tenant identifier, and a timestamp freshness bound) it evaluates a batch of
 * fabricated sample submissions and returns one conservative disposition per
 * submission. It performs no I/O, touches no real sample, customer, or
 * SENAITE data, and never invents a regulatory threshold, a unit conversion,
 * or an accreditation conclusion of its own — every bound comes from the
 * policy the caller provides. It only ever produces one of three
 * dispositions:
 *
 *   - REJECT: the submission cannot be accepted under the supplied policy.
 *   - HOLD: the submission is otherwise acceptable but a configured
 *     condition (or an ambiguous replay) requires manual hold review.
 *   - ACCEPT: the submission satisfies every configured rule with no
 *     outstanding reasons.
 *
 * A structurally invalid or contradictory policy, or a structurally
 * unusable submission batch, throws a typed error instead of guessing at a
 * disposition.
 */

export type SampleDispositionStatus = 'ACCEPT' | 'HOLD' | 'REJECT';

export type SampleMatrixContainerPair = {
  matrix: string;
  container: string;
};

export type SampleVolumeRule = {
  matrix: string;
  unit: string;
  minVolume: number;
  maxVolume: number;
};

export type SampleTemperatureRange = {
  matrix: string;
  unit: string;
  minTemperature: number;
  maxTemperature: number;
};

export type SampleSealRule = {
  acceptedSealStates: string[];
};

/** Disposition applied when an exact replay (identical content) of a prior sample identifier is submitted in the same batch. */
export type SampleDuplicateRule = {
  replayDisposition: 'HOLD' | 'REJECT';
};

/**
 * A condition that always routes an otherwise-acceptable sample to HOLD.
 * Every field that is present must match exactly; a field left undefined is
 * a wildcard for that field. At least one field must be present.
 */
export type SampleHoldCondition = {
  matrix?: string;
  container?: string;
  sealState?: string;
};

export type SampleHoldRule = {
  conditions: SampleHoldCondition[];
};

export type SampleTimestampBound = {
  /** ISO 8601 timestamp representing "now" for freshness evaluation. */
  referenceTime: string;
  /** Maximum age, in milliseconds, that a sample's collection time may lag the reference time. */
  maxAgeMs: number;
};

export type SampleAcceptancePolicy = {
  /** Synthetic tenant/lab identifier this policy is being evaluated for. */
  tenantId: string;
  /** Every approved matrix/container pairing. A pairing not on this list is never accepted. */
  approvedPairs: SampleMatrixContainerPair[];
  /** Exactly one volume/unit rule per matrix that appears in approvedPairs. */
  volumeRules: SampleVolumeRule[];
  /** Exactly one temperature range per matrix that appears in approvedPairs. */
  temperatureRanges: SampleTemperatureRange[];
  sealRule: SampleSealRule;
  duplicateRule: SampleDuplicateRule;
  holdRule: SampleHoldRule;
  timestampBound: SampleTimestampBound;
};

export type SampleSubmission = {
  /** Synthetic sample identifier. Never a real sample or customer identifier. */
  sampleId: string;
  /** Synthetic tenant/lab identifier the submission claims to belong to. */
  tenantId: string;
  /** Fabricated matrix code. */
  matrix: string;
  /** Fabricated container code. */
  container: string;
  /** Raw fabricated volume, exactly as received; may be nonnumeric. */
  volume: unknown;
  volumeUnit?: string;
  /** Raw fabricated temperature, exactly as received; may be nonnumeric. */
  temperature: unknown;
  temperatureUnit?: string;
  /** Raw seal state string; may be unrecognized. */
  sealState: string;
  /** ISO 8601 timestamp the sample was collected. */
  collectedAt: string;
  /** Optional fabricated operational note. Scanned and rejected if it looks unsafe. */
  note?: string;
};

export type SampleRejectionReasonCode =
  | 'tenant-mismatch'
  | 'matrix-container-not-approved'
  | 'volume-invalid'
  | 'volume-unit-mismatched'
  | 'volume-out-of-range'
  | 'temperature-invalid'
  | 'temperature-unit-mismatched'
  | 'temperature-out-of-range'
  | 'seal-state-invalid'
  | 'timestamp-invalid'
  | 'timestamp-out-of-bound'
  | 'duplicate-conflict'
  | 'duplicate-replay'
  | 'note-unsafe-content'
  | 'hold-condition-matched';

export type SampleRejectionReason = {
  code: SampleRejectionReasonCode;
};

export type SampleAcceptanceDecision = {
  sampleId: string;
  status: SampleDispositionStatus;
  /** Deterministically ordered, privacy-safe reasons. Empty when ACCEPT. */
  reasons: SampleRejectionReason[];
};

/** Reason codes that always fail a submission closed to REJECT, regardless of anything else. Ambiguous duplicates and unsafe text are never configurable. */
const STATIC_REJECT_CODES: ReadonlySet<SampleRejectionReasonCode> = new Set<SampleRejectionReasonCode>([
  'tenant-mismatch',
  'matrix-container-not-approved',
  'volume-invalid',
  'volume-unit-mismatched',
  'volume-out-of-range',
  'temperature-invalid',
  'temperature-unit-mismatched',
  'temperature-out-of-range',
  'seal-state-invalid',
  'timestamp-invalid',
  'timestamp-out-of-bound',
  'duplicate-conflict',
  'note-unsafe-content',
]);

const REASON_MESSAGES: Record<SampleRejectionReasonCode, string> = {
  'tenant-mismatch': 'The sample does not belong to the tenant this evaluation was run for.',
  'matrix-container-not-approved': 'The sample matrix and container combination is not on the configured approved pairing list.',
  'volume-invalid': 'The submitted sample volume is not a finite number.',
  'volume-unit-mismatched': 'The submitted volume unit does not match the configured unit for this matrix.',
  'volume-out-of-range': 'The submitted volume falls outside the configured bounded range for this matrix.',
  'temperature-invalid': 'The submitted sample temperature is not a finite number.',
  'temperature-unit-mismatched': 'The submitted temperature unit does not match the configured unit for this matrix.',
  'temperature-out-of-range': 'The submitted temperature falls outside the configured bounded range for this matrix.',
  'seal-state-invalid': 'The submitted seal state is not on the configured accepted seal state list.',
  'timestamp-invalid': 'The collection timestamp could not be parsed.',
  'timestamp-out-of-bound': 'The collection timestamp is outside the configured allowed time window.',
  'duplicate-conflict': 'More than one submitted sample shares this identifier with conflicting content.',
  'duplicate-replay': 'This sample identifier was already submitted with identical content in this batch.',
  'note-unsafe-content': 'The submitted free-text note contains unsafe or personally identifying content.',
  'hold-condition-matched': 'The sample matches a configured condition that always requires manual hold review.',
};

/** Deterministic, privacy-safe human-readable text for a disposition reason, suitable for UI display. */
export function explainSampleRejectionReason(reason: SampleRejectionReason): string {
  return REASON_MESSAGES[reason.code];
}

/** The concrete corrective step a submitter can take to move a held or rejected sample forward, keyed by reason code. */
const REASON_NEXT_ACTIONS: Record<SampleRejectionReasonCode, string> = {
  'tenant-mismatch': 'Confirm the sample belongs to this tenant and resubmit under the correct tenant.',
  'matrix-container-not-approved': 'Recollect the sample using an approved matrix and container pairing for this policy.',
  'volume-invalid': 'Resupply a numeric volume value.',
  'volume-unit-mismatched': 'Resupply the volume using the configured unit for this matrix.',
  'volume-out-of-range': 'Recollect the sample with a volume inside the configured range for this matrix.',
  'temperature-invalid': 'Resupply a numeric temperature value.',
  'temperature-unit-mismatched': 'Resupply the temperature using the configured unit for this matrix.',
  'temperature-out-of-range': 'Recollect and store the sample within the configured temperature range for this matrix.',
  'seal-state-invalid': 'Recollect the sample with an accepted seal state.',
  'timestamp-invalid': 'Resupply a parsable collection timestamp.',
  'timestamp-out-of-bound': 'Recollect the sample within the configured freshness window.',
  'duplicate-conflict': 'Resolve the conflicting duplicate submissions before resubmitting this sample identifier.',
  'duplicate-replay': 'This sample was already submitted with identical content; no resubmission is needed.',
  'note-unsafe-content': 'Remove unsafe or personally identifying content from the note and resubmit.',
  'hold-condition-matched': 'Await manual hold review; no resubmission is needed unless the reviewer requests one.',
};

/** Deterministic, privacy-safe next corrective action for a disposition reason, suitable for UI display alongside the explanation. */
export function explainSampleRejectionNextAction(reason: SampleRejectionReason): string {
  return REASON_NEXT_ACTIONS[reason.code];
}

export type SampleRejectionInputErrorCode =
  | 'policy-malformed'
  | 'policy-tenant-invalid'
  | 'policy-timestamp-bound-invalid'
  | 'policy-approved-pairs-invalid'
  | 'policy-volume-rules-invalid'
  | 'policy-temperature-ranges-invalid'
  | 'policy-seal-rule-invalid'
  | 'policy-duplicate-rule-invalid'
  | 'policy-hold-rule-invalid'
  | 'samples-not-array'
  | 'sample-malformed';

const INPUT_ERROR_MESSAGES: Record<SampleRejectionInputErrorCode, string> = {
  'policy-malformed': 'The sample acceptance policy is not a valid configuration object.',
  'policy-tenant-invalid': 'The sample acceptance policy tenant identifier is invalid.',
  'policy-timestamp-bound-invalid': 'The sample acceptance policy timestamp bound has an invalid reference time or freshness window.',
  'policy-approved-pairs-invalid': 'The sample acceptance policy approved matrix/container pairing list is invalid or empty.',
  'policy-volume-rules-invalid': 'The sample acceptance policy volume rules are invalid, incomplete, or reference an unapproved matrix.',
  'policy-temperature-ranges-invalid': 'The sample acceptance policy temperature ranges are invalid, incomplete, or reference an unapproved matrix.',
  'policy-seal-rule-invalid': 'The sample acceptance policy seal rule is invalid or empty.',
  'policy-duplicate-rule-invalid': 'The sample acceptance policy duplicate rule has an invalid replay disposition.',
  'policy-hold-rule-invalid': 'The sample acceptance policy hold rule is invalid or references an unapproved value.',
  'samples-not-array': 'The sample submission batch is not a list of submissions.',
  'sample-malformed': 'A sample submission is missing a required field or has the wrong shape.',
};

/** Thrown for a structurally invalid policy or a structurally unusable submission batch, rather than guessing at a disposition. */
export class SampleRejectionInputError extends Error {
  readonly code: SampleRejectionInputErrorCode;

  constructor(code: SampleRejectionInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'SampleRejectionInputError';
    this.code = code;
  }
}

function fail(code: SampleRejectionInputErrorCode): never {
  throw new SampleRejectionInputError(code);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toFiniteNumber(rawValue: unknown): number | undefined {
  if (typeof rawValue === 'number') {
    return Number.isFinite(rawValue) ? rawValue : undefined;
  }
  if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

const PII_PATTERNS: readonly RegExp[] = [
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  /\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b(?:ssn|social security|date of birth|d\.?o\.?b\.?|patient name|home address)\b/i,
];

const UNSAFE_MARKUP_PATTERNS: readonly RegExp[] = [/<script\b/i, /javascript:/i, /on\w+\s*=\s*["']/i];

function looksUnsafe(value: string): boolean {
  return PII_PATTERNS.some((pattern) => pattern.test(value)) || UNSAFE_MARKUP_PATTERNS.some((pattern) => pattern.test(value));
}

function pairKey(matrix: string, container: string): string {
  return `${matrix} ${container}`;
}

type CompiledVolumeRule = { unit: string; minVolume: number; maxVolume: number };
type CompiledTemperatureRule = { unit: string; minTemperature: number; maxTemperature: number };

type CompiledPolicy = {
  tenantId: string;
  parsedReferenceTime: number;
  maxAgeMs: number;
  approvedPairKeys: ReadonlySet<string>;
  volumeRuleByMatrix: ReadonlyMap<string, CompiledVolumeRule>;
  temperatureRuleByMatrix: ReadonlyMap<string, CompiledTemperatureRule>;
  acceptedSealStates: ReadonlySet<string>;
  replayDisposition: 'HOLD' | 'REJECT';
  holdConditions: readonly SampleHoldCondition[];
  rejectTierCodes: ReadonlySet<SampleRejectionReasonCode>;
};

function compilePolicy(rawPolicy: unknown): CompiledPolicy {
  if (!isPlainObject(rawPolicy)) {
    fail('policy-malformed');
  }
  const policy = rawPolicy;

  if (!isNonEmptyString(policy.tenantId)) {
    fail('policy-tenant-invalid');
  }

  if (!isPlainObject(policy.timestampBound)) {
    fail('policy-timestamp-bound-invalid');
  }
  const timestampBound = policy.timestampBound;
  const parsedReferenceTime = isNonEmptyString(timestampBound.referenceTime) ? Date.parse(timestampBound.referenceTime) : NaN;
  const maxAgeMs = timestampBound.maxAgeMs;
  if (!Number.isFinite(parsedReferenceTime) || !isFiniteNumber(maxAgeMs) || maxAgeMs < 0) {
    fail('policy-timestamp-bound-invalid');
  }

  if (!Array.isArray(policy.approvedPairs) || policy.approvedPairs.length === 0) {
    fail('policy-approved-pairs-invalid');
  }
  const approvedMatrices = new Set<string>();
  const approvedContainers = new Set<string>();
  const approvedPairKeys = new Set<string>();
  for (const rawPair of policy.approvedPairs) {
    if (!isPlainObject(rawPair) || !isNonEmptyString(rawPair.matrix) || !isNonEmptyString(rawPair.container)) {
      fail('policy-approved-pairs-invalid');
    }
    const key = pairKey(rawPair.matrix, rawPair.container);
    if (approvedPairKeys.has(key)) {
      fail('policy-approved-pairs-invalid');
    }
    approvedPairKeys.add(key);
    approvedMatrices.add(rawPair.matrix);
    approvedContainers.add(rawPair.container);
  }

  if (!Array.isArray(policy.volumeRules)) {
    fail('policy-volume-rules-invalid');
  }
  const volumeRuleByMatrix = new Map<string, CompiledVolumeRule>();
  for (const rawRule of policy.volumeRules) {
    if (
      !isPlainObject(rawRule) ||
      !isNonEmptyString(rawRule.matrix) ||
      !isNonEmptyString(rawRule.unit) ||
      !isFiniteNumber(rawRule.minVolume) ||
      !isFiniteNumber(rawRule.maxVolume) ||
      rawRule.minVolume > rawRule.maxVolume
    ) {
      fail('policy-volume-rules-invalid');
    }
    if (!approvedMatrices.has(rawRule.matrix) || volumeRuleByMatrix.has(rawRule.matrix)) {
      fail('policy-volume-rules-invalid');
    }
    volumeRuleByMatrix.set(rawRule.matrix, { unit: rawRule.unit, minVolume: rawRule.minVolume, maxVolume: rawRule.maxVolume });
  }
  if (volumeRuleByMatrix.size !== approvedMatrices.size) {
    fail('policy-volume-rules-invalid');
  }

  if (!Array.isArray(policy.temperatureRanges)) {
    fail('policy-temperature-ranges-invalid');
  }
  const temperatureRuleByMatrix = new Map<string, CompiledTemperatureRule>();
  for (const rawRange of policy.temperatureRanges) {
    if (
      !isPlainObject(rawRange) ||
      !isNonEmptyString(rawRange.matrix) ||
      !isNonEmptyString(rawRange.unit) ||
      !isFiniteNumber(rawRange.minTemperature) ||
      !isFiniteNumber(rawRange.maxTemperature) ||
      rawRange.minTemperature > rawRange.maxTemperature
    ) {
      fail('policy-temperature-ranges-invalid');
    }
    if (!approvedMatrices.has(rawRange.matrix) || temperatureRuleByMatrix.has(rawRange.matrix)) {
      fail('policy-temperature-ranges-invalid');
    }
    temperatureRuleByMatrix.set(rawRange.matrix, {
      unit: rawRange.unit,
      minTemperature: rawRange.minTemperature,
      maxTemperature: rawRange.maxTemperature,
    });
  }
  if (temperatureRuleByMatrix.size !== approvedMatrices.size) {
    fail('policy-temperature-ranges-invalid');
  }

  if (!isPlainObject(policy.sealRule) || !Array.isArray(policy.sealRule.acceptedSealStates) || policy.sealRule.acceptedSealStates.length === 0) {
    fail('policy-seal-rule-invalid');
  }
  const acceptedSealStates = new Set<string>();
  for (const rawState of policy.sealRule.acceptedSealStates) {
    if (!isNonEmptyString(rawState) || acceptedSealStates.has(rawState)) {
      fail('policy-seal-rule-invalid');
    }
    acceptedSealStates.add(rawState);
  }

  if (!isPlainObject(policy.duplicateRule) || (policy.duplicateRule.replayDisposition !== 'HOLD' && policy.duplicateRule.replayDisposition !== 'REJECT')) {
    fail('policy-duplicate-rule-invalid');
  }
  const replayDisposition = policy.duplicateRule.replayDisposition as 'HOLD' | 'REJECT';

  if (!isPlainObject(policy.holdRule) || !Array.isArray(policy.holdRule.conditions)) {
    fail('policy-hold-rule-invalid');
  }
  const holdConditions: SampleHoldCondition[] = [];
  for (const rawCondition of policy.holdRule.conditions) {
    if (!isPlainObject(rawCondition)) {
      fail('policy-hold-rule-invalid');
    }
    const { matrix, container, sealState, ...rest } = rawCondition;
    if (Object.keys(rest).length > 0) {
      fail('policy-hold-rule-invalid');
    }
    if (matrix === undefined && container === undefined && sealState === undefined) {
      fail('policy-hold-rule-invalid');
    }
    if (matrix !== undefined && (!isNonEmptyString(matrix) || !approvedMatrices.has(matrix))) {
      fail('policy-hold-rule-invalid');
    }
    if (container !== undefined && (!isNonEmptyString(container) || !approvedContainers.has(container))) {
      fail('policy-hold-rule-invalid');
    }
    if (sealState !== undefined && (!isNonEmptyString(sealState) || !acceptedSealStates.has(sealState))) {
      fail('policy-hold-rule-invalid');
    }
    holdConditions.push({
      ...(matrix !== undefined ? { matrix: matrix as string } : {}),
      ...(container !== undefined ? { container: container as string } : {}),
      ...(sealState !== undefined ? { sealState: sealState as string } : {}),
    });
  }

  const rejectTierCodes = new Set<SampleRejectionReasonCode>(STATIC_REJECT_CODES);
  if (replayDisposition === 'REJECT') {
    rejectTierCodes.add('duplicate-replay');
  }

  return {
    tenantId: policy.tenantId,
    parsedReferenceTime,
    maxAgeMs,
    approvedPairKeys,
    volumeRuleByMatrix,
    temperatureRuleByMatrix,
    acceptedSealStates,
    replayDisposition,
    holdConditions,
    rejectTierCodes,
  };
}

function hasRequiredIdentity(raw: unknown): raw is SampleSubmission {
  if (!isPlainObject(raw)) {
    return false;
  }
  return (
    isNonEmptyString(raw.sampleId) &&
    isNonEmptyString(raw.tenantId) &&
    isNonEmptyString(raw.matrix) &&
    isNonEmptyString(raw.container) &&
    isNonEmptyString(raw.sealState) &&
    isNonEmptyString(raw.collectedAt) &&
    raw.volume !== undefined &&
    raw.temperature !== undefined &&
    (raw.volumeUnit === undefined || typeof raw.volumeUnit === 'string') &&
    (raw.temperatureUnit === undefined || typeof raw.temperatureUnit === 'string') &&
    (raw.note === undefined || typeof raw.note === 'string')
  );
}

function normalizedNumericToken(rawValue: unknown): string {
  const numeric = toFiniteNumber(rawValue);
  return numeric === undefined ? `raw:${JSON.stringify(rawValue)}` : `num:${numeric}`;
}

function sampleContentSignature(sample: SampleSubmission): string {
  return JSON.stringify([
    sample.tenantId,
    sample.matrix,
    sample.container,
    normalizedNumericToken(sample.volume),
    sample.volumeUnit ?? null,
    normalizedNumericToken(sample.temperature),
    sample.temperatureUnit ?? null,
    sample.sealState,
    sample.collectedAt,
    sample.note ?? null,
  ]);
}

function compareReasons(a: SampleRejectionReason, b: SampleRejectionReason): number {
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

function holdConditionMatches(condition: SampleHoldCondition, sample: SampleSubmission): boolean {
  return (
    (condition.matrix === undefined || condition.matrix === sample.matrix) &&
    (condition.container === undefined || condition.container === sample.container) &&
    (condition.sealState === undefined || condition.sealState === sample.sealState)
  );
}

function evaluateSingleSample(
  sample: SampleSubmission,
  policy: CompiledPolicy,
  duplicateReason: 'duplicate-replay' | 'duplicate-conflict' | undefined,
): SampleAcceptanceDecision {
  const reasons: SampleRejectionReason[] = [];
  const flag = (code: SampleRejectionReasonCode) => reasons.push({ code });

  if (duplicateReason) {
    flag(duplicateReason);
  }

  if (sample.tenantId !== policy.tenantId) {
    flag('tenant-mismatch');
  }

  const pairApproved = policy.approvedPairKeys.has(pairKey(sample.matrix, sample.container));
  if (!pairApproved) {
    flag('matrix-container-not-approved');
  }

  const numericVolume = toFiniteNumber(sample.volume);
  if (numericVolume === undefined) {
    flag('volume-invalid');
  }
  const volumeRule = policy.volumeRuleByMatrix.get(sample.matrix);
  if (volumeRule) {
    if (!isNonEmptyString(sample.volumeUnit) || sample.volumeUnit !== volumeRule.unit) {
      flag('volume-unit-mismatched');
    } else if (numericVolume !== undefined && (numericVolume < volumeRule.minVolume || numericVolume > volumeRule.maxVolume)) {
      flag('volume-out-of-range');
    }
  }

  const numericTemperature = toFiniteNumber(sample.temperature);
  if (numericTemperature === undefined) {
    flag('temperature-invalid');
  }
  const temperatureRule = policy.temperatureRuleByMatrix.get(sample.matrix);
  if (temperatureRule) {
    if (!isNonEmptyString(sample.temperatureUnit) || sample.temperatureUnit !== temperatureRule.unit) {
      flag('temperature-unit-mismatched');
    } else if (
      numericTemperature !== undefined &&
      (numericTemperature < temperatureRule.minTemperature || numericTemperature > temperatureRule.maxTemperature)
    ) {
      flag('temperature-out-of-range');
    }
  }

  if (!policy.acceptedSealStates.has(sample.sealState)) {
    flag('seal-state-invalid');
  }

  const collectedTime = Date.parse(sample.collectedAt);
  if (!Number.isFinite(collectedTime)) {
    flag('timestamp-invalid');
  } else {
    const age = policy.parsedReferenceTime - collectedTime;
    if (age < 0 || age > policy.maxAgeMs) {
      flag('timestamp-out-of-bound');
    }
  }

  if (sample.note !== undefined && looksUnsafe(sample.note)) {
    flag('note-unsafe-content');
  }

  if (policy.holdConditions.some((condition) => holdConditionMatches(condition, sample))) {
    flag('hold-condition-matched');
  }

  reasons.sort(compareReasons);

  const status: SampleDispositionStatus = reasons.some((reason) => policy.rejectTierCodes.has(reason.code))
    ? 'REJECT'
    : reasons.length > 0
      ? 'HOLD'
      : 'ACCEPT';

  return { sampleId: sample.sampleId, status, reasons };
}

/**
 * Evaluate a batch of fabricated sample submissions against a caller-supplied
 * acceptance policy and return one conservative disposition per submission,
 * in the same order the submissions were given.
 *
 * Fail-closed: a tenant mismatch, an unapproved matrix/container pairing, a
 * nonnumeric or out-of-range volume or temperature, a mismatched unit, an
 * unrecognized seal state, an unparsable or out-of-bound collection
 * timestamp, an ambiguous (conflicting-content) duplicate identifier, or
 * unsafe free text always rejects. A configured hold condition, or an
 * exact-content replay when the policy so configures, holds instead. A
 * structurally invalid or contradictory policy, or a structurally unusable
 * submission batch, throws SampleRejectionInputError instead of guessing at
 * a disposition.
 */
export function evaluateSampleAcceptance(rawPolicy: unknown, rawSamples: unknown): SampleAcceptanceDecision[] {
  const policy = compilePolicy(rawPolicy);

  if (!Array.isArray(rawSamples)) {
    fail('samples-not-array');
  }

  const samples: SampleSubmission[] = rawSamples.map((raw) => {
    if (!hasRequiredIdentity(raw)) {
      fail('sample-malformed');
    }
    return raw;
  });

  const groupsBySampleId = new Map<string, number[]>();
  samples.forEach((sample, index) => {
    const indices = groupsBySampleId.get(sample.sampleId);
    if (indices) {
      indices.push(index);
    } else {
      groupsBySampleId.set(sample.sampleId, [index]);
    }
  });

  const duplicateReasonByIndex = new Map<number, 'duplicate-replay' | 'duplicate-conflict'>();
  for (const indices of groupsBySampleId.values()) {
    if (indices.length < 2) {
      continue;
    }
    const signatures = new Set(indices.map((index) => sampleContentSignature(samples[index])));
    const reason = signatures.size === 1 ? 'duplicate-replay' : 'duplicate-conflict';
    for (const index of indices) {
      duplicateReasonByIndex.set(index, reason);
    }
  }

  return samples.map((sample, index) => evaluateSingleSample(sample, policy, duplicateReasonByIndex.get(index)));
}
