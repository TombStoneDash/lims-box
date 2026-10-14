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

test('rejects a number whose string form uses an exponent, same as the exponent string', () => {
  assert.deepEqual(errorsOf({ ...VALID, value: 0.0000001 }), [{ field: 'value', code: 'value-not-numeric' }]);
  assert.deepEqual(errorsOf({ ...VALID, value: '1e-7' }), [{ field: 'value', code: 'value-not-numeric' }]);
  assert.deepEqual(errorsOf({ ...VALID, value: 1e21 }), [{ field: 'value', code: 'value-not-numeric' }]);
});

test('every accepted message re-validates to the identical message', () => {
  const values: unknown[] = [
    12, -0.5, 0, -0, 0.000001, 0.0000001, 123456.789, 1e20, 1e21, NaN, Infinity,
    '5.40', '-0.50', '+3', '.5', '0007.10', '1e-7', ' 42 ',
  ];
  let accepted = 0;
  for (const value of values) {
    const first = validateInstrumentMessage({ ...VALID, value });
    if (!first.ok) continue;
    accepted += 1;
    const again = validateInstrumentMessage(first.message);
    assert.equal(again.ok, true, `re-validation failed for ${String(value)}`);
    assert.deepEqual(again.ok && again.message, first.message);
  }
  assert.ok(accepted >= 10);
});

test('rejects a timestamp whose UTC normalization leaves the accepted year range', () => {
  for (const resultedAt of [
    '9999-12-31T23:59:59-14:00',
    '9999-12-31T23:00:00-01:00',
    '0100-01-01T00:00:00+01:00',
    '0100-01-01T00:00:00+14:00',
    '0099-12-31T23:59:59Z',
    '0000-01-01T00:00:00Z',
  ]) {
    assert.deepEqual(errorsOf({ ...VALID, resultedAt }), [{ field: 'resultedAt', code: 'timestamp-invalid' }], resultedAt);
  }
  const top = validateInstrumentMessage({ ...VALID, resultedAt: '9999-12-31T23:59:59+14:00' });
  assert.equal(top.ok && top.message.resultedAt, '9999-12-31T09:59:59.000Z');
  const bottom = validateInstrumentMessage({ ...VALID, resultedAt: '0100-01-01T00:00:00-14:00' });
  assert.equal(bottom.ok && bottom.message.resultedAt, '0100-01-01T14:00:00.000Z');
});

test('property: for every field edge input, an accepted message re-validates to itself', () => {
  const offsets = ['Z', '+00:00', '+14:00', '-14:00', '+01:00', '-01:00', '+05:45', '-09:30', '+14:59', '-14:59'];
  const instants = [
    '9999-12-31T23:59:59', '9999-12-31T10:00:00', '9999-12-31T00:00:00.999', '0100-01-01T00:00:00',
    '0100-01-01T14:00:00', '0100-01-01T23:59:59.5', '2028-02-29T23:59:59.5', '1970-01-01T00:00:00',
  ];
  const edges: Record<string, unknown[]> = {
    instrumentId: ['a', '  a  ', 'A'.repeat(128), 'A'.repeat(129), '\tX-1\n', 'x.y_z-0', '-x', 'x-'],
    specimenId: ['SYN-SPEC-0001', '  SYN-SPEC-0001 ', '0', ' 0 ', 'S'.repeat(128), 'SYN 0001'],
    analyteCode: ['GLU', ' glu ', 'a.b', 'a..b', '.a'],
    value: [
      0, -0, 1, -1, 0.000001, 0.0000001, 5e-324, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER,
      Number.MAX_VALUE, 1e20, 1e21, -1e21, 123456.789, NaN, Infinity, -Infinity,
      '0', '-0', '+0', '.5', '-.5', '0007.10', ' 42 ', '\t-3.0\n', '1e-7', '9'.repeat(400), `0.${'0'.repeat(400)}1`,
    ],
    units: ['%', ' mg/dL ', 'x'.repeat(32), ` ${'x'.repeat(32)} `, 'x'.repeat(33), 'µg/L', '10^3/uL'],
    resultedAt: [
      ...instants.flatMap((instant) => offsets.map((offset) => `${instant}${offset}`)),
      ' 2026-03-04T09:15:00-08:00 ',
      '2026-03-04T09:15:00.1Z',
      '2026-03-04T09:15:00.12+00:00',
    ],
  };

  let accepted = 0;
  let rejected = 0;
  for (const [field, inputs] of Object.entries(edges)) {
    for (const input of inputs) {
      const label = `${field}=${String(input).slice(0, 60)}`;
      const first = validateInstrumentMessage({ ...VALID, [field]: input });
      if (!first.ok) {
        rejected += 1;
        continue;
      }
      accepted += 1;
      const again = validateInstrumentMessage(first.message);
      assert.equal(again.ok, true, `re-validation failed for ${label}`);
      assert.deepEqual(again.ok && again.message, first.message, label);
    }
  }
  assert.ok(accepted >= 60 && rejected >= 15, `accepted=${accepted} rejected=${rejected}`);
});
