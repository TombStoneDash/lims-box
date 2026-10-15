import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEmail } from '../lib/emailValidation';

test('a well-formed lowercase email round-trips unchanged', () => {
  assert.equal(normalizeEmail('user@example.com'), 'user@example.com');
});

test('mixed case and surrounding whitespace are normalized', () => {
  assert.equal(normalizeEmail(' \tUser@Example.COM\n '), 'user@example.com');
});

for (const [label, value] of [
  ['number', 42],
  ['null', null],
  ['undefined', undefined],
  ['object', {}],
  ['array', ['user@example.com']],
] as const) {
  test(`a non-string ${label} returns null`, () => {
    assert.equal(normalizeEmail(value), null);
  });
}

for (const [label, value] of [
  ['missing @', 'user.example.com'],
  ['missing domain dot', 'user@example'],
  ['empty string', ''],
  ['whitespace-only', ' \t\n '],
  ['consecutive dots in domain', 'a@b..com'],
  ['trailing dot on domain', 'a@b.com.'],
  ['leading hyphen domain label', 'a@-b.com'],
  ['markup characters in domain', 'a@b.c<x>'],
  ['quoted local part', '"a"@b.com'],
  ['65-char local part', `${'a'.repeat(65)}@example.com`],
  ['255-char address', `${'a'.repeat(243)}@example.com`],
] as const) {
  test(`a malformed email (${label}) returns null`, () => {
    assert.equal(normalizeEmail(value), null);
  });
}

for (const email of [
  'user+tag@example.com',
  'user@mail.example.com',
  'user+tag@mail.example.com',
]) {
  test(`a well-formed email accepts ${email}`, () => {
    assert.equal(normalizeEmail(email), email);
  });
}

for (const email of ['josé@x.com', 'user@münchen.de']) {
  test(`unicode letters in the local part and domain are accepted (${email})`, () => {
    assert.equal(normalizeEmail(email), email);
  });
}
