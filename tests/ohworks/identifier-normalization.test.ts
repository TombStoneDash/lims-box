import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_IDENTIFIER_PATTERNS,
  IdentifierNormalizationError,
  PROBABLE_MATCH_THRESHOLD,
  explainIdentifierNormalizationError,
  normalizeIdentifier,
  scoreIdentifierMatch,
  type IdentifierNormalizationErrorCode,
  type IdentifierPattern,
} from '../../lib/ohworks-identifier-normalization';

/**
 * All fabricated: synthetic accession/requisition/external-reference
 * identifiers only. None of this represents a real patient, sample, or
 * customer identifier, and no name or personal data ever appears here.
 */

const ALL_ERROR_CODES: IdentifierNormalizationErrorCode[] = [
  'not-a-string',
  'empty-input',
  'no-alphabetic-prefix',
  'unrecognized-prefix',
  'missing-digits',
  'invalid-character',
  'undeclared-ocr-position',
  'value-too-large',
];

function expectError(fn: () => unknown, code: IdentifierNormalizationErrorCode): void {
  assert.throws(
    fn,
    (error: unknown) => {
      assert.ok(error instanceof IdentifierNormalizationError);
      assert.equal((error as IdentifierNormalizationError).code, code);
      return true;
    },
  );
}

// --- canonicalization: case, whitespace, separators ---

test('a plain accession identifier normalizes to its canonical form', () => {
  const result = normalizeIdentifier('ACC-123456');
  assert.equal(result.kind, 'accession');
  assert.equal(result.prefix, 'ACC');
  assert.equal(result.digits, '123456');
  assert.equal(result.canonical, 'ACC-123456');
});

test('lowercase input normalizes identically to uppercase input', () => {
  const upper = normalizeIdentifier('ACC-123456');
  const lower = normalizeIdentifier('acc-123456');
  assert.equal(upper.canonical, lower.canonical);
});

test('mixed-case input normalizes identically', () => {
  assert.equal(normalizeIdentifier('AcC-123456').canonical, 'ACC-123456');
});

test('surrounding and internal whitespace is stripped before matching', () => {
  assert.equal(normalizeIdentifier('  acc 123456  ').canonical, 'ACC-123456');
});

test('underscore, period, and slash separators all normalize identically to hyphen', () => {
  const hyphen = normalizeIdentifier('ACC-123456').canonical;
  assert.equal(normalizeIdentifier('ACC_123456').canonical, hyphen);
  assert.equal(normalizeIdentifier('ACC.123456').canonical, hyphen);
  assert.equal(normalizeIdentifier('ACC/123456').canonical, hyphen);
});

test('no separator at all still normalizes correctly', () => {
  assert.equal(normalizeIdentifier('ACC123456').canonical, 'ACC-123456');
});

test('repeated separator characters collapse and normalize identically', () => {
  assert.equal(normalizeIdentifier('ACC---123456').canonical, 'ACC-123456');
  assert.equal(normalizeIdentifier('ACC  123456').canonical, 'ACC-123456');
});

// --- leading zeros ---

test('fewer digits than the declared width are zero-padded on the left', () => {
  assert.equal(normalizeIdentifier('ACC-123').canonical, 'ACC-000123');
});

test('extra leading zeros beyond the declared width are absorbed, not rejected', () => {
  assert.equal(normalizeIdentifier('ACC-0000123').canonical, 'ACC-000123');
});

test('an all-zero numeric segment normalizes to the zero-padded canonical form', () => {
  assert.equal(normalizeIdentifier('ACC-0').canonical, 'ACC-000000');
});

test('two inputs differing only in leading zero count normalize to the same canonical form', () => {
  const a = normalizeIdentifier('REQ-00000042');
  const b = normalizeIdentifier('REQ-42');
  assert.equal(a.canonical, b.canonical);
});

// --- OCR confusion limited to declared positions ---

test('O and I are corrected to 0 and 1 only at a pattern-declared position', () => {
  // ACC declares positions 4 and 5 (from the right) as OCR-ambiguous.
  const result = normalizeIdentifier('ACC-OI1234');
  assert.equal(result.digits, '011234');
  assert.equal(result.canonical, 'ACC-011234');
});

