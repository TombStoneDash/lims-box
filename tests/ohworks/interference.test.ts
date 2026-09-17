import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateSpecimenInterference,
  explainInterferenceInputError,
  InterferenceInputError,
  type AnalyteToleranceRules,
  type InterferenceEvaluationInput,
  type InterferenceInputErrorCode,
  type InterferenceToleranceTable,
} from '../../lib/ohworks-interference';

/**
 * All fabricated: synthetic specimen identifiers, made-up analyte codes,
 * and invented index thresholds. None of this represents a real specimen,
 * patient, or customer.
 */

const NO_RULE: AnalyteToleranceRules = { hemolysis: null, icterus: null, lipemia: null };

function tolerant(): AnalyteToleranceRules {
  return { ...NO_RULE };
}

function baselineTable(): InterferenceToleranceTable {
  return {
    'potassium-synthetic': {
      hemolysis: { commentAt: 50, commentCode: 'HEMOLYSIS-COMMENT-POTASSIUM', suppressAt: 150 },
      icterus: null,
      lipemia: null,
    },
    'triglycerides-synthetic': {
      hemolysis: null,
      icterus: null,
      lipemia: { commentAt: 100, commentCode: 'LIPEMIA-COMMENT-TRIGLYCERIDES', suppressAt: 400 },
    },
    'bilirubin-synthetic': {
      hemolysis: null,
      icterus: { commentAt: 5, commentCode: 'ICTERUS-COMMENT-BILIRUBIN', suppressAt: 20 },
      lipemia: null,
    },
    'unaffected-synthetic': tolerant(),
    'multi-index-synthetic': {
      hemolysis: { commentAt: 50, commentCode: 'HEMOLYSIS-COMMENT-MULTI', suppressAt: 150 },
      icterus: { commentAt: 5, commentCode: 'ICTERUS-COMMENT-MULTI', suppressAt: 20 },
      lipemia: null,
    },
  };
}

function baselineInput(overrides: Partial<InterferenceEvaluationInput> = {}): InterferenceEvaluationInput {
  return {
    specimenId: 'specimen-synthetic-001',
    indices: { hemolysisIndex: 10, icterusIndex: 1, lipemiaIndex: 20 },
    orderedAnalytes: ['potassium-synthetic', 'triglycerides-synthetic', 'bilirubin-synthetic', 'unaffected-synthetic'],
    toleranceTable: baselineTable(),
    ...overrides,
  };
}

const ALL_INPUT_ERROR_CODES: InterferenceInputErrorCode[] = [
  'specimen-id-invalid',
  'indices-not-object',
  'indices-unexpected-key',
  'index-value-invalid',
  'ordered-analytes-not-array',
  'ordered-analytes-empty',
  'ordered-analyte-invalid',
  'ordered-analyte-duplicate',
  'tolerance-table-not-object',
  'tolerance-table-entry-invalid',
  'unknown-analyte',
];

// ---------------------------------------------------------------------------
// Golden paths
// ---------------------------------------------------------------------------

test('every analyte reports cleanly when all indices are within tolerance', () => {
  const result = evaluateSpecimenInterference(baselineInput());
  assert.equal(result.specimenId, 'specimen-synthetic-001');
  assert.equal(result.decisions.length, 4);
  for (const decision of result.decisions) {
    assert.equal(decision.status, 'report');
    assert.equal(decision.reasonCode, 'within-tolerance');
    assert.deepEqual(decision.commentCodes, []);
  }
  assert.equal(result.summary.reportCount, 4);
  assert.equal(result.summary.reportWithCommentCount, 0);
  assert.equal(result.summary.suppressCount, 0);
  assert.deepEqual(result.summary.suppressedAnalytes, []);
  assert.deepEqual(result.summary.commentedAnalytes, []);
  assert.deepEqual(result.summary.allCommentCodes, []);
});

test('an index at the comment threshold produces report_with_comment with the declared code', () => {
  const result = evaluateSpecimenInterference(
    baselineInput({ indices: { hemolysisIndex: 50, icterusIndex: 1, lipemiaIndex: 20 } }),
  );
  const potassium = result.decisions.find((d) => d.analyteCode === 'potassium-synthetic')!;
  assert.equal(potassium.status, 'report_with_comment');
  assert.equal(potassium.reasonCode, 'comment-threshold-exceeded');
  assert.deepEqual(potassium.commentCodes, ['HEMOLYSIS-COMMENT-POTASSIUM']);

  const unaffected = result.decisions.find((d) => d.analyteCode === 'unaffected-synthetic')!;
  assert.equal(unaffected.status, 'report');

  assert.equal(result.summary.reportWithCommentCount, 1);
  assert.deepEqual(result.summary.commentedAnalytes, ['potassium-synthetic']);
  assert.deepEqual(result.summary.allCommentCodes, ['HEMOLYSIS-COMMENT-POTASSIUM']);
});

