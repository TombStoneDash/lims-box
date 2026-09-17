import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ANALYTE_CANONICAL_UNITS,
  ResultUnitConversionError,
  UNIT_TABLE,
  convertResultToCanonicalUnit,
  explainResultUnitConversionError,
  type ResultUnitConversionErrorCode,
  type ResultUnitConversionInput,
} from '../../lib/ohworks-result-units';

/**
 * All fabricated: synthetic analyte identifiers and made-up result values.
 * None of this represents a real analyte, sample, or customer result.
 */
function input(overrides: Partial<ResultUnitConversionInput> = {}): ResultUnitConversionInput {
  return {
    analyte: 'analyte-synthetic-mass-001',
    valueText: '1.50',
    fromUnit: 'mg/L',
    ...overrides,
  };
}

const ALL_ERROR_CODES: ResultUnitConversionErrorCode[] = [
  'analyte-malformed',
  'from-unit-malformed',
  'value-text-malformed',
  'from-unit-unknown',
  'analyte-canonical-unit-undeclared',
  'cross-family-conversion',
  'conversion-overflow',
  'conversion-underflow-nonzero-to-zero',
];

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

// ---------------------------------------------------------------------------
// Reproduced boundary failures
// ---------------------------------------------------------------------------

test('a mass-concentration value of 1 followed by 308 zeros in g/L overflows to a typed error, not Infinity', () => {
  const huge = `1${'0'.repeat(308)}`;
  assertThrowsCode(
    () => convertResultToCanonicalUnit(input({ valueText: huge, fromUnit: 'g/L' })),
    'conversion-overflow',
  );
});

test('a mass-concentration value of 0. followed by 330 zeros then 1 in mg/L underflows to a typed error, not a silent zero', () => {
  const tiny = `0.${'0'.repeat(330)}1`;
  assertThrowsCode(
    () => convertResultToCanonicalUnit(input({ valueText: tiny, fromUnit: 'mg/L' })),
    'conversion-underflow-nonzero-to-zero',
  );
});

test('the same tiny non-zero value still underflows when an actual unit conversion is applied', () => {
  const tiny = `0.${'0'.repeat(330)}1`;
  assertThrowsCode(
    () => convertResultToCanonicalUnit(input({ valueText: tiny, fromUnit: 'g/L' })),
    'conversion-underflow-nonzero-to-zero',
  );
});

test('a value just large enough to still be finite as a double does not overflow', () => {
  // Number.MAX_VALUE is approximately 1.7976931348623157e308; 1e300 g/L converted
  // to the mg/L canonical unit (x1000) lands at 1e303, still comfortably finite.
  const large = `1${'0'.repeat(300)}`;
  const result = convertResultToCanonicalUnit(input({ valueText: large, fromUnit: 'g/L' }));
  assert.equal(result.valueText, `1${'0'.repeat(303)}`);
  assert.ok(Number.isFinite(result.value));
});

// ---------------------------------------------------------------------------
// Ordinary conversions and significant-figure preservation
// ---------------------------------------------------------------------------

test('an identity conversion (source unit equals canonical unit) is a pass-through', () => {
  const result = convertResultToCanonicalUnit(input({ valueText: '1.50', fromUnit: 'mg/L' }));
  assert.equal(result.canonicalUnit, 'mg/L');
  assert.equal(result.valueText, '1.50');
  assert.equal(result.value, 1.5);
  assert.equal(result.significantFigures, 3);
});

test('ng/L converts down to the mg/L canonical unit, preserving trailing significant zeros', () => {
  const result = convertResultToCanonicalUnit(input({ analyte: 'analyte-synthetic-mass-001', valueText: '500', fromUnit: 'ng/L' }));
  assert.equal(result.canonicalUnit, 'mg/L');
  assert.equal(result.valueText, '0.000500');
  assert.equal(result.value, 0.0005);
  assert.equal(result.significantFigures, 3);
});

test('g/L converts up to the mg/L canonical unit', () => {
  const result = convertResultToCanonicalUnit(input({ valueText: '2.5', fromUnit: 'g/L' }));
  assert.equal(result.canonicalUnit, 'mg/L');
  assert.equal(result.valueText, '2500');
  assert.equal(result.value, 2500);
  assert.equal(result.significantFigures, 2);
});

test('a percent volume-concentration value converts to the mL/L canonical unit', () => {
  const result = convertResultToCanonicalUnit({ analyte: 'analyte-synthetic-volume-001', valueText: '2.50', fromUnit: '%' });
  assert.equal(result.canonicalUnit, 'mL/L');
  assert.equal(result.valueText, '25.0');
  assert.equal(result.value, 25);
  assert.equal(result.significantFigures, 3);
});

test('a count/100mL value converts to the count/L canonical unit', () => {
  const result = convertResultToCanonicalUnit({ analyte: 'analyte-synthetic-count-001', valueText: '3', fromUnit: 'count/100mL' });
  assert.equal(result.canonicalUnit, 'count/L');
  assert.equal(result.valueText, '30');
  assert.equal(result.value, 30);
  assert.equal(result.significantFigures, 1);
});

test('negative values are converted with sign preserved', () => {
  const result = convertResultToCanonicalUnit(input({ valueText: '-0.75', fromUnit: 'g/L' }));
  assert.equal(result.valueText, '-750');
  assert.equal(result.value, -750);
});

