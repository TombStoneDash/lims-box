import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeContactSubmission } from '../lib/contact-submission';

test('normalizeContactSubmission rejects a whitespace-only name', () => {
  const result = normalizeContactSubmission({
    name: '   ',
    labName: 'Analytical Engines Lab',
    email: 'ada@example.com',
  });

  assert.equal(result.ok, false);
  assert.equal(
    !result.ok && result.error,
    'Name, valid email, and lab name are required',
  );
});

test('normalizeContactSubmission rejects a whitespace-only labName', () => {
  const result = normalizeContactSubmission({
    name: 'Ada Lovelace',
    labName: '   ',
    email: 'ada@example.com',
  });

  assert.equal(result.ok, false);
  assert.equal(
    !result.ok && result.error,
    'Name, valid email, and lab name are required',
  );
});

test('normalizeContactSubmission trims surrounding spaces on real values', () => {
  const result = normalizeContactSubmission({
    name: '  Ada Lovelace  ',
    labName: '  Analytical Engines Lab  ',
    email: '  ada@example.com  ',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.record, {
    name: 'Ada Lovelace',
    labName: 'Analytical Engines Lab',
    email: 'ada@example.com',
    labSize: null,
    currentSystem: null,
    message: null,
    phone: null,
    instruments: null,
  });
});

test('normalizeContactSubmission keeps optional fields on a valid submission', () => {
  const result = normalizeContactSubmission({
    name: 'Ada Lovelace',
    labName: 'Analytical Engines Lab',
    email: 'ada@example.com',
    labSize: '  11-50  ',
    currentSystem: '  LabWare  ',
    message: '  Interested in a demo  ',
    phone: '  555-0100  ',
    instruments: '  Centrifuge, PCR  ',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.record, {
    name: 'Ada Lovelace',
    labName: 'Analytical Engines Lab',
    email: 'ada@example.com',
    labSize: '11-50',
    currentSystem: 'LabWare',
    message: 'Interested in a demo',
    phone: '555-0100',
    instruments: 'Centrifuge, PCR',
  });
});