test('a declared-position O at the rightmost declared boundary is corrected', () => {
  // REQ declares positions 6 and 7 (from the right) as OCR-ambiguous; tail length 8.
  const result = normalizeIdentifier('REQ-O1234567');
  assert.equal(result.digits, '01234567');
});

test('an O at a position not declared as OCR-ambiguous fails closed', () => {
  expectError(() => normalizeIdentifier('ACC-1234O6'), 'undeclared-ocr-position');
});

test('an I at a position not declared as OCR-ambiguous fails closed', () => {
  expectError(() => normalizeIdentifier('REQ-123456I8'), 'undeclared-ocr-position');
});

test('a pattern declaring no OCR-ambiguous positions rejects every letter in the digit segment', () => {
  expectError(() => normalizeIdentifier('EXT-1234O'), 'undeclared-ocr-position');
  expectError(() => normalizeIdentifier('EXT-I2345'), 'undeclared-ocr-position');
});

test('OCR correction composes with genuine leading zeros in the same digit segment', () => {
  // ACC tail "OI0034" (length 6, matching the declared width) -> corrected "010034".
  const result = normalizeIdentifier('ACC-OI0034');
  assert.equal(result.canonical, 'ACC-010034');
});

// --- fail-closed: empty and unrecognized input ---

test('an empty string fails closed', () => {
  expectError(() => normalizeIdentifier(''), 'empty-input');
});

test('a whitespace-only string fails closed as empty', () => {
  expectError(() => normalizeIdentifier('   '), 'empty-input');
});

test('a separator-only string fails closed as empty', () => {
  expectError(() => normalizeIdentifier('--__..'), 'empty-input');
});

test('a non-string input fails closed', () => {
  expectError(() => normalizeIdentifier(123456 as unknown as string), 'not-a-string');
});

test('null input fails closed', () => {
  expectError(() => normalizeIdentifier(null as unknown as string), 'not-a-string');
});

test('undefined input fails closed', () => {
  expectError(() => normalizeIdentifier(undefined as unknown as string), 'not-a-string');
});

test('an identifier with no alphabetic prefix fails closed', () => {
  expectError(() => normalizeIdentifier('123456'), 'no-alphabetic-prefix');
});

test('an identifier with an undeclared prefix fails closed', () => {
  expectError(() => normalizeIdentifier('ZZZ-123456'), 'unrecognized-prefix');
});

test('a prefix with no digit segment fails closed', () => {
  expectError(() => normalizeIdentifier('ACC'), 'missing-digits');
  expectError(() => normalizeIdentifier('ACC----'), 'missing-digits');
});

test('a digit segment containing a non-O/I letter fails closed', () => {
  expectError(() => normalizeIdentifier('ACC-12A456'), 'invalid-character');
});

test('a numeric value that overflows the declared pattern width fails closed', () => {
  expectError(() => normalizeIdentifier('EXT-199999'), 'value-too-large');
});

test('a numeric value exactly at the declared width boundary is accepted', () => {
  assert.equal(normalizeIdentifier('EXT-99999').canonical, 'EXT-99999');
});

test('does not fit any declared pattern (unrecognized-prefix and structural mismatches) fails closed rather than returning a best guess', () => {
  expectError(() => normalizeIdentifier('NOPE'), 'unrecognized-prefix');
});

// --- purity, determinism, and output shape ---

test('normalization is deterministic across repeated calls', () => {
  assert.deepEqual(normalizeIdentifier('acc 123456'), normalizeIdentifier('ACC-123456'));
});

test('normalization does not mutate the declared patterns array', () => {
  const before = JSON.stringify(DEFAULT_IDENTIFIER_PATTERNS);
  normalizeIdentifier('ACC-123456');
  assert.equal(JSON.stringify(DEFAULT_IDENTIFIER_PATTERNS), before);
});

test('the normalized result is frozen', () => {
  assert.ok(Object.isFrozen(normalizeIdentifier('ACC-123456')));
});

// --- match scoring ---

test('two identical identifiers score an exact match', () => {
  const match = scoreIdentifierMatch('ACC-123456', 'ACC-123456');
  assert.equal(match.score, 1);
  assert.equal(match.exact, true);
  assert.equal(match.isProbableMatch, true);
});

test('two differently formatted inputs that canonicalize the same score an exact match', () => {
  const match = scoreIdentifierMatch('acc 000123', 'ACC-123');
  assert.equal(match.exact, true);
  assert.equal(match.score, 1);
});