test('a literal zero value converts to zero without throwing, regardless of the unit shift', () => {
  const result = convertResultToCanonicalUnit(input({ valueText: '0.00', fromUnit: 'g/L' }));
  assert.equal(result.valueText, '0');
  assert.equal(result.value, 0);
  assert.equal(result.significantFigures, 0);
});

// ---------------------------------------------------------------------------
// Fail closed: unknown units, undeclared analytes, cross-family conversions
// ---------------------------------------------------------------------------

test('an unrecognized source unit throws a sanitized typed error', () => {
  assertThrowsCode(() => convertResultToCanonicalUnit(input({ fromUnit: 'lbs/gal' })), 'from-unit-unknown');
});

test('an analyte absent from the canonical-unit registry throws a sanitized typed error', () => {
  assertThrowsCode(
    () => convertResultToCanonicalUnit(input({ analyte: 'analyte-synthetic-does-not-exist' })),
    'analyte-canonical-unit-undeclared',
  );
});

test('converting a mass-concentration unit for a count-per-volume analyte is a cross-family conversion', () => {
  assertThrowsCode(
    () => convertResultToCanonicalUnit({ analyte: 'analyte-synthetic-count-001', valueText: '5', fromUnit: 'mg/L' }),
    'cross-family-conversion',
  );
});

test('converting a count-per-volume unit for a mass-concentration analyte is a cross-family conversion', () => {
  assertThrowsCode(
    () => convertResultToCanonicalUnit(input({ fromUnit: 'count/L' })),
    'cross-family-conversion',
  );
});

// ---------------------------------------------------------------------------
// Fail closed: malformed and non-finite value text
// ---------------------------------------------------------------------------

const MALFORMED_VALUE_TEXTS = ['', 'Infinity', '-Infinity', 'NaN', 'abc', '1.2.3', '-', '.', '.5', '1.', '1e10', ' 1', '1 ', '+1'];

for (const bad of MALFORMED_VALUE_TEXTS) {
  test(`valueText ${JSON.stringify(bad)} is rejected as malformed rather than parsed loosely`, () => {
    assertThrowsCode(() => convertResultToCanonicalUnit(input({ valueText: bad })), 'value-text-malformed');
  });
}

test('a non-string valueText throws a sanitized typed error', () => {
  assertThrowsCode(
    () => convertResultToCanonicalUnit(input({ valueText: 1.5 as unknown as string })),
    'value-text-malformed',
  );
});

// ---------------------------------------------------------------------------
// Fail closed: structurally malformed input
// ---------------------------------------------------------------------------

test('a null input throws a sanitized typed error', () => {
  assertThrowsCode(() => convertResultToCanonicalUnit(null as unknown as ResultUnitConversionInput), 'analyte-malformed');
});

test('a non-string analyte throws a sanitized typed error', () => {
  assertThrowsCode(
    () => convertResultToCanonicalUnit(input({ analyte: 123 as unknown as string })),
    'analyte-malformed',
  );
});

test('an empty-string analyte throws a sanitized typed error', () => {
  assertThrowsCode(() => convertResultToCanonicalUnit(input({ analyte: '' })), 'analyte-malformed');
});

test('an empty-string fromUnit throws a sanitized typed error', () => {
  assertThrowsCode(() => convertResultToCanonicalUnit(input({ fromUnit: '' })), 'from-unit-malformed');
});

test('a typed error message never echoes any submitted data', () => {
  try {
    convertResultToCanonicalUnit(input({ analyte: 'analyte-secret-token-abc123' }));
    assert.fail('expected convertResultToCanonicalUnit to throw');
  } catch (error) {
    assert.ok(error instanceof ResultUnitConversionError);
    assert.doesNotMatch((error as Error).message, /analyte-secret-token-abc123/);
  }
});

// ---------------------------------------------------------------------------
// Determinism, purity, and immutability
// ---------------------------------------------------------------------------

test('the result is deterministic across repeated calls with equivalent input', () => {
  const first = convertResultToCanonicalUnit(input());
  const second = convertResultToCanonicalUnit(input());
  assert.deepEqual(first, second);
});

test('the result object is frozen', () => {
  const result = convertResultToCanonicalUnit(input());
  assert.ok(Object.isFrozen(result));
  const mutationSucceeded = Reflect.set(result, 'value', 999);
  assert.equal(mutationSucceeded, false);
  assert.equal(result.value, 1.5);
});

test('convertResultToCanonicalUnit does not mutate its input', () => {
  const conversionInput = input();
  const before = JSON.stringify(conversionInput);
  convertResultToCanonicalUnit(conversionInput);
  assert.equal(JSON.stringify(conversionInput), before);
});

// ---------------------------------------------------------------------------
// Table integrity and explanations
// ---------------------------------------------------------------------------

test('every declared analyte canonical unit exists in the unit table', () => {
  for (const unit of Object.values(ANALYTE_CANONICAL_UNITS)) {
    assert.ok(unit in UNIT_TABLE, `${unit} should be a known unit`);
  }
});

test('every error code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_ERROR_CODES) {
    const message = explainResultUnitConversionError(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(explainResultUnitConversionError('from-unit-unknown'), explainResultUnitConversionError('from-unit-unknown'));
});
