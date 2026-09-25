import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWorklistPlan,
  explainWorklistSequencingError,
  WorklistSequencingError,
  type QCBracketingRule,
  type WorklistPlanRequest,
  type WorklistSequencingErrorCode,
  type WorklistSpecimen,
} from '../../lib/ohworks-worklist';

/**
 * All fabricated: synthetic specimen and QC identifiers only. None of this
 * represents a real patient, specimen, or laboratory run.
 */
function specimen(overrides: Partial<WorklistSpecimen> = {}): WorklistSpecimen {
  return {
    specimenId: 'SPEC-1',
    priority: 'routine',
    accessionSequence: 1,
    ...overrides,
  };
}

function bracketingRule(overrides: Partial<QCBracketingRule> = {}): QCBracketingRule {
  return {
    everyNSamples: 2,
    qcSampleId: 'QC-CTRL',
    ...overrides,
  };
}

function request(overrides: Partial<WorklistPlanRequest> = {}): WorklistPlanRequest {
  return {
    specimens: [specimen()],
    bracketingRule: bracketingRule(),
    maxRunLength: 20,
    ...overrides,
  };
}

const ALL_ERROR_CODES: WorklistSequencingErrorCode[] = [
  'qc-interval-invalid',
  'qc-sample-id-invalid',
  'max-run-length-invalid',
  'max-run-length-too-small',
  'specimen-id-duplicate',
  'specimen-priority-unknown',
  'specimen-accession-sequence-invalid',
];

function assertThrowsCode(fn: () => unknown, code: WorklistSequencingErrorCode): void {
  assert.throws(
    fn,
    (error: unknown) => error instanceof WorklistSequencingError && error.code === code,
  );
}

// ---------------------------------------------------------------------------
// Golden paths
// ---------------------------------------------------------------------------

test('empty specimen list produces an empty plan with no runs or brackets', () => {
  const plan = buildWorklistPlan(request({ specimens: [], maxRunLength: 1 }));
  assert.deepEqual(plan, { runs: [], brackets: [] });
});

test('single specimen is bracketed with QC at start and end', () => {
  const plan = buildWorklistPlan(request({ specimens: [specimen({ specimenId: 'SPEC-1' })] }));

  assert.equal(plan.runs.length, 1);
  const [run] = plan.runs;
  assert.deepEqual(
    run.entries.map((entry) => entry.kind),
    ['qc', 'patient', 'qc'],
  );
  assert.equal(run.entries[0].kind, 'qc');
  assert.equal((run.entries[0] as { bracketKind: string }).bracketKind, 'start');
  assert.equal(run.entries[1].kind, 'patient');
  assert.equal((run.entries[1] as { specimenId: string }).specimenId, 'SPEC-1');
  assert.equal((run.entries[2] as { bracketKind: string }).bracketKind, 'end');

  assert.deepEqual(plan.brackets, [{ runIndex: 0, startPosition: 0, intervalPositions: [], endPosition: 2 }]);
});

test('orders the worklist by priority regardless of input order', () => {
  const specimens = [
    specimen({ specimenId: 'ROUTINE-1', priority: 'routine', accessionSequence: 1 }),
    specimen({ specimenId: 'STAT-1', priority: 'stat', accessionSequence: 2 }),
    specimen({ specimenId: 'URGENT-1', priority: 'urgent', accessionSequence: 3 }),
  ];
  const plan = buildWorklistPlan(request({ specimens, bracketingRule: bracketingRule({ everyNSamples: 100 }) }));

  const patientOrder = plan.runs
    .flatMap((run) => run.entries)
    .filter((entry) => entry.kind === 'patient')
    .map((entry) => (entry as { specimenId: string }).specimenId);

  assert.deepEqual(patientOrder, ['STAT-1', 'URGENT-1', 'ROUTINE-1']);
});

test('within the same priority, orders by ascending accession sequence', () => {
  const specimens = [
    specimen({ specimenId: 'B', priority: 'routine', accessionSequence: 5 }),
    specimen({ specimenId: 'A', priority: 'routine', accessionSequence: 1 }),
    specimen({ specimenId: 'C', priority: 'routine', accessionSequence: 3 }),
  ];
  const plan = buildWorklistPlan(request({ specimens, bracketingRule: bracketingRule({ everyNSamples: 100 }) }));

  const patientOrder = plan.runs
    .flatMap((run) => run.entries)
    .filter((entry) => entry.kind === 'patient')
    .map((entry) => (entry as { specimenId: string }).specimenId);

  assert.deepEqual(patientOrder, ['A', 'C', 'B']);
});

