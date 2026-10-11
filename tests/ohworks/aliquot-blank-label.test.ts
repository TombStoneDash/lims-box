import assert from 'node:assert/strict';
import test from 'node:test';

import { AliquotSplitInputError, planAliquotSplit, type ParentSpecimen } from '../../lib/ohworks-aliquot-split';

/**
 * All fabricated: synthetic accession ids, volumes, container types, and
 * purposes. None of this represents a real specimen, patient, or lab record.
 */
function baselineParent(overrides: Partial<ParentSpecimen> = {}): ParentSpecimen {
  return {
    accessionId: 'ACC-1',
    volume: 10,
    containerType: 'VIAL',
    derivationDepth: 0,
    ...overrides,
  };
}

for (const label of ['   ', '\t', ' A', 'A ']) {
  test(`rejects whitespace-only or padded label ${JSON.stringify(label)} as malformed`, () => {
    assert.throws(
      () =>
        planAliquotSplit({
          parent: baselineParent(),
          deadVolume: 0,
          requests: [{ label, volume: 1, purpose: 'QC_REPLICATE' }],
        }),
      (error: unknown) => {
        assert.ok(error instanceof AliquotSplitInputError);
        assert.equal(error.code, 'request-malformed');
        return true;
      },
    );
  });
}

for (const [label, expectedChildId] of [
  ['A', 'ACC-1-A'],
  ['QC-1', 'ACC-1-QC-1'],
] as const) {
  test(`still accepts clean label ${JSON.stringify(label)} as VALID`, () => {
    const summary = planAliquotSplit({
      parent: baselineParent(),
      deadVolume: 0,
      requests: [{ label, volume: 1, purpose: 'QC_REPLICATE' }],
    });
    assert.equal(summary.status, 'VALID');
    if (summary.status !== 'VALID') return;
    assert.equal(summary.children.length, 1);
    assert.equal(summary.children[0].childId, expectedChildId);
  });
}
