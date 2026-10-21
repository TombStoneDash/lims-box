import assert from 'node:assert/strict';
import test from 'node:test';
import { clearSubmittedFields } from '../lib/contact-form-state';

const submitted = {
  name: 'Ada Lovelace',
  labName: 'Analytical Engines Lab',
  email: 'ada@example.com',
  labSize: '6-15',
  currentSystem: 'excel',
  message: 'Hello there',
};

test('clearSubmittedFields clears fields that still match the submitted snapshot', () => {
  const result = clearSubmittedFields(submitted, submitted);

  assert.deepEqual(result, {
    name: '',
    labName: '',
    email: '',
    labSize: '',
    currentSystem: '',
    message: '',
  });
});

test('clearSubmittedFields keeps a field the visitor edited while the request was in flight', () => {
  const current = { ...submitted, message: 'Actually, one more thing...' };

  const result = clearSubmittedFields(current, submitted);

  assert.equal(result.message, 'Actually, one more thing...');
  assert.equal(result.name, '');
  assert.equal(result.labName, '');
  assert.equal(result.email, '');
  assert.equal(result.labSize, '');
  assert.equal(result.currentSystem, '');
});

test('clearSubmittedFields leaves an empty form empty', () => {
  const empty = {
    name: '',
    labName: '',
    email: '',
    labSize: '',
    currentSystem: '',
    message: '',
  };

  const result = clearSubmittedFields(empty, empty);

  assert.deepEqual(result, empty);
});