test('ties on priority and accession sequence break deterministically on specimen id', () => {
  const specimens = [
    specimen({ specimenId: 'ZEBRA', priority: 'routine', accessionSequence: 1 }),
    specimen({ specimenId: 'ALPHA', priority: 'routine', accessionSequence: 1 }),
  ];
  const plan = buildWorklistPlan(request({ specimens, bracketingRule: bracketingRule({ everyNSamples: 100 }) }));

  const patientOrder = plan.runs
    .flatMap((run) => run.entries)
    .filter((entry) => entry.kind === 'patient')
    .map((entry) => (entry as { specimenId: string }).specimenId);

  assert.deepEqual(patientOrder, ['ALPHA', 'ZEBRA']);
});

test('inserts QC after every N patient specimens within a single run', () => {
  const specimens = Array.from({ length: 5 }, (_, i) =>
    specimen({ specimenId: `SPEC-${i + 1}`, accessionSequence: i + 1 }),
  );
  const plan = buildWorklistPlan(
    request({ specimens, bracketingRule: bracketingRule({ everyNSamples: 2 }), maxRunLength: 20 }),
  );

  assert.equal(plan.runs.length, 1);
  const [run] = plan.runs;
  assert.deepEqual(
    run.entries.map((entry) => entry.kind),
    ['qc', 'patient', 'patient', 'qc', 'patient', 'patient', 'qc', 'patient', 'qc'],
  );
  assert.deepEqual(
    run.entries.map((entry) => (entry.kind === 'qc' ? entry.bracketKind : entry.specimenId)),
    ['start', 'SPEC-1', 'SPEC-2', 'interval', 'SPEC-3', 'SPEC-4', 'interval', 'SPEC-5', 'end'],
  );

  assert.deepEqual(plan.brackets, [{ runIndex: 0, startPosition: 0, intervalPositions: [3, 6], endPosition: 8 }]);
});

test('a final interval QC that lands exactly on the last patient specimen is reused as the end bracket', () => {
  const specimens = Array.from({ length: 4 }, (_, i) =>
    specimen({ specimenId: `SPEC-${i + 1}`, accessionSequence: i + 1 }),
  );
  const plan = buildWorklistPlan(
    request({ specimens, bracketingRule: bracketingRule({ everyNSamples: 2 }), maxRunLength: 20 }),
  );

  assert.equal(plan.runs.length, 1);
  const [run] = plan.runs;
  assert.deepEqual(
    run.entries.map((entry) => (entry.kind === 'qc' ? entry.bracketKind : entry.specimenId)),
    ['start', 'SPEC-1', 'SPEC-2', 'interval', 'SPEC-3', 'SPEC-4', 'end'],
  );
  // Only one QC entry follows SPEC-4: the interval QC that would have fired is reused as the end bracket.
  assert.equal(run.entries.length, 7);
  assert.deepEqual(plan.brackets, [{ runIndex: 0, startPosition: 0, intervalPositions: [3], endPosition: 6 }]);
});

test('splits into multiple runs, each independently bracketed, once the maximum run length is exceeded', () => {
  const specimens = Array.from({ length: 3 }, (_, i) =>
    specimen({ specimenId: `SPEC-${i + 1}`, accessionSequence: i + 1 }),
  );
  const plan = buildWorklistPlan(
    request({ specimens, bracketingRule: bracketingRule({ everyNSamples: 100 }), maxRunLength: 3 }),
  );

  assert.equal(plan.runs.length, 3);
  for (const [index, run] of plan.runs.entries()) {
    assert.equal(run.runIndex, index);
    assert.deepEqual(
      run.entries.map((entry) => entry.kind),
      ['qc', 'patient', 'qc'],
    );
    assert.equal((run.entries[1] as { specimenId: string }).specimenId, `SPEC-${index + 1}`);
  }
  assert.deepEqual(plan.brackets, [
    { runIndex: 0, startPosition: 0, intervalPositions: [], endPosition: 2 },
    { runIndex: 1, startPosition: 0, intervalPositions: [], endPosition: 2 },
    { runIndex: 2, startPosition: 0, intervalPositions: [], endPosition: 2 },
  ]);
});

test('generated QC specimen ids are unique across runs and bracket positions', () => {
  const specimens = Array.from({ length: 6 }, (_, i) =>
    specimen({ specimenId: `SPEC-${i + 1}`, accessionSequence: i + 1 }),
  );
  const plan = buildWorklistPlan(
    request({ specimens, bracketingRule: bracketingRule({ everyNSamples: 2 }), maxRunLength: 5 }),
  );

  const qcIds = plan.runs
    .flatMap((run) => run.entries)
    .filter((entry) => entry.kind === 'qc')
    .map((entry) => (entry as { specimenId: string }).specimenId);

  assert.equal(new Set(qcIds).size, qcIds.length);
  assert.ok(plan.runs.length > 1);
});

