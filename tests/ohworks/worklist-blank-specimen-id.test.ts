import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWorklistPlan,
  explainWorklistSequencingError,
  WorklistSequencingError,
  type WorklistSpecimen,
} from '../../lib/ohworks-worklist';

// Synthetic identifiers only; casts exercise malformed runtime input.
function planForIds(ids: unknown[]) {
  return buildWorklistPlan({
    specimens: ids.map((specimenId, index) => ({
      specimenId: specimenId as WorklistSpecimen['specimenId'],
      priority: 'stat',
      accessionSequence: index + 1,
    })),
    bracketingRule: { everyNSamples: 100, qcSampleId: 'QC-SYNTHETIC' },
    maxRunLength: 20,
  });
}

for (const [label, value] of [
  ['empty', ''],
  ['spaces', '   '],
  ['mixed whitespace', '\t\r\n\u00a0'],
  ['null', null],
  ['number', 42],
  ['undefined', undefined],
  ['boolean', false],
  ['object', {}],
] as const) {
  test(`rejects ${label} specimen ID with a typed sequencing error`, () => {
    assert.throws(
      () => planForIds([value]),
      (error: unknown) =>
        error instanceof WorklistSequencingError && error.code === 'invalid-specimen-id',
    );
  });
}

test('invalid specimen ID has an explanatory error message', () => {
  const message = explainWorklistSequencingError('invalid-specimen-id');
  assert.equal(typeof message, 'string');
  assert.ok(message.length > 0);
});

test('valid specimen IDs remain byte-identical and distinct with surrounding whitespace', () => {
  const ids = ['SPEC-1', ' SPEC-1', 'SPEC-1 ', '\tSPEC-1\n'];
  const plan = planForIds(ids);
  assert.equal(plan.runs.length, 1);
  assert.deepEqual(
    plan.runs[0].entries.map((entry) => entry.kind),
    ['qc', 'patient', 'patient', 'patient', 'patient', 'qc'],
  );
  assert.deepEqual(
    plan.runs[0].entries.filter((entry) => entry.kind === 'patient').map((entry) => entry.specimenId),
    ids,
  );
  assert.deepEqual(plan.brackets, [
    { runIndex: 0, startPosition: 0, intervalPositions: [], endPosition: 5 },
  ]);
});

for (const id of ['SPEC-1', ' SPEC-1 ']) {
  test(`still rejects exact duplicate specimen ID ${JSON.stringify(id)}`, () => {
    assert.throws(
      () => planForIds([id, id]),
      (error: unknown) =>
        error instanceof WorklistSequencingError && error.code === 'specimen-id-duplicate',
    );
  });
}
