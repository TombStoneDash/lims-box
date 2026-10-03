import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { registrationMessage, registrationOutcome } from '../../lib/webinar-registration';

test('successful responses are registered', () => {
  assert.equal(registrationOutcome({ ok: true, status: 200 }), 'registered');
  assert.equal(registrationMessage('registered'), '');
});

test('400 and 422 are invalid with actionable copy', () => {
  assert.equal(registrationOutcome({ ok: false, status: 400 }), 'invalid');
  assert.equal(registrationOutcome({ ok: false, status: 422 }), 'invalid');
  assert.equal(registrationMessage('invalid'), 'Please check your name and e-mail address.');
});

test('429, 500, and network errors are failed with retry copy', () => {
  assert.equal(registrationOutcome({ ok: false, status: 429 }), 'failed');
  assert.equal(registrationOutcome({ ok: false, status: 500 }), 'failed');
  assert.equal(registrationOutcome('network-error'), 'failed');
  assert.equal(
    registrationMessage('failed'),
    'We could not save your registration. Please try again, or e-mail us from the contact page.'
  );
});

test('webinar page uses the helper and shows an honest alert', () => {
  const source = readFileSync(new URL('../../app/webinar/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /from '@\/lib\/webinar-registration'/);
  assert.match(source, /role="alert"/);
  assert.doesNotMatch(source, /silent fail/i);

  const outcomeIndex = source.indexOf('registrationOutcome(');
  const setRegisteredIndex = source.indexOf('setRegistered((prev)');
  assert.notEqual(outcomeIndex, -1);
  assert.notEqual(setRegisteredIndex, -1);
  assert.ok(
    outcomeIndex < setRegisteredIndex,
    'registrationOutcome() must be read before setRegistered() runs'
  );
});

test('session dates, times, and titles are unchanged', () => {
  const source = readFileSync(new URL('../../app/webinar/page.tsx', import.meta.url), 'utf8');
  const dateLiterals = source.match(/date: '[^']*'/g) ?? [];

  let headSource;
  try {
    headSource = execFileSync('git', ['show', 'HEAD:app/webinar/page.tsx'], {
      cwd: new URL('../..', import.meta.url),
      encoding: 'utf8',
    });
  } catch {
    return;
  }

  const headDateLiterals = headSource.match(/date: '[^']*'/g) ?? [];
  assert.deepEqual(dateLiterals, headDateLiterals);
});
