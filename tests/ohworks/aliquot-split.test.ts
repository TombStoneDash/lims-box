import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AliquotSplitInputError,
  deriveChildAccessionId,
  explainAliquotSplitReason,
  planAliquotSplit,
  MAX_DERIVATION_DEPTH,
  type AliquotRequest,
  type AliquotSplitFailure,
  type AliquotSplitInput,
  type AliquotSplitReasonCode,
  type AliquotSplitSummary,
  type ParentSpecimen,
} from '../../lib/ohworks-aliquot-split';

function assertFailure(summary: AliquotSplitSummary, expected: AliquotSplitFailure): void {
  assert.equal(summary.status, 'INVALID');
  if (summary.status !== 'INVALID') return;
  assert.deepEqual(summary.failure, expected);
}

/**
 * All fabricated: synthetic accession ids, volumes, container types, and
 * purposes. None of this represents a real specimen, patient, or lab record.
 */
function baselineParent(overrides: Partial<ParentSpecimen> = {}): ParentSpecimen {
  return {
    accessionId: 'ACC-SYNTH-0001',
    volume: 10,
    containerType: 'VIAL',
    derivationDepth: 0,
    ...overrides,
  };
}

function baselineRequests(overrides: Partial<AliquotRequest>[] = []): AliquotRequest[] {
  const defaults: AliquotRequest[] = [
    { label: 'A', volume: 3, purpose: 'PRIMARY_ANALYSIS' },
    { label: 'B', volume: 2, purpose: 'QC_REPLICATE' },
  ];
  if (overrides.length === 0) {
    return defaults;
  }
  return overrides.map((o, i) => ({ ...defaults[i % defaults.length], ...o }));
}

function baselineInput(overrides: Partial<AliquotSplitInput> = {}): AliquotSplitInput {
  return {
    parent: baselineParent(),
    deadVolume: 1,
    requests: baselineRequests(),
    ...overrides,
  };
}

test('derives children with parent link, depth, and identifiers for a valid split', () => {
  const summary = planAliquotSplit(baselineInput());
  assert.equal(summary.status, 'VALID');
  if (summary.status !== 'VALID') return;
  assert.equal(summary.parentAccessionId, 'ACC-SYNTH-0001');
  assert.deepEqual(summary.children, [
    {
      childId: 'ACC-SYNTH-0001-A',
      parentAccessionId: 'ACC-SYNTH-0001',
      derivationDepth: 1,
      containerType: 'VIAL',
      purpose: 'PRIMARY_ANALYSIS',
      volume: 3,
    },
    {
      childId: 'ACC-SYNTH-0001-B',
      parentAccessionId: 'ACC-SYNTH-0001',
      derivationDepth: 1,
      containerType: 'VIAL',
      purpose: 'QC_REPLICATE',
      volume: 2,
    },
  ]);
});

test('accepts an exact match between requested volume, dead volume, and parent volume', () => {
  const summary = planAliquotSplit(
    baselineInput({
      parent: baselineParent({ volume: 5 }),
      deadVolume: 1,
      requests: baselineRequests([{ volume: 3 }, { volume: 1 }]),
    }),
  );
  assert.equal(summary.status, 'VALID');
});

test('derives child accession ids from the parent accession id and label', () => {
  assert.equal(deriveChildAccessionId('ACC-SYNTH-0001', 'A'), 'ACC-SYNTH-0001-A');
});

test('rejects over-allocation when requested volume plus dead volume exceeds parent volume', () => {
  const summary = planAliquotSplit(
    baselineInput({
      parent: baselineParent({ volume: 5 }),
      deadVolume: 1,
      requests: baselineRequests([{ volume: 3 }, { volume: 2 }]),
    }),
  );
  assertFailure(summary, { code: 'over-allocation' });
});

test('rejects a zero aliquot volume', () => {
  const summary = planAliquotSplit(baselineInput({ requests: baselineRequests([{ volume: 0 }, { volume: 2 }]) }));
  assertFailure(summary, { requestIndex: 0, code: 'aliquot-volume-invalid' });
});

test('rejects a negative aliquot volume', () => {
  const summary = planAliquotSplit(baselineInput({ requests: baselineRequests([{ volume: -1 }, { volume: 2 }]) }));
  assertFailure(summary, { requestIndex: 0, code: 'aliquot-volume-invalid' });
});

test('rejects a zero parent volume', () => {
  const summary = planAliquotSplit(baselineInput({ parent: baselineParent({ volume: 0 }) }));
  assertFailure(summary, { code: 'parent-volume-invalid' });
});

test('rejects a negative parent volume', () => {
  const summary = planAliquotSplit(baselineInput({ parent: baselineParent({ volume: -5 }) }));
  assertFailure(summary, { code: 'parent-volume-invalid' });
});

test('rejects a negative dead volume', () => {
  const summary = planAliquotSplit(baselineInput({ deadVolume: -1 }));
  assertFailure(summary, { code: 'dead-volume-invalid' });
});

