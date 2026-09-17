/**
 * Fail-closed synthetic OHWorks identifier normalization.
 *
 * This module is a pure, dependency-free helper for reconciling accession
 * numbers, requisition numbers, and external reference identifiers that
 * were typed, scanned, or OCR'd inconsistently. It never looks at names,
 * addresses, dates of birth, or any other personal data — the only inputs
 * it accepts are short alphanumeric identifier strings matched against
 * declared identifier patterns, and it fails closed on anything else.
 *
 * Modeling choices, made explicit rather than guessed at silently:
 *
 *   - Every declared pattern is a fixed alphabetic prefix followed by a
 *     fixed-width numeric segment (e.g. "ACC" + 6 digits). Free text,
 *     names, and anything without a declared prefix is rejected outright;
 *     this module has no concept of a "name field" to accidentally handle.
 *   - Case, internal whitespace, and the separators declared in
 *     `IDENTIFIER_SEPARATORS` (space, hyphen, underscore, period, slash)
 *     are stripped before matching, so "acc 000123", "ACC-000123", and
 *     "acc_0123" all normalize identically.
 *   - Leading zeros are handled by parsing the numeric segment as an
 *     integer and re-padding it to the pattern's declared width, so the
 *     count of leading zeros a caller typed never affects the canonical
 *     form.
 *   - OCR confusion between the letters O/I and the digits 0/1 is only
 *     corrected at positions a pattern explicitly declares as
 *     OCR-ambiguous. Positions are counted from the *right* end of the
 *     zero-padded canonical digit segment (0 = the last/units digit),
 *     because that is the part of the identifier whose meaning is stable
 *     regardless of how many leading zeros a caller typed. A letter
 *     appearing anywhere else in the digit segment fails closed rather
 *     than being silently guessed at.
 *
 * Fails closed instead of guessing: empty or non-string input, an
 * unrecognized prefix, a digit segment containing a character that is
 * not a digit and not a declared-position O/I, a numeric value that
 * overflows the pattern's declared width, or a missing digit segment all
 * throw IdentifierNormalizationError rather than returning a best-effort
 * canonical form.
 */

export type IdentifierKind = 'accession' | 'requisition' | 'external-reference';

/** A declared, closed-world shape for one class of identifier. */
export type IdentifierPattern = {
  kind: IdentifierKind;
  /** Fixed literal alphabetic prefix, matched case-insensitively. */
  prefix: string;
  /** Fixed width of the canonical numeric segment. */
  digitLength: number;
  /**
   * Digit-segment positions, counted from the right (0 = units digit),
   * where an OCR-confused letter (O for 0, I for 1) is tolerated and
   * corrected. Any other position must already be a digit.
   */
  ocrAmbiguousPositionsFromEnd: ReadonlyArray<number>;
};

const IDENTIFIER_SEPARATORS = /[\s\-_./]+/g;

/** Synthetic, generic default patterns. Callers may declare their own instead. */
export const DEFAULT_IDENTIFIER_PATTERNS: ReadonlyArray<IdentifierPattern> = Object.freeze([
  Object.freeze({ kind: 'accession', prefix: 'ACC', digitLength: 6, ocrAmbiguousPositionsFromEnd: Object.freeze([4, 5]) }),
  Object.freeze({ kind: 'requisition', prefix: 'REQ', digitLength: 8, ocrAmbiguousPositionsFromEnd: Object.freeze([6, 7]) }),
  Object.freeze({ kind: 'external-reference', prefix: 'EXT', digitLength: 5, ocrAmbiguousPositionsFromEnd: Object.freeze([]) }),
]);

export type NormalizedIdentifier = {
  kind: IdentifierKind;
  prefix: string;
  /** Zero-padded canonical digit segment, fixed to the pattern's declared width. */
  digits: string;
  /** `${prefix}-${digits}`, the single canonical form for this identifier. */
  canonical: string;
};

export type IdentifierNormalizationErrorCode =
  | 'not-a-string'
  | 'empty-input'
  | 'no-alphabetic-prefix'
  | 'unrecognized-prefix'
  | 'missing-digits'
  | 'invalid-character'
  | 'undeclared-ocr-position'
  | 'value-too-large';

const ERROR_MESSAGES: Record<IdentifierNormalizationErrorCode, string> = {
  'not-a-string': 'The identifier is not a string.',
  'empty-input': 'The identifier is empty.',
  'no-alphabetic-prefix': 'The identifier has no leading alphabetic prefix.',
  'unrecognized-prefix': 'The identifier prefix does not match any declared pattern.',
  'missing-digits': 'The identifier has no numeric segment.',
  'invalid-character': 'The identifier numeric segment contains a character that is not a digit.',
  'undeclared-ocr-position': 'The identifier has a letter at a position not declared as OCR-ambiguous.',
  'value-too-large': 'The identifier numeric segment overflows the declared pattern width.',
};

/** Thrown for input that cannot be safely assigned a canonical identifier form. */
export class IdentifierNormalizationError extends Error {
  readonly code: IdentifierNormalizationErrorCode;

  constructor(code: IdentifierNormalizationErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'IdentifierNormalizationError';
    this.code = code;
  }
}

/** Deterministic, privacy-safe human-readable text for a normalization error code. */
export function explainIdentifierNormalizationError(code: IdentifierNormalizationErrorCode): string {
  return ERROR_MESSAGES[code];
}

function stripSeparatorsAndCase(raw: string): string {
  return raw.replace(IDENTIFIER_SEPARATORS, '').toUpperCase();
}

