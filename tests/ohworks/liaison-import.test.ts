import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseLiaisonExport } from '../../lib/ohworks-liaison-import';

const options = { serviceKeywordByAssayCode: {
  'SYNTHETIC-ASSAY-A': 'SYNTHETIC-SERVICE-A',
  'SYNTHETIC-ASSAY-B': 'SYNTHETIC-SERVICE-B',
} };
const header = 'sample id,assay code,result value,unit,flag,run timestamp,instrument serial';
const base = ['SYNTHETIC-SAMPLE-001', 'SYNTHETIC-ASSAY-A', '12.5', 'SYNTHETIC-UNIT', '',
  '2026-09-20T10:15:30Z', 'SYNTHETIC-INSTRUMENT-001'];
const row = (changes: Record<number, string> = {}) => base.map((field, index) => changes[index] ?? field).join(',');
const parse = (...rows: string[]) => parseLiaisonExport([header, ...rows].join('\n'), options);

test('fabricated fixture: quoted delimiters/escaped quotes, numeric values and UTC timestamps', () => {
  const fixture = readFileSync(new URL('./fixtures/SYNTHETIC-liaison-export.csv', import.meta.url), 'utf8');
  const expected = { results: [
    { sampleId: base[0], keyword: 'SYNTHETIC-SERVICE-A', value: 12.5, unit: base[3], flag: '',
      capturedAtIso: '2026-09-20T10:15:30.000Z', instrument: base[6] },
    { sampleId: 'SYNTHETIC-SAMPLE,002', keyword: 'SYNTHETIC-SERVICE-B', value: -23, unit: base[3],
      flag: 'SYNTHETIC-FLAG "RECHECK", HIGH', capturedAtIso: '2026-09-20T10:15:30.123Z', instrument: base[6] },
  ], rejected: [] };
  assert.deepEqual(parseLiaisonExport(fixture, options), expected);
  assert.deepEqual(parseLiaisonExport('\uFEFF' + fixture.replace(/\n/g, '\r\n') + '\r\n', options), expected);
});

test('unknown code does not prevent a separate valid row from importing', () => {
  const parsed = parse(row({ 1: 'SYNTHETIC-UNKNOWN' }), row({ 0: 'SYNTHETIC-SAMPLE-002' }));
  assert.deepEqual(parsed.rejected, [{ line: 2, reason: 'unknown-assay-code' }]);
  assert.equal(parsed.results.length, 1);
});

test('mapping requires an own, nonempty keyword', () => {
  const inherited = Object.create({ 'SYNTHETIC-ASSAY-A': 'SYNTHETIC-SERVICE-A' });
  for (const mapping of [inherited, { 'SYNTHETIC-ASSAY-A': '' }]) {
    assert.deepEqual(parseLiaisonExport(header + '\n' + row(), { serviceKeywordByAssayCode: mapping }),
      { results: [], rejected: [{ line: 2, reason: 'unknown-assay-code' }] });
  }
});

test('rejects missing sample id', () => {
  assert.deepEqual(parse(row({ 0: '  ' })), { results: [], rejected: [{ line: 2, reason: 'missing-sample-id' }] });
});

test('rejects invalid numbers instead of coercing or truncating', () => {
  for (const value of ['', ' ', 'SYNTHETIC-NEGATIVE', '12mg', '<5', 'NaN', 'Infinity', '0x10', '1e999', '1e-999']) {
    assert.deepEqual(parse(row({ 2: value })), { results: [], rejected: [{ line: 2, reason: 'non-numeric-value' }] });
  }
  assert.equal(parse(row({ 2: '0' })).results[0].value, 0);
});

test('rejects all duplicates, including an earlier row and duplicates with invalid values', () => {
  assert.deepEqual(parse(row(), row({ 2: 'SYNTHETIC-INVALID' })), { results: [], rejected: [
    { line: 2, reason: 'duplicate-sample-assay' }, { line: 3, reason: 'duplicate-sample-assay' },
  ] });
  assert.equal(parse(row(), row({ 1: 'SYNTHETIC-ASSAY-B' }), row({ 0: 'SYNTHETIC-SAMPLE-002' })).results.length, 3);
});

test('rejects bad, ambiguous and impossible timestamps', () => {
  for (const timestamp of ['', 'SYNTHETIC-INVALID', '2026-09-20', '2026-09-20T10:15:30',
    '2026-02-29T10:15:30Z', '2026-04-31T10:15:30Z', '2026-13-01T00:00:00Z',
    '2026-01-00T00:00:00Z', '2026-09-20T24:00:00Z', '2026-09-20T10:60:00Z',
    '2026-09-20T10:15:60Z', '2026-09-20T10:15:30+24:00', '2026-09-20T10:15:30-00:00']) {
    assert.deepEqual(parse(row({ 5: timestamp })), { results: [], rejected: [{ line: 2, reason: 'bad-timestamp' }] });
  }
  assert.equal(parse(row({ 5: '2024-02-29T10:15:30-02:00' })).results[0].capturedAtIso, '2024-02-29T12:15:30.000Z');
});

test('detects tab and semicolon from the required header', () => {
  for (const delimiter of ['\t', ';']) {
    assert.deepEqual(parseLiaisonExport(header.replaceAll(',', delimiter) + '\n' + base.join(delimiter), options), parse(row()));
  }
});

test('fails closed for absent/incorrect headers and malformed records', () => {
  for (const text of ['', row(), header.replace('sample id', 'SYNTHETIC-WRONG') + '\n' + row()]) {
    assert.deepEqual(parseLiaisonExport(text, options), { results: [], rejected: [{ line: 1, reason: 'invalid-header' }] });
  }
  for (const record of [row() + ',SYNTHETIC-EXTRA', base.slice(0, -1).join(','),
    row({ 0: 'SYNTHETIC-BAD"QUOTE' }), row({ 0: '"SYNTHETIC-CLOSED"suffix' }), row({ 0: '"SYNTHETIC-UNCLOSED' })]) {
    assert.deepEqual(parse(record), { results: [], rejected: [{ line: 2, reason: 'malformed-record' }] });
  }
  assert.deepEqual(parse(row({ 6: '' })), { results: [], rejected: [{ line: 2, reason: 'missing-instrument-serial' }] });
});

test('quoted newlines preserve content and subsequent rejection physical line numbers', () => {
  const parsed = parse(row({ 4: '"SYNTHETIC-FLAG\nSYNTHETIC-CONTINUED"' }), '', row({ 0: '' }));
  assert.equal(parsed.results[0].flag, 'SYNTHETIC-FLAG\nSYNTHETIC-CONTINUED');
  assert.deepEqual(parsed.rejected, [{ line: 4, reason: 'malformed-record' }, { line: 5, reason: 'missing-sample-id' }]);
});
