/**
 * Fail-closed, deterministic aliquot derivation for the synthetic OHWorks
 * pilot.
 *
 * This module is a pure, dependency-free planner: given a fabricated parent
 * specimen (an accession id, a volume, a container type, and the specimen's
 * own derivation depth) plus a declared dead volume and a set of requested
 * aliquots (a caller-supplied label, a volume, and a purpose), it derives a
 * deterministic child identifier for each aliquot from the parent accession
 * id and the aliquot's label, and returns either the full set of derived
 * children or the first rule the split breaks.
 *
 * Derivation depth: the parent's own `derivationDepth` is 0 for an original
 * specimen and increments by one for every generation of aliquoting already
 * applied to it. Every child produced by a split has `derivationDepth`
 * `parent.derivationDepth + 1`. Splitting is rejected once that value would
 * exceed MAX_DERIVATION_DEPTH, capping any lineage at two aliquot
 * generations below the original specimen.
 *
 * A split is rejected, in this order, for the first rule broken:
 *
 *   1. derivation-depth-exceeded — the parent is already at the maximum
 *                                   derivation depth
 *   2. parent-volume-invalid     — the parent volume is zero or negative
 *   3. dead-volume-invalid       — the declared dead volume is negative
 *   4. requests-empty            — no aliquots were requested
 *   5. (per request, in order)   — aliquot-volume-invalid, purpose-unknown,
 *                                   or child-id-duplicate
 *   6. over-allocation           — total requested volume plus dead volume
 *                                   exceeds the parent volume
 *
 * Structurally unusable input (not an object, a missing required field, or
 * the wrong type) throws a typed error instead of guessing at a summary.
 * Every fixture used to exercise this module is synthetic: it names no real
 * specimen, patient, or lab record.
 */

/** Bounded, synthetic container registry. Not tied to any real equipment. */
export type AliquotContainerType = 'VIAL' | 'TUBE' | 'BOTTLE' | 'CASSETTE';

const KNOWN_CONTAINER_TYPES: ReadonlySet<string> = new Set<AliquotContainerType>([
  'VIAL',
  'TUBE',
  'BOTTLE',
  'CASSETTE',
]);

/** Bounded, synthetic aliquot purpose registry. */
export type AliquotPurpose =
  | 'PRIMARY_ANALYSIS'
  | 'QC_REPLICATE'
  | 'RETAIN_ARCHIVE'
  | 'REFERRAL_SEND_OUT'
  | 'REEXTRACTION';

const KNOWN_PURPOSES: ReadonlySet<string> = new Set<AliquotPurpose>([
  'PRIMARY_ANALYSIS',
  'QC_REPLICATE',
  'RETAIN_ARCHIVE',
  'REFERRAL_SEND_OUT',
  'REEXTRACTION',
]);

/** Maximum derivation depth a produced child aliquot may carry. */
export const MAX_DERIVATION_DEPTH = 2;

/** Tolerance for floating-point volume sums; does not change fail-closed intent. */
const VOLUME_EPSILON = 1e-9;

export type ParentSpecimen = {
  /** Synthetic accession identifier. Never a real specimen id. */
  accessionId: string;
  volume: number;
  containerType: AliquotContainerType;
  /** 0 for an original specimen; increments per aliquot generation already applied. */
  derivationDepth: number;
};

export type AliquotRequest = {
  /** Caller-supplied label combined with the parent accession id to derive the child id. */
  label: string;
  volume: number;
  purpose: AliquotPurpose;
};

export type AliquotSplitInput = {
  parent: ParentSpecimen;
  deadVolume: number;
  requests: AliquotRequest[];
};

export type DerivedAliquot = {
  childId: string;
  parentAccessionId: string;
  derivationDepth: number;
  containerType: AliquotContainerType;
  purpose: AliquotPurpose;
  volume: number;
};

export type AliquotSplitReasonCode =
  | 'derivation-depth-exceeded'
  | 'parent-volume-invalid'
  | 'dead-volume-invalid'
  | 'requests-empty'
  | 'aliquot-volume-invalid'
  | 'purpose-unknown'
  | 'child-id-duplicate'
  | 'over-allocation';

const REASON_MESSAGES: Record<AliquotSplitReasonCode, string> = {
  'derivation-depth-exceeded':
    'Splitting this parent would create a child deeper than the maximum allowed derivation depth.',
  'parent-volume-invalid': 'The parent specimen volume must be a positive number.',
  'dead-volume-invalid': 'The declared dead volume must not be negative.',
  'requests-empty': 'At least one aliquot must be requested.',
  'aliquot-volume-invalid': 'The requested aliquot volume must be a positive number.',
  'purpose-unknown': 'The requested aliquot purpose is not on the bounded known purpose list.',
  'child-id-duplicate': 'The derived child identifier duplicates an identifier already produced for this split.',
  'over-allocation':
    'The total requested aliquot volume plus the declared dead volume exceeds the parent specimen volume.',
};

/** Deterministic, human-readable text for a fail-closed reason code. */
export function explainAliquotSplitReason(code: AliquotSplitReasonCode): string {
  return REASON_MESSAGES[code];
}

export type AliquotSplitFailure = {
  /** Present only for failures tied to a specific requested aliquot. */
  requestIndex?: number;
  code: AliquotSplitReasonCode;
};

