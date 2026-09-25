/**
 * Fail-closed, deterministic accession barcode/label validator for the
 * synthetic OHWorks pilot.
 *
 * This module is a pure, dependency-free parser and formatter for a fixed
 * accession label format:
 *
 *   PREFIX (3 uppercase letters, from a bounded synthetic site registry)
 *   SEQUENCE (6 zero-padded digits, 000000-999999)
 *   YEAR (2 digits, the two-digit accession year)
 *   CHECK (1 character, computed from PREFIX+SEQUENCE+YEAR by a declared
 *          weighted base-36 modulus rule)
 *
 * concatenated with no separators, for a fixed total length of 12
 * characters, e.g. "LAB00000126P".
 *
 * The check character rule: map every character of PREFIX+SEQUENCE+YEAR to
 * its value in the 36-symbol alphabet "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
 * (digits 0-9 map to 0-9, letters A-Z map to 10-35), multiply each value by
 * its 1-based position in that string, sum the products, and take the sum
 * modulo 36. The remainder indexes back into the same alphabet to produce
 * the check character.
 *
 * The site prefix registry, and every fixture used to exercise this module,
 * is entirely synthetic: it names no real facility, patient, or sample.
 *
 * parseSpecimenLabel never throws for malformed label input; it returns a
 * discriminated result carrying the parsed parts or the first rule the
 * label failed. formatSpecimenLabel throws SpecimenLabelError when asked to
 * build a label from parts that are themselves out of the format's bounds
 * (unknown site prefix, out-of-range sequence or year), since that input is
 * caller-controlled rather than external label data.
 */

/** Bounded, synthetic site registry. Not tied to any real facility. */
export type SpecimenLabelSitePrefix = 'LAB' | 'ENV' | 'WTR' | 'SED' | 'AIR';

export const KNOWN_SITE_PREFIXES: readonly SpecimenLabelSitePrefix[] = ['LAB', 'ENV', 'WTR', 'SED', 'AIR'];

const KNOWN_SITE_PREFIX_SET: ReadonlySet<string> = new Set<SpecimenLabelSitePrefix>(KNOWN_SITE_PREFIXES);

const SITE_PREFIX_LENGTH = 3;
const SEQUENCE_LENGTH = 6;
const YEAR_LENGTH = 2;
const CHECK_LENGTH = 1;

/** Total fixed length of a well-formed label, in characters. */
export const SPECIMEN_LABEL_TOTAL_LENGTH = SITE_PREFIX_LENGTH + SEQUENCE_LENGTH + YEAR_LENGTH + CHECK_LENGTH;

const MAX_SEQUENCE = 10 ** SEQUENCE_LENGTH - 1;
const MAX_YEAR = 10 ** YEAR_LENGTH - 1;

const CHECK_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Parsed, validated parts of a well-formed specimen label. */
export type SpecimenLabelParts = {
  sitePrefix: SpecimenLabelSitePrefix;
  /** 0-999999, the decoded (not zero-padded) sequence number. */
  sequence: number;
  /** 0-99, the two-digit accession year. */
  year: number;
  /** The single computed check character, from CHECK_ALPHABET. */
  checkChar: string;
};

/** Every rule this module can fail on, checked in this order by parseSpecimenLabel. */
export type SpecimenLabelRuleCode =
  | 'label-not-string'
  | 'length-invalid'
  | 'mixed-case'
  | 'site-prefix-unknown'
  | 'sequence-non-numeric'
  | 'year-non-numeric'
  | 'check-character-invalid'
  | 'sequence-out-of-range'
  | 'year-out-of-range';

const RULE_MESSAGES: Record<SpecimenLabelRuleCode, string> = {
  'label-not-string': 'The label is not a string.',
  'length-invalid': `The label is not exactly ${SPECIMEN_LABEL_TOTAL_LENGTH} characters long.`,
  'mixed-case': 'The label mixes uppercase and lowercase letters; labels must be a single case.',
  'site-prefix-unknown': 'The site prefix is not a recognized bounded value.',
  'sequence-non-numeric': 'The sequence segment contains a non-digit character.',
  'year-non-numeric': 'The year segment contains a non-digit character.',
  'check-character-invalid': 'The check character does not match the value computed from the label.',
  'sequence-out-of-range': `The sequence must be an integer between 0 and ${MAX_SEQUENCE}.`,
  'year-out-of-range': `The year must be an integer between 0 and ${MAX_YEAR}.`,
};

/** Deterministic, human-readable text for a fail-closed rule code. */
export function explainSpecimenLabelRuleCode(code: SpecimenLabelRuleCode): string {
  return RULE_MESSAGES[code];
}

/** Thrown by formatSpecimenLabel when the supplied parts are out of the format's bounds. */
export class SpecimenLabelError extends Error {
  readonly code: SpecimenLabelRuleCode;

