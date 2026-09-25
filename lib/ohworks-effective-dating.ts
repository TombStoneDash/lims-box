/**
 * Deterministic, synthetic OHWorks catalog effective-dating resolution.
 *
 * This module is a pure, dependency-free, total function over a caller-
 * supplied catalog of test definition versions and a result timestamp. It
 * performs no I/O, reads no system clock, and touches no real instrument,
 * patient, or customer data.
 *
 * A test code (e.g. an analyte or panel identifier) may have several
 * versions of its definition over time: its method identifier, reporting
 * units, and reference interval can all change on a declared effective-from
 * instant, optionally ending at a declared effective-to instant. This module:
 *
 *   1. Validates the whole catalog: every version is structurally sound, its
 *      effective-from and effective-to (when present) are UTC instants that
 *      parse to a finite time, its range is not inverted or zero-length,
 *      every version id is unique, and no two versions of the same test code
 *      have overlapping effective ranges.
 *   2. Resolves exactly which version of a declared test code was in force
 *      at a caller-supplied result timestamp, using a half-open
 *      [effectiveFrom, effectiveTo) window (an open-ended version has no
 *      upper bound).
 *
 * A result timestamp that falls in a gap between two versions of a known
 * test code is reported as `no-version-in-force`, never silently resolved to
 * the nearest version. Every failure mode defaults to `rejected` rather than
 * guessing.
 */

export type TestDefinitionReferenceInterval = {
  lowerBound: number;
  upperBound: number;
};

export type TestDefinitionVersion = {
  versionId: string;
  testCode: string;
  methodIdentifier: string;
  units: string;
  referenceInterval: TestDefinitionReferenceInterval;
  /** UTC instant, e.g. '2026-01-01T00:00:00Z'. Inclusive. */
  effectiveFrom: string;
  /** UTC instant. Exclusive. Omit for an open-ended (still current) version. */
  effectiveTo?: string;
};

export type ResolvedTestDefinitionVersion = {
  versionId: string;
  methodIdentifier: string;
  units: string;
  referenceInterval: TestDefinitionReferenceInterval;
  effectiveFrom: string;
  effectiveTo: string | undefined;
};

export type EffectiveDatingDecision = 'resolved' | 'rejected';

/** Bounded, privacy-safe codes naming the rule behind an effective-dating resolution. */
export type EffectiveDatingReasonCode =
  | 'catalog-malformed'
  | 'version-malformed'
  | 'version-id-duplicate'
  | 'version-timestamp-invalid'
  | 'effective-range-inverted'
  | 'versions-overlap'
  | 'result-timestamp-invalid'
  | 'test-code-unknown'
  | 'no-version-in-force'
  | 'version-resolved';

export type EffectiveVersionResolution = {
  decision: EffectiveDatingDecision;
  reasonCode: EffectiveDatingReasonCode;
  /** Deterministic, privacy-safe human-readable explanation of reasonCode. */
  reason: string;
  testCode: string;
  resultTimestamp: string;
  /** Number of catalog versions declared for testCode, once the catalog itself validates. */
  candidateVersionCount: number;
  /** Set only when reasonCode is 'version-id-duplicate'. */
  duplicateVersionId: string | undefined;
  /** Set only when reasonCode is 'versions-overlap'. */
  overlappingVersionIds: readonly [string, string] | undefined;
  /** Set only when decision is 'resolved'. */
  version: ResolvedTestDefinitionVersion | undefined;
};

const REASON_DECISIONS: Record<EffectiveDatingReasonCode, EffectiveDatingDecision> = {
  'catalog-malformed': 'rejected',
  'version-malformed': 'rejected',
  'version-id-duplicate': 'rejected',
  'version-timestamp-invalid': 'rejected',
  'effective-range-inverted': 'rejected',
  'versions-overlap': 'rejected',
  'result-timestamp-invalid': 'rejected',
  'test-code-unknown': 'rejected',
  'no-version-in-force': 'rejected',
  'version-resolved': 'resolved',
};

