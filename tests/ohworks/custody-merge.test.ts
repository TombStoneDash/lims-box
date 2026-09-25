import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CustodyMergeInputError,
  DERIVATION_ACTION,
  explainCustodyMergeReason,
  mergeCustodyChains,
  type ChildCustodyChain,
  type CustodyMergeFailure,
  type CustodyMergeInput,
  type CustodyMergeReasonCode,
  type CustodyMergeSummary,
  type SpecimenCustodyChain,
} from '../../lib/ohworks-custody-merge';

function assertFailure(summary: CustodyMergeSummary, expected: CustodyMergeFailure): void {
  assert.equal(summary.status, 'INVALID');
  if (summary.status !== 'INVALID') return;
  assert.deepEqual(summary.failure, expected);
}

/**
 * All fabricated: synthetic specimen ids, actors, actions, and timestamps.
 * None of this represents a real specimen, patient, or lab record.
 */
function baselineParent(overrides: Partial<SpecimenCustodyChain> = {}): SpecimenCustodyChain {
  return {
    specimenId: 'SPEC-SYNTH-0001',
    events: [
      { actor: 'ANALYST-1', action: 'COLLECTED', timestamp: '2026-01-01T00:00:00.000Z' },
      { actor: 'ANALYST-1', action: DERIVATION_ACTION, timestamp: '2026-01-01T01:00:00.000Z' },
    ],
    ...overrides,
  };
}

function baselineChildren(overrides: Partial<ChildCustodyChain>[] = []): ChildCustodyChain[] {
  const defaults: ChildCustodyChain[] = [
    {
      specimenId: 'SPEC-SYNTH-0001-A',
      parentId: 'SPEC-SYNTH-0001',
      events: [{ actor: 'ANALYST-2', action: 'RECEIVED', timestamp: '2026-01-01T01:30:00.000Z' }],
    },
    {
      specimenId: 'SPEC-SYNTH-0001-B',
      parentId: 'SPEC-SYNTH-0001',
      events: [{ actor: 'ANALYST-3', action: 'RECEIVED', timestamp: '2026-01-01T02:00:00.000Z' }],
    },
  ];
  if (overrides.length === 0) {
    return defaults;
  }
  return overrides.map((o, i) => ({ ...defaults[i % defaults.length], ...o }));
}

function baselineInput(overrides: Partial<CustodyMergeInput> = {}): CustodyMergeInput {
  return {
    parent: baselineParent(),
    children: baselineChildren(),
    maxGapMs: 3_600_000,
    ...overrides,
  };
}

test('merges parent and child events into one timeline ordered by time with specimen ids attached', () => {
  const summary = mergeCustodyChains(baselineInput());
  assert.equal(summary.status, 'VALID');
  if (summary.status !== 'VALID') return;
  assert.equal(summary.parentId, 'SPEC-SYNTH-0001');
  assert.deepEqual(summary.timeline, [
    { specimenId: 'SPEC-SYNTH-0001', actor: 'ANALYST-1', action: 'COLLECTED', timestamp: '2026-01-01T00:00:00.000Z' },
    {
      specimenId: 'SPEC-SYNTH-0001',
      actor: 'ANALYST-1',
      action: DERIVATION_ACTION,
      timestamp: '2026-01-01T01:00:00.000Z',
    },
    {
      specimenId: 'SPEC-SYNTH-0001-A',
      actor: 'ANALYST-2',
      action: 'RECEIVED',
      timestamp: '2026-01-01T01:30:00.000Z',
    },
    {
      specimenId: 'SPEC-SYNTH-0001-B',
      actor: 'ANALYST-3',
      action: 'RECEIVED',
      timestamp: '2026-01-01T02:00:00.000Z',
    },
  ]);
  assert.deepEqual(summary.gaps, []);
});

test('reorders out-of-order caller-supplied events by timestamp', () => {
  const summary = mergeCustodyChains(
    baselineInput({
      children: baselineChildren([
        { events: [{ actor: 'ANALYST-3', action: 'RECEIVED', timestamp: '2026-01-01T02:00:00.000Z' }] },
        { events: [{ actor: 'ANALYST-2', action: 'RECEIVED', timestamp: '2026-01-01T01:30:00.000Z' }] },
      ]),
    }),
  );
  assert.equal(summary.status, 'VALID');
  if (summary.status !== 'VALID') return;
  assert.deepEqual(
    summary.timeline.map((row) => row.specimenId),
    ['SPEC-SYNTH-0001', 'SPEC-SYNTH-0001', 'SPEC-SYNTH-0001-B', 'SPEC-SYNTH-0001-A'],
  );
});

