import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveEffectiveTestDefinition,
  type TestDefinitionVersion,
} from '../../lib/ohworks-effective-dating';

/**
 * All fabricated: synthetic test codes, version ids, and made-up method
 * identifiers, units, and reference intervals. None of this represents a
 * real patient, instrument, or customer catalog.
 */
function version(overrides: Partial<TestDefinitionVersion> = {}): TestDefinitionVersion {
  return {
    versionId: 'v1',
    testCode: 'GLU',
    methodIdentifier: 'hexokinase-g6pd',
    units: 'mg/dL',
    referenceInterval: { lowerBound: 70, upperBound: 100 },
    effectiveFrom: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function twoConsecutiveVersions(): TestDefinitionVersion[] {
  return [
    version({
      versionId: 'v1',
      methodIdentifier: 'hexokinase-g6pd',
      effectiveFrom: '2024-01-01T00:00:00Z',
      effectiveTo: '2025-01-01T00:00:00Z',
    }),
    version({
      versionId: 'v2',
      methodIdentifier: 'glucose-oxidase',
      effectiveFrom: '2025-01-01T00:00:00Z',
    }),
  ];
}

// ---------------------------------------------------------------------------
// Golden path: resolution
// ---------------------------------------------------------------------------

test('resolves the single open-ended version covering the result timestamp', () => {
  const result = resolveEffectiveTestDefinition([version()], 'GLU', '2024-06-01T00:00:00Z');
  assert.equal(result.decision, 'resolved');
  assert.equal(result.reasonCode, 'version-resolved');
  assert.equal(result.candidateVersionCount, 1);
  assert.equal(result.version?.versionId, 'v1');
});

test('resolves the earlier of two consecutive versions when the timestamp falls in its window', () => {
  const result = resolveEffectiveTestDefinition(twoConsecutiveVersions(), 'GLU', '2024-06-01T00:00:00Z');
  assert.equal(result.decision, 'resolved');
  assert.equal(result.version?.versionId, 'v1');
  assert.equal(result.version?.methodIdentifier, 'hexokinase-g6pd');
});

test('resolves the later of two consecutive versions when the timestamp falls in its window', () => {
  const result = resolveEffectiveTestDefinition(twoConsecutiveVersions(), 'GLU', '2025-06-01T00:00:00Z');
  assert.equal(result.decision, 'resolved');
  assert.equal(result.version?.versionId, 'v2');
  assert.equal(result.version?.methodIdentifier, 'glucose-oxidase');
});

test('effective-from is inclusive: a timestamp exactly at the boundary resolves to the version starting there', () => {
  const result = resolveEffectiveTestDefinition(twoConsecutiveVersions(), 'GLU', '2025-01-01T00:00:00Z');
  assert.equal(result.decision, 'resolved');
  assert.equal(result.version?.versionId, 'v2');
});

test('effective-to is exclusive: a timestamp exactly at the boundary does not resolve to the ending version', () => {
  const result = resolveEffectiveTestDefinition(twoConsecutiveVersions(), 'GLU', '2024-12-31T23:59:59.999Z');
  assert.equal(result.decision, 'resolved');
  assert.equal(result.version?.versionId, 'v1');
});

test('an unrelated test code in the same catalog does not affect resolution', () => {
  const catalog = [...twoConsecutiveVersions(), version({ versionId: 'v3', testCode: 'CREAT' })];
  const result = resolveEffectiveTestDefinition(catalog, 'CREAT', '2024-06-01T00:00:00Z');
  assert.equal(result.decision, 'resolved');
  assert.equal(result.version?.versionId, 'v3');
  assert.equal(result.candidateVersionCount, 1);
});

// ---------------------------------------------------------------------------
// Gaps are reported explicitly, never resolved to the nearest version
// ---------------------------------------------------------------------------

test('a timestamp in the gap between two non-adjacent versions is no-version-in-force', () => {
  const catalog = [
    version({ versionId: 'v1', effectiveFrom: '2024-01-01T00:00:00Z', effectiveTo: '2024-06-01T00:00:00Z' }),
    version({ versionId: 'v2', effectiveFrom: '2024-09-01T00:00:00Z' }),
  ];
  const result = resolveEffectiveTestDefinition(catalog, 'GLU', '2024-07-01T00:00:00Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'no-version-in-force');
  assert.equal(result.version, undefined);
  assert.equal(result.candidateVersionCount, 2);
});

test('a timestamp before the earliest version is no-version-in-force', () => {
  const result = resolveEffectiveTestDefinition([version()], 'GLU', '2023-12-31T23:59:59Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'no-version-in-force');
});

test('a timestamp after the last closed version is no-version-in-force', () => {
  const catalog = [version({ effectiveTo: '2025-01-01T00:00:00Z' })];
  const result = resolveEffectiveTestDefinition(catalog, 'GLU', '2025-06-01T00:00:00Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'no-version-in-force');
});

// ---------------------------------------------------------------------------
// Fail closed: unknown test code
// ---------------------------------------------------------------------------

test('a test code with no declared versions is test-code-unknown', () => {
  const result = resolveEffectiveTestDefinition([version()], 'UNKNOWN', '2024-06-01T00:00:00Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'test-code-unknown');
  assert.equal(result.candidateVersionCount, 0);
});

test('a blank test code is test-code-unknown', () => {
  const result = resolveEffectiveTestDefinition([version()], '   ', '2024-06-01T00:00:00Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'test-code-unknown');
});

// ---------------------------------------------------------------------------
// Fail closed: overlapping versions
// ---------------------------------------------------------------------------

test('two overlapping versions of the same test code are rejected as versions-overlap', () => {
  const catalog = [
    version({ versionId: 'v1', effectiveFrom: '2024-01-01T00:00:00Z', effectiveTo: '2024-07-01T00:00:00Z' }),
    version({ versionId: 'v2', effectiveFrom: '2024-06-01T00:00:00Z' }),
  ];
  const result = resolveEffectiveTestDefinition(catalog, 'GLU', '2024-06-15T00:00:00Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'versions-overlap');
  assert.deepEqual(result.overlappingVersionIds, ['v1', 'v2']);
});

test('two open-ended versions of the same test code always overlap', () => {
  const catalog = [
    version({ versionId: 'v1', effectiveFrom: '2024-01-01T00:00:00Z' }),
    version({ versionId: 'v2', effectiveFrom: '2024-06-01T00:00:00Z' }),
  ];
  const result = resolveEffectiveTestDefinition(catalog, 'GLU', '2024-06-15T00:00:00Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'versions-overlap');
});

test('a version fully nested inside another version of the same test code is versions-overlap', () => {
  const catalog = [
    version({ versionId: 'v1', effectiveFrom: '2024-01-01T00:00:00Z', effectiveTo: '2025-01-01T00:00:00Z' }),
    version({ versionId: 'v2', effectiveFrom: '2024-03-01T00:00:00Z', effectiveTo: '2024-04-01T00:00:00Z' }),
  ];
  const result = resolveEffectiveTestDefinition(catalog, 'GLU', '2024-03-15T00:00:00Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'versions-overlap');
});

test('adjacent versions that touch at a shared boundary do not overlap', () => {
  const result = resolveEffectiveTestDefinition(twoConsecutiveVersions(), 'GLU', '2025-01-01T00:00:00Z');
  assert.equal(result.decision, 'resolved');
});

test('overlapping versions of a different test code do not block resolution of the requested test code', () => {
  const catalog = [
    ...twoConsecutiveVersions(),
    version({ versionId: 'v3', testCode: 'CREAT', effectiveFrom: '2024-01-01T00:00:00Z' }),
    version({ versionId: 'v4', testCode: 'CREAT', effectiveFrom: '2024-02-01T00:00:00Z' }),
  ];
  const result = resolveEffectiveTestDefinition(catalog, 'GLU', '2024-06-01T00:00:00Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'versions-overlap');
});

// ---------------------------------------------------------------------------
// Fail closed: inverted or zero-length ranges
// ---------------------------------------------------------------------------

test('an effective-to before effective-from is effective-range-inverted', () => {
  const catalog = [version({ effectiveFrom: '2024-06-01T00:00:00Z', effectiveTo: '2024-01-01T00:00:00Z' })];
  const result = resolveEffectiveTestDefinition(catalog, 'GLU', '2024-06-01T00:00:00Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'effective-range-inverted');
});

test('an effective-to equal to effective-from is effective-range-inverted', () => {
  const catalog = [version({ effectiveFrom: '2024-06-01T00:00:00Z', effectiveTo: '2024-06-01T00:00:00Z' })];
  const result = resolveEffectiveTestDefinition(catalog, 'GLU', '2024-06-01T00:00:00Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'effective-range-inverted');
});

// ---------------------------------------------------------------------------
// Fail closed: duplicate version ids
// ---------------------------------------------------------------------------

test('two catalog entries sharing a version id are version-id-duplicate', () => {
  const catalog = [
    version({ versionId: 'v1', effectiveFrom: '2024-01-01T00:00:00Z', effectiveTo: '2024-06-01T00:00:00Z' }),
    version({ versionId: 'v1', effectiveFrom: '2024-06-01T00:00:00Z' }),
  ];
  const result = resolveEffectiveTestDefinition(catalog, 'GLU', '2024-07-01T00:00:00Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'version-id-duplicate');
  assert.equal(result.duplicateVersionId, 'v1');
});

test('duplicate version ids across different test codes are still rejected', () => {
  const catalog = [version({ versionId: 'dup', testCode: 'GLU' }), version({ versionId: 'dup', testCode: 'CREAT' })];
  const result = resolveEffectiveTestDefinition(catalog, 'GLU', '2024-06-01T00:00:00Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'version-id-duplicate');
});

// ---------------------------------------------------------------------------
// Fail closed: non-UTC or non-finite timestamps in the catalog
// ---------------------------------------------------------------------------

test('a version effective-from with a non-UTC offset is version-timestamp-invalid', () => {
  const catalog = [version({ effectiveFrom: '2024-01-01T00:00:00+00:00' })];
  const result = resolveEffectiveTestDefinition(catalog, 'GLU', '2024-06-01T00:00:00Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'version-timestamp-invalid');
});

test('a version effective-from with no offset at all is version-timestamp-invalid', () => {
  const catalog = [version({ effectiveFrom: '2024-01-01T00:00:00' })];
  const result = resolveEffectiveTestDefinition(catalog, 'GLU', '2024-06-01T00:00:00Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'version-timestamp-invalid');
});

test('a version effective-from that is a calendar-invalid date is version-timestamp-invalid', () => {
  const catalog = [version({ effectiveFrom: '2024-13-40T00:00:00Z' })];
  const result = resolveEffectiveTestDefinition(catalog, 'GLU', '2024-06-01T00:00:00Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'version-timestamp-invalid');
});

test('a version effective-to with a non-UTC offset is version-timestamp-invalid', () => {
  const catalog = [version({ effectiveFrom: '2024-01-01T00:00:00Z', effectiveTo: '2024-06-01T00:00:00-05:00' })];
  const result = resolveEffectiveTestDefinition(catalog, 'GLU', '2024-03-01T00:00:00Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'version-timestamp-invalid');
});

// ---------------------------------------------------------------------------
// Fail closed: non-UTC or non-finite result timestamp
// ---------------------------------------------------------------------------

test('a result timestamp with a non-UTC offset is result-timestamp-invalid', () => {
  const result = resolveEffectiveTestDefinition([version()], 'GLU', '2024-06-01T00:00:00-05:00');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'result-timestamp-invalid');
});

test('a result timestamp with no timezone marker is result-timestamp-invalid', () => {
  const result = resolveEffectiveTestDefinition([version()], 'GLU', '2024-06-01T00:00:00');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'result-timestamp-invalid');
});

test('a result timestamp that is a calendar-invalid date is result-timestamp-invalid', () => {
  const result = resolveEffectiveTestDefinition([version()], 'GLU', '2024-13-40T00:00:00Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'result-timestamp-invalid');
});

test('a non-string result timestamp is result-timestamp-invalid', () => {
  const result = resolveEffectiveTestDefinition(
    [version()],
    'GLU',
    1717200000000 as unknown as string,
  );
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'result-timestamp-invalid');
});

test('a blank result timestamp is result-timestamp-invalid', () => {
  const result = resolveEffectiveTestDefinition([version()], 'GLU', '');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'result-timestamp-invalid');
});

// ---------------------------------------------------------------------------
// Fail closed: malformed catalog and entries
// ---------------------------------------------------------------------------

test('a non-array catalog is catalog-malformed', () => {
  const result = resolveEffectiveTestDefinition(
    null as unknown as TestDefinitionVersion[],
    'GLU',
    '2024-06-01T00:00:00Z',
  );
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'catalog-malformed');
});

test('an empty catalog is test-code-unknown, not a crash', () => {
  const result = resolveEffectiveTestDefinition([], 'GLU', '2024-06-01T00:00:00Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'test-code-unknown');
});

test('a catalog entry missing a required field is version-malformed', () => {
  const entries = [version()] as unknown as Array<Partial<TestDefinitionVersion>>;
  delete entries[0].methodIdentifier;
  const result = resolveEffectiveTestDefinition(
    entries as TestDefinitionVersion[],
    'GLU',
    '2024-06-01T00:00:00Z',
  );
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'version-malformed');
});

test('a catalog entry with a non-finite reference interval bound is version-malformed', () => {
  const catalog = [version({ referenceInterval: { lowerBound: NaN, upperBound: 100 } })];
  const result = resolveEffectiveTestDefinition(catalog, 'GLU', '2024-06-01T00:00:00Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'version-malformed');
});

test('a blank version id is version-malformed', () => {
  const catalog = [version({ versionId: '  ' })];
  const result = resolveEffectiveTestDefinition(catalog, 'GLU', '2024-06-01T00:00:00Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'version-malformed');
});

// ---------------------------------------------------------------------------
// Result shape is frozen and deterministic
// ---------------------------------------------------------------------------

test('the returned resolution and its resolved version are frozen', () => {
  const result = resolveEffectiveTestDefinition([version()], 'GLU', '2024-06-01T00:00:00Z');
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.version));
});

test('repeated resolution of the same input is byte-for-byte identical', () => {
  const catalog = twoConsecutiveVersions();
  const first = resolveEffectiveTestDefinition(catalog, 'GLU', '2024-06-01T00:00:00Z');
  const second = resolveEffectiveTestDefinition(catalog, 'GLU', '2024-06-01T00:00:00Z');
  assert.deepEqual(first, second);
});

test('every rejection has a fixed result shape with the same keys as a resolution', () => {
  const resolved = resolveEffectiveTestDefinition([version()], 'GLU', '2024-06-01T00:00:00Z');
  const rejected = resolveEffectiveTestDefinition([version()], 'UNKNOWN', '2024-06-01T00:00:00Z');
  assert.deepEqual(Object.keys(resolved).sort(), Object.keys(rejected).sort());
});