test('an index just below the comment threshold still reports cleanly', () => {
  const result = evaluateSpecimenInterference(
    baselineInput({ indices: { hemolysisIndex: 49.999, icterusIndex: 1, lipemiaIndex: 20 } }),
  );
  const potassium = result.decisions.find((d) => d.analyteCode === 'potassium-synthetic')!;
  assert.equal(potassium.status, 'report');
  assert.equal(potassium.reasonCode, 'within-tolerance');
});

test('an index at the suppress threshold suppresses regardless of the comment threshold', () => {
  const result = evaluateSpecimenInterference(
    baselineInput({ indices: { hemolysisIndex: 150, icterusIndex: 1, lipemiaIndex: 20 } }),
  );
  const potassium = result.decisions.find((d) => d.analyteCode === 'potassium-synthetic')!;
  assert.equal(potassium.status, 'suppress');
  assert.equal(potassium.reasonCode, 'suppress-threshold-exceeded');
  assert.deepEqual(potassium.commentCodes, []);
  assert.deepEqual(result.summary.suppressedAnalytes, ['potassium-synthetic']);
});

test('multiple index kinds on the same analyte combine deterministically, worst outcome wins', () => {
  const commentBoth = evaluateSpecimenInterference(
    baselineInput({
      orderedAnalytes: ['multi-index-synthetic'],
      indices: { hemolysisIndex: 50, icterusIndex: 5, lipemiaIndex: 0 },
    }),
  );
  const multi = commentBoth.decisions[0];
  assert.equal(multi.status, 'report_with_comment');
  assert.deepEqual(multi.commentCodes, ['HEMOLYSIS-COMMENT-MULTI', 'ICTERUS-COMMENT-MULTI']);

  const oneSuppresses = evaluateSpecimenInterference(
    baselineInput({
      orderedAnalytes: ['multi-index-synthetic'],
      indices: { hemolysisIndex: 50, icterusIndex: 20, lipemiaIndex: 0 },
    }),
  );
  assert.equal(oneSuppresses.decisions[0].status, 'suppress');
  assert.equal(oneSuppresses.decisions[0].reasonCode, 'suppress-threshold-exceeded');
});

test('an analyte with no declared tolerance for any kind always reports', () => {
  const result = evaluateSpecimenInterference(
    baselineInput({ orderedAnalytes: ['unaffected-synthetic'], indices: {} }),
  );
  assert.equal(result.decisions[0].status, 'report');
  assert.equal(result.decisions[0].reasonCode, 'within-tolerance');
  assert.deepEqual(result.decisions[0].indexOutcomes, []);
});

test('decisions preserve ordered-analyte order and summary reflects a mixed batch', () => {
  const result = evaluateSpecimenInterference(
    baselineInput({
      orderedAnalytes: ['bilirubin-synthetic', 'potassium-synthetic', 'triglycerides-synthetic'],
      indices: { hemolysisIndex: 150, icterusIndex: 1, lipemiaIndex: 100 },
    }),
  );
  assert.deepEqual(
    result.decisions.map((d) => d.analyteCode),
    ['bilirubin-synthetic', 'potassium-synthetic', 'triglycerides-synthetic'],
  );
  assert.equal(result.decisions[0].status, 'report');
  assert.equal(result.decisions[1].status, 'suppress');
  assert.equal(result.decisions[2].status, 'report_with_comment');
  assert.equal(result.summary.reportCount, 1);
  assert.equal(result.summary.reportWithCommentCount, 1);
  assert.equal(result.summary.suppressCount, 1);
});

// ---------------------------------------------------------------------------
// Fail-closed: missing index for an analyte that declares a tolerance
// ---------------------------------------------------------------------------

test('a missing index for an analyte that declares a tolerance suppresses only that analyte', () => {
  const result = evaluateSpecimenInterference(
    baselineInput({
      indices: { icterusIndex: 1, lipemiaIndex: 20 },
    }),
  );
  const potassium = result.decisions.find((d) => d.analyteCode === 'potassium-synthetic')!;
  assert.equal(potassium.status, 'suppress');
  assert.equal(potassium.reasonCode, 'index-missing');
  assert.deepEqual(potassium.indexOutcomes, [
    { kind: 'hemolysis', status: 'missing', indexValue: null, commentCode: null },
  ]);

  const unaffected = result.decisions.find((d) => d.analyteCode === 'unaffected-synthetic')!;
  assert.equal(unaffected.status, 'report');

  const bilirubin = result.decisions.find((d) => d.analyteCode === 'bilirubin-synthetic')!;
  assert.equal(bilirubin.status, 'report');
});