test('breaks ties at the same timestamp by specimen id', () => {
  const summary = mergeCustodyChains(
    baselineInput({
      children: baselineChildren([
        { events: [{ actor: 'ANALYST-2', action: 'RECEIVED', timestamp: '2026-01-01T01:30:00.000Z' }] },
        { events: [{ actor: 'ANALYST-3', action: 'RECEIVED', timestamp: '2026-01-01T01:30:00.000Z' }] },
      ]),
    }),
  );
  assert.equal(summary.status, 'VALID');
  if (summary.status !== 'VALID') return;
  assert.deepEqual(
    summary.timeline.slice(2).map((row) => row.specimenId),
    ['SPEC-SYNTH-0001-A', 'SPEC-SYNTH-0001-B'],
  );
});

test('does not flag a gap exactly equal to the declared maximum', () => {
  const summary = mergeCustodyChains(baselineInput({ maxGapMs: 3_600_000 }));
  assert.equal(summary.status, 'VALID');
  if (summary.status !== 'VALID') return;
  assert.deepEqual(summary.gaps, []);
});

test('flags a gap strictly longer than the declared maximum', () => {
  const summary = mergeCustodyChains(
    baselineInput({
      children: baselineChildren([
        { events: [{ actor: 'ANALYST-2', action: 'RECEIVED', timestamp: '2026-01-01T05:00:00.000Z' }] },
        { events: [{ actor: 'ANALYST-3', action: 'RECEIVED', timestamp: '2026-01-01T05:30:00.000Z' }] },
      ]),
      maxGapMs: 3_600_000,
    }),
  );
  assert.equal(summary.status, 'VALID');
  if (summary.status !== 'VALID') return;
  assert.deepEqual(summary.gaps, [
    {
      afterSpecimenId: 'SPEC-SYNTH-0001',
      afterTimestamp: '2026-01-01T01:00:00.000Z',
      beforeSpecimenId: 'SPEC-SYNTH-0001-A',
      beforeTimestamp: '2026-01-01T05:00:00.000Z',
      gapMs: 14_400_000,
    },
  ]);
});

test('merges a grandchild derived from a child, checked against the child’s own derivation event', () => {
  const grandchild: ChildCustodyChain = {
    specimenId: 'SPEC-SYNTH-0001-A-1',
    parentId: 'SPEC-SYNTH-0001-A',
    events: [{ actor: 'ANALYST-4', action: 'RECEIVED', timestamp: '2026-01-01T03:00:00.000Z' }],
  };
  const summary = mergeCustodyChains(
    baselineInput({
      children: [
        {
          specimenId: 'SPEC-SYNTH-0001-A',
          parentId: 'SPEC-SYNTH-0001',
          events: [
            { actor: 'ANALYST-2', action: 'RECEIVED', timestamp: '2026-01-01T01:30:00.000Z' },
            { actor: 'ANALYST-2', action: DERIVATION_ACTION, timestamp: '2026-01-01T02:30:00.000Z' },
          ],
        },
        grandchild,
      ],
    }),
  );
  assert.equal(summary.status, 'VALID');
  if (summary.status !== 'VALID') return;
  assert.ok(summary.timeline.some((row) => row.specimenId === 'SPEC-SYNTH-0001-A-1'));
});

test('rejects a grandchild whose first event precedes its own parent’s derivation event', () => {
  const grandchild: ChildCustodyChain = {
    specimenId: 'SPEC-SYNTH-0001-A-1',
    parentId: 'SPEC-SYNTH-0001-A',
    events: [{ actor: 'ANALYST-4', action: 'RECEIVED', timestamp: '2026-01-01T02:00:00.000Z' }],
  };
  const summary = mergeCustodyChains(
    baselineInput({
      children: [
        {
          specimenId: 'SPEC-SYNTH-0001-A',
          parentId: 'SPEC-SYNTH-0001',
          events: [
            { actor: 'ANALYST-2', action: 'RECEIVED', timestamp: '2026-01-01T01:30:00.000Z' },
            { actor: 'ANALYST-2', action: DERIVATION_ACTION, timestamp: '2026-01-01T02:30:00.000Z' },
          ],
        },
        grandchild,
      ],
    }),
  );
  assertFailure(summary, {
    specimenId: 'SPEC-SYNTH-0001-A-1',
    relatedSpecimenId: 'SPEC-SYNTH-0001-A',
    code: 'child-precedes-derivation',
  });
});

test('rejects a child whose earliest event precedes the parent’s derivation event', () => {
  const summary = mergeCustodyChains(
    baselineInput({
      children: baselineChildren([
        { events: [{ actor: 'ANALYST-2', action: 'RECEIVED', timestamp: '2026-01-01T00:30:00.000Z' }] },
      ]),
    }),
  );
  assertFailure(summary, {
    specimenId: 'SPEC-SYNTH-0001-A',
    relatedSpecimenId: 'SPEC-SYNTH-0001',
    code: 'child-precedes-derivation',
  });
});

