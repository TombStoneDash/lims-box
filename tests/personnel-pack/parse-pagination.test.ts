import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePagination } from '../../lib/personnel-pack-utils';

test('missing limit defaults to 20 and missing cursor defaults to null', () => {
  assert.deepEqual(parsePagination(new URL('https://example.test/')), {
    limit: 20,
    cursor: null,
  });
});

test('an in-range limit passes through unchanged', () => {
  assert.equal(parsePagination(new URL('https://example.test/?limit=42')).limit, 42);
});

for (const [input, expected] of [['0', 1], ['-5', 1], ['101', 100]] as const) {
  test(`limit=${input} clamps to ${expected}`, () => {
    assert.equal(parsePagination(new URL(`https://example.test/?limit=${input}`)).limit, expected);
  });
}

for (const input of ['abc', '', 'NaN', '%20']) {
  test(`limit=${input} defaults to a finite 20`, () => {
    const result = parsePagination(new URL(`https://example.test/?limit=${input}`));
    assert.ok(Number.isFinite(result.limit));
    assert.equal(result.limit, 20);
  });
}

test('decimal limit=5.9 retains parseInt truncation to 5', () => {
  assert.equal(parsePagination(new URL('https://example.test/?limit=5.9')).limit, 5);
});

test('cursor passthrough is preserved for valid and malformed limits', () => {
  for (const limit of ['42', 'abc']) {
    const result = parsePagination(new URL(`https://example.test/?limit=${limit}&cursor=version%2F123`));
    assert.equal(result.cursor, 'version/123');
  }
  assert.equal(parsePagination(new URL('https://example.test/?cursor=')).cursor, '');
});