test('a single-digit typo scores below exact but can still be a probable match', () => {
  const match = scoreIdentifierMatch('ACC-123456', 'ACC-123457');
  assert.equal(match.exact, false);
  assert.ok(match.score > 0 && match.score < 1);
  assert.equal(match.score, 5 / 6);
  assert.equal(match.isProbableMatch, true);
});

test('a fully mismatched digit segment of the same kind scores zero', () => {
  const match = scoreIdentifierMatch('ACC-123456', 'ACC-999999');
  assert.equal(match.score, 0);
  assert.equal(match.exact, false);
  assert.equal(match.isProbableMatch, false);
});

test('identifiers under different declared prefixes score zero regardless of digit similarity', () => {
  const match = scoreIdentifierMatch('ACC-123456', 'REQ-00123456');
  assert.equal(match.score, 0);
  assert.equal(match.isProbableMatch, false);
});

test('the declared probable-match threshold is exposed and used consistently', () => {
  assert.equal(PROBABLE_MATCH_THRESHOLD, 0.8);
  const custom: IdentifierPattern[] = [
    { kind: 'accession', prefix: 'SYN', digitLength: 4, ocrAmbiguousPositionsFromEnd: [] },
  ];
  const belowThreshold = scoreIdentifierMatch('SYN-1234', 'SYN-4321', custom);
  assert.ok(belowThreshold.score < PROBABLE_MATCH_THRESHOLD);
  assert.equal(belowThreshold.isProbableMatch, false);

  const nearMiss = scoreIdentifierMatch('SYN-1234', 'SYN-1235', custom);
  assert.equal(nearMiss.score, 0.75);
  assert.equal(nearMiss.isProbableMatch, false);
});

test('matching corrects OCR ambiguity on both sides before scoring', () => {
  const match = scoreIdentifierMatch('ACC-OI1234', 'ACC-011234');
  assert.equal(match.exact, true);
  assert.equal(match.score, 1);
});

test('matching fails closed when the first identifier does not fit a declared pattern', () => {
  expectError(() => scoreIdentifierMatch('', 'ACC-123456'), 'empty-input');
});

test('matching fails closed when the second identifier does not fit a declared pattern', () => {
  expectError(() => scoreIdentifierMatch('ACC-123456', 'ZZZ-123456'), 'unrecognized-prefix');
});

test('match results are frozen', () => {
  assert.ok(Object.isFrozen(scoreIdentifierMatch('ACC-123456', 'ACC-123456')));
});

test('match scoring is deterministic across repeated calls', () => {
  const first = scoreIdentifierMatch('ACC-123456', 'ACC-123457');
  const second = scoreIdentifierMatch('ACC-123456', 'ACC-123457');
  assert.deepEqual(first, second);
});

// --- caller-declared patterns ---

test('a caller-declared pattern set is honored instead of the defaults', () => {
  const custom: IdentifierPattern[] = [
    { kind: 'external-reference', prefix: 'SPEC', digitLength: 3, ocrAmbiguousPositionsFromEnd: [0] },
  ];
  const result = normalizeIdentifier('spec-2O', custom);
  assert.equal(result.canonical, 'SPEC-020');
});

test('a caller-declared pattern set rejects identifiers matching only the defaults', () => {
  const custom: IdentifierPattern[] = [
    { kind: 'external-reference', prefix: 'SPEC', digitLength: 3, ocrAmbiguousPositionsFromEnd: [] },
  ];
  expectError(() => normalizeIdentifier('ACC-123456', custom), 'unrecognized-prefix');
});

// --- error explanations never leak submitted data ---

test('every declared error code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_ERROR_CODES) {
    const message = explainIdentifierNormalizationError(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(
    explainIdentifierNormalizationError('unrecognized-prefix'),
    explainIdentifierNormalizationError('unrecognized-prefix'),
  );
});

test('a thrown error message never echoes the submitted raw identifier', () => {
  try {
    normalizeIdentifier('ACC-12A456');
    assert.fail('expected normalizeIdentifier to throw');
  } catch (error) {
    assert.ok(error instanceof IdentifierNormalizationError);
    assert.doesNotMatch((error as Error).message, /12A456/);
  }
});