const REASON_MESSAGES: Record<EffectiveDatingReasonCode, string> = {
  'catalog-malformed': 'The supplied catalog is not an array of test definition versions.',
  'version-malformed': 'A catalog entry is missing a required field or has the wrong shape.',
  'version-id-duplicate': 'Two or more catalog entries declare the same version id.',
  'version-timestamp-invalid':
    "A catalog entry's effective-from or effective-to is not a UTC instant string that parses to a finite time.",
  'effective-range-inverted':
    "A catalog entry's effective-to is not strictly after its effective-from.",
  'versions-overlap': 'Two versions of the same test code have overlapping effective ranges.',
  'result-timestamp-invalid': 'The supplied result timestamp is not a UTC instant string that parses to a finite time.',
  'test-code-unknown': 'The supplied catalog declares no version for the supplied test code.',
  'no-version-in-force':
    'No version of the supplied test code was in force at the supplied result timestamp; there is a gap in effective-dated coverage.',
  'version-resolved': 'Exactly one version of the supplied test code was in force at the supplied result timestamp.',
};

const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Parse a caller-supplied instant. Only a strict UTC ISO-8601 string (a
 * literal 'Z' offset, never a numeric or other-zone offset) that parses to a
 * finite time is accepted; anything else returns undefined.
 */
function parseUtcInstant(value: unknown): number | undefined {
  if (typeof value !== 'string' || !UTC_INSTANT_PATTERN.test(value)) {
    return undefined;
  }
  const epochMs = Date.parse(value);
  return Number.isFinite(epochMs) ? epochMs : undefined;
}

function isStructurallyValidVersion(raw: unknown): raw is TestDefinitionVersion {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  if (
    !isNonEmptyString(candidate.versionId) ||
    !isNonEmptyString(candidate.testCode) ||
    !isNonEmptyString(candidate.methodIdentifier) ||
    !isNonEmptyString(candidate.units) ||
    typeof candidate.effectiveFrom !== 'string' ||
    (candidate.effectiveTo !== undefined && typeof candidate.effectiveTo !== 'string')
  ) {
    return false;
  }
  const interval = candidate.referenceInterval;
  if (typeof interval !== 'object' || interval === null) {
    return false;
  }
  const bounds = interval as Record<string, unknown>;
  return isFiniteNumber(bounds.lowerBound) && isFiniteNumber(bounds.upperBound);
}

type ParsedRange = { fromMs: number; toMs: number };

function toResolution(
  reasonCode: EffectiveDatingReasonCode,
  testCode: string,
  resultTimestamp: string,
  overrides: {
    candidateVersionCount?: number;
    duplicateVersionId?: string;
    overlappingVersionIds?: readonly [string, string];
    version?: ResolvedTestDefinitionVersion;
  } = {},
): EffectiveVersionResolution {
  return Object.freeze({
    decision: REASON_DECISIONS[reasonCode],
    reasonCode,
    reason: REASON_MESSAGES[reasonCode],
    testCode,
    resultTimestamp,
    candidateVersionCount: overrides.candidateVersionCount ?? 0,
    duplicateVersionId: overrides.duplicateVersionId,
    overlappingVersionIds: overrides.overlappingVersionIds
      ? Object.freeze([...overrides.overlappingVersionIds] as [string, string])
      : undefined,
    version: overrides.version ? Object.freeze({ ...overrides.version }) : undefined,
  });
}

/**
 * Validate a catalog of test definition versions and resolve exactly which
 * version of the declared test code was in force at the declared result
 * timestamp.
 *
 * Checks run in a fixed order and the first failure wins: the catalog's
 * shape, each version's shape, each version's effective-from/effective-to
 * validity, version id uniqueness, range inversion, then cross-version
 * overlap within each test code. Only once the whole catalog validates are
 * the caller's result timestamp and test code checked, and the in-force
 * version (if any) resolved.
 */
