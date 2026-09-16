/**
 * Fail-closed synthetic result unit normalization for OHWorks/SENAITE-shaped
 * numeric results.
 *
 * This module is a pure, dependency-free converter: given a fabricated
 * analyte code, a reported unit, and the exact decimal text of a reported
 * value, it converts the value into the analyte's declared canonical
 * reporting unit. It performs no I/O, touches no real instrument or customer
 * data, and never invents a conversion factor. Every factor this module uses
 * comes from an explicit, in-source table with a source note; anything not
 * in that table — an unrecognized unit, a conversion across unit families,
 * a non-finite or malformed value, or an analyte whose canonical unit is not
 * declared — is rejected rather than guessed at.
 */

/** The three declared families of convertible units. Small and explicit by design. */
export type ResultUnitFamily = 'mass-concentration' | 'volume-concentration' | 'count-concentration';

export type UnitDeclaration = {
  /** Exact unit string as reported. Case-sensitive: unit prefixes are not interchangeable. */
  readonly unit: string;
  readonly family: ResultUnitFamily;
  /** Exact multiplier that converts one of `unit` into the family's base unit. Never inferred. */
  readonly toBaseFactor: number;
  /** Where this factor comes from. Every declared unit must carry one. */
  readonly sourceNote: string;
};

/**
 * The complete, explicit unit conversion table. Each family has a base unit
 * (toBaseFactor === 1) that every other unit in the family converts through.
 * All factors here are exact decimal-prefix multiples defined by the SI
 * system, not measured or estimated values.
 */
const UNIT_TABLE: readonly UnitDeclaration[] = [
  // mass-concentration family; base unit mg/L
  {
    unit: 'ng/L',
    family: 'mass-concentration',
    toBaseFactor: 1e-6,
    sourceNote: 'SI decimal prefix: 1 ng = 1e-9 g and 1 mg = 1e-3 g, so 1 ng/L = 1e-6 mg/L (exact by SI prefix definition).',
  },
  {
    unit: 'ug/L',
    family: 'mass-concentration',
    toBaseFactor: 1e-3,
    sourceNote: 'SI decimal prefix: 1 ug = 1e-6 g and 1 mg = 1e-3 g, so 1 ug/L = 1e-3 mg/L (exact by SI prefix definition).',
  },
  {
    unit: 'mg/L',
    family: 'mass-concentration',
    toBaseFactor: 1,
    sourceNote: 'Family base unit for mass-concentration; identity conversion.',
  },
  {
    unit: 'g/L',
    family: 'mass-concentration',
    toBaseFactor: 1000,
    sourceNote: 'SI decimal prefix: 1 g = 1e3 mg, so 1 g/L = 1000 mg/L (exact by SI prefix definition).',
  },

  // volume-concentration family; base unit mL/L
  {
    unit: 'uL/L',
    family: 'volume-concentration',
    toBaseFactor: 1e-3,
    sourceNote: 'SI decimal prefix: 1 uL = 1e-6 L and 1 mL = 1e-3 L, so 1 uL/L = 1e-3 mL/L (exact by SI prefix definition).',
  },
  {
    unit: 'mL/L',
    family: 'volume-concentration',
    toBaseFactor: 1,
    sourceNote: 'Family base unit for volume-concentration; identity conversion.',
  },
  {
    unit: 'L/L',
    family: 'volume-concentration',
    toBaseFactor: 1000,
    sourceNote: 'SI decimal prefix: 1 L = 1e3 mL, so 1 L/L = 1000 mL/L (exact by SI prefix definition).',
  },

  // count-concentration family; base unit count/L
  {
    unit: 'count/uL',
    family: 'count-concentration',
    toBaseFactor: 1e6,
    sourceNote: 'SI decimal prefix: 1 uL = 1e-6 L, so 1 count/uL = 1 count / 1e-6 L = 1e6 count/L (exact by SI prefix definition).',
  },
  {
    unit: 'count/mL',
    family: 'count-concentration',
    toBaseFactor: 1000,
    sourceNote: 'SI decimal prefix: 1 mL = 1e-3 L, so 1 count/mL = 1000 count/L (exact by SI prefix definition).',
  },
  {
    unit: 'count/L',
    family: 'count-concentration',
    toBaseFactor: 1,
    sourceNote: 'Family base unit for count-concentration; identity conversion.',
  },
];

