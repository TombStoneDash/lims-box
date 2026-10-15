import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveEffectiveTestDefinition,
  type TestDefinitionVersion,
} from '../../lib/ohworks-effective-dating';

function version(overrides: Partial<TestDefinitionVersion> = {}): TestDefinitionVersion {
  return {
    versionId: 'synthetic-v1',
    testCode: 'SYNTH',
    methodIdentifier: 'synthetic-method',
    units: 'synthetic-units',
    referenceInterval: { lowerBound: 70, upperBound: 100 },
    effectiveFrom: '2024-01-01T00:00:00Z',
    effectiveTo: '2027-01-01T00:00:00Z',
    ...overrides,
  };
}

const invalidInstants = [
  '2026-02-30T00:00:00Z',
  '2026-04-31T00:00:00Z',
  '2026-02-29T00:00:00Z',
  '2026-06-01T24:00:00Z',
  '2026-06-01T00:60:00Z',
  '2026-06-01T00:00:60Z',
];

for (const instant of invalidInstants) {
  test(`rejects ${instant} as a result timestamp`, () => {
    const result = resolveEffectiveTestDefinition([version()], 'SYNTH', instant);
    assert.equal(result.decision, 'rejected');
    assert.equal(result.reasonCode, 'result-timestamp-invalid');
  });

  for (const field of ['effectiveFrom', 'effectiveTo'] as const) {
    test(`rejects ${instant} as ${field} anywhere in the catalog`, () => {
      const catalog = [
        version(),
        version({ versionId: 'synthetic-v2', testCode: 'OTHER', [field]: instant }),
      ];
      const result = resolveEffectiveTestDefinition(catalog, 'SYNTH', '2026-06-01T00:00:00Z');
      assert.equal(result.decision, 'rejected');
      assert.equal(result.reasonCode, 'version-timestamp-invalid');
    });
  }
}

test('accepts a leap day and fractional-second UTC instants', () => {
  const catalog = [version({
    effectiveFrom: '2024-02-29T00:00:00.123456789Z',
    effectiveTo: '2024-03-01T00:00:00.987654321Z',
  })];
  const result = resolveEffectiveTestDefinition(catalog, 'SYNTH', '2024-02-29T12:34:56.123456789Z');
  assert.equal(result.decision, 'resolved');
  assert.equal(result.reasonCode, 'version-resolved');
  assert.equal(result.version?.versionId, 'synthetic-v1');
});

test('applies century leap-year rules', () => {
  const leapDay = resolveEffectiveTestDefinition(
    [version({ effectiveFrom: '2000-02-29T00:00:00Z', effectiveTo: '2000-03-01T00:00:00Z' })],
    'SYNTH',
    '2000-02-29T12:00:00Z',
  );
  assert.equal(leapDay.reasonCode, 'version-resolved');

  const nonLeapDay = resolveEffectiveTestDefinition(
    [version({ effectiveFrom: '1900-02-29T00:00:00Z' })],
    'SYNTH',
    '2026-06-01T00:00:00Z',
  );
  assert.equal(nonLeapDay.reasonCode, 'version-timestamp-invalid');
});

test('rejects an inverted reference interval anywhere in the catalog', () => {
  const catalog = [
    version(),
    version({
      versionId: 'synthetic-v2',
      testCode: 'OTHER',
      referenceInterval: { lowerBound: 100, upperBound: 70 },
    }),
  ];
  const result = resolveEffectiveTestDefinition(catalog, 'SYNTH', '2026-06-01T00:00:00Z');
  assert.equal(result.decision, 'rejected');
  assert.equal(result.reasonCode, 'version-malformed');
});

test('resolves a version with equal reference interval bounds', () => {
  const result = resolveEffectiveTestDefinition(
    [version({ referenceInterval: { lowerBound: 70, upperBound: 70 } })],
    'SYNTH',
    '2026-06-01T00:00:00Z',
  );
  assert.equal(result.decision, 'resolved');
  assert.deepEqual(result.version?.referenceInterval, { lowerBound: 70, upperBound: 70 });
});
