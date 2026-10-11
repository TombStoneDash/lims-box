import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ResultUnitConversionError,
  convertResultToCanonicalUnit,
  type ResultUnitConversionErrorCode,
} from '../../lib/ohworks-result-units';

/**
 * All fabricated: synthetic analyte identifiers and made-up result values.
 * None of this represents a real analyte, sample, or customer result.
 */
function assertThrowsCode(fn: () => unknown, code: ResultUnitConversionErrorCode) {
  assert.throws(
    fn,
    (error: unknown) => {
      assert.ok(error instanceof ResultUnitConversionError);
      assert.equal((error as ResultUnitConversionError).code, code);
      return true;
    },
  );
}

const INHERITED_ANALYTE_NAMES = ['constructor', 'toString', '__proto__', 'hasOwnProperty'];
const INHERITED_FROM_UNIT_NAMES = ['constructor', 'toString', '__proto__'];

// ---------------------------------------------------------------------------
// Object.prototype-inherited lookup keys must never resolve via prototype chain
// ---------------------------------------------------------------------------

for (const analyte of INHERITED_ANALYTE_NAMES) {
  test(`an analyte identifier of "${analyte}" fails closed as undeclared, not a native TypeError`, () => {
    assertThrowsCode(
      () => convertResultToCanonicalUnit({ analyte, fromUnit: 'mg/L', valueText: '1' }),
      'analyte-canonical-unit-undeclared',
    );
  });
}

for (const fromUnit of INHERITED_FROM_UNIT_NAMES) {
  test(`a fromUnit of "${fromUnit}" fails closed as unknown, not a cross-family conversion`, () => {
    assertThrowsCode(
      () => convertResultToCanonicalUnit({ analyte: 'analyte-synthetic-mass-001', fromUnit, valueText: '1' }),
      'from-unit-unknown',
    );
  });
}

test('a valid µg/L to mg/L conversion still works', () => {
  const result = convertResultToCanonicalUnit({
    analyte: 'analyte-synthetic-mass-001',
    fromUnit: 'µg/L',
    valueText: '1500',
  });
  assert.equal(result.canonicalUnit, 'mg/L');
  assert.equal(result.valueText, '1.500');
  assert.equal(result.value, 1.5);
});
