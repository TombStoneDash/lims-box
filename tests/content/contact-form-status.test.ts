import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { contactMessage, contactOutcome } from '../../lib/contact-form-status';

test('ok responses are sent', () => {
  assert.equal(contactOutcome({ ok: true, status: 200 }), 'sent');
  assert.equal(contactMessage('sent'), '');
});

test('400 and 422 are invalid — the visitor can fix these', () => {
  assert.equal(contactOutcome({ ok: false, status: 400 }), 'invalid');
  assert.equal(contactOutcome({ ok: false, status: 422 }), 'invalid');
  assert.match(contactMessage('invalid'), /required fields/i);
  assert.match(contactMessage('invalid'), /e-mail address/i);
});

test('429, 500, and network errors are failed — not the visitor\'s fault', () => {
  assert.equal(contactOutcome({ ok: false, status: 429 }), 'failed');
  assert.equal(contactOutcome({ ok: false, status: 500 }), 'failed');
  assert.equal(contactOutcome('network-error'), 'failed');
  assert.match(contactMessage('failed'), /could not send/i);
});

test('the only e-mail address in either message is info@lims.bot', () => {
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  for (const outcome of ['sent', 'invalid', 'failed'] as const) {
    const message = contactMessage(outcome);
    const matches = message.match(emailPattern) ?? [];
    for (const match of matches) {
      assert.equal(match, 'info@lims.bot');
    }
  }
});

test('contact page uses the helper and makes results perceivable', () => {
  const source = readFileSync(new URL('../../app/contact/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /from '@\/lib\/contact-form-status'/);
  assert.match(source, /role="alert"/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-busy/);
  assert.doesNotMatch(source, /Something went wrong/);
  assert.match(source, /'\/api\/contact'/);
  for (const field of ['name', 'labName', 'email', 'labSize', 'currentSystem', 'message']) {
    assert.match(source, new RegExp(field));
  }
});
