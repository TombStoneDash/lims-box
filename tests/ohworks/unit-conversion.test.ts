import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ANALYTE_UNIT_FACTORS,
  UnitConversionError,
  convertResultUnit,
  getAnalyteUnitFactor,
  type UnitConversionErrorCode,
} from '../../lib/ohworks-unit-conversion';

/**
 * All fabricated: synthetic analyte codes and made-up numeric result
 * values chosen to sit in a clinically plausible range so round-trip
 * checks are meaningful. None of this represents a real patient, sample,
 * or result.
 */

// Conventional-unit fixture values per analyte, used as round-trip start points.
const CONVENTIONAL_FIXTURES: Record<string, number[]> = {
  GLUCOSE: [70, 100, 126, 200, 400],
  CREATININE: [0.6, 0.9, 1.3, 2.0, 5.0],
  CHOLESTEROL: [125, 180, 200, 240, 300],
  CALCIUM: [7.5, 8.5, 9.5, 10.5, 12.0],
};

// SI-unit fixture values per analyte, used as round-trip start points.
const SI_FIXTURES: Record<string, number[]> = {
  GLUCOSE: [3.9, 5.5, 7.0, 11.1, 22.2],
  CREATININE: [53, 80, 115, 177, 442],
  CHOLESTEROL: [3.2, 4.7, 5.2, 6.2, 7.8],
  CALCIUM: [1.9, 2.1, 2.4, 2.6, 3.0],
};

const ALL_ERROR_CODES: UnitConversionErrorCode[] = [
  'analyte-unknown',
  'unit-unknown',
  'unit-mismatched',
  'value-not-finite',
  'value-negative',
];

test('the factor table declares exactly the four documented analytes', () => {
  const codes = ANALYTE_UNIT_FACTORS.map((factor) => factor.analyteCode).sort();
  assert.deepEqual(codes, ['CALCIUM', 'CHOLESTEROL', 'CREATININE', 'GLUCOSE']);
});

test('every factor entry documents a positive molar mass and a matching molar basis note', () => {
  for (const factor of ANALYTE_UNIT_FACTORS) {
    assert.ok(factor.molarMassGramsPerMole > 0);
    assert.ok(factor.molarBasis.includes(String(factor.molarMassGramsPerMole)));
    assert.ok(factor.molarBasis.includes(factor.conventionalUnit));
    assert.ok(factor.molarBasis.includes(factor.siUnit));
  }
});

test('every factor entry declares non-negative per-unit rounding decimals', () => {
  for (const factor of ANALYTE_UNIT_FACTORS) {
    assert.ok(Number.isInteger(factor.conventionalDecimals) && factor.conventionalDecimals >= 0);
    assert.ok(Number.isInteger(factor.siDecimals) && factor.siDecimals >= 0);
  }
});

test('the factor table is frozen and cannot be mutated', () => {
  assert.ok(Object.isFrozen(ANALYTE_UNIT_FACTORS));
  for (const factor of ANALYTE_UNIT_FACTORS) {
    assert.ok(Object.isFrozen(factor));
  }
});

test('getAnalyteUnitFactor returns undefined for an analyte not in the table', () => {
  assert.equal(getAnalyteUnitFactor('SODIUM'), undefined);
});

test('glucose mg/dL -> mmol/L uses the documented molar-mass factor', () => {
  const result = convertResultUnit({ analyteCode: 'GLUCOSE', value: 100, fromUnit: 'mg/dL', toUnit: 'mmol/L' });
  assert.equal(result.unit, 'mmol/L');
  assert.equal(result.decimals, 2);
  assert.equal(result.value, 5.55);
});

test('creatinine mg/dL -> umol/L uses the documented molar-mass factor', () => {
  const result = convertResultUnit({ analyteCode: 'CREATININE', value: 0.9, fromUnit: 'mg/dL', toUnit: 'umol/L' });
  assert.equal(result.unit, 'umol/L');
  assert.equal(result.decimals, 1);
  assert.equal(result.value, 79.6);
});

test('cholesterol mg/dL -> mmol/L uses the documented molar-mass factor', () => {
  const result = convertResultUnit({ analyteCode: 'CHOLESTEROL', value: 200, fromUnit: 'mg/dL', toUnit: 'mmol/L' });
  assert.equal(result.unit, 'mmol/L');
  assert.equal(result.decimals, 2);
  assert.equal(result.value, 5.17);
});

