/**
 * Fail-closed synthetic OHWorks instrument flag mapping.
 *
 * This module is a pure, dependency-free evaluator over a fabricated,
 * caller-declared mapping table that translates instrument-specific flag
 * codes (per instrument model) into canonical flags, each carrying a
 * declared severity and an action (`report`, `review`, or `suppress`). It
 * performs no I/O, reads no system clock, mutates no SENAITE or database
 * state, and touches no real instrument, sample, or customer data.
 *
 * Given the mapping table, an instrument model, and a result's raw flag
 * codes, it:
 *
 *   - translates every raw flag code into its declared canonical flag,
 *   - resolves conflicts between multiple mapped flags by highest declared
 *     severity (ties broken toward the more visible action: report over
 *     review over suppress, never silently toward suppress), and
 *   - returns the single required action driven by that resolved severity.
 *
 * Fail-closed: an instrument model absent from the table, or any raw flag
 * code not declared for that model, blocks the whole translation rather than
 * dropping the unmapped flag silently.
 */

export type FlagSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type FlagAction = 'report' | 'review' | 'suppress';

export type CanonicalFlagDefinition = {
  canonicalFlag: string;
  severity: FlagSeverity;
  action: FlagAction;
};

/** Synthetic mapping table: instrument model -> raw flag code -> canonical flag definition. */
export type InstrumentFlagMappingTable = Readonly<Record<string, Readonly<Record<string, CanonicalFlagDefinition>>>>;

export type MappedCanonicalFlag = {
  rawFlagCode: string;
  canonicalFlag: string;
  severity: FlagSeverity;
  action: FlagAction;
};

export type FlagMappingDecision = 'mapped' | 'blocked';

/** Bounded, privacy-safe codes explaining a flag mapping decision. */
export type FlagMappingReasonCode =
  | 'unknown-instrument-model'
  | 'unmapped-flag-code'
  | 'no-raw-flags'
  | 'flags-mapped';

export type RequiredAction = FlagAction | 'none';

export type InstrumentFlagMappingResult = {
  instrumentModel: string;
  decision: FlagMappingDecision;
  reasonCode: FlagMappingReasonCode;
  /** Deterministic, privacy-safe human-readable explanation of reasonCode. */
  reason: string;
  /** Distinct canonical flags produced by the translation, in first-seen order. */
  canonicalFlags: ReadonlyArray<MappedCanonicalFlag>;
  resolvedSeverity: FlagSeverity | null;
  requiredAction: RequiredAction;
  /** Present only when reasonCode is 'unmapped-flag-code'. */
  unmappedFlagCode?: string;
};

export type InstrumentFlagMappingInputErrorCode =
  | 'table-malformed'
  | 'instrument-model-malformed'
  | 'raw-flags-malformed'
  | 'model-mapping-malformed'
  | 'flag-definition-malformed';

