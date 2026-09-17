/**
 * Fail-closed synthetic OHWorks result-unit normalization.
 *
 * This module is a pure, dependency-free function over a fabricated,
 * deliberately small table of analyte unit families and a fabricated
 * per-analyte canonical-reporting-unit registry. It performs no I/O, reads
 * no system clock, and touches no real analyte, sample, or customer data.
 *
 * Given a numeric result reported as decimal text plus the unit it was
 * reported in, it converts that value to the analyte's declared canonical
 * reporting unit and returns the converted value as decimal text alongside
 * a parsed `number`.
 *
 * All arithmetic is done on an exact bigint-backed decimal representation
 * (significant-digit coefficient + power-of-ten exponent). Every unit in
 * the table is related to its family's base unit by an exact power-of-ten
 * multiplier, so every conversion this module performs is an exact decimal
 * point shift: no floating-point multiplication, and no rounding error, is
 * ever introduced by the conversion itself. Significant figures are
 * preserved because shifting a decimal point neither adds nor removes
 * digits. A digit string's significant figures are every digit from its
 * first non-zero digit through the last digit as written, so trailing
 * zeros written by the caller (e.g. "500", "0.500") are treated as
 * intentional precision and kept; leading zeros are not.
 *
 * Only after computing the exact converted value does this module collapse
 * it to a JS `number` (a binary double). If that collapse cannot represent
 * the exact value faithfully -- because the exact magnitude is larger than
 * the largest finite double (overflow to Infinity) or because a
 * mathematically non-zero exact magnitude is smaller than the smallest
 * representable double and would silently collapse to 0 (underflow) -- the
 * conversion throws a typed error instead of returning a misleading
 * `Infinity` or `0`.
 *
 * Every failure mode -- a malformed or non-finite input, an unrecognized
 * unit, an analyte with no declared canonical unit, a cross-family
 * conversion, or a conversion result that cannot be faithfully represented
 * -- throws ResultUnitConversionError rather than guessing at a conversion
 * factor or silently returning a wrong number.
 */

export type UnitFamily = 'mass-concentration' | 'volume-concentration' | 'count-per-volume';

export type UnitId =
  | 'ng/L'
  | 'µg/L'
  | 'mg/L'
  | 'g/L'
  | 'µL/L'
  | 'mL/L'
  | 'L/L'
  | '%'
  | 'count/mL'
  | 'count/L'
  | 'count/100mL';

export type UnitDefinition = {
  family: UnitFamily;
  /** value_in_family_base_unit = value * 10^exponentToBase. Exact; never a guessed or approximated factor. */
  exponentToBase: number;
};

/** Small, explicit table of every unit this module knows how to convert. Nothing outside this table is guessed at. */
export const UNIT_TABLE: Readonly<Record<UnitId, UnitDefinition>> = Object.freeze({
  'ng/L': { family: 'mass-concentration', exponentToBase: -6 },
  'µg/L': { family: 'mass-concentration', exponentToBase: -3 },
  'mg/L': { family: 'mass-concentration', exponentToBase: 0 },
  'g/L': { family: 'mass-concentration', exponentToBase: 3 },

  'µL/L': { family: 'volume-concentration', exponentToBase: -3 },
  'mL/L': { family: 'volume-concentration', exponentToBase: 0 },
  'L/L': { family: 'volume-concentration', exponentToBase: 3 },
  '%': { family: 'volume-concentration', exponentToBase: 1 },

  'count/mL': { family: 'count-per-volume', exponentToBase: 3 },
  'count/L': { family: 'count-per-volume', exponentToBase: 0 },
  'count/100mL': { family: 'count-per-volume', exponentToBase: 1 },
});

/**
 * Small, explicit, fabricated registry of synthetic analyte identifiers to
 * their declared canonical reporting unit. An analyte absent from this
 * table has no declared canonical unit and conversion for it must fail
 * closed rather than guess one.
 */
export const ANALYTE_CANONICAL_UNITS: Readonly<Record<string, UnitId>> = Object.freeze({
  'analyte-synthetic-mass-001': 'mg/L',
  'analyte-synthetic-volume-001': 'mL/L',
  'analyte-synthetic-count-001': 'count/L',
});

export type ResultUnitConversionInput = {
  analyte: string;
  /** Decimal text, e.g. "1.230" or "0.00045". Plain decimal notation only; no scientific notation. */
  valueText: string;
  fromUnit: string;
};

export type ResultUnitConversionResult = {
  analyte: string;
  fromUnit: string;
  canonicalUnit: UnitId;
  /** Exact decimal text of the converted value, with significant figures preserved. */
  valueText: string;
  /** Number(valueText). Guaranteed finite, and guaranteed non-zero when the exact converted value is non-zero. */
  value: number;
  /** Count of significant digits carried over from valueText's input, per this module's documented significant-figures rule. */
  significantFigures: number;
};

export type ResultUnitConversionErrorCode =
  | 'analyte-malformed'
  | 'from-unit-malformed'
  | 'value-text-malformed'
  | 'from-unit-unknown'
  | 'analyte-canonical-unit-undeclared'
  | 'cross-family-conversion'
  | 'conversion-overflow'
  | 'conversion-underflow-nonzero-to-zero';

const ERROR_MESSAGES: Record<ResultUnitConversionErrorCode, string> = {
  'analyte-malformed': 'The analyte identifier is not a non-empty string.',
  'from-unit-malformed': 'The source unit is not a non-empty string.',
  'value-text-malformed': 'The result value text is not valid finite plain-decimal text.',
  'from-unit-unknown': 'The source unit is not a recognized unit in the conversion table.',
  'analyte-canonical-unit-undeclared': 'This analyte has no declared canonical reporting unit.',
  'cross-family-conversion': 'The source unit and the canonical reporting unit belong to different unit families.',
  'conversion-overflow': 'The exact converted value is larger than can be represented as a finite number.',
  'conversion-underflow-nonzero-to-zero':
    'The exact converted value is non-zero but too small to be represented as a non-zero number.',
};

