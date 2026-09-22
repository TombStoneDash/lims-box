import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { newsletterMessage, newsletterOutcome } from '../../lib/newsletter-status';

test('200 is subscribed and confirms newsletter membership', () => {
  assert.equal(newsletterOutcome(200, { success: true }), 'subscribed');
  assert.equal(newsletterMessage('subscribed'), "You're subscribed to the newsletter!");
});

test('503 with deferred:true is deferred with honest confirmation copy', () => {
  assert.equal(newsletterOutcome(503, { deferred: true }), 'deferred');
  const message = newsletterMessage('deferred');
  assert.match(message, /address was saved/i);
  assert.match(message, /no confirmation email is coming yet/i);
  assert.doesNotMatch(message, /inbox/i);
});

test('503 without an explicit true deferred flag is an error', () => {
  for (const body of [{}, { deferred: false }, { deferred: 'true' }]) {
    assert.equal(newsletterOutcome(503, body), 'error');
  }
});

test('500 is an error even with a deferred flag and keeps retry copy', () => {
  assert.equal(newsletterOutcome(500, {}), 'error');
  assert.equal(newsletterOutcome(500, { deferred: true }), 'error');
  assert.equal(newsletterMessage('error'), 'Something went wrong. Try again?');
});

test('non-object bodies are handled safely', () => {
  for (const body of [null, undefined, 'unavailable', 42, true, []]) {
    assert.equal(newsletterOutcome(503, body), 'error');
    assert.equal(newsletterOutcome(200, body), 'subscribed');
  }
});

test('signup exposes status, errors, email name, and readable loading text', () => {
  const source = readFileSync(new URL('../../components/blog/NewsletterSignup.tsx', import.meta.url), 'utf8');
  assert.match(source, /role="alert"/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-label="Email address"/);
  assert.match(source, /Subscribing…/);
});