test('a missing index takes precedence over a comment or suppress threshold on another kind for the same analyte', () => {
  const result = evaluateSpecimenInterference(
    baselineInput({
      orderedAnalytes: ['multi-index-synthetic'],
      indices: { hemolysisIndex: 500 },
    }),
  );
  assert.equal(result.decisions[0].status, 'suppress');
  assert.equal(result.decisions[0].reasonCode, 'index-missing');
});

test('an empty indices object is valid input and suppresses every analyte that declares any tolerance', () => {
  const result = evaluateSpecimenInterference(baselineInput({ indices: {} }));
  const byCode = Object.fromEntries(result.decisions.map((d) => [d.analyteCode, d]));
  assert.equal(byCode['potassium-synthetic'].status, 'suppress');
  assert.equal(byCode['potassium-synthetic'].reasonCode, 'index-missing');
  assert.equal(byCode['triglycerides-synthetic'].status, 'suppress');
  assert.equal(byCode['bilirubin-synthetic'].status, 'suppress');
  assert.equal(byCode['unaffected-synthetic'].status, 'report');
});

// ---------------------------------------------------------------------------
// Fail-closed: unknown analytes
// ---------------------------------------------------------------------------

test('an ordered analyte absent from the tolerance table throws unknown-analyte', () => {
  assert.throws(
    () => evaluateSpecimenInterference(baselineInput({ orderedAnalytes: ['not-declared-synthetic'] })),
    (error: unknown) => error instanceof InterferenceInputError && error.code === 'unknown-analyte',
  );
});

test('one unknown analyte among otherwise valid ones still throws, producing no partial result', () => {
  assert.throws(
    () =>
      evaluateSpecimenInterference(
        baselineInput({ orderedAnalytes: ['potassium-synthetic', 'ghost-analyte-synthetic'] }),
      ),
    (error: unknown) => error instanceof InterferenceInputError && error.code === 'unknown-analyte',
  );
});

// ---------------------------------------------------------------------------
// Fail-closed: non-finite / invalid indices
// ---------------------------------------------------------------------------

test('a NaN index value throws index-value-invalid', () => {
  assert.throws(
    () => evaluateSpecimenInterference(baselineInput({ indices: { hemolysisIndex: Number.NaN } })),
    (error: unknown) => error instanceof InterferenceInputError && error.code === 'index-value-invalid',
  );
});

test('an Infinity index value throws index-value-invalid', () => {
  assert.throws(
    () => evaluateSpecimenInterference(baselineInput({ indices: { lipemiaIndex: Number.POSITIVE_INFINITY } })),
    (error: unknown) => error instanceof InterferenceInputError && error.code === 'index-value-invalid',
  );
});

test('a negative index value throws index-value-invalid', () => {
  assert.throws(
    () => evaluateSpecimenInterference(baselineInput({ indices: { icterusIndex: -1 } })),
    (error: unknown) => error instanceof InterferenceInputError && error.code === 'index-value-invalid',
  );
});

test('a non-numeric index value throws index-value-invalid', () => {
  assert.throws(
    () =>
      evaluateSpecimenInterference(
        baselineInput({ indices: { hemolysisIndex: '50' as unknown as number } }),
      ),
    (error: unknown) => error instanceof InterferenceInputError && error.code === 'index-value-invalid',
  );
});

// ---------------------------------------------------------------------------
// Fail-closed: other structurally invalid input
// ---------------------------------------------------------------------------

test('a blank specimen ID throws specimen-id-invalid', () => {
  assert.throws(
    () => evaluateSpecimenInterference(baselineInput({ specimenId: '   ' })),
    (error: unknown) => error instanceof InterferenceInputError && error.code === 'specimen-id-invalid',
  );
});

test('indices that are not a plain object throws indices-not-object', () => {
  assert.throws(
    () => evaluateSpecimenInterference(baselineInput({ indices: null as unknown as InterferenceEvaluationInput['indices'] })),
    (error: unknown) => error instanceof InterferenceInputError && error.code === 'indices-not-object',
  );
  assert.throws(
    () => evaluateSpecimenInterference(baselineInput({ indices: [] as unknown as InterferenceEvaluationInput['indices'] })),
    (error: unknown) => error instanceof InterferenceInputError && error.code === 'indices-not-object',
  );
});

test('an unexpected key in indices throws indices-unexpected-key', () => {
  assert.throws(
    () =>
      evaluateSpecimenInterference(
        baselineInput({ indices: { hemolysisIndex: 1, turbidityIndex: 2 } as unknown as InterferenceEvaluationInput['indices'] }),
      ),
    (error: unknown) => error instanceof InterferenceInputError && error.code === 'indices-unexpected-key',
  );
});

