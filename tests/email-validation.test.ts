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
  ['trailing dot in domain', 'a@b.com.'],
  ['leading hyphen in domain label', 'a@-b.com'],
  ['invalid characters in domain label', 'a@b.c<x>'],
  ['quoted local part', '"a"@b.com'],
] as const) {
  test(`a malformed email (${label}) returns null`, () => {
    assert.equal(normalizeEmail(value), null);
  });
}

test('a local part longer than 64 characters returns null', () => {
  const longLocal = `${'a'.repeat(65)}@example.com`;
  assert.equal(normalizeEmail(longLocal), null);
});

test('an address longer than 254 characters returns null', () => {
  const longDomain = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.com`;
  const longLocal = 'a'.repeat(59);
  const longAddress = `${longLocal}@${longDomain}`;
  assert.equal(longAddress.length, 255);
  assert.equal(normalizeEmail(longAddress), null);
});

for (const email of [
  'user+tag@example.com',
  'user@mail.example.com',
  'user+tag@mail.example.com',
]) {
  test(`the permissive regex accepts ${email}`, () => {
    assert.equal(normalizeEmail(email), email);
  });
}
