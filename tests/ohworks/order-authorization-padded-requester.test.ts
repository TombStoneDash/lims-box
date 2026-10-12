import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeOrder,
  type OrderAuthorizationMatrix,
  type OrderRequest,
  type RequesterCredential,
} from '../../lib/ohworks-order-authorization';

// Fabricated identifiers and order data only.
const matrix: OrderAuthorizationMatrix = [
  { role: 'CLINICIAN', testClass: 'SYNTH-PANEL', requiresCosign: true },
];

const credential: RequesterCredential = {
  requesterId: 'SYNTH-PERSON',
  role: 'CLINICIAN',
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '2027-01-01T00:00:00.000Z',
};

function order(cosignerId?: string): OrderRequest {
  return {
    orderId: 'SYNTH-ORDER',
    testClass: 'SYNTH-PANEL',
    timestamp: '2026-06-01T00:00:00.000Z',
    ...(cosignerId === undefined ? {} : { cosignerId }),
  };
}

test('refuses the requester as co-signer with or without padding on either side', () => {
  for (const [requesterId, cosignerId] of [
    ['SYNTH-PERSON', 'SYNTH-PERSON'],
    [' SYNTH-PERSON ', ' SYNTH-PERSON '],
    [' SYNTH-PERSON ', 'SYNTH-PERSON'],
    ['SYNTH-PERSON', ' SYNTH-PERSON '],
  ]) {
    assert.deepEqual(
      authorizeOrder(matrix, { ...credential, requesterId }, order(cosignerId)),
      { orderId: 'SYNTH-ORDER', decision: 'REFUSED', rule: 'cosigner-same-as-requester' },
      `requesterId=${JSON.stringify(requesterId)}, cosignerId=${JSON.stringify(cosignerId)}`,
    );
  }
});

test('authorizes a genuinely distinct co-signer', () => {
  assert.deepEqual(
    authorizeOrder(matrix, { ...credential, requesterId: ' SYNTH-PERSON ' }, order(' SYNTH-OTHER ')),
    { orderId: 'SYNTH-ORDER', decision: 'AUTHORIZED', rule: 'authorized-with-cosign' },
  );
});

test('retains case-sensitive co-signer comparison', () => {
  assert.deepEqual(
    authorizeOrder(matrix, credential, order('synth-person')),
    { orderId: 'SYNTH-ORDER', decision: 'AUTHORIZED', rule: 'authorized-with-cosign' },
  );
});

test('still needs a co-signer when one is blank or missing', () => {
  for (const cosignerId of [undefined, '   ']) {
    assert.deepEqual(
      authorizeOrder(matrix, credential, order(cosignerId)),
      { orderId: 'SYNTH-ORDER', decision: 'NEEDS_COSIGN', rule: 'cosign-required' },
    );
  }
});
