/**
 * Deterministic, synthetic-only OHWorks result unit conversion.
 *
 * This module is a pure, dependency-free converter: given a fabricated
 * analyte code, a fabricated numeric value, a source unit, and a target
 * unit, it converts between the "conventional" and "SI" unit declared for
 * that analyte in a small explicit table below. Every factor in the table
 * is documented with its molar basis so the arithmetic can be audited by
 * inspection rather than trusted blindly.
 *
 * It performs no I/O, reads no system clock, mutates no SENAITE or database
 * state, and touches no real subject, sample, or customer data.
 *
 * Conversion only ever happens when:
 *   - the analyte code is present in ANALYTE_UNIT_FACTORS, and
 *   - the requested source and target units are exactly the two units
 *     declared for that analyte (in either direction).
 *
 * A unit string is never used on its own to infer a conversion factor --
 * "mg/dL" means nothing without a matching analyte entry, because the
 * mg/dL -> SI factor differs by analyte (it depends on molar mass). If the
 * analyte is unknown, either unit is unknown for that analyte, the units
 * match but neither is a recognized member of the analyte's pair, the
 * value is non-finite, or the value is negative, this module refuses with
 * a typed UnitConversionError instead of guessing.
 */

export type UnitConversionErrorCode =
  | 'analyte-unknown'
  | 'unit-unknown'
  | 'unit-mismatched'
  | 'value-not-finite'
  | 'value-negative';

const ERROR_MESSAGES: Record<UnitConversionErrorCode, string> = {
  'analyte-unknown': 'The analyte code has no declared unit conversion factor.',
  'unit-unknown': 'The requested unit is not one of the two units declared for this analyte.',
  'unit-mismatched': 'The source and target units are not the declared conventional/SI pair for this analyte.',
  'value-not-finite': 'The value to convert is not a finite number.',
  'value-negative': 'Concentration values cannot be negative.',
};

/** Thrown when a conversion cannot be performed without guessing. */
export class UnitConversionError extends Error {
  readonly code: UnitConversionErrorCode;

  constructor(code: UnitConversionErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'UnitConversionError';
    this.code = code;
  }
}

export type AnalyteUnitFactor = {
  /** Fabricated analyte code this factor applies to. */
  analyteCode: string;
  /** Conventional (typically US customary) unit, e.g. "mg/dL". */
  conventionalUnit: string;
  /** SI unit, e.g. "mmol/L". */
  siUnit: string;
  /**
   * Multiply a conventional-unit value by this factor to get the SI-unit
   * value: si = conventional * conventionalToSi.
   */
  conventionalToSi: number;
  /** Molar mass (g/mol) underlying conventionalToSi, documented for audit. */
  molarMassGramsPerMole: number;
  /** Human-readable note on how conventionalToSi was derived from the molar mass. */
  molarBasis: string;
  /** Decimal places to round to when reporting a value in conventionalUnit. */
  conventionalDecimals: number;
  /** Decimal places to round to when reporting a value in siUnit. */
  siDecimals: number;
};

/**
 * Explicit, small, human-auditable table of analyte-specific conventional/SI
 * conversion factors. Every factor is derived from a documented molar mass:
 * SI (mmol/L or umol/L) = conventional (mg/dL) * (10 / molar mass in g/mol)
 * for mmol/L targets, or * (10000 / molar mass) for umol/L targets, since
 * mg/dL -> g/L is a factor of 10 and g/L -> mol/L divides by molar mass
 * (then mol/L -> mmol/L multiplies by 1000, or -> umol/L by 1,000,000).
 *
 * Rounding rules are declared per analyte and chosen so that a value
 * converted conventional -> SI -> conventional (or the reverse) returns to
 * within one unit in the last declared decimal place of the original.
 */
