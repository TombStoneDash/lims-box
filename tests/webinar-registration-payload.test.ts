import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { webinarRegistrationPayload } from '../lib/webinar-registration';

test('webinarRegistrationPayload keeps a trimmed name, email, labName and the webinar source', () => {
  const payload = webinarRegistrationPayload({
    name: '  Ada Lovelace  ',
    email: '  ada@example.com  ',
    labName: '  Analytical Engines Lab  ',
    sessionId: 'env-labs-101',
  });

  assert.deepEqual(payload, {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    labName: 'Analytical Engines Lab',
    source: 'webinar:env-labs-101',
  });
});

test('app/webinar/page.tsx builds its request body with webinarRegistrationPayload', () => {
  const source = readFileSync(new URL('../app/webinar/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /from '@\/lib\/webinar-registration'/);
  assert.match(source, /webinarRegistrationPayload/);

  const bodyIndex = source.indexOf('body: JSON.stringify(');
  const payloadIndex = source.indexOf('webinarRegistrationPayload(', bodyIndex);
  assert.notEqual(bodyIndex, -1);
  assert.notEqual(payloadIndex, -1);
  assert.ok(
    payloadIndex > bodyIndex && payloadIndex - bodyIndex < 80,
    'the POST body must be built with webinarRegistrationPayload(...)'
  );
});