test('a non-array ordered analyte list throws ordered-analytes-not-array', () => {
  assert.throws(
    () => evaluateSpecimenInterference(baselineInput({ orderedAnalytes: 'potassium-synthetic' as unknown as string[] })),
    (error: unknown) => error instanceof InterferenceInputError && error.code === 'ordered-analytes-not-array',
  );
});

test('an empty ordered analyte list throws ordered-analytes-empty', () => {
  assert.throws(
    () => evaluateSpecimenInterference(baselineInput({ orderedAnalytes: [] })),
    (error: unknown) => error instanceof InterferenceInputError && error.code === 'ordered-analytes-empty',
  );
});

test('a blank ordered analyte entry throws ordered-analyte-invalid', () => {
  assert.throws(
    () => evaluateSpecimenInterference(baselineInput({ orderedAnalytes: ['potassium-synthetic', '  '] })),
    (error: unknown) => error instanceof InterferenceInputError && error.code === 'ordered-analyte-invalid',
  );
});

test('a duplicate ordered analyte entry throws ordered-analyte-duplicate', () => {
  assert.throws(
    () =>
      evaluateSpecimenInterference(
        baselineInput({ orderedAnalytes: ['potassium-synthetic', 'potassium-synthetic'] }),
      ),
    (error: unknown) => error instanceof InterferenceInputError && error.code === 'ordered-analyte-duplicate',
  );
});

test('a non-object tolerance table throws tolerance-table-not-object', () => {
  assert.throws(
    () =>
      evaluateSpecimenInterference(
        baselineInput({ toleranceTable: [] as unknown as InterferenceToleranceTable }),
      ),
    (error: unknown) => error instanceof InterferenceInputError && error.code === 'tolerance-table-not-object',
  );
});

test('a tolerance table entry missing a required kind key throws tolerance-table-entry-invalid', () => {
  const malformed = { 'potassium-synthetic': { hemolysis: null, icterus: null } } as unknown as InterferenceToleranceTable;
  assert.throws(
    () => evaluateSpecimenInterference(baselineInput({ toleranceTable: malformed })),
    (error: unknown) => error instanceof InterferenceInputError && error.code === 'tolerance-table-entry-invalid',
  );
});

test('a comment threshold declared without a comment code throws tolerance-table-entry-invalid', () => {
  const malformed = {
    'potassium-synthetic': {
      hemolysis: { commentAt: 50, commentCode: null, suppressAt: null },
      icterus: null,
      lipemia: null,
    },
  } as unknown as InterferenceToleranceTable;
  assert.throws(
    () => evaluateSpecimenInterference(baselineInput({ toleranceTable: malformed })),
    (error: unknown) => error instanceof InterferenceInputError && error.code === 'tolerance-table-entry-invalid',
  );
});

test('a suppress threshold below the comment threshold throws tolerance-table-entry-invalid', () => {
  const malformed = {
    'potassium-synthetic': {
      hemolysis: { commentAt: 100, commentCode: 'HEMOLYSIS-COMMENT-POTASSIUM', suppressAt: 50 },
      icterus: null,
      lipemia: null,
    },
  } as unknown as InterferenceToleranceTable;
  assert.throws(
    () => evaluateSpecimenInterference(baselineInput({ toleranceTable: malformed })),
    (error: unknown) => error instanceof InterferenceInputError && error.code === 'tolerance-table-entry-invalid',
  );
});

test('a rule with neither commentAt nor suppressAt declared throws tolerance-table-entry-invalid', () => {
  const malformed = {
    'potassium-synthetic': {
      hemolysis: { commentAt: null, commentCode: null, suppressAt: null },
      icterus: null,
      lipemia: null,
    },
  } as unknown as InterferenceToleranceTable;
  assert.throws(
    () => evaluateSpecimenInterference(baselineInput({ toleranceTable: malformed })),
    (error: unknown) => error instanceof InterferenceInputError && error.code === 'tolerance-table-entry-invalid',
  );
});

// ---------------------------------------------------------------------------
// Error surface completeness
// ---------------------------------------------------------------------------

test('every declared input error code has explainer text', () => {
  for (const code of ALL_INPUT_ERROR_CODES) {
    const text = explainInterferenceInputError(code);
    assert.equal(typeof text, 'string');
    assert.ok(text.length > 0);
  }
});

test('results and nested arrays are frozen, guarding against accidental caller mutation', () => {
  const result = evaluateSpecimenInterference(baselineInput());
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.decisions));
  assert.ok(Object.isFrozen(result.decisions[0]));
  assert.ok(Object.isFrozen(result.summary));
});