/** Thrown for any input or result this module will not guess at: malformed input, unknown units, cross-family conversions, or a non-representable result. */
export class ResultUnitConversionError extends Error {
  readonly code: ResultUnitConversionErrorCode;

  constructor(code: ResultUnitConversionErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'ResultUnitConversionError';
    this.code = code;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Strict plain decimal: optional leading '-', at least one integer digit, optional '.' with at least one fraction digit. No scientific notation, no "Infinity"/"NaN", no leading '+'. */
const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

type ExactDecimal = {
  sign: 1 | -1;
  isZero: boolean;
  /** Significant-digit coefficient; unset (0n) when isZero. */
  coefficient: bigint;
  /** value = sign * coefficient * 10^exponent. */
  exponent: number;
  significantFigures: number;
};

function parseExactDecimal(valueText: string): ExactDecimal {
  if (!isNonEmptyString(valueText)) {
    throw new ResultUnitConversionError('value-text-malformed');
  }
  const match = DECIMAL_PATTERN.exec(valueText);
  if (!match) {
    throw new ResultUnitConversionError('value-text-malformed');
  }
  const [, signText, intPart, fracPart = ''] = match;
  const sign: 1 | -1 = signText === '-' ? -1 : 1;
  const combined = intPart + fracPart;
  const firstSignificant = combined.search(/[1-9]/);
  if (firstSignificant === -1) {
    return { sign: 1, isZero: true, coefficient: BigInt(0), exponent: 0, significantFigures: 0 };
  }
  const significantDigits = combined.slice(firstSignificant);
  return {
    sign,
    isZero: false,
    coefficient: BigInt(significantDigits),
    exponent: -fracPart.length,
    significantFigures: significantDigits.length,
  };
}

function formatExactDecimal(sign: 1 | -1, coefficient: bigint, exponent: number): string {
  if (coefficient === BigInt(0)) {
    return '0';
  }
  const digits = coefficient.toString();
  const pointPos = digits.length + exponent;
  let magnitude: string;
  if (pointPos <= 0) {
    magnitude = `0.${'0'.repeat(-pointPos)}${digits}`;
  } else if (pointPos >= digits.length) {
    magnitude = `${digits}${'0'.repeat(pointPos - digits.length)}`;
  } else {
    magnitude = `${digits.slice(0, pointPos)}.${digits.slice(pointPos)}`;
  }
  return sign === -1 ? `-${magnitude}` : magnitude;
}

/**
 * Convert a decimal-text result value from `fromUnit` to the declared
 * canonical reporting unit for `analyte`.
 *
 * Fails closed (throws ResultUnitConversionError) rather than guessing for:
 * malformed or non-finite `valueText`; an unrecognized `fromUnit`; an
 * analyte with no declared canonical unit; a `fromUnit` whose family
 * differs from the canonical unit's family; and an exact conversion result
 * that cannot be represented as a finite, faithfully non-zero JS number
 * (overflow to Infinity, or non-zero-to-zero underflow).
 */
export function convertResultToCanonicalUnit(input: ResultUnitConversionInput): ResultUnitConversionResult {
  if (typeof input !== 'object' || input === null) {
    throw new ResultUnitConversionError('analyte-malformed');
  }
  const { analyte, valueText, fromUnit } = input;

  if (!isNonEmptyString(analyte)) {
    throw new ResultUnitConversionError('analyte-malformed');
  }
  if (!isNonEmptyString(fromUnit)) {
    throw new ResultUnitConversionError('from-unit-malformed');
  }

  const parsed = parseExactDecimal(valueText);

  const canonicalUnit = (ANALYTE_CANONICAL_UNITS as Record<string, UnitId | undefined>)[analyte];
  if (canonicalUnit === undefined) {
    throw new ResultUnitConversionError('analyte-canonical-unit-undeclared');
  }
  const fromDefinition = (UNIT_TABLE as Record<string, UnitDefinition | undefined>)[fromUnit];
  if (fromDefinition === undefined) {
    throw new ResultUnitConversionError('from-unit-unknown');
  }
  const canonicalDefinition = UNIT_TABLE[canonicalUnit];
  if (fromDefinition.family !== canonicalDefinition.family) {
    throw new ResultUnitConversionError('cross-family-conversion');
  }

  if (parsed.isZero) {
    return Object.freeze({
      analyte,
      fromUnit,
      canonicalUnit,
      valueText: '0',
      value: 0,
      significantFigures: 0,
    });
  }

  const delta = fromDefinition.exponentToBase - canonicalDefinition.exponentToBase;
  const resultExponent = parsed.exponent + delta;
  const resultText = formatExactDecimal(parsed.sign, parsed.coefficient, resultExponent);
  const value = Number(resultText);

  if (!Number.isFinite(value)) {
    throw new ResultUnitConversionError('conversion-overflow');
  }
  if (value === 0) {
    throw new ResultUnitConversionError('conversion-underflow-nonzero-to-zero');
  }

  return Object.freeze({
    analyte,
    fromUnit,
    canonicalUnit,
    valueText: resultText,
    value,
    significantFigures: parsed.significantFigures,
  });
}

/** Deterministic, privacy-safe human-readable text for an error code, suitable for UI display. */
export function explainResultUnitConversionError(code: ResultUnitConversionErrorCode): string {
  return ERROR_MESSAGES[code];
}