const UNIT_TABLE_BY_UNIT: ReadonlyMap<string, UnitDeclaration> = new Map(
  UNIT_TABLE.map((declaration) => [declaration.unit, declaration]),
);

export type AnalyteUnitDeclaration = {
  readonly analyteCode: string;
  readonly family: ResultUnitFamily;
  /** The unit this analyte's results must be reported in. Must exactly match a `UNIT_TABLE` entry in the same family. */
  readonly canonicalUnit: string;
};

/**
 * Small, explicit table of fabricated analytes and their declared canonical
 * reporting unit. `ANALYTE-SYNTH-UNDECLARED-CANONICAL` is a deliberately
 * broken synthetic fixture: its canonical unit is not present in
 * `UNIT_TABLE`, so it always fails closed. It exists only to exercise that
 * failure path in tests.
 */
const ANALYTE_TABLE: readonly AnalyteUnitDeclaration[] = [
  { analyteCode: 'ANALYTE-SYNTH-GLUCOSE', family: 'mass-concentration', canonicalUnit: 'mg/L' },
  { analyteCode: 'ANALYTE-SYNTH-CREATININE', family: 'mass-concentration', canonicalUnit: 'mg/L' },
  { analyteCode: 'ANALYTE-SYNTH-ETHANOL', family: 'volume-concentration', canonicalUnit: 'mL/L' },
  { analyteCode: 'ANALYTE-SYNTH-BACTERIA-COUNT', family: 'count-concentration', canonicalUnit: 'count/mL' },
  { analyteCode: 'ANALYTE-SYNTH-UNDECLARED-CANONICAL', family: 'mass-concentration', canonicalUnit: 'kg/L' },
];

const ANALYTE_TABLE_BY_CODE: ReadonlyMap<string, AnalyteUnitDeclaration> = new Map(
  ANALYTE_TABLE.map((declaration) => [declaration.analyteCode, declaration]),
);

/** Read-only view of every declared unit and its source note, for transparency and testing. */
export function listDeclaredUnits(): readonly UnitDeclaration[] {
  return UNIT_TABLE;
}

/** Read-only view of every declared analyte's family and canonical unit, for transparency and testing. */
export function listDeclaredAnalytes(): readonly AnalyteUnitDeclaration[] {
  return ANALYTE_TABLE;
}

export type NormalizeResultUnitInput = {
  /** Fabricated analyte/parameter code. Must be declared in ANALYTE_TABLE. */
  readonly analyteCode: string;
  /** Exact reported value text, e.g. "15.20". Its digit count determines the significant figures preserved through conversion. */
  readonly valueText: string;
  /** Exact reported unit, e.g. "ug/L". Case-sensitive. */
  readonly unit: string;
};

export type NormalizeResultUnitResult = {
  readonly analyteCode: string;
  readonly family: ResultUnitFamily;
  readonly originalUnit: string;
  readonly originalValue: number;
  readonly canonicalUnit: string;
  readonly canonicalValue: number;
  /** Canonical value formatted to the same number of significant figures as the reported value; may use exponential notation. */
  readonly canonicalValueText: string;
  readonly significantFigures: number;
};

export type NormalizeResultUnitErrorCode =
  | 'analyte-unknown'
  | 'analyte-canonical-unit-undeclared'
  | 'value-not-finite-decimal'
  | 'unit-unknown'
  | 'unit-family-mismatch';

const INPUT_ERROR_MESSAGES: Record<NormalizeResultUnitErrorCode, string> = {
  'analyte-unknown': 'The analyte code is not declared in the unit normalization table.',
  'analyte-canonical-unit-undeclared': "The analyte's canonical reporting unit is not declared in the unit table.",
  'value-not-finite-decimal': 'The reported value is not a finite plain-decimal number.',
  'unit-unknown': 'The reported unit is not declared in the unit table.',
  'unit-family-mismatch': "The reported unit's family does not match the analyte's declared family.",
};

/** Thrown for any input that cannot be normalized without guessing. Never echoes submitted data. */
export class NormalizeResultUnitError extends Error {
  readonly code: NormalizeResultUnitErrorCode;

  constructor(code: NormalizeResultUnitErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'NormalizeResultUnitError';
    this.code = code;
  }
}

const DECIMAL_TEXT_PATTERN = /^([+-])?(\d+)(?:\.(\d+))?$/;

