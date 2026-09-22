import assert from 'node:assert/strict';
import test from 'node:test';
import { newsletterMessage, newsletterOutcome } from '../../lib/newsletter-status';

test('successful subscription confirms membership without promising email delivery', () => {
  const outcome = newsletterOutcome(200, { success: true });
  const message = newsletterMessage(outcome);

  assert.equal(outcome, 'subscribed');
  assert.equal(message, "You're subscribed to the newsletter!");
  assert.doesNotMatch(message, /inbox|e-?mail|\b(sent|send|sending|deliver\w*|arriv\w*|soon|shortly)\b/i);
});