test('is deterministic across repeated calls with the same input', () => {
  const req = request({
    specimens: [
      specimen({ specimenId: 'A', priority: 'urgent', accessionSequence: 2 }),
      specimen({ specimenId: 'B', priority: 'stat', accessionSequence: 1 }),
      specimen({ specimenId: 'C', priority: 'routine', accessionSequence: 3 }),
    ],
    bracketingRule: bracketingRule({ everyNSamples: 2 }),
    maxRunLength: 6,
  });

  const first = buildWorklistPlan(req);
  const second = buildWorklistPlan(req);
  assert.deepEqual(first, second);
});

// ---------------------------------------------------------------------------
// Fail-closed behavior
// ---------------------------------------------------------------------------

test('every declared error code has an explanatory message', () => {
  for (const code of ALL_ERROR_CODES) {
    const message = explainWorklistSequencingError(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

test('rejects a zero QC interval', () => {
  assertThrowsCode(
    () => buildWorklistPlan(request({ bracketingRule: bracketingRule({ everyNSamples: 0 }) })),
    'qc-interval-invalid',
  );
});

test('rejects a negative QC interval', () => {
  assertThrowsCode(
    () => buildWorklistPlan(request({ bracketingRule: bracketingRule({ everyNSamples: -3 }) })),
    'qc-interval-invalid',
  );
});

test('rejects a non-integer QC interval', () => {
  assertThrowsCode(
    () => buildWorklistPlan(request({ bracketingRule: bracketingRule({ everyNSamples: 2.5 }) })),
    'qc-interval-invalid',
  );
});

test('rejects a non-finite QC interval', () => {
  assertThrowsCode(
    () => buildWorklistPlan(request({ bracketingRule: bracketingRule({ everyNSamples: Infinity }) })),
    'qc-interval-invalid',
  );
});

test('rejects an empty QC sample id', () => {
  assertThrowsCode(
    () => buildWorklistPlan(request({ bracketingRule: bracketingRule({ qcSampleId: '' }) })),
    'qc-sample-id-invalid',
  );
});

test('rejects a zero maximum run length', () => {
  assertThrowsCode(() => buildWorklistPlan(request({ maxRunLength: 0 })), 'max-run-length-invalid');
});

test('rejects a negative maximum run length', () => {
  assertThrowsCode(() => buildWorklistPlan(request({ maxRunLength: -5 })), 'max-run-length-invalid');
});

test('rejects a non-integer maximum run length', () => {
  assertThrowsCode(() => buildWorklistPlan(request({ maxRunLength: 3.5 })), 'max-run-length-invalid');
});

test('rejects a maximum run length too small to bracket even one specimen', () => {
  assertThrowsCode(() => buildWorklistPlan(request({ maxRunLength: 2 })), 'max-run-length-too-small');
});

test('allows a too-small maximum run length when there are no specimens to place', () => {
  const plan = buildWorklistPlan(request({ specimens: [], maxRunLength: 1 }));
  assert.deepEqual(plan, { runs: [], brackets: [] });
});

test('rejects duplicate specimen ids', () => {
  assertThrowsCode(
    () =>
      buildWorklistPlan(
        request({
          specimens: [specimen({ specimenId: 'DUP-1' }), specimen({ specimenId: 'DUP-1', accessionSequence: 2 })],
        }),
      ),
    'specimen-id-duplicate',
  );
});

test('rejects an unknown specimen priority', () => {
  assertThrowsCode(
    () => buildWorklistPlan(request({ specimens: [specimen({ priority: 'emergency' })] })),
    'specimen-priority-unknown',
  );
});

test('rejects a NaN accession sequence', () => {
  assertThrowsCode(
    () => buildWorklistPlan(request({ specimens: [specimen({ accessionSequence: NaN })] })),
    'specimen-accession-sequence-invalid',
  );
});

test('rejects a non-finite accession sequence', () => {
  assertThrowsCode(
    () => buildWorklistPlan(request({ specimens: [specimen({ accessionSequence: Infinity })] })),
    'specimen-accession-sequence-invalid',
  );
});

test('thrown errors are instances of WorklistSequencingError with the offending code', () => {
  try {
    buildWorklistPlan(request({ bracketingRule: bracketingRule({ everyNSamples: 0 }) }));
    assert.fail('expected buildWorklistPlan to throw');
  } catch (error) {
    assert.ok(error instanceof WorklistSequencingError);
    assert.equal((error as WorklistSequencingError).code, 'qc-interval-invalid');
    assert.equal((error as WorklistSequencingError).name, 'WorklistSequencingError');
  }
});
