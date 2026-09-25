/**
 * Deterministic, synthetic OHWorks reporting-format rules.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated
 * numeric result for a synthetic analyte, and a declared set of per-analyte
 * reporting formats (decimal places, censoring symbols and limits for below
 * detection and above quantitation, a unit label, and optional qualitative
 * mapping thresholds), it produces the exact report string that should be
 * shown for that result, plus the qualitative label when one is declared
 * and matches.
 *
 * It performs no I/O, reads no system clock, mutates no SENAITE or database
 * state, and touches no real specimen, instrument, or customer data. Every
 * value in every fixture and test is fabricated.
 *
 * A result below the declared below-detection limit, or above the declared
 * above-quantitation limit, is censored: the report string is the declared
 * censoring symbol followed by the declared limit itself, never the raw
 * reading. The limit is written out at its own full precision -- it is
 * never rounded to the analyte's declared decimal places. Rounding a
 * detection or quantitation limit down to fewer digits than it was declared
 * with would silently imply a precision the lab never claimed, so censored
 * values are always reported at the limit's own exact value. Only an
 * in-range (non-censored) result is rounded, and only to the analyte's
 * declared decimal places.
 *
 * A result exactly at the below-detection limit or exactly at the
 * above-quantitation limit is in range, not censored: censoring triggers
 * only for a reading strictly below the lower limit or strictly above the
 * upper limit.
 *
 * When a format declares qualitative mapping thresholds, the raw
 * (uncensored) numeric result is matched against them in declared order;
 * the first band whose inclusive lower bound and exclusive upper bound (or
 * no upper bound, for the topmost band) contains the result supplies the
 * qualitative label. A result matching no declared band, or a format with
 * no declared thresholds, yields no qualitative label.
 *
 * This module never guesses in the result's favor: an analyte with no
 * declared format, a non-finite result, or a declared format with negative
 * decimal places all fail closed by throwing ReportingFormatError, as does
 * any structurally malformed input.
 */

export type QualitativeThreshold = {
  label: string;
  /** Inclusive lower bound of this band. */
  minValue: number;
  /** Exclusive upper bound of this band, or null for the topmost band (unbounded above). */
  maxValue: number | null;
};

export type ReportingFormat = {
  analyteCode: string;
  /** Unit label appended to every report string for this analyte. */
  unit: string;
  /** Number of decimal places an in-range (non-censored) result is rounded to. Must not be negative. */
  decimalPlaces: number;
  /** Symbol prefixed to the below-detection limit when a result is censored low, e.g. "<". */
  belowDetectionSymbol: string;
  /** A result strictly below this limit is censored low. */
  belowDetectionLimit: number;
  /** Symbol prefixed to the above-quantitation limit when a result is censored high, e.g. ">". */
  aboveQuantitationSymbol: string;
  /** A result strictly above this limit is censored high. */
  aboveQuantitationLimit: number;
  /** Declared qualitative bands, matched in array order, or null when this analyte has no qualitative mapping. */
  qualitativeThresholds: ReadonlyArray<QualitativeThreshold> | null;
};

export type ReportRequest = {
  analyteCode: string;
  /** Fabricated raw numeric result for this analyte. */
  value: number;
  /** Declared reporting formats for every known analyte. */
  formats: ReadonlyArray<ReportingFormat>;
};

export type ReportCensoring = 'below-detection' | 'above-quantitation' | null;

export type ReportOutcome = {
  analyteCode: string;
  /** The exact report string: the formatted number (or censored symbol + exact limit), a space, then the unit. */
  reportString: string;
  censoring: ReportCensoring;
  /** The matched qualitative label, or null when no thresholds are declared or none match. */
  qualitativeLabel: string | null;
};

export type ReportingFormatErrorCode =
  | 'request-malformed'
  | 'formats-malformed'
  | 'unknown-analyte'
  | 'non-finite-result'
  | 'negative-decimal-places';

const ERROR_MESSAGES: Record<ReportingFormatErrorCode, string> = {
  'request-malformed': 'The report request is missing a required field or has the wrong shape.',
  'formats-malformed': 'The declared reporting formats are not a valid list of format entries.',
  'unknown-analyte': 'No reporting format is declared for this analyte.',
  'non-finite-result': 'The numeric result is not finite.',
  'negative-decimal-places': 'The declared reporting format has a negative number of decimal places.',
};

/** Thrown for any input this module will not guess at: malformed shape, an undeclared analyte, a non-finite result, or a format with negative decimal places. */
export class ReportingFormatError extends Error {
  readonly code: ReportingFormatErrorCode;

  constructor(code: ReportingFormatErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'ReportingFormatError';
    this.code = code;
  }
}

