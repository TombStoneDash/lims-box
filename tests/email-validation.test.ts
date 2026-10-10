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
  test(`a well-formed email is accepted: ${email}`, () => {
    assert.equal(normalizeEmail(email), email);
  });
}

for (const [label, value] of [
  ['consecutive dots in domain', 'a@b..com'],
  ['trailing dot after domain', 'a@b.com.'],
  ['domain label starting with hyphen', 'a@-b.com'],
  ['disallowed character in domain label', 'a@b.c<x>'],
  ['quoted local part', '"a"@b.com'],
  ['65-character local part', `${'a'.repeat(65)}@b.com`],
  ['255-character address', `${'a'.repeat(249)}@b.com`],
] as const) {
  test(`a malformed email (${label}) returns null`, () => {
    assert.equal(normalizeEmail(value), null);
  });
}
