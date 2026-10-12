import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateInstrumentMessage,
  type InstrumentMessageError,
} from '../../lib/ohworks-instrument-message';

/** All fabricated: synthetic instrument, specimen, and analyte identifiers. */
const VALID = {
  instrumentId: 'analyzer-synthetic-x1',
  specimenId: 'SYN-SPEC-0001',
  analyteCode: 'GLU',
  value: '5.40',
  units: 'mmol/L',
  resultedAt: '2026-03-04T09:15:00-08:00',
};

function errorsOf(input: unknown): readonly InstrumentMessageError[] {
  const result = validateInstrumentMessage(input);
  assert.equal(result.ok, false);
  return result.ok ? [] : result.errors;
}

test('accepts a complete message and normalizes it', () => {
  const result = validateInstrumentMessage({ ...VALID, specimenId: '  SYN-SPEC-0001 ' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.message, {
    instrumentId: 'analyzer-synthetic-x1',
    specimenId: 'SYN-SPEC-0001',
    analyteCode: 'GLU',
    value: '5.40',
    units: 'mmol/L',
    resultedAt: '2026-03-04T17:15:00.000Z',
  });
});

test('keeps decimal text as reported and accepts finite numbers', () => {
  const asNumber = validateInstrumentMessage({ ...VALID, value: 12 });
  assert.equal(asNumber.ok && asNumber.message.value, '12');
  const negative = validateInstrumentMessage({ ...VALID, value: '-0.50' });
  assert.equal(negative.ok && negative.message.value, '-0.50');
});

test('rejects a non-object message', () => {
  for (const input of [null, undefined, 'msg', 42, []]) {
    assert.deepEqual(errorsOf(input), [{ field: 'message', code: 'message-not-object' }]);
  }
});

test('reports every missing required field', () => {
  assert.deepEqual(errorsOf({}), [
    { field: 'instrumentId', code: 'field-missing' },
    { field: 'specimenId', code: 'field-missing' },
    { field: 'analyteCode', code: 'field-missing' },
    { field: 'value', code: 'field-missing' },
    { field: 'units', code: 'field-missing' },
    { field: 'resultedAt', code: 'field-missing' },
  ]);
});

test('distinguishes non-string and empty fields', () => {
  assert.deepEqual(errorsOf({ ...VALID, instrumentId: 7 }), [{ field: 'instrumentId', code: 'field-not-string' }]);
  assert.deepEqual(errorsOf({ ...VALID, analyteCode: '   ' }), [{ field: 'analyteCode', code: 'field-empty' }]);
});

test('rejects ambiguous identifiers', () => {
  for (const specimenId of ['SYN 0001', 'SYN,0001', 'SYN|0001', '-SYN', 'SYN*']) {
    assert.deepEqual(errorsOf({ ...VALID, specimenId }), [{ field: 'specimenId', code: 'identifier-ambiguous' }]);
  }
});

test('rejects non-decimal values', () => {
  for (const value of ['0x10', '1e3', 'Infinity', 'NaN', '5,4', '>5', '5.', NaN, Infinity]) {
    assert.deepEqual(errorsOf({ ...VALID, value }), [{ field: 'value', code: 'value-not-numeric' }], String(value));
  }
});

test('rejects malformed units', () => {
  assert.deepEqual(errorsOf({ ...VALID, units: 'mg dL' }), [{ field: 'units', code: 'units-invalid' }]);
  assert.deepEqual(errorsOf({ ...VALID, units: 'x'.repeat(33) }), [{ field: 'units', code: 'units-invalid' }]);
  for (const units of ['mg/dL', '10^3/uL', '%', 'µg/L']) {
    assert.equal(validateInstrumentMessage({ ...VALID, units }).ok, true, units);
  }
});

test('rejects ambiguous or impossible timestamps', () => {
  for (const resultedAt of [
    '2026-03-04',
    '2026-03-04 09:15:00Z',
    '2026-03-04T09:15:00',
    '2026-02-30T09:15:00Z',
    '2026-13-01T09:15:00Z',
    '2026-03-04T24:00:00Z',
    '2026-03-04T09:15:00+15:00',
    'not-a-date',
  ]) {
    assert.deepEqual(errorsOf({ ...VALID, resultedAt }), [{ field: 'resultedAt', code: 'timestamp-invalid' }], resultedAt);
  }
  const leap = validateInstrumentMessage({ ...VALID, resultedAt: '2028-02-29T23:59:59.5Z' });
  assert.equal(leap.ok && leap.message.resultedAt, '2028-02-29T23:59:59.500Z');
});

test('never echoes raw input values in errors', () => {
  const secret = 'SYN-SECRET-VALUE';
  const errors = errorsOf({ ...VALID, specimenId: `${secret} x`, value: secret, units: `${secret} y` });
  assert.equal(JSON.stringify(errors).includes(secret), false);
});