export function resolveEffectiveTestDefinition(
  catalog: TestDefinitionVersion[],
  testCode: string,
  resultTimestamp: string,
): EffectiveVersionResolution {
  const safeTestCode = typeof testCode === 'string' ? testCode : '';
  const safeResultTimestamp = typeof resultTimestamp === 'string' ? resultTimestamp : '';

  if (!Array.isArray(catalog)) {
    return toResolution('catalog-malformed', safeTestCode, safeResultTimestamp);
  }

  for (const entry of catalog) {
    if (!isStructurallyValidVersion(entry)) {
      return toResolution('version-malformed', safeTestCode, safeResultTimestamp);
    }
  }
  const versions = catalog as TestDefinitionVersion[];

  const rangesByVersionId = new Map<string, ParsedRange>();
  for (const version of versions) {
    const fromMs = parseUtcInstant(version.effectiveFrom);
    if (fromMs === undefined) {
      return toResolution('version-timestamp-invalid', safeTestCode, safeResultTimestamp);
    }
    let toMs = Infinity;
    if (version.effectiveTo !== undefined) {
      const parsedTo = parseUtcInstant(version.effectiveTo);
      if (parsedTo === undefined) {
        return toResolution('version-timestamp-invalid', safeTestCode, safeResultTimestamp);
      }
      toMs = parsedTo;
    }
    rangesByVersionId.set(version.versionId, { fromMs, toMs });
  }

  const seenVersionIds = new Set<string>();
  for (const version of versions) {
    if (seenVersionIds.has(version.versionId)) {
      return toResolution('version-id-duplicate', safeTestCode, safeResultTimestamp, {
        duplicateVersionId: version.versionId,
      });
    }
    seenVersionIds.add(version.versionId);
  }

  for (const version of versions) {
    const range = rangesByVersionId.get(version.versionId) as ParsedRange;
    if (range.toMs <= range.fromMs) {
      return toResolution('effective-range-inverted', safeTestCode, safeResultTimestamp);
    }
  }

  const versionsByTestCode = new Map<string, TestDefinitionVersion[]>();
  for (const version of versions) {
    const group = versionsByTestCode.get(version.testCode) ?? [];
    group.push(version);
    versionsByTestCode.set(version.testCode, group);
  }

  for (const group of versionsByTestCode.values()) {
    if (group.length < 2) {
      continue;
    }
    const sorted = [...group].sort((a, b) => {
      const rangeA = rangesByVersionId.get(a.versionId) as ParsedRange;
      const rangeB = rangesByVersionId.get(b.versionId) as ParsedRange;
      return rangeA.fromMs - rangeB.fromMs || a.versionId.localeCompare(b.versionId);
    });
    let runningMaxEndMs = -Infinity;
    let runningMaxVersionId: string | undefined;
    for (const version of sorted) {
      const range = rangesByVersionId.get(version.versionId) as ParsedRange;
      if (range.fromMs < runningMaxEndMs) {
        return toResolution('versions-overlap', safeTestCode, safeResultTimestamp, {
          overlappingVersionIds: [runningMaxVersionId as string, version.versionId],
        });
      }
      if (range.toMs > runningMaxEndMs) {
        runningMaxEndMs = range.toMs;
        runningMaxVersionId = version.versionId;
      }
    }
  }

  const resultTimestampMs = parseUtcInstant(safeResultTimestamp);
  if (resultTimestampMs === undefined) {
    return toResolution('result-timestamp-invalid', safeTestCode, safeResultTimestamp);
  }

  if (!isNonEmptyString(safeTestCode)) {
    return toResolution('test-code-unknown', safeTestCode, safeResultTimestamp);
  }

  const candidates = versions.filter((version) => version.testCode === safeTestCode);
  if (candidates.length === 0) {
    return toResolution('test-code-unknown', safeTestCode, safeResultTimestamp, {
      candidateVersionCount: 0,
    });
  }

  const inForce = candidates.find((version) => {
    const range = rangesByVersionId.get(version.versionId) as ParsedRange;
    return resultTimestampMs >= range.fromMs && resultTimestampMs < range.toMs;
  });

  if (inForce === undefined) {
    return toResolution('no-version-in-force', safeTestCode, safeResultTimestamp, {
      candidateVersionCount: candidates.length,
    });
  }

  return toResolution('version-resolved', safeTestCode, safeResultTimestamp, {
    candidateVersionCount: candidates.length,
    version: {
      versionId: inForce.versionId,
      methodIdentifier: inForce.methodIdentifier,
      units: inForce.units,
      referenceInterval: { ...inForce.referenceInterval },
      effectiveFrom: inForce.effectiveFrom,
      effectiveTo: inForce.effectiveTo,
    },
  });
}
