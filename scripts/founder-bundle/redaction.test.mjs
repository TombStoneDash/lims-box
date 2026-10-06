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
    assert.match(redact(value), /redacted/);
  }
});

test('preserves career evidence and complete paragraph boundaries', () => {
  const passage = 'Historical Company\nLIMS Administrator, 2005–2008\n\nConfigured laboratory data imports.';
  assert.equal(redact(passage), '[name] [name]\nLIMS [name], 2005–2008\n\n[name] laboratory data imports.');
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

test('unknown name products fail closed without maintaining a private-name inventory', async () => {
  const { redactFounderNames } = await import('../../lib/bot/founder-privacy.mjs');
  for (const first of ['Zorvella', 'Élodixa', 'ǅorvella', 'Αλφα', 'Жанна', 'O’Zorvella']) {
    for (const last of ['Quenwick', 'deQuxwick', 'Zyx-Wex', 'D’Quxwick']) {
      for (const name of [`${first} ${last}`, `${last}, ${first}`, `${first[0]}. ${last}`, `${first}’s`, `${last}'s`, `${first.toUpperCase()} ${last.toUpperCase()}`]) {
        for (const form of [name, name.normalize('NFD'), name.replace(/([A-Za-z])/g, '$1\u200b'), name.replace(/[A-Za-z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0))]) {
          const output = redactFounderNames(form);
          assert.ok(output.includes('[name]'));
          assert.equal(/[\p{Lu}\p{Lt}]/u.test(output), false);
          assert.equal(redactFounderNames(output), output, 'redaction is idempotent');
        }
      }
    }
  }
  assert.equal(redactFounderNames('PreHudsonTaylor HudsonTaylorSuffix Hudson Taylor Quenwick'), '[name] [name] Hudson Taylor [name]');
});

test('every public allow-list entry survives including normalization and possessives', async () => {
  const { FOUNDER_NAME_ALLOWLIST } = await import('../../lib/bot/founder-name-allowlist.mjs');
  const { redactFounderNames } = await import('../../lib/bot/founder-privacy.mjs');
  for (const name of FOUNDER_NAME_ALLOWLIST) {
    for (const variant of [name, name.toUpperCase(), `${name}’s`, `${name}'s`]) {
      assert.equal(redactFounderNames(variant), variant);
    }
  }
});

test('whole-document clinical detection precedes redaction and handles Unicode', async () => {
  const { containsClinicalContent } = await import('../../lib/bot/founder-privacy.mjs');
  for (const marker of ['patient', 'PATIENTS', 'diagnosis', 'diagnoses', 'diagnosed', 'DOB: 42', 'MRN: A42', 'D.O.B.', 'M.R.N.', 'patient_name', 'date_of_birth', 'date of birth', 'clinical-case', 'specimen result', 'medical record number', 'ＰＡＴＩＥＮＴ', 'pa\u200btient']) {
    const document = `Hudson Taylor\n\nHistorical career evidence.\n\n${marker}\n\nMore career evidence.`;
    assert.equal(containsClinicalContent(document), true);
  }
  assert.equal(containsClinicalContent('Hudson Taylor\n\nconfigured laboratory data imports in 2005–2008.'), false);
});