export type AliquotSplitSummary =
  | { status: 'VALID'; parentAccessionId: string; children: DerivedAliquot[] }
  | { status: 'INVALID'; parentAccessionId: string; failure: AliquotSplitFailure };

export type AliquotSplitInputErrorCode =
  | 'input-malformed'
  | 'parent-malformed'
  | 'dead-volume-malformed'
  | 'requests-not-array'
  | 'request-malformed';

const INPUT_ERROR_MESSAGES: Record<AliquotSplitInputErrorCode, string> = {
  'input-malformed': 'The split input is not an object.',
  'parent-malformed': 'The parent specimen is missing a required field or has the wrong shape.',
  'dead-volume-malformed': 'The declared dead volume is not a finite number.',
  'requests-not-array': 'The requested aliquots input is not a list.',
  'request-malformed': 'A requested aliquot is missing a required field or has the wrong shape.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a fail-closed summary. */
export class AliquotSplitInputError extends Error {
  readonly code: AliquotSplitInputErrorCode;

  constructor(code: AliquotSplitInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'AliquotSplitInputError';
    this.code = code;
  }
}

function fail(code: AliquotSplitInputErrorCode): never {
  throw new AliquotSplitInputError(code);
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

function isStructurallyValidParent(raw: unknown): raw is ParentSpecimen {
  if (!isPlainObject(raw)) {
    return false;
  }
  return (
    isNonEmptyString(raw.accessionId) &&
    isFiniteNumber(raw.volume) &&
    typeof raw.containerType === 'string' &&
    KNOWN_CONTAINER_TYPES.has(raw.containerType) &&
    typeof raw.derivationDepth === 'number' &&
    Number.isInteger(raw.derivationDepth) &&
    raw.derivationDepth >= 0
  );
}

function isStructurallyValidRequest(raw: unknown): raw is AliquotRequest {
  if (!isPlainObject(raw)) {
    return false;
  }
  return isNonEmptyString(raw.label) && isFiniteNumber(raw.volume) && typeof raw.purpose === 'string';
}

/** Deterministically derive a child accession id from a parent accession id and an aliquot label. */
export function deriveChildAccessionId(parentAccessionId: string, label: string): string {
  return `${parentAccessionId}-${label}`;
}

/**
 * Plan a synthetic aliquot split for a parent specimen.
 *
 * Fail-closed: rules are checked in a fixed order (see module doc comment)
 * and this returns the first one the split breaks, or the full set of
 * derived children if every rule passes. Structurally unusable input (not
 * an object, a missing required field, or the wrong type) throws
 * AliquotSplitInputError instead of guessing at a summary.
 */
export function planAliquotSplit(rawInput: unknown): AliquotSplitSummary {
  if (!isPlainObject(rawInput)) {
    fail('input-malformed');
  }

  const { parent, deadVolume, requests } = rawInput;

  if (!isStructurallyValidParent(parent)) {
    fail('parent-malformed');
  }
  if (!isFiniteNumber(deadVolume)) {
    fail('dead-volume-malformed');
  }
  if (!Array.isArray(requests)) {
    fail('requests-not-array');
  }

  const validatedRequests: AliquotRequest[] = requests.map((raw) => {
    if (!isStructurallyValidRequest(raw)) {
      fail('request-malformed');
    }
    return raw;
  });

  const parentAccessionId = parent.accessionId;

  const invalid = (code: AliquotSplitReasonCode, requestIndex?: number): AliquotSplitSummary => ({
    status: 'INVALID',
    parentAccessionId,
    failure: requestIndex === undefined ? { code } : { code, requestIndex },
  });

  const childDerivationDepth = parent.derivationDepth + 1;
  if (childDerivationDepth > MAX_DERIVATION_DEPTH) {
    return invalid('derivation-depth-exceeded');
  }

  if (parent.volume <= 0) {
    return invalid('parent-volume-invalid');
  }

  if (deadVolume < 0) {
    return invalid('dead-volume-invalid');
  }

  if (validatedRequests.length === 0) {
    return invalid('requests-empty');
  }

  const seenChildIds = new Set<string>();
  const children: DerivedAliquot[] = [];

  for (let index = 0; index < validatedRequests.length; index += 1) {
    const request = validatedRequests[index];

    if (request.volume <= 0) {
      return invalid('aliquot-volume-invalid', index);
    }

    if (!KNOWN_PURPOSES.has(request.purpose)) {
      return invalid('purpose-unknown', index);
    }

    const childId = deriveChildAccessionId(parentAccessionId, request.label);
    if (seenChildIds.has(childId)) {
      return invalid('child-id-duplicate', index);
    }
    seenChildIds.add(childId);

    children.push({
      childId,
      parentAccessionId,
      derivationDepth: childDerivationDepth,
      containerType: parent.containerType,
      purpose: request.purpose,
      volume: request.volume,
    });
  }

  const totalRequestedVolume = validatedRequests.reduce((sum, request) => sum + request.volume, 0);
  if (totalRequestedVolume + deadVolume > parent.volume + VOLUME_EPSILON) {
    return invalid('over-allocation');
  }

  return { status: 'VALID', parentAccessionId, children };
}