const INPUT_ERROR_MESSAGES: Record<InstrumentFlagMappingInputErrorCode, string> = {
  'table-malformed': 'The instrument flag mapping table is not a valid lookup object.',
  'instrument-model-malformed': 'The requested instrument model is not a non-empty string.',
  'raw-flags-malformed': 'The supplied raw flag codes are not an array of non-empty strings.',
  'model-mapping-malformed': 'The mapping table entry for this instrument model is not a valid lookup object.',
  'flag-definition-malformed': 'The canonical flag definition for a mapped raw flag code has a missing or invalid field.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a reason code. */
export class InstrumentFlagMappingInputError extends Error {
  readonly code: InstrumentFlagMappingInputErrorCode;

  constructor(code: InstrumentFlagMappingInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'InstrumentFlagMappingInputError';
    this.code = code;
  }
}

const KNOWN_SEVERITIES: ReadonlySet<string> = new Set<FlagSeverity>(['info', 'low', 'medium', 'high', 'critical']);
const KNOWN_ACTIONS: ReadonlySet<string> = new Set<FlagAction>(['report', 'review', 'suppress']);

const SEVERITY_RANK: Record<FlagSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** Tie-break priority when resolved severity is shared by more than one action: the more visible action wins. */
const ACTION_PRIORITY: Record<FlagAction, number> = {
  suppress: 0,
  review: 1,
  report: 2,
};

const REASON_DECISIONS: Record<FlagMappingReasonCode, FlagMappingDecision> = {
  'unknown-instrument-model': 'blocked',
  'unmapped-flag-code': 'blocked',
  'no-raw-flags': 'mapped',
  'flags-mapped': 'mapped',
};

const REASON_MESSAGES: Record<FlagMappingReasonCode, string> = {
  'unknown-instrument-model': 'No flag mapping is declared for this instrument model.',
  'unmapped-flag-code': 'A raw flag code on this result has no declared canonical mapping for this instrument model.',
  'no-raw-flags': 'The result carried no raw flags, so no canonical flag or action applies.',
  'flags-mapped': 'Every raw flag was translated to a declared canonical flag.',
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPlainLookupObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStructurallyValidFlagDefinition(raw: unknown): raw is CanonicalFlagDefinition {
  if (!isPlainLookupObject(raw)) {
    return false;
  }
  return (
    isNonEmptyString(raw.canonicalFlag) &&
    typeof raw.severity === 'string' &&
    KNOWN_SEVERITIES.has(raw.severity) &&
    typeof raw.action === 'string' &&
    KNOWN_ACTIONS.has(raw.action)
  );
}

function toBlockedResult(
  instrumentModel: string,
  reasonCode: FlagMappingReasonCode,
  unmappedFlagCode?: string,
): InstrumentFlagMappingResult {
  return Object.freeze({
    instrumentModel,
    decision: REASON_DECISIONS[reasonCode],
    reasonCode,
    reason: REASON_MESSAGES[reasonCode],
    canonicalFlags: Object.freeze([]),
    resolvedSeverity: null,
    requiredAction: 'none' as RequiredAction,
    ...(unmappedFlagCode === undefined ? {} : { unmappedFlagCode }),
  });
}

/**
 * Translate a result's raw instrument flag codes into canonical flags for a
 * declared instrument model, resolve conflicts by highest declared severity,
 * and return the single required action.
 *
 * Fail-closed: an instrument model missing from the mapping table, or any
 * raw flag code not declared for that model, blocks the whole translation
 * (`decision: 'blocked'`) rather than mapping the flags it can and dropping
 * the rest. An empty raw flag list is not an error -- it maps cleanly to no
 * canonical flags and `requiredAction: 'none'`.
 *
 * Structurally unusable input (a malformed table, instrument model, raw flag
 * list, per-model mapping, or flag definition) throws
 * InstrumentFlagMappingInputError instead of guessing at a reason code.
 */
export function mapInstrumentFlags(
  table: InstrumentFlagMappingTable,
  instrumentModel: string,
  rawFlagCodes: ReadonlyArray<string>,
): InstrumentFlagMappingResult {
  if (!isPlainLookupObject(table)) {
    throw new InstrumentFlagMappingInputError('table-malformed');
  }
  if (!isNonEmptyString(instrumentModel)) {
    throw new InstrumentFlagMappingInputError('instrument-model-malformed');
  }
  if (!Array.isArray(rawFlagCodes) || !rawFlagCodes.every(isNonEmptyString)) {
    throw new InstrumentFlagMappingInputError('raw-flags-malformed');
  }

  const modelMapping = (table as Record<string, unknown>)[instrumentModel];
  if (modelMapping === undefined) {
    return toBlockedResult(instrumentModel, 'unknown-instrument-model');
  }
  if (!isPlainLookupObject(modelMapping)) {
    throw new InstrumentFlagMappingInputError('model-mapping-malformed');
  }

  if (rawFlagCodes.length === 0) {
    return toBlockedResult(instrumentModel, 'no-raw-flags');
  }

  const canonicalFlagsByFlag = new Map<string, MappedCanonicalFlag>();
  const orderedCanonicalFlags: string[] = [];

  for (const rawFlagCode of rawFlagCodes) {
    const definitionRaw = modelMapping[rawFlagCode];
    if (definitionRaw === undefined) {
      return toBlockedResult(instrumentModel, 'unmapped-flag-code', rawFlagCode);
    }
    if (!isStructurallyValidFlagDefinition(definitionRaw)) {
      throw new InstrumentFlagMappingInputError('flag-definition-malformed');
    }

    const mapped: MappedCanonicalFlag = Object.freeze({
      rawFlagCode,
      canonicalFlag: definitionRaw.canonicalFlag,
      severity: definitionRaw.severity,
      action: definitionRaw.action,
    });

    const existing = canonicalFlagsByFlag.get(mapped.canonicalFlag);
    if (existing === undefined) {
      canonicalFlagsByFlag.set(mapped.canonicalFlag, mapped);
      orderedCanonicalFlags.push(mapped.canonicalFlag);
    } else if (SEVERITY_RANK[mapped.severity] > SEVERITY_RANK[existing.severity]) {
      canonicalFlagsByFlag.set(mapped.canonicalFlag, mapped);
    }
  }

  const canonicalFlags = Object.freeze(orderedCanonicalFlags.map((flag) => canonicalFlagsByFlag.get(flag)!));

  let resolved: MappedCanonicalFlag = canonicalFlags[0]!;
  for (const candidate of canonicalFlags) {
    const severityDelta = SEVERITY_RANK[candidate.severity] - SEVERITY_RANK[resolved.severity];
    if (
      severityDelta > 0 ||
      (severityDelta === 0 && ACTION_PRIORITY[candidate.action] > ACTION_PRIORITY[resolved.action])
    ) {
      resolved = candidate;
    }
  }

  return Object.freeze({
    instrumentModel,
    decision: REASON_DECISIONS['flags-mapped'],
    reasonCode: 'flags-mapped',
    reason: REASON_MESSAGES['flags-mapped'],
    canonicalFlags,
    resolvedSeverity: resolved.severity,
    requiredAction: resolved.action,
  });
}

/** Deterministic, privacy-safe human-readable text for a reason code, suitable for UI display. */
export function explainFlagMappingReason(reasonCode: FlagMappingReasonCode): string {
  return REASON_MESSAGES[reasonCode];
}
