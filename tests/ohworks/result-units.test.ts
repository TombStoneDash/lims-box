import assert from 'node:assert/strict';
import test from 'node:test';

import {
  listDeclaredAnalytes,
  listDeclaredUnits,
  normalizeResultUnit,
  NormalizeResultUnitError,
  type NormalizeResultUnitInput,
} from '../../lib/ohworks-result-units';

/**
 * All fabricated: synthetic analyte codes and made-up numeric values. None
 * of this represents a real instrument, customer, or result.
 */
function glucoseInput(overrides: Partial<NormalizeResultUnitInput> = {}): NormalizeResultUnitInput {
  return {
    analyteCode: 'ANALYTE-SYNTH-GLUCOSE',
    valueText: '1520',
    unit: 'ug/L',
    ...overrides,
  };
}

test('a mass-concentration value converts down through a declared prefix factor, preserving significant figures', () => {
  const result = normalizeResultUnit(glucoseInput());
  assert.equal(result.canonicalUnit, 'mg/L');
  assert.equal(result.canonicalValue, 1.52);
  assert.equal(result.canonicalValueText, '1.52');
  assert.equal(result.significantFigures, 3);
  assert.equal(result.family, 'mass-concentration');
  assert.equal(result.originalUnit, 'ug/L');
  assert.equal(result.originalValue, 1520);
});

test('an identity conversion (already the canonical unit) preserves trailing significant zeros', () => {
  const result = normalizeResultUnit(glucoseInput({ valueText: '15.20', unit: 'mg/L' }));
  assert.equal(result.canonicalUnit, 'mg/L');
  assert.equal(result.canonicalValue, 15.2);
  assert.equal(result.canonicalValueText, '15.20');
  assert.equal(result.significantFigures, 4);
});

test('a mass-concentration value converts up through a declared prefix factor', () => {
  const result = normalizeResultUnit(glucoseInput({ valueText: '0.0152', unit: 'g/L' }));
  assert.equal(result.canonicalUnit, 'mg/L');
  assert.equal(result.canonicalValue, 15.2);
  assert.equal(result.significantFigures, 3);
});

test('a volume-concentration analyte converts through its own declared family', () => {
  const result = normalizeResultUnit({
    analyteCode: 'ANALYTE-SYNTH-ETHANOL',
    valueText: '500',
    unit: 'uL/L',
  });
  assert.equal(result.family, 'volume-concentration');
  assert.equal(result.canonicalUnit, 'mL/L');
  assert.equal(result.canonicalValue, 0.5);
  assert.equal(result.canonicalValueText, '0.5');
  assert.equal(result.significantFigures, 1);
});

test('a count-concentration analyte converts to its declared non-base canonical unit', () => {
  const result = normalizeResultUnit({
    analyteCode: 'ANALYTE-SYNTH-BACTERIA-COUNT',
    valueText: '2300',
    unit: 'count/L',
  });
  assert.equal(result.family, 'count-concentration');
  assert.equal(result.canonicalUnit, 'count/mL');
  assert.equal(result.canonicalValue, 2.3);
  assert.equal(result.canonicalValueText, '2.3');
  assert.equal(result.significantFigures, 2);
});

test('a value of exactly zero preserves declared decimal precision', () => {
  const result = normalizeResultUnit(glucoseInput({ valueText: '0.00', unit: 'mg/L' }));
  assert.equal(result.canonicalValue, 0);
  assert.equal(result.significantFigures, 2);
});

test('normalization is pure: it does not mutate its input', () => {
  const input = glucoseInput();
  const before = JSON.stringify(input);
  normalizeResultUnit(input);
  assert.equal(JSON.stringify(input), before);
});

test('normalization is deterministic across repeated calls', () => {
  const first = normalizeResultUnit(glucoseInput());
  const second = normalizeResultUnit(glucoseInput());
  assert.deepEqual(first, second);
});

test('an unknown analyte code fails closed rather than guessing a family', () => {
  assert.throws(
    () => normalizeResultUnit(glucoseInput({ analyteCode: 'ANALYTE-SYNTH-NOT-DECLARED' })),
    (error: unknown) => {
      assert.ok(error instanceof NormalizeResultUnitError);
      assert.equal((error as NormalizeResultUnitError).code, 'analyte-unknown');
      return true;
    },
  );
});

test('an analyte whose canonical unit is not itself declared fails closed', () => {
  assert.throws(
    () =>
      normalizeResultUnit({
        analyteCode: 'ANALYTE-SYNTH-UNDECLARED-CANONICAL',
        valueText: '10',
        unit: 'mg/L',
      }),
    (error: unknown) => {
      assert.ok(error instanceof NormalizeResultUnitError);
      assert.equal((error as NormalizeResultUnitError).code, 'analyte-canonical-unit-undeclared');
      return true;
    },
  );
});

test('an unrecognized unit fails closed rather than guessing a factor', () => {
  assert.throws(
    () => normalizeResultUnit(glucoseInput({ unit: 'lbs/gal' })),
    (error: unknown) => {
      assert.ok(error instanceof NormalizeResultUnitError);
      assert.equal((error as NormalizeResultUnitError).code, 'unit-unknown');
      return true;
    },
  );
});

test('a cross-family unit (volume for a mass-concentration analyte) fails closed', () => {
  assert.throws(
    () => normalizeResultUnit(glucoseInput({ unit: 'mL/L' })),
    (error: unknown) => {
      assert.ok(error instanceof NormalizeResultUnitError);
      assert.equal((error as NormalizeResultUnitError).code, 'unit-family-mismatch');
      return true;
    },
  );
});