  constructor(code: SpecimenLabelRuleCode) {
    super(RULE_MESSAGES[code]);
    this.name = 'SpecimenLabelError';
    this.code = code;
  }
}

export type SpecimenLabelParseResult =
  | { ok: true; parts: SpecimenLabelParts }
  | { ok: false; ruleCode: SpecimenLabelRuleCode; message: string };

function fail(ruleCode: SpecimenLabelRuleCode): SpecimenLabelParseResult {
  return { ok: false, ruleCode, message: RULE_MESSAGES[ruleCode] };
}

/**
 * Compute the single check character for PREFIX+SEQUENCE+YEAR, per the
 * weighted base-36 modulus rule described in the module doc comment.
 *
 * Callers must ensure `sitePrefix`, `sequenceDigits`, and `yearDigits`
 * contain only characters from CHECK_ALPHABET before calling this; both
 * parseSpecimenLabel and formatSpecimenLabel enforce that beforehand.
 */
function computeCheckCharacter(sitePrefix: string, sequenceDigits: string, yearDigits: string): string {
  const payload = sitePrefix + sequenceDigits + yearDigits;
  let sum = 0;
  for (let i = 0; i < payload.length; i += 1) {
    const value = CHECK_ALPHABET.indexOf(payload[i]);
    sum += value * (i + 1);
  }
  return CHECK_ALPHABET[sum % CHECK_ALPHABET.length];
}

/**
 * Parse a raw label string against the fixed OHWorks specimen label format.
 *
 * Fail-closed: never throws. Rules are checked in a fixed order and this
 * returns the first one the label fails, or the parsed parts if every rule
 * passes.
 */
export function parseSpecimenLabel(raw: unknown): SpecimenLabelParseResult {
  if (typeof raw !== 'string') {
    return fail('label-not-string');
  }

  if (raw.length !== SPECIMEN_LABEL_TOTAL_LENGTH) {
    return fail('length-invalid');
  }

  const hasUpper = /[A-Z]/.test(raw);
  const hasLower = /[a-z]/.test(raw);
  if (hasUpper && hasLower) {
    return fail('mixed-case');
  }

  const sitePrefix = raw.slice(0, SITE_PREFIX_LENGTH);
  const sequenceDigits = raw.slice(SITE_PREFIX_LENGTH, SITE_PREFIX_LENGTH + SEQUENCE_LENGTH);
  const yearDigits = raw.slice(
    SITE_PREFIX_LENGTH + SEQUENCE_LENGTH,
    SITE_PREFIX_LENGTH + SEQUENCE_LENGTH + YEAR_LENGTH,
  );
  const checkChar = raw.slice(-CHECK_LENGTH);

  if (!KNOWN_SITE_PREFIX_SET.has(sitePrefix)) {
    return fail('site-prefix-unknown');
  }

  if (!/^\d+$/.test(sequenceDigits)) {
    return fail('sequence-non-numeric');
  }

  if (!/^\d+$/.test(yearDigits)) {
    return fail('year-non-numeric');
  }

  const expectedCheckChar = computeCheckCharacter(sitePrefix, sequenceDigits, yearDigits);
  if (checkChar !== expectedCheckChar) {
    return fail('check-character-invalid');
  }

  return {
    ok: true,
    parts: {
      sitePrefix: sitePrefix as SpecimenLabelSitePrefix,
      sequence: Number(sequenceDigits),
      year: Number(yearDigits),
      checkChar,
    },
  };
}

export type SpecimenLabelFormatInput = {
  sitePrefix: SpecimenLabelSitePrefix;
  sequence: number;
  year: number;
};

/**
 * Build a well-formed label string from parts, computing the check
 * character rather than trusting any caller-supplied one.
 *
 * Fail-closed: throws SpecimenLabelError if the site prefix is not in the
 * bounded registry, or if the sequence or year is not an integer within
 * this format's representable range.
 */
export function formatSpecimenLabel(parts: SpecimenLabelFormatInput): string {
  if (!KNOWN_SITE_PREFIX_SET.has(parts.sitePrefix)) {
    throw new SpecimenLabelError('site-prefix-unknown');
  }

  if (!Number.isInteger(parts.sequence) || parts.sequence < 0 || parts.sequence > MAX_SEQUENCE) {
    throw new SpecimenLabelError('sequence-out-of-range');
  }

  if (!Number.isInteger(parts.year) || parts.year < 0 || parts.year > MAX_YEAR) {
    throw new SpecimenLabelError('year-out-of-range');
  }

  const sequenceDigits = String(parts.sequence).padStart(SEQUENCE_LENGTH, '0');
  const yearDigits = String(parts.year).padStart(YEAR_LENGTH, '0');
  const checkChar = computeCheckCharacter(parts.sitePrefix, sequenceDigits, yearDigits);

  return `${parts.sitePrefix}${sequenceDigits}${yearDigits}${checkChar}`;
}