/**
 * Count significant figures in a plain decimal's digit groups, using the
 * standard convention: all non-zero digits are significant; zeros between
 * non-zero digits are significant; leading zeros are never significant;
 * trailing zeros are significant only when an explicit decimal point makes
 * them so.
 */
function countSignificantFigures(intPart: string, fracPart: string | undefined): number {
  if (fracPart !== undefined && fracPart.length > 0) {
    const combined = intPart + fracPart;
    const firstNonZeroIndex = combined.search(/[1-9]/);
    if (firstNonZeroIndex === -1) {
      return fracPart.length;
    }
    return combined.length - firstNonZeroIndex;
  }
  const withoutLeadingZeros = intPart.replace(/^0+/, '');
  if (withoutLeadingZeros.length === 0) {
    return 1;
  }
  const withoutTrailingZeros = withoutLeadingZeros.replace(/0+$/, '');
  return withoutTrailingZeros.length === 0 ? 1 : withoutTrailingZeros.length;
}

function parseDecimalText(valueText: string): { value: number; significantFigures: number } | undefined {
  const trimmed = valueText.trim();
  const match = DECIMAL_TEXT_PATTERN.exec(trimmed);
  if (!match) {
    return undefined;
  }
  const [, sign, intPart, fracPart] = match;
  const numericText = `${sign ?? ''}${intPart}${fracPart ? `.${fracPart}` : ''}`;
  const value = Number(numericText);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return { value, significantFigures: countSignificantFigures(intPart, fracPart) };
}

/**
 * Convert a fabricated result's reported value from its reported unit into
 * its analyte's declared canonical reporting unit.
 *
 * Fails closed (throws NormalizeResultUnitError) rather than guessing when:
 *  - the analyte code is not declared (`analyte-unknown`);
 *  - the analyte's declared canonical unit is not itself a declared unit
 *    (`analyte-canonical-unit-undeclared`);
 *  - the reported value is not a finite plain-decimal string
 *    (`value-not-finite-decimal`);
 *  - the reported unit is not declared (`unit-unknown`);
 *  - the reported unit belongs to a different family than the analyte's
 *    declared family (`unit-family-mismatch`).
 *
 * Every conversion factor used comes from the explicit UNIT_TABLE; none is
 * computed or estimated at call time.
 */
export function normalizeResultUnit(input: NormalizeResultUnitInput): NormalizeResultUnitResult {
  if (typeof input.analyteCode !== 'string' || input.analyteCode.length === 0) {
    throw new NormalizeResultUnitError('analyte-unknown');
  }
  const analyte = ANALYTE_TABLE_BY_CODE.get(input.analyteCode);
  if (!analyte) {
    throw new NormalizeResultUnitError('analyte-unknown');
  }

  const canonicalDeclaration = UNIT_TABLE_BY_UNIT.get(analyte.canonicalUnit);
  if (!canonicalDeclaration || canonicalDeclaration.family !== analyte.family) {
    throw new NormalizeResultUnitError('analyte-canonical-unit-undeclared');
  }

  if (typeof input.valueText !== 'string') {
    throw new NormalizeResultUnitError('value-not-finite-decimal');
  }
  const parsed = parseDecimalText(input.valueText);
  if (!parsed) {
    throw new NormalizeResultUnitError('value-not-finite-decimal');
  }

  if (typeof input.unit !== 'string' || input.unit.length === 0) {
    throw new NormalizeResultUnitError('unit-unknown');
  }
  const sourceDeclaration = UNIT_TABLE_BY_UNIT.get(input.unit);
  if (!sourceDeclaration) {
    throw new NormalizeResultUnitError('unit-unknown');
  }
  if (sourceDeclaration.family !== analyte.family) {
    throw new NormalizeResultUnitError('unit-family-mismatch');
  }

  const baseValue = parsed.value * sourceDeclaration.toBaseFactor;
  const rawCanonicalValue = baseValue / canonicalDeclaration.toBaseFactor;
  const canonicalValueText = rawCanonicalValue.toPrecision(parsed.significantFigures);
  const canonicalValue = Number(canonicalValueText);

  return {
    analyteCode: analyte.analyteCode,
    family: analyte.family,
    originalUnit: sourceDeclaration.unit,
    originalValue: parsed.value,
    canonicalUnit: canonicalDeclaration.unit,
    canonicalValue,
    canonicalValueText,
    significantFigures: parsed.significantFigures,
  };
}