test('a cross-family unit (count for a volume-concentration analyte) fails closed', () => {
  assert.throws(
    () =>
      normalizeResultUnit({
        analyteCode: 'ANALYTE-SYNTH-ETHANOL',
        valueText: '10',
        unit: 'count/mL',
      }),
    (error: unknown) => {
      assert.ok(error instanceof NormalizeResultUnitError);
      assert.equal((error as NormalizeResultUnitError).code, 'unit-family-mismatch');
      return true;
    },
  );
});

test('a non-numeric value text fails closed', () => {
  assert.throws(
    () => normalizeResultUnit(glucoseInput({ valueText: 'not-a-number' })),
    (error: unknown) => {
      assert.ok(error instanceof NormalizeResultUnitError);
      assert.equal((error as NormalizeResultUnitError).code, 'value-not-finite-decimal');
      return true;
    },
  );
});

test('an "Infinity" value text fails closed as non-finite, not coerced by Number()', () => {
  assert.throws(
    () => normalizeResultUnit(glucoseInput({ valueText: 'Infinity' })),
    (error: unknown) => {
      assert.ok(error instanceof NormalizeResultUnitError);
      assert.equal((error as NormalizeResultUnitError).code, 'value-not-finite-decimal');
      return true;
    },
  );
});

test('a "NaN" value text fails closed', () => {
  assert.throws(
    () => normalizeResultUnit(glucoseInput({ valueText: 'NaN' })),
    (error: unknown) => {
      assert.ok(error instanceof NormalizeResultUnitError);
      assert.equal((error as NormalizeResultUnitError).code, 'value-not-finite-decimal');
      return true;
    },
  );
});

test('an empty value text fails closed', () => {
  assert.throws(
    () => normalizeResultUnit(glucoseInput({ valueText: '' })),
    (error: unknown) => {
      assert.ok(error instanceof NormalizeResultUnitError);
      assert.equal((error as NormalizeResultUnitError).code, 'value-not-finite-decimal');
      return true;
    },
  );
});

test('scientific notation in value text fails closed rather than being parsed loosely', () => {
  assert.throws(
    () => normalizeResultUnit(glucoseInput({ valueText: '1.5e3' })),
    (error: unknown) => {
      assert.ok(error instanceof NormalizeResultUnitError);
      assert.equal((error as NormalizeResultUnitError).code, 'value-not-finite-decimal');
      return true;
    },
  );
});

test('a value text with multiple decimal points fails closed', () => {
  assert.throws(
    () => normalizeResultUnit(glucoseInput({ valueText: '1.2.3' })),
    (error: unknown) => {
      assert.ok(error instanceof NormalizeResultUnitError);
      assert.equal((error as NormalizeResultUnitError).code, 'value-not-finite-decimal');
      return true;
    },
  );
});

test('unit lookup is case-sensitive: prefixes are never guessed by case-folding', () => {
  assert.throws(
    () => normalizeResultUnit(glucoseInput({ unit: 'MG/L' })),
    (error: unknown) => {
      assert.ok(error instanceof NormalizeResultUnitError);
      assert.equal((error as NormalizeResultUnitError).code, 'unit-unknown');
      return true;
    },
  );
});

test('a missing unit fails closed', () => {
  assert.throws(
    () => normalizeResultUnit(glucoseInput({ unit: '' })),
    (error: unknown) => {
      assert.ok(error instanceof NormalizeResultUnitError);
      assert.equal((error as NormalizeResultUnitError).code, 'unit-unknown');
      return true;
    },
  );
});

test('a missing analyte code fails closed', () => {
  assert.throws(
    () => normalizeResultUnit(glucoseInput({ analyteCode: '' })),
    (error: unknown) => {
      assert.ok(error instanceof NormalizeResultUnitError);
      assert.equal((error as NormalizeResultUnitError).code, 'analyte-unknown');
      return true;
    },
  );
});

test('a typed error message never echoes any submitted data', () => {
  try {
    normalizeResultUnit(glucoseInput({ analyteCode: 'ANALYTE-SYNTH-SECRET-LEAK-PROBE' }));
    assert.fail('expected normalizeResultUnit to throw');
  } catch (error) {
    assert.ok(error instanceof NormalizeResultUnitError);
    assert.doesNotMatch((error as Error).message, /SECRET-LEAK-PROBE/);
  }
});

test('every declared unit carries a non-empty source note', () => {
  for (const declaration of listDeclaredUnits()) {
    assert.equal(typeof declaration.sourceNote, 'string');
    assert.ok(declaration.sourceNote.length > 0);
  }
});

test('every declared unit family has exactly one base unit (toBaseFactor === 1)', () => {
  const families = new Set(listDeclaredUnits().map((d) => d.family));
  for (const family of families) {
    const baseUnits = listDeclaredUnits().filter((d) => d.family === family && d.toBaseFactor === 1);
    assert.equal(baseUnits.length, 1, `expected exactly one base unit for family ${family}`);
  }
});

test('every declared analyte other than the deliberately-broken fixture has a canonical unit present in the unit table', () => {
  for (const analyte of listDeclaredAnalytes()) {
    if (analyte.analyteCode === 'ANALYTE-SYNTH-UNDECLARED-CANONICAL') {
      continue;
    }
    const canonical = listDeclaredUnits().find((d) => d.unit === analyte.canonicalUnit);
    assert.ok(canonical, `expected a declared unit for canonical unit ${analyte.canonicalUnit}`);
    assert.equal(canonical?.family, analyte.family);
  }
});

test('round-tripping through two declared units in the same family returns the original magnitude', () => {
  const down = normalizeResultUnit(glucoseInput({ valueText: '1000000', unit: 'ng/L' }));
  assert.equal(down.canonicalUnit, 'mg/L');
  assert.equal(down.canonicalValue, 1);
});
