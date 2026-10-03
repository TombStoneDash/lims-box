import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { intakeErrorMessage } from '../../lib/intake-form-status';

const fallback = 'We could not send your form. Please try again, or email us.';
const source = readFileSync(new URL('../../app/_intake/IntakeForm.tsx', import.meta.url), 'utf8');

test('passes through a clean server message', () => {
  assert.equal(intakeErrorMessage({ status: 400, serverError: 'Please enter your email.' }), 'Please enter your email.');
  assert.equal(intakeErrorMessage({ serverError: 'a'.repeat(199) }), 'a'.repeat(199));
});

test('replaces HTML-looking messages', () => {
  for (const serverError of ['<html>Server error</html>', 'Unexpected token <', 'error >']) {
    assert.equal(intakeErrorMessage({ serverError }), fallback);
  }
});

test('does not expose a thrown SyntaxError', () => {
  assert.equal(intakeErrorMessage({ thrown: new SyntaxError('Unexpected token < in JSON at position 0') }), fallback);
});

test('handles a missing body', () => {
  assert.equal(intakeErrorMessage({}), fallback);
  assert.equal(intakeErrorMessage({ serverError: null }), fallback);
});

test('handles a 500 with no JSON', () => {
  assert.equal(intakeErrorMessage({ status: 500 }), fallback);
  assert.match(source, /res\.json\(\)\.catch\(\(\) => null\)/);
  assert.match(source, /!res\.ok \|\| !json\?\.ok/);
  assert.match(source, /intakeErrorMessage\(\{ status: res\.status, serverError: json\?\.error \}\)/);
});

test('rejects empty, oversized, and non-string server errors', () => {
  for (const serverError of ['', '  ', 'a'.repeat(200), {}, 500, false]) {
    assert.equal(intakeErrorMessage({ serverError }), fallback);
  }
});

test('form exposes accessible errors, selections, and range values', () => {
  assert.match(source, /role="alert"/);
  assert.match(source, /role="group" aria-labelledby=\{labSizeLabelId\}/);
  assert.match(source, /id=\{labSizeLabelId\}/);
  assert.match(source, /aria-pressed=\{state\.labSize === s\}/);
  assert.match(source, /aria-label="Field vs bench split"/);
  assert.ok(source.includes('aria-valuetext={`${state.fieldBenchSplit}% field, ${100 - state.fieldBenchSplit}% bench`}'));
  assert.doesNotMatch(source, /err\.message/);
  assert.match(source, /intakeErrorMessage\(\{ thrown: err \}\)/);
});
