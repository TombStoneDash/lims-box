import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateSpecimenInterference,
  InterferenceInputError,
  type AnalyteToleranceRules,
  type InterferenceEvaluationInput,
  type InterferenceToleranceTable,
} from '../../lib/ohworks-interference';

/**
 * All fabricated: synthetic specimen identifiers, made-up analyte codes,
 * and invented index thresholds. None of this represents a real specimen,
 * patient, or customer.
 */

const DECLARED_RULE: AnalyteToleranceRules = {
  hemolysis: { commentAt: 5, commentCode: 'HEMOLYSIS-COMMENT-SYNTHETIC', suppressAt: null },
  icterus: null,
  lipemia: null,
};

function baselineInput(overrides: Partial<InterferenceEvaluationInput> = {}): InterferenceEvaluationInput {
  return {
    specimenId: 'specimen-synthetic-own-keys',
    indices: { hemolysisIndex: 1 },
    orderedAnalytes: ['declared-analyte-synthetic'],
    toleranceTable: { 'declared-analyte-synthetic': DECLARED_RULE } as InterferenceToleranceTable,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Inherited `Object.prototype` keys must not be treated as declared analytes
// ---------------------------------------------------------------------------

const INHERITED_KEYS = ['constructor', 'toString', '__proto__', 'hasOwnProperty'];

for (const inheritedKey of INHERITED_KEYS) {
  test(`ordering an inherited key "${inheritedKey}" with no own entry throws unknown-analyte`, () => {
    const input = baselineInput({
      orderedAnalytes: [inheritedKey],
      toleranceTable: { 'declared-analyte-synthetic': DECLARED_RULE } as InterferenceToleranceTable,
    });

    assert.throws(
      () => evaluateSpecimenInterference(input),
      (error: unknown) => error instanceof InterferenceInputError && error.code === 'unknown-analyte',
    );
  });
}

// ---------------------------------------------------------------------------
// Golden paths unaffected by the own-key check
// ---------------------------------------------------------------------------

test('an ordinary declared analyte still reports normally', () => {
  const result = evaluateSpecimenInterference(baselineInput());

  assert.equal(result.decisions.length, 1);
  assert.equal(result.decisions[0]?.analyteCode, 'declared-analyte-synthetic');
  assert.equal(result.decisions[0]?.status, 'report');
  assert.equal(result.decisions[0]?.reasonCode, 'within-tolerance');
});

test('a tolerance table that genuinely declares an own "constructor" analyte still evaluates normally', () => {
  const input = baselineInput({
    orderedAnalytes: ['constructor'],
    toleranceTable: { constructor: DECLARED_RULE } as InterferenceToleranceTable,
  });

  const result = evaluateSpecimenInterference(input);

  assert.equal(result.decisions.length, 1);
  assert.equal(result.decisions[0]?.analyteCode, 'constructor');
  assert.equal(result.decisions[0]?.status, 'report');
  assert.equal(result.decisions[0]?.reasonCode, 'within-tolerance');
});
