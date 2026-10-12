import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DERIVATION_ACTION,
  mergeCustodyChains,
  type ChildCustodyChain,
  type CustodyMergeFailure,
  type CustodyMergeSummary,
  type SpecimenCustodyChain,
} from '../../lib/ohworks-custody-merge';

function assertFailure(summary: CustodyMergeSummary, expected: CustodyMergeFailure): void {
  assert.equal(summary.status, 'INVALID');
  if (summary.status !== 'INVALID') return;
  assert.deepEqual(summary.failure, expected);
}

/**
 * All fabricated: synthetic specimen ids, actors, and timestamps.
 * None of this represents a real specimen, patient, or lab record.
 */
function inputWithChildTimestamp(timestamp: string): {
  maxGapMs: number;
  parent: SpecimenCustodyChain;
  children: ChildCustodyChain[];
} {
  return {
    maxGapMs: 3_600_000,
    parent: {
      specimenId: 'P1',
      events: [{ actor: 'a', action: DERIVATION_ACTION, timestamp: '2026-03-01T10:00:01.000Z' }],
    },
    children: [
      {
        specimenId: 'C1',
        parentId: 'P1',
        events: [{ actor: 'b', action: 'RECEIVE', timestamp }],
      },
    ],
  };
}

test('regression: a child event at .9996 fractional seconds before the parent SPLIT is truncated, not rounded, and is flagged', () => {
  const summary = mergeCustodyChains(inputWithChildTimestamp('2026-03-01T10:00:00.9996Z'));
  assertFailure(summary, {
    specimenId: 'C1',
    relatedSpecimenId: 'P1',
    code: 'child-precedes-derivation',
  });
});

test('neighbor: a child event exactly at the parent SPLIT timestamp stays VALID', () => {
  const summary = mergeCustodyChains(inputWithChildTimestamp('2026-03-01T10:00:01.000Z'));
  assert.equal(summary.status, 'VALID');
});

test('neighbor: a child event at .999 fractional seconds before the parent SPLIT stays INVALID', () => {
  const summary = mergeCustodyChains(inputWithChildTimestamp('2026-03-01T10:00:00.999Z'));
  assertFailure(summary, {
    specimenId: 'C1',
    relatedSpecimenId: 'P1',
    code: 'child-precedes-derivation',
  });
});

test('neighbor: timestamps without a fractional part are unaffected by the truncation change', () => {
  const beforeSplit = mergeCustodyChains(inputWithChildTimestamp('2026-03-01T10:00:00Z'));
  assertFailure(beforeSplit, {
    specimenId: 'C1',
    relatedSpecimenId: 'P1',
    code: 'child-precedes-derivation',
  });

  const atSplit = mergeCustodyChains(inputWithChildTimestamp('2026-03-01T10:00:01Z'));
  assert.equal(atSplit.status, 'VALID');
});