test('calcium mg/dL -> mmol/L uses the documented molar-mass factor', () => {
  const result = convertResultUnit({ analyteCode: 'CALCIUM', value: 9.5, fromUnit: 'mg/dL', toUnit: 'mmol/L' });
  assert.equal(result.unit, 'mmol/L');
  assert.equal(result.decimals, 2);
  assert.equal(result.value, 2.37);
});

test('a zero concentration converts to zero in either direction', () => {
  const toSi = convertResultUnit({ analyteCode: 'GLUCOSE', value: 0, fromUnit: 'mg/dL', toUnit: 'mmol/L' });
  assert.equal(toSi.value, 0);
  const toConventional = convertResultUnit({ analyteCode: 'GLUCOSE', value: 0, fromUnit: 'mmol/L', toUnit: 'mg/dL' });
  assert.equal(toConventional.value, 0);
});

test('conversion is deterministic across repeated calls with identical input', () => {
  const input = { analyteCode: 'GLUCOSE', value: 126, fromUnit: 'mg/dL', toUnit: 'mmol/L' } as const;
  const first = convertResultUnit(input);
  const second = convertResultUnit(input);
  assert.deepEqual(first, second);
});

test('the returned result is frozen', () => {
  const result = convertResultUnit({ analyteCode: 'GLUCOSE', value: 100, fromUnit: 'mg/dL', toUnit: 'mmol/L' });
  assert.ok(Object.isFrozen(result));
});

test('conversion does not mutate its input', () => {
  const input = { analyteCode: 'GLUCOSE', value: 100, fromUnit: 'mg/dL', toUnit: 'mmol/L' };
  const before = JSON.stringify(input);
  convertResultUnit(input);
  assert.equal(JSON.stringify(input), before);
});

for (const factor of ANALYTE_UNIT_FACTORS) {
  test(`${factor.analyteCode}: conventional -> SI -> conventional round-trips within its declared rounding`, () => {
    const tolerance = 10 ** -factor.conventionalDecimals + 1e-9;
    for (const original of CONVENTIONAL_FIXTURES[factor.analyteCode]) {
      const toSi = convertResultUnit({
        analyteCode: factor.analyteCode,
        value: original,
        fromUnit: factor.conventionalUnit,
        toUnit: factor.siUnit,
      });
      const backToConventional = convertResultUnit({
        analyteCode: factor.analyteCode,
        value: toSi.value,
        fromUnit: factor.siUnit,
        toUnit: factor.conventionalUnit,
      });
      const diff = Math.abs(backToConventional.value - original);
      assert.ok(
        diff <= tolerance,
        `${factor.analyteCode} ${original} ${factor.conventionalUnit} round-tripped to ${backToConventional.value} (diff ${diff} > tolerance ${tolerance})`,
      );
    }
  });

  test(`${factor.analyteCode}: SI -> conventional -> SI round-trips within its declared rounding`, () => {
    const tolerance = 10 ** -factor.siDecimals + 1e-9;
    for (const original of SI_FIXTURES[factor.analyteCode]) {
      const toConventional = convertResultUnit({
        analyteCode: factor.analyteCode,
        value: original,
        fromUnit: factor.siUnit,
        toUnit: factor.conventionalUnit,
      });
      const backToSi = convertResultUnit({
        analyteCode: factor.analyteCode,
        value: toConventional.value,
        fromUnit: factor.conventionalUnit,
        toUnit: factor.siUnit,
      });
      const diff = Math.abs(backToSi.value - original);
      assert.ok(
        diff <= tolerance,
        `${factor.analyteCode} ${original} ${factor.siUnit} round-tripped to ${backToSi.value} (diff ${diff} > tolerance ${tolerance})`,
      );
    }
  });
}

test('an unknown analyte code is refused with a typed error, guessing nothing', () => {
  assert.throws(
    () => convertResultUnit({ analyteCode: 'SODIUM', value: 140, fromUnit: 'mmol/L', toUnit: 'mEq/L' }),
    (error: unknown) => error instanceof UnitConversionError && error.code === 'analyte-unknown',
  );
});