test('accepts a child event exactly at the parent’s derivation event timestamp', () => {
  const summary = mergeCustodyChains(
    baselineInput({
      children: baselineChildren([
        { events: [{ actor: 'ANALYST-2', action: 'RECEIVED', timestamp: '2026-01-01T01:00:00.000Z' }] },
      ]),
    }),
  );
  assert.equal(summary.status, 'VALID');
});

test('rejects a parent with no derivation event when it has referenced children', () => {
  const summary = mergeCustodyChains(
    baselineInput({
      parent: baselineParent({ events: [{ actor: 'ANALYST-1', action: 'COLLECTED', timestamp: '2026-01-01T00:00:00.000Z' }] }),
    }),
  );
  assertFailure(summary, { specimenId: 'SPEC-SYNTH-0001', code: 'derivation-event-missing' });
});

test('rejects a parent with more than one derivation event', () => {
  const summary = mergeCustodyChains(
    baselineInput({
      parent: baselineParent({
        events: [
          { actor: 'ANALYST-1', action: DERIVATION_ACTION, timestamp: '2026-01-01T00:00:00.000Z' },
          { actor: 'ANALYST-1', action: DERIVATION_ACTION, timestamp: '2026-01-01T00:30:00.000Z' },
        ],
      }),
    }),
  );
  assertFailure(summary, { specimenId: 'SPEC-SYNTH-0001', code: 'derivation-event-duplicate' });
});

test('does not require a derivation event on a parent with no children', () => {
  const summary = mergeCustodyChains(
    baselineInput({
      parent: baselineParent({ events: [{ actor: 'ANALYST-1', action: 'COLLECTED', timestamp: '2026-01-01T00:00:00.000Z' }] }),
      children: [],
    }),
  );
  assert.equal(summary.status, 'VALID');
  if (summary.status !== 'VALID') return;
  assert.deepEqual(summary.timeline, [
    { specimenId: 'SPEC-SYNTH-0001', actor: 'ANALYST-1', action: 'COLLECTED', timestamp: '2026-01-01T00:00:00.000Z' },
  ]);
});

test('rejects a non-positive declared maximum gap', () => {
  const summary = mergeCustodyChains(baselineInput({ maxGapMs: 0 }));
  assertFailure(summary, { specimenId: 'SPEC-SYNTH-0001', code: 'max-gap-invalid' });
});

test('rejects a negative declared maximum gap', () => {
  const summary = mergeCustodyChains(baselineInput({ maxGapMs: -1 }));
  assertFailure(summary, { specimenId: 'SPEC-SYNTH-0001', code: 'max-gap-invalid' });
});

test('rejects an unparsable event timestamp', () => {
  const summary = mergeCustodyChains(
    baselineInput({
      children: baselineChildren([{ events: [{ actor: 'ANALYST-2', action: 'RECEIVED', timestamp: 'not-a-date' }] }]),
    }),
  );
  assertFailure(summary, { specimenId: 'SPEC-SYNTH-0001-A', code: 'timestamp-invalid' });
});

test('rejects a calendar-invalid event timestamp', () => {
  const summary = mergeCustodyChains(
    baselineInput({
      children: baselineChildren([
        { events: [{ actor: 'ANALYST-2', action: 'RECEIVED', timestamp: '2026-02-30T00:00:00.000Z' }] },
      ]),
    }),
  );
  assertFailure(summary, { specimenId: 'SPEC-SYNTH-0001-A', code: 'timestamp-invalid' });
});

test('rejects a timestamp without an explicit timezone designator', () => {
  const summary = mergeCustodyChains(
    baselineInput({
      children: baselineChildren([
        { events: [{ actor: 'ANALYST-2', action: 'RECEIVED', timestamp: '2026-01-01T01:30:00.000' }] },
      ]),
    }),
  );
  assertFailure(summary, { specimenId: 'SPEC-SYNTH-0001-A', code: 'timestamp-invalid' });
});

test('throws CustodyMergeInputError for non-object input', () => {
  assert.throws(
    () => mergeCustodyChains('not-an-object'),
    (error: unknown) => error instanceof CustodyMergeInputError && error.code === 'input-malformed',
  );
});

test('throws CustodyMergeInputError for a malformed parent', () => {
  assert.throws(
    () => mergeCustodyChains(baselineInput({ parent: { ...baselineParent(), specimenId: '' } })),
    (error: unknown) => error instanceof CustodyMergeInputError && error.code === 'parent-malformed',
  );
});

