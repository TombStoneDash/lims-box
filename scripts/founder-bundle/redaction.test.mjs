import assert from 'node:assert/strict';
import test from 'node:test';
import { redact } from './build.mjs';

test('redacts each contact and identifier class from the integration receipt', () => {
  for (const value of [
    'someone@example.test', 'https://example.test/profile', 'www.example.test',
    '(202) 555-0199', '2025550199', '+1 202 555 0199', '123-45-6789',
    '123 Example Avenue Apt 2', '333 E. Main St.', 'P.O. Box 123',
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