test('a unit not declared for the analyte is refused, even if it is a valid unit for a different analyte', () => {
  // umol/L is declared for CREATININE but not for GLUCOSE: must not be silently accepted.
  assert.throws(
    () => convertResultUnit({ analyteCode: 'GLUCOSE', value: 100, fromUnit: 'mg/dL', toUnit: 'umol/L' }),
    (error: unknown) => error instanceof UnitConversionError && error.code === 'unit-unknown',
  );
});

test('a completely unrecognized unit string is refused', () => {
  assert.throws(
    () => convertResultUnit({ analyteCode: 'GLUCOSE', value: 100, fromUnit: 'mg/dL', toUnit: 'g/L' }),
    (error: unknown) => error instanceof UnitConversionError && error.code === 'unit-unknown',
  );
});

test('identical source and target units are refused rather than treated as a no-op', () => {
  assert.throws(
    () => convertResultUnit({ analyteCode: 'GLUCOSE', value: 100, fromUnit: 'mg/dL', toUnit: 'mg/dL' }),
    (error: unknown) => error instanceof UnitConversionError && error.code === 'unit-mismatched',
  );
});

test('NaN is refused as a non-finite value', () => {
  assert.throws(
    () => convertResultUnit({ analyteCode: 'GLUCOSE', value: NaN, fromUnit: 'mg/dL', toUnit: 'mmol/L' }),
    (error: unknown) => error instanceof UnitConversionError && error.code === 'value-not-finite',
  );
});

test('positive Infinity is refused as a non-finite value', () => {
  assert.throws(
    () => convertResultUnit({ analyteCode: 'GLUCOSE', value: Infinity, fromUnit: 'mg/dL', toUnit: 'mmol/L' }),
    (error: unknown) => error instanceof UnitConversionError && error.code === 'value-not-finite',
  );
});

test('negative Infinity is refused as a non-finite value', () => {
  assert.throws(
    () => convertResultUnit({ analyteCode: 'GLUCOSE', value: -Infinity, fromUnit: 'mg/dL', toUnit: 'mmol/L' }),
    (error: unknown) => error instanceof UnitConversionError && error.code === 'value-not-finite',
  );
});

test('a negative concentration is refused', () => {
  assert.throws(
    () => convertResultUnit({ analyteCode: 'GLUCOSE', value: -5, fromUnit: 'mg/dL', toUnit: 'mmol/L' }),
    (error: unknown) => error instanceof UnitConversionError && error.code === 'value-negative',
  );
});

test('unit validity is checked before the value, so a bad unit is reported even for an invalid value', () => {
  assert.throws(
    () => convertResultUnit({ analyteCode: 'GLUCOSE', value: -5, fromUnit: 'mg/dL', toUnit: 'g/L' }),
    (error: unknown) => error instanceof UnitConversionError && error.code === 'unit-unknown',
  );
});

test('every declared error code is reachable and carries a non-empty message', () => {
  const codes: UnitConversionErrorCode[] = [];
  const attempts: Array<() => void> = [
    () => convertResultUnit({ analyteCode: 'SODIUM', value: 1, fromUnit: 'mg/dL', toUnit: 'mmol/L' }),
    () => convertResultUnit({ analyteCode: 'GLUCOSE', value: 1, fromUnit: 'mg/dL', toUnit: 'g/L' }),
    () => convertResultUnit({ analyteCode: 'GLUCOSE', value: 1, fromUnit: 'mg/dL', toUnit: 'mg/dL' }),
    () => convertResultUnit({ analyteCode: 'GLUCOSE', value: NaN, fromUnit: 'mg/dL', toUnit: 'mmol/L' }),
    () => convertResultUnit({ analyteCode: 'GLUCOSE', value: -1, fromUnit: 'mg/dL', toUnit: 'mmol/L' }),
  ];
  for (const attempt of attempts) {
    try {
      attempt();
      assert.fail('expected UnitConversionError to be thrown');
    } catch (error) {
      assert.ok(error instanceof UnitConversionError);
      assert.ok(error.message.length > 0);
      codes.push(error.code);
    }
  }
  assert.deepEqual(codes.sort(), [...ALL_ERROR_CODES].sort());
});