/** Deterministic, privacy-safe human-readable text for a reporting-format error code, suitable for UI display. */
export function explainReportingFormatError(code: ReportingFormatErrorCode): string {
  return ERROR_MESSAGES[code];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStructurallyValidThreshold(raw: unknown): raw is QualitativeThreshold {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  if (!isNonEmptyString(candidate.label)) {
    return false;
  }
  if (!isFiniteNumber(candidate.minValue)) {
    return false;
  }
  if (candidate.maxValue !== null) {
    if (!isFiniteNumber(candidate.maxValue)) {
      return false;
    }
    if (!(candidate.minValue < candidate.maxValue)) {
      return false;
    }
  }
  return true;
}

function isStructurallyValidFormat(raw: unknown): raw is ReportingFormat {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  if (!isNonEmptyString(candidate.analyteCode)) {
    return false;
  }
  if (!isNonEmptyString(candidate.unit)) {
    return false;
  }
  if (typeof candidate.decimalPlaces !== 'number' || !Number.isFinite(candidate.decimalPlaces) || !Number.isInteger(candidate.decimalPlaces)) {
    return false;
  }
  if (!isNonEmptyString(candidate.belowDetectionSymbol)) {
    return false;
  }
  if (!isFiniteNumber(candidate.belowDetectionLimit)) {
    return false;
  }
  if (!isNonEmptyString(candidate.aboveQuantitationSymbol)) {
    return false;
  }
  if (!isFiniteNumber(candidate.aboveQuantitationLimit)) {
    return false;
  }
  if (candidate.qualitativeThresholds !== null) {
    if (!Array.isArray(candidate.qualitativeThresholds) || !candidate.qualitativeThresholds.every(isStructurallyValidThreshold)) {
      return false;
    }
  }
  return true;
}

/** Renders a finite number as plain decimal text at its own full precision, never rounded. */
function exactNumberText(value: number): string {
  if (Object.is(value, -0)) {
    return '0';
  }
  return value.toString();
}

/** Renders a finite number rounded to a non-negative number of decimal places, with negative zero normalized to positive zero. */
function roundedNumberText(value: number, decimalPlaces: number): string {
  const fixed = value.toFixed(decimalPlaces);
  if (fixed === `-${(0).toFixed(decimalPlaces)}`) {
    return (0).toFixed(decimalPlaces);
  }
  return fixed;
}

function matchQualitativeLabel(value: number, thresholds: ReadonlyArray<QualitativeThreshold> | null): string | null {
  if (!thresholds) {
    return null;
  }
  for (const threshold of thresholds) {
    if (value >= threshold.minValue && (threshold.maxValue === null || value < threshold.maxValue)) {
      return threshold.label;
    }
  }
  return null;
}

/**
 * Format a fabricated numeric result according to its analyte's declared
 * reporting format, returning the exact report string, the censoring
 * status, and the qualitative label when one is declared and matches.
 *
 * Fail-closed: an analyte with no declared reporting format, a non-finite
 * result, or a declared format with negative decimal places all throw
 * ReportingFormatError instead of guessing. Structurally unusable input (a
 * malformed request or a malformed format list) throws ReportingFormatError
 * as well.
 */
export function formatReportedResult(request: ReportRequest): ReportOutcome {
  if (typeof request !== 'object' || request === null) {
    throw new ReportingFormatError('request-malformed');
  }
  const { analyteCode, value, formats } = request;

  if (!isNonEmptyString(analyteCode)) {
    throw new ReportingFormatError('request-malformed');
  }
  if (typeof value !== 'number') {
    throw new ReportingFormatError('request-malformed');
  }
  if (!Array.isArray(formats) || !formats.every(isStructurallyValidFormat)) {
    throw new ReportingFormatError('formats-malformed');
  }

  const format = formats.find((candidate) => candidate.analyteCode === analyteCode);
  if (!format) {
    throw new ReportingFormatError('unknown-analyte');
  }

  if (!Number.isFinite(value)) {
    throw new ReportingFormatError('non-finite-result');
  }

  if (format.decimalPlaces < 0) {
    throw new ReportingFormatError('negative-decimal-places');
  }

  let censoring: ReportCensoring = null;
  let numberText: string;
  if (value < format.belowDetectionLimit) {
    censoring = 'below-detection';
    numberText = `${format.belowDetectionSymbol}${exactNumberText(format.belowDetectionLimit)}`;
  } else if (value > format.aboveQuantitationLimit) {
    censoring = 'above-quantitation';
    numberText = `${format.aboveQuantitationSymbol}${exactNumberText(format.aboveQuantitationLimit)}`;
  } else {
    numberText = roundedNumberText(value, format.decimalPlaces);
  }

  return Object.freeze({
    analyteCode,
    reportString: `${numberText} ${format.unit}`,
    censoring,
    qualitativeLabel: matchQualitativeLabel(value, format.qualitativeThresholds),
  });
}
