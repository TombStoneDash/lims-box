import assert from 'node:assert/strict';
import test from 'node:test';
import { redact } from './build.mjs';

test('redacts each contact and identifier class from the integration receipt', () => {
  for (const value of [
    'someone@example.test', 'https://example.test/profile', 'www.example.test',
    '(202) 555-0199', '2025550199', '+1 202 555 0199', '123-45-6789',
    '123 Example Avenue Apt 2', '333 E. Main St.', 'P.O. Box 123', 'P.O.Box 123', '+44 20 7946 0958', '123A Example Street',
    'CA 90210', 'CA, 90210', '90210-1234', 'DOB: 01/02/1900',
    'Date of birth: January 2, 1900', 'AAMC ID: 12345678',
  ]) {
    assert.ok(!redact(value).includes(value), value);
    assert.match(redact(value), /REDACTED/);
  }
});

test('preserves career evidence and complete paragraph boundaries', () => {
  const passage = 'Historical Company\nLIMS Administrator, 2005–2008\n\nConfigured laboratory data imports.';
  assert.equal(redact(passage), passage);
});

test('label/value/separator products remove short, long and alphanumeric identifiers', () => {
  for (const label of ['AMCAS', 'AAMC', 'ID', 'No.', '#', 'account', 'application', 'member', 'policy', 'license', 'licence', 'case', 'reference', 'SSN', 'DOB', 'passport', 'MRN', 'NPI', 'EIN']) {
    for (const suffix of ['', ' ID', ' number', ' No.']) {
      for (const separator of [' ', ': ', ' # ', ' = ', ':\n']) {
        for (const value of ['42', 'A42', '123456', '12345678', 'AB-1234']) {
          const output = redact(`${label}${suffix}${separator}${value}`);
          assert.ok(!output.includes(value), `${label}${suffix}${separator} synthetic identifier survived`);
        }
      }
    }
  }
});

test('unlabelled long digits are removed but years and dated ranges survive', () => {
  for (let length = 6; length <= 24; length++) {
    const value = '7'.repeat(length);
    assert.ok(!redact(`Record ${value}.`).includes(value));
  }
  const text = 'Hudson Taylor\nBerkshire Hathaway Energy\n2005–2008\n2005 - 2008\n2026';
  assert.equal(redact(text), text);
});
