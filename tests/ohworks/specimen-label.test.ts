import assert from 'node:assert/strict';
import test from 'node:test';

import {
  explainSpecimenLabelRuleCode,
  formatSpecimenLabel,
  KNOWN_SITE_PREFIXES,
  parseSpecimenLabel,
  SPECIMEN_LABEL_TOTAL_LENGTH,
  SpecimenLabelError,
  type SpecimenLabelRuleCode,
} from '../../lib/ohworks-specimen-label';

/**
 * All fabricated: synthetic site prefixes and made-up sequence/year values.
 * None of this represents a real patient, specimen, facility, or result.
 */

test('formats a label from parts with the declared modulus check character', () => {
  const label = formatSpecimenLabel({ sitePrefix: 'LAB', sequence: 1, year: 26 });
  assert.equal(label, 'LAB00000126P');
  assert.equal(label.length, SPECIMEN_LABEL_TOTAL_LENGTH);
});

test('round-trips every known site prefix through format then parse', () => {
  for (const sitePrefix of KNOWN_SITE_PREFIXES) {
    const label = formatSpecimenLabel({ sitePrefix, sequence: 42, year: 5 });
    const result = parseSpecimenLabel(label);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.parts, { sitePrefix, sequence: 42, year: 5, checkChar: label.slice(-1) });
    }
  }
});

test('round-trips boundary sequence and year values', () => {
  for (const sequence of [0, 999999]) {
    for (const year of [0, 99]) {
      const label = formatSpecimenLabel({ sitePrefix: 'ENV', sequence, year });
      const result = parseSpecimenLabel(label);
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.parts.sequence, sequence);
        assert.equal(result.parts.year, year);
      }
    }
  }
});

test('zero-pads the sequence and year segments', () => {
  const label = formatSpecimenLabel({ sitePrefix: 'WTR', sequence: 7, year: 6 });
  assert.equal(label.slice(3, 9), '000007');
  assert.equal(label.slice(9, 11), '06');
});

test('fails closed on a non-string label', () => {
  const result = parseSpecimenLabel(12345 as unknown);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.ruleCode, 'label-not-string');
  }
});

test('fails closed on the wrong length', () => {
  const result = parseSpecimenLabel('LAB0000012P');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.ruleCode, 'length-invalid');
  }
});

test('fails closed on an unknown site prefix', () => {
  const result = parseSpecimenLabel('ZZZ00000126P');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.ruleCode, 'site-prefix-unknown');
  }
});

test('fails closed on a non-numeric sequence', () => {
  const result = parseSpecimenLabel('LAB0000A126P'.slice(0, 12));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.ruleCode, 'sequence-non-numeric');
  }
});

test('fails closed on a non-numeric year', () => {
  const base = formatSpecimenLabel({ sitePrefix: 'LAB', sequence: 1, year: 26 });
  const corrupted = `${base.slice(0, 9)}2Y${base.slice(11)}`;
  const result = parseSpecimenLabel(corrupted);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.ruleCode, 'year-non-numeric');
  }
});

test('fails closed on a bad check character', () => {
  const base = formatSpecimenLabel({ sitePrefix: 'LAB', sequence: 1, year: 26 });
  const wrongCheckChar = base.slice(-1) === 'A' ? 'B' : 'A';
  const corrupted = `${base.slice(0, -1)}${wrongCheckChar}`;
  const result = parseSpecimenLabel(corrupted);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.ruleCode, 'check-character-invalid');
  }
});

test('fails closed on mixed-case input', () => {
  const base = formatSpecimenLabel({ sitePrefix: 'LAB', sequence: 1, year: 26 });
  const mixed = `${base.slice(0, 2)}${base[2].toLowerCase()}${base.slice(3)}`;
  const result = parseSpecimenLabel(mixed);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.ruleCode, 'mixed-case');
  }
});

test('fails closed on an all-lowercase label via site-prefix-unknown, not a silent case fold', () => {
  const base = formatSpecimenLabel({ sitePrefix: 'LAB', sequence: 1, year: 26 });
  const result = parseSpecimenLabel(base.toLowerCase());
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.ruleCode, 'site-prefix-unknown');
  }
});

test('checks length before site prefix', () => {
  const result = parseSpecimenLabel('ZZ00000126P');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.ruleCode, 'length-invalid');
  }
});

test('checks mixed-case before site prefix', () => {
  const result = parseSpecimenLabel('lAB00000126P');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.ruleCode, 'mixed-case');
  }
});

test('checks site prefix before sequence numeric-ness', () => {
  const result = parseSpecimenLabel('ZZZ0000A126P'.slice(0, 12));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.ruleCode, 'site-prefix-unknown');
  }
});

test('formatSpecimenLabel throws SpecimenLabelError on an unknown site prefix', () => {
  assert.throws(
    () => formatSpecimenLabel({ sitePrefix: 'ZZZ' as unknown as 'LAB', sequence: 1, year: 26 }),
    (error: unknown) => error instanceof SpecimenLabelError && error.code === 'site-prefix-unknown',
  );
});

test('formatSpecimenLabel throws SpecimenLabelError on a negative sequence', () => {
  assert.throws(
    () => formatSpecimenLabel({ sitePrefix: 'LAB', sequence: -1, year: 26 }),
    (error: unknown) => error instanceof SpecimenLabelError && error.code === 'sequence-out-of-range',
  );
});

test('formatSpecimenLabel throws SpecimenLabelError on a sequence above the representable range', () => {
  assert.throws(
    () => formatSpecimenLabel({ sitePrefix: 'LAB', sequence: 1_000_000, year: 26 }),
    (error: unknown) => error instanceof SpecimenLabelError && error.code === 'sequence-out-of-range',
  );
});

test('formatSpecimenLabel throws SpecimenLabelError on a non-integer sequence', () => {
  assert.throws(
    () => formatSpecimenLabel({ sitePrefix: 'LAB', sequence: 1.5, year: 26 }),
    (error: unknown) => error instanceof SpecimenLabelError && error.code === 'sequence-out-of-range',
  );
});

test('formatSpecimenLabel throws SpecimenLabelError on a year above the representable range', () => {
  assert.throws(
    () => formatSpecimenLabel({ sitePrefix: 'LAB', sequence: 1, year: 100 }),
    (error: unknown) => error instanceof SpecimenLabelError && error.code === 'year-out-of-range',
  );
});

test('formatSpecimenLabel throws SpecimenLabelError on a negative year', () => {
  assert.throws(
    () => formatSpecimenLabel({ sitePrefix: 'LAB', sequence: 1, year: -1 }),
    (error: unknown) => error instanceof SpecimenLabelError && error.code === 'year-out-of-range',
  );
});

test('explainSpecimenLabelRuleCode returns deterministic, non-empty text for every rule code', () => {
  const codes: SpecimenLabelRuleCode[] = [
    'label-not-string',
    'length-invalid',
    'mixed-case',
    'site-prefix-unknown',
    'sequence-non-numeric',
    'year-non-numeric',
    'check-character-invalid',
    'sequence-out-of-range',
    'year-out-of-range',
  ];
  for (const code of codes) {
    const message = explainSpecimenLabelRuleCode(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

test('is deterministic: identical input always produces identical output', () => {
  const label = formatSpecimenLabel({ sitePrefix: 'SED', sequence: 314159, year: 3 });
  const first = parseSpecimenLabel(label);
  const second = parseSpecimenLabel(label);
  assert.deepEqual(first, second);
});
