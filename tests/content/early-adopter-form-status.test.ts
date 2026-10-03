import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { earlyAdopterMessage, earlyAdopterOutcome } from '../../lib/early-adopter-form-status';

test('successful responses are received', () => {
  assert.equal(earlyAdopterOutcome({ ok: true, status: 200 }), 'received');
  assert.equal(earlyAdopterMessage('received'), '');
});

test('400 and 422 are invalid with actionable copy', () => {
  assert.equal(earlyAdopterOutcome({ ok: false, status: 400 }), 'invalid');
  assert.equal(earlyAdopterOutcome({ ok: false, status: 422 }), 'invalid');
  assert.equal(
    earlyAdopterMessage('invalid'),
    'Please check the required answers, your e-mail address and the data-use box, then submit again.'
  );
});

test('429, 500, and network errors are failed with retry copy', () => {
  assert.equal(earlyAdopterOutcome({ ok: false, status: 429 }), 'failed');
  assert.equal(earlyAdopterOutcome({ ok: false, status: 500 }), 'failed');
  assert.equal(earlyAdopterOutcome('network-error'), 'failed');
  assert.equal(
    earlyAdopterMessage('failed'),
    'We could not save your application. Please try again, or e-mail info@lims.bot.'
  );
});

test('only info@lims.bot is referenced in the outcome copy', () => {
  const messages = [
    earlyAdopterMessage('received'),
    earlyAdopterMessage('invalid'),
    earlyAdopterMessage('failed'),
  ];
  const emails = messages.join(' ').match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? [];
  for (const email of emails) {
    assert.equal(email, 'info@lims.bot');
  }
});

test('early-adopter page uses the helper and shows an honest, focusable alert', () => {
  const source = readFileSync(new URL('../../app/early-adopter/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /from '@\/lib\/early-adopter-form-status'/);
  assert.match(source, /role="alert"/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-busy/);
  assert.doesNotMatch(source, /Something went wrong/);

  assert.match(source, /'\/api\/early-access'/);
  assert.match(source, /dataUseAccepted/);
  assert.match(source, /This is not an automated signup/);
});
