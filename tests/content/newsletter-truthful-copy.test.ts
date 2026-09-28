import assert from 'node:assert/strict';
import test from 'node:test';
import { newsletterMessage } from '../../lib/newsletter-status';

test('successful copy confirms subscription without promising an incoming message', () => {
  const message = newsletterMessage('subscribed');

  assert.match(message, /you're subscribed/i);
  assert.doesNotMatch(message, /inbox|confirmation|email|message|sent|receive|on (?:its|the) way/i);
});

test('deferred copy explains failure and requests a later retry without claiming persistence', () => {
  const message = newsletterMessage('deferred');

  assert.match(message, /couldn't complete your subscription/i);
  assert.match(message, /please try again later/i);
  assert.doesNotMatch(message, /saved|stored|recorded|retained|queued|pending|automatic|processed|once configured|we(?:'ll| will)/i);
  assert.doesNotMatch(message, /inbox|confirmation|sent|receive|on (?:its|the) way/i);
});