/**
 * Locate the declared pattern whose literal prefix opens `compact`, and
 * split off the remainder as the digit-segment tail. Matching is done
 * against each pattern's exact declared prefix string rather than a
 * generic leading-alphabetic-run scan, because a generic scan would
 * swallow OCR-confusable letters (O, I) that belong to the digit segment
 * into the prefix instead of leaving them for OCR correction.
 */
function findPatternAndTail(
  compact: string,
  patterns: ReadonlyArray<IdentifierPattern>,
): { pattern: IdentifierPattern; tail: string } {
  if (!/^[A-Z]/.test(compact)) {
    throw new IdentifierNormalizationError('no-alphabetic-prefix');
  }

  for (const pattern of patterns) {
    if (compact.startsWith(pattern.prefix)) {
      return { pattern, tail: compact.slice(pattern.prefix.length) };
    }
  }

  throw new IdentifierNormalizationError('unrecognized-prefix');
}

function correctDigitSegment(tail: string, pattern: IdentifierPattern): string {
  const ambiguous = new Set(pattern.ocrAmbiguousPositionsFromEnd);
  const length = tail.length;
  let corrected = '';

  for (let i = 0; i < length; i += 1) {
    const char = tail[i];
    const positionFromEnd = length - 1 - i;

    if (char >= '0' && char <= '9') {
      corrected += char;
      continue;
    }

    if (char === 'O' || char === 'I') {
      if (!ambiguous.has(positionFromEnd)) {
        throw new IdentifierNormalizationError('undeclared-ocr-position');
      }
      corrected += char === 'O' ? '0' : '1';
      continue;
    }

    throw new IdentifierNormalizationError('invalid-character');
  }

  return corrected;
}

/**
 * Normalize a raw, human-typed or OCR-scanned identifier against a set of
 * declared identifier patterns, producing a single canonical form. Fails
 * closed (throws IdentifierNormalizationError) on empty input and on any
 * identifier that does not fit exactly one declared pattern.
 */
export function normalizeIdentifier(
  raw: string,
  patterns: ReadonlyArray<IdentifierPattern> = DEFAULT_IDENTIFIER_PATTERNS,
): NormalizedIdentifier {
  if (typeof raw !== 'string') {
    throw new IdentifierNormalizationError('not-a-string');
  }

  const compact = stripSeparatorsAndCase(raw);
  if (compact.length === 0) {
    throw new IdentifierNormalizationError('empty-input');
  }

  const { pattern, tail } = findPatternAndTail(compact, patterns);

  if (tail.length === 0) {
    throw new IdentifierNormalizationError('missing-digits');
  }

  const digitString = correctDigitSegment(tail, pattern);
  const numericValue = Number.parseInt(digitString, 10);
  const maxValue = 10 ** pattern.digitLength;
  if (numericValue >= maxValue) {
    throw new IdentifierNormalizationError('value-too-large');
  }

  const digits = String(numericValue).padStart(pattern.digitLength, '0');

  return Object.freeze({
    kind: pattern.kind,
    prefix: pattern.prefix,
    digits,
    canonical: `${pattern.prefix}-${digits}`,
  });
}

/** Declared threshold at or above which two identifiers are treated as a probable match. */
export const PROBABLE_MATCH_THRESHOLD = 0.8;

export type IdentifierMatchResult = {
  /** Score in [0, 1]; 1 means the canonical forms are identical. */
  score: number;
  /** True when both identifiers normalize to the exact same canonical form. */
  exact: boolean;
  /** True when `score` is at or above the declared PROBABLE_MATCH_THRESHOLD. */
  isProbableMatch: boolean;
  canonicalA: string;
  canonicalB: string;
};

function digitDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) {
    table[i][0] = i;
  }
  for (let j = 0; j < cols; j += 1) {
    table[0][j] = j;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      table[i][j] = Math.min(table[i - 1][j] + 1, table[i][j - 1] + 1, table[i - 1][j - 1] + cost);
    }
  }

  return table[rows - 1][cols - 1];
}

/**
 * Normalize two raw identifiers and score how likely they are to refer to
 * the same underlying record. Fails closed: if either input does not
 * normalize against a declared pattern, the underlying
 * IdentifierNormalizationError propagates rather than being scored as a
 * non-match.
 */
export function scoreIdentifierMatch(
  rawA: string,
  rawB: string,
  patterns: ReadonlyArray<IdentifierPattern> = DEFAULT_IDENTIFIER_PATTERNS,
): IdentifierMatchResult {
  const normalizedA = normalizeIdentifier(rawA, patterns);
  const normalizedB = normalizeIdentifier(rawB, patterns);

  const canonicalA = normalizedA.canonical;
  const canonicalB = normalizedB.canonical;

  if (canonicalA === canonicalB) {
    return Object.freeze({ score: 1, exact: true, isProbableMatch: true, canonicalA, canonicalB });
  }

  if (normalizedA.kind !== normalizedB.kind || normalizedA.prefix !== normalizedB.prefix) {
    return Object.freeze({ score: 0, exact: false, isProbableMatch: false, canonicalA, canonicalB });
  }

  const distance = digitDistance(normalizedA.digits, normalizedB.digits);
  const maxLength = Math.max(normalizedA.digits.length, normalizedB.digits.length);
  const score = maxLength === 0 ? 1 : Math.max(0, 1 - distance / maxLength);

  return Object.freeze({
    score,
    exact: false,
    isProbableMatch: score >= PROBABLE_MATCH_THRESHOLD,
    canonicalA,
    canonicalB,
  });
}