test('throws CustodyMergeInputError when parent events is not an array', () => {
  assert.throws(
    () =>
      mergeCustodyChains(
        baselineInput({ parent: { ...baselineParent(), events: 'not-an-array' as unknown as SpecimenCustodyChain['events'] } }),
      ),
    (error: unknown) => error instanceof CustodyMergeInputError && error.code === 'parent-malformed',
  );
});

test('throws CustodyMergeInputError when children is not an array', () => {
  assert.throws(
    () => mergeCustodyChains(baselineInput({ children: 'not-an-array' as unknown as ChildCustodyChain[] })),
    (error: unknown) => error instanceof CustodyMergeInputError && error.code === 'children-not-array',
  );
});

test('throws CustodyMergeInputError for a child missing a parentId', () => {
  const [first, ...rest] = baselineChildren();
  const { parentId, ...withoutParentId } = first;
  assert.throws(
    () => mergeCustodyChains(baselineInput({ children: [withoutParentId as unknown as ChildCustodyChain, ...rest] })),
    (error: unknown) => error instanceof CustodyMergeInputError && error.code === 'child-malformed',
  );
});

test('throws CustodyMergeInputError for a child event missing a required field', () => {
  const summary = () =>
    mergeCustodyChains(
      baselineInput({
        children: baselineChildren([
          { events: [{ actor: 'ANALYST-2', timestamp: '2026-01-01T01:30:00.000Z' } as unknown as ChildCustodyChain['events'][number]] },
        ]),
      }),
    );
  assert.throws(summary, (error: unknown) => error instanceof CustodyMergeInputError && error.code === 'child-malformed');
});

test('throws CustodyMergeInputError for a non-finite declared maximum gap', () => {
  assert.throws(
    () => mergeCustodyChains(baselineInput({ maxGapMs: Number.NaN })),
    (error: unknown) => error instanceof CustodyMergeInputError && error.code === 'max-gap-malformed',
  );
});

test('throws CustodyMergeInputError when a child reuses the parent’s specimen id', () => {
  assert.throws(
    () =>
      mergeCustodyChains(
        baselineInput({
          children: baselineChildren([{ specimenId: 'SPEC-SYNTH-0001' }]),
        }),
      ),
    (error: unknown) => error instanceof CustodyMergeInputError && error.code === 'specimen-id-duplicate',
  );
});

test('throws CustodyMergeInputError when two children share a specimen id', () => {
  assert.throws(
    () =>
      mergeCustodyChains(
        baselineInput({
          children: baselineChildren([{}, { specimenId: 'SPEC-SYNTH-0001-A' }]),
        }),
      ),
    (error: unknown) => error instanceof CustodyMergeInputError && error.code === 'specimen-id-duplicate',
  );
});

test('throws CustodyMergeInputError when a child references an unknown parent id', () => {
  assert.throws(
    () =>
      mergeCustodyChains(
        baselineInput({
          children: baselineChildren([{ parentId: 'SPEC-DOES-NOT-EXIST' }]),
        }),
      ),
    (error: unknown) => error instanceof CustodyMergeInputError && error.code === 'unknown-child-identifier',
  );
});

test('throws CustodyMergeInputError for a self-referencing parent id', () => {
  assert.throws(
    () =>
      mergeCustodyChains(
        baselineInput({
          children: baselineChildren([{ specimenId: 'SPEC-SYNTH-0001-A', parentId: 'SPEC-SYNTH-0001-A' }]),
        }),
      ),
    (error: unknown) => error instanceof CustodyMergeInputError && error.code === 'cyclic-parent-reference',
  );
});

test('throws CustodyMergeInputError for a cycle formed between two children', () => {
  assert.throws(
    () =>
      mergeCustodyChains(
        baselineInput({
          children: [
            { specimenId: 'SPEC-SYNTH-0001-A', parentId: 'SPEC-SYNTH-0001-B', events: [] },
            { specimenId: 'SPEC-SYNTH-0001-B', parentId: 'SPEC-SYNTH-0001-A', events: [] },
          ],
        }),
      ),
    (error: unknown) => error instanceof CustodyMergeInputError && error.code === 'cyclic-parent-reference',
  );
});

test('explainCustodyMergeReason covers every reason code', () => {
  const codes: CustodyMergeReasonCode[] = [
    'max-gap-invalid',
    'timestamp-invalid',
    'derivation-event-missing',
    'derivation-event-duplicate',
    'child-precedes-derivation',
  ];
  for (const code of codes) {
    const reason = explainCustodyMergeReason(code);
    assert.equal(typeof reason, 'string');
    assert.ok(reason.length > 0);
  }
});