test('accepts a zero dead volume', () => {
  const summary = planAliquotSplit(baselineInput({ deadVolume: 0 }));
  assert.equal(summary.status, 'VALID');
});

test('rejects an unknown purpose', () => {
  const summary = planAliquotSplit(
    baselineInput({ requests: baselineRequests([{ purpose: 'MYSTERY_PURPOSE' as AliquotRequest['purpose'] }, {}]) }),
  );
  assertFailure(summary, { requestIndex: 0, code: 'purpose-unknown' });
});

test('rejects duplicate child identifiers from a reused label', () => {
  const summary = planAliquotSplit(baselineInput({ requests: baselineRequests([{ label: 'A' }, { label: 'A' }]) }));
  assertFailure(summary, { requestIndex: 1, code: 'child-id-duplicate' });
});

test('rejects an empty request list', () => {
  const summary = planAliquotSplit(baselineInput({ requests: [] }));
  assertFailure(summary, { code: 'requests-empty' });
});

test('rejects a split from a parent already at the maximum derivation depth', () => {
  const summary = planAliquotSplit(
    baselineInput({ parent: baselineParent({ derivationDepth: MAX_DERIVATION_DEPTH }) }),
  );
  assertFailure(summary, { code: 'derivation-depth-exceeded' });
});

test('accepts a split from a parent one level below the maximum derivation depth', () => {
  const summary = planAliquotSplit(
    baselineInput({ parent: baselineParent({ derivationDepth: MAX_DERIVATION_DEPTH - 1 }) }),
  );
  assert.equal(summary.status, 'VALID');
  if (summary.status !== 'VALID') return;
  assert.equal(summary.children[0].derivationDepth, MAX_DERIVATION_DEPTH);
});

test('checks derivation depth before parent volume', () => {
  const summary = planAliquotSplit(
    baselineInput({ parent: baselineParent({ derivationDepth: MAX_DERIVATION_DEPTH, volume: -1 }) }),
  );
  assertFailure(summary, { code: 'derivation-depth-exceeded' });
});

test('checks per-request rules in the documented priority order', () => {
  const summary = planAliquotSplit(
    baselineInput({
      requests: baselineRequests([
        { volume: -1, purpose: 'MYSTERY_PURPOSE' as AliquotRequest['purpose'], label: 'A' },
        { label: 'A' },
      ]),
    }),
  );
  assertFailure(summary, { requestIndex: 0, code: 'aliquot-volume-invalid' });
});

test('throws AliquotSplitInputError for non-object input', () => {
  assert.throws(
    () => planAliquotSplit('not-an-object'),
    (error: unknown) => error instanceof AliquotSplitInputError && error.code === 'input-malformed',
  );
});

test('throws AliquotSplitInputError for a malformed parent', () => {
  assert.throws(
    () => planAliquotSplit(baselineInput({ parent: { ...baselineParent(), accessionId: '' } })),
    (error: unknown) => error instanceof AliquotSplitInputError && error.code === 'parent-malformed',
  );
});

test('throws AliquotSplitInputError for an unknown container type', () => {
  assert.throws(
    () =>
      planAliquotSplit(
        baselineInput({ parent: { ...baselineParent(), containerType: 'BEAKER' as ParentSpecimen['containerType'] } }),
      ),
    (error: unknown) => error instanceof AliquotSplitInputError && error.code === 'parent-malformed',
  );
});

test('throws AliquotSplitInputError for a non-finite dead volume', () => {
  assert.throws(
    () => planAliquotSplit(baselineInput({ deadVolume: Number.NaN })),
    (error: unknown) => error instanceof AliquotSplitInputError && error.code === 'dead-volume-malformed',
  );
});

test('throws AliquotSplitInputError when requests is not an array', () => {
  assert.throws(
    () => planAliquotSplit(baselineInput({ requests: 'not-an-array' as unknown as AliquotRequest[] })),
    (error: unknown) => error instanceof AliquotSplitInputError && error.code === 'requests-not-array',
  );
});

test('throws AliquotSplitInputError for a malformed request', () => {
  assert.throws(
    () => planAliquotSplit(baselineInput({ requests: [{ label: 'A' }] as unknown as AliquotRequest[] })),
    (error: unknown) => error instanceof AliquotSplitInputError && error.code === 'request-malformed',
  );
});

test('throws AliquotSplitInputError for a non-object request', () => {
  assert.throws(
    () => planAliquotSplit(baselineInput({ requests: [null] as unknown as AliquotRequest[] })),
    (error: unknown) => error instanceof AliquotSplitInputError && error.code === 'request-malformed',
  );
});

test('explainAliquotSplitReason covers every reason code', () => {
  const codes: AliquotSplitReasonCode[] = [
    'derivation-depth-exceeded',
    'parent-volume-invalid',
    'dead-volume-invalid',
    'requests-empty',
    'aliquot-volume-invalid',
    'purpose-unknown',
    'child-id-duplicate',
    'over-allocation',
  ];
  for (const code of codes) {
    const reason = explainAliquotSplitReason(code);
    assert.equal(typeof reason, 'string');
    assert.ok(reason.length > 0);
  }
});
