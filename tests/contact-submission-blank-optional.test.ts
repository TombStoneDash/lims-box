import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeContactSubmission } from '../lib/contact-submission';

test('normalizeContactSubmission converts whitespace-only optional fields to null', () => {
  const result = normalizeContactSubmission({
    name: 'a',
    labName: 'b',
    email: 'a@b.co',
    phone: '   ',
    message: '  ',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.record, {
    name: 'a',
    labName: 'b',
    email: 'a@b.co',
    labSize: null,
    currentSystem: null,
    message: null,
    phone: null,
    instruments: null,
  });
});

test('normalizeContactSubmission keeps trimmed real values alongside blanked optional fields', () => {
  const result = normalizeContactSubmission({
    name: 'Ada Lovelace',
    labName: 'Analytical Engines Lab',
    email: 'ada@example.com',
    labSize: '  11-50  ',
    currentSystem: '   ',
    message: '  Interested in a demo  ',
    phone: '   ',
    instruments: '   ',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.record, {
    name: 'Ada Lovelace',
    labName: 'Analytical Engines Lab',
    email: 'ada@example.com',
    labSize: '11-50',
    currentSystem: null,
    message: 'Interested in a demo',
    phone: null,
    instruments: null,
  });
});