export const ANALYTE_UNIT_FACTORS: ReadonlyArray<AnalyteUnitFactor> = Object.freeze([
  Object.freeze({
    analyteCode: 'GLUCOSE',
    conventionalUnit: 'mg/dL',
    siUnit: 'mmol/L',
    // glucose molar mass 180.156 g/mol; mg/dL -> mmol/L = mg/dL * 10 / 180.156
    conventionalToSi: 10 / 180.156,
    molarMassGramsPerMole: 180.156,
    molarBasis: 'mmol/L = mg/dL * 10 / 180.156 (glucose, C6H12O6, molar mass 180.156 g/mol)',
    conventionalDecimals: 0,
    siDecimals: 2,
  }),
  Object.freeze({
    analyteCode: 'CREATININE',
    conventionalUnit: 'mg/dL',
    siUnit: 'umol/L',
    // creatinine molar mass 113.12 g/mol; mg/dL -> umol/L = mg/dL * 10000 / 113.12
    conventionalToSi: 10000 / 113.12,
    molarMassGramsPerMole: 113.12,
    molarBasis: 'umol/L = mg/dL * 10000 / 113.12 (creatinine, C4H7N3O, molar mass 113.12 g/mol)',
    conventionalDecimals: 3,
    siDecimals: 1,
  }),
  Object.freeze({
    analyteCode: 'CHOLESTEROL',
    conventionalUnit: 'mg/dL',
    siUnit: 'mmol/L',
    // cholesterol molar mass 386.65 g/mol; mg/dL -> mmol/L = mg/dL * 10 / 386.65
    conventionalToSi: 10 / 386.65,
    molarMassGramsPerMole: 386.65,
    molarBasis: 'mmol/L = mg/dL * 10 / 386.65 (cholesterol, C27H46O, molar mass 386.65 g/mol)',
    conventionalDecimals: 0,
    siDecimals: 2,
  }),
  Object.freeze({
    analyteCode: 'CALCIUM',
    conventionalUnit: 'mg/dL',
    siUnit: 'mmol/L',
    // calcium molar mass 40.078 g/mol; mg/dL -> mmol/L = mg/dL * 10 / 40.078
    conventionalToSi: 10 / 40.078,
    molarMassGramsPerMole: 40.078,
    molarBasis: 'mmol/L = mg/dL * 10 / 40.078 (elemental calcium, Ca, molar mass 40.078 g/mol)',
    conventionalDecimals: 1,
    siDecimals: 2,
  }),
]);

const FACTORS_BY_ANALYTE: ReadonlyMap<string, AnalyteUnitFactor> = new Map(
  ANALYTE_UNIT_FACTORS.map((factor) => [factor.analyteCode, factor]),
);

export type UnitConversionInput = {
  analyteCode: string;
  value: number;
  fromUnit: string;
  toUnit: string;
};

export type UnitConversionResult = {
  analyteCode: string;
  value: number;
  unit: string;
  /** Decimal places applied to `value` per the declared per-analyte rounding rule. */
  decimals: number;
};

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Convert a fabricated result value between the declared conventional and SI
 * units for a fabricated analyte code, using the explicit factor table
 * above. Never infers a factor from the unit strings alone: both the
 * analyte and the exact declared unit pair must match an entry.
 *
 * Fail-closed via UnitConversionError:
 *   - 'analyte-unknown':   no entry for analyteCode.
 *   - 'unit-unknown':      fromUnit or toUnit is not one of the two units
 *                          declared for this analyte.
 *   - 'unit-mismatched':   fromUnit and toUnit are the same unit, or are
 *                          both recognized but not the declared pair
 *                          (e.g. both equal to the same side).
 *   - 'value-not-finite':  value is NaN, +/-Infinity, or not a number.
 *   - 'value-negative':    value is a finite negative number.
 */
export function convertResultUnit(input: UnitConversionInput): UnitConversionResult {
  const factor = FACTORS_BY_ANALYTE.get(input.analyteCode);
  if (!factor) {
    throw new UnitConversionError('analyte-unknown');
  }

  const knownUnits = new Set([factor.conventionalUnit, factor.siUnit]);
  if (!knownUnits.has(input.fromUnit) || !knownUnits.has(input.toUnit)) {
    throw new UnitConversionError('unit-unknown');
  }
  if (input.fromUnit === input.toUnit) {
    throw new UnitConversionError('unit-mismatched');
  }

  if (typeof input.value !== 'number' || !Number.isFinite(input.value)) {
    throw new UnitConversionError('value-not-finite');
  }
  if (input.value < 0) {
    throw new UnitConversionError('value-negative');
  }

  if (input.fromUnit === factor.conventionalUnit && input.toUnit === factor.siUnit) {
    return Object.freeze({
      analyteCode: input.analyteCode,
      value: round(input.value * factor.conventionalToSi, factor.siDecimals),
      unit: factor.siUnit,
      decimals: factor.siDecimals,
    });
  }

  return Object.freeze({
    analyteCode: input.analyteCode,
    value: round(input.value / factor.conventionalToSi, factor.conventionalDecimals),
    unit: factor.conventionalUnit,
    decimals: factor.conventionalDecimals,
  });
}

/** Look up the declared conversion factor entry for an analyte, or undefined if none is declared. */
export function getAnalyteUnitFactor(analyteCode: string): AnalyteUnitFactor | undefined {
  return FACTORS_BY_ANALYTE.get(analyteCode);
}
