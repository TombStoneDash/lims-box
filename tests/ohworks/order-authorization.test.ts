import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeOrder,
  explainOrderAuthorizationRule,
  OrderAuthorizationInputError,
  type OrderAuthorizationMatrix,
  type OrderAuthorizationRuleCode,
  type OrderRequest,
  type RequesterCredential,
} from '../../lib/ohworks-order-authorization';

/**
 * All fabricated: synthetic roles, test class names, and requester/co-signer
 * identifiers. None of this represents a real requester, patient, or lab
 * record.
 */
function baselineMatrix(overrides: OrderAuthorizationMatrix = []): OrderAuthorizationMatrix {
  return [
    { role: 'CLINICIAN', testClass: 'BASIC-METABOLIC', requiresCosign: false },
    { role: 'CLINICIAN', testClass: 'TOX-PANEL-7', requiresCosign: true },
    { role: 'NURSE', testClass: 'BASIC-METABOLIC', requiresCosign: false },
    ...overrides,
  ];
}

function baselineCredential(overrides: Partial<RequesterCredential> = {}): RequesterCredential {
  return {
    requesterId: 'requester-synthetic-a',
    role: 'CLINICIAN',
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function baselineOrder(overrides: Partial<OrderRequest> = {}): OrderRequest {
  return {
    orderId: 'order-synthetic-1',
    testClass: 'BASIC-METABOLIC',
    timestamp: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

test('authorizes an unrestricted class with a current credential and matrix permission', () => {
  const summary = authorizeOrder(baselineMatrix(), baselineCredential(), baselineOrder());
  assert.deepEqual(summary, { orderId: 'order-synthetic-1', decision: 'AUTHORIZED', rule: 'authorized-no-cosign-required' });
});

test('authorizes a restricted class with a distinct co-signer supplied', () => {
  const summary = authorizeOrder(
    baselineMatrix(),
    baselineCredential(),
    baselineOrder({ testClass: 'TOX-PANEL-7', cosignerId: 'requester-synthetic-b' }),
  );
  assert.deepEqual(summary, {
    orderId: 'order-synthetic-1',
    decision: 'AUTHORIZED',
    rule: 'authorized-with-cosign',
  });
});

test('reports needs_cosign for a restricted class with no co-signer supplied', () => {
  const summary = authorizeOrder(baselineMatrix(), baselineCredential(), baselineOrder({ testClass: 'TOX-PANEL-7' }));
  assert.deepEqual(summary, { orderId: 'order-synthetic-1', decision: 'NEEDS_COSIGN', rule: 'cosign-required' });
});

test('refuses when the evaluation timestamp cannot be parsed', () => {
  const summary = authorizeOrder(baselineMatrix(), baselineCredential(), baselineOrder({ timestamp: 'not-a-timestamp' }));
  assert.deepEqual(summary, { orderId: 'order-synthetic-1', decision: 'REFUSED', rule: 'timestamp-invalid' });
});

test('fails closed for a test class absent from the matrix entirely', () => {
  const summary = authorizeOrder(baselineMatrix(), baselineCredential(), baselineOrder({ testClass: 'MYSTERY-PANEL' }));
  assert.deepEqual(summary, { orderId: 'order-synthetic-1', decision: 'REFUSED', rule: 'test-class-unknown' });
});

test('refuses when the credential validity window has not started', () => {
  const credential = baselineCredential({ validFrom: '2026-12-01T00:00:00.000Z', validUntil: '2027-06-01T00:00:00.000Z' });
  const summary = authorizeOrder(baselineMatrix(), credential, baselineOrder());
  assert.deepEqual(summary, { orderId: 'order-synthetic-1', decision: 'REFUSED', rule: 'credential-not-yet-valid' });
});

test('fails closed when the credential validity window has expired', () => {
  const credential = baselineCredential({ validFrom: '2024-01-01T00:00:00.000Z', validUntil: '2025-01-01T00:00:00.000Z' });
  const summary = authorizeOrder(baselineMatrix(), credential, baselineOrder());
  assert.deepEqual(summary, { orderId: 'order-synthetic-1', decision: 'REFUSED', rule: 'credential-expired' });
});

test('refuses when the role has no matrix entry for the test class', () => {
  const credential = baselineCredential({ role: 'NURSE' });
  const summary = authorizeOrder(baselineMatrix(), credential, baselineOrder({ testClass: 'TOX-PANEL-7' }));
  assert.deepEqual(summary, { orderId: 'order-synthetic-1', decision: 'REFUSED', rule: 'role-not-authorized' });
});

test('refuses a restricted class whose co-signer is the requester', () => {
  const summary = authorizeOrder(
    baselineMatrix(),
    baselineCredential(),
    baselineOrder({ testClass: 'TOX-PANEL-7', cosignerId: 'requester-synthetic-a' }),
  );
  assert.deepEqual(summary, {
    orderId: 'order-synthetic-1',
    decision: 'REFUSED',
    rule: 'cosigner-same-as-requester',
  });
});

test('refuses a restricted class whose co-signer id is whitespace-only', () => {
  const summary = authorizeOrder(
    baselineMatrix(),
    baselineCredential(),
    baselineOrder({ testClass: 'TOX-PANEL-7', cosignerId: '   ' }),
  );
  assert.deepEqual(summary, { orderId: 'order-synthetic-1', decision: 'NEEDS_COSIGN', rule: 'cosign-required' });
});

test('checks rules in the documented priority order when several are broken', () => {
  const credential = baselineCredential({ validFrom: '2024-01-01T00:00:00.000Z', validUntil: '2025-01-01T00:00:00.000Z' });
  const summary = authorizeOrder(baselineMatrix(), credential, baselineOrder({ testClass: 'MYSTERY-PANEL' }));
  assert.deepEqual(summary, { orderId: 'order-synthetic-1', decision: 'REFUSED', rule: 'test-class-unknown' });
});

test('decision summary excludes requester id and role', () => {
  const summary = authorizeOrder(
    baselineMatrix(),
    baselineCredential(),
    baselineOrder({ testClass: 'TOX-PANEL-7', cosignerId: 'requester-synthetic-b' }),
  );
  const serialized = JSON.stringify(summary);
  assert.ok(!serialized.includes('requester-synthetic'));
  assert.ok(!serialized.includes('CLINICIAN'));
  assert.deepEqual(Object.keys(summary).sort(), ['decision', 'orderId', 'rule']);
});

test('throws OrderAuthorizationInputError for a non-array matrix', () => {
  assert.throws(
    () => authorizeOrder('not-an-array', baselineCredential(), baselineOrder()),
    (error: unknown) => error instanceof OrderAuthorizationInputError && error.code === 'matrix-malformed',
  );
});

test('throws OrderAuthorizationInputError for a matrix entry missing a field', () => {
  const malformed = [{ role: 'CLINICIAN', testClass: 'BASIC-METABOLIC' }];
  assert.throws(
    () => authorizeOrder(malformed, baselineCredential(), baselineOrder()),
    (error: unknown) => error instanceof OrderAuthorizationInputError && error.code === 'matrix-malformed',
  );
});

test('throws OrderAuthorizationInputError for a matrix entry with a non-boolean requiresCosign', () => {
  const malformed = [{ role: 'CLINICIAN', testClass: 'BASIC-METABOLIC', requiresCosign: 'no' }];
  assert.throws(
    () => authorizeOrder(malformed, baselineCredential(), baselineOrder()),
    (error: unknown) => error instanceof OrderAuthorizationInputError && error.code === 'matrix-malformed',
  );
});

test('throws OrderAuthorizationInputError for a non-object credential', () => {
  assert.throws(
    () => authorizeOrder(baselineMatrix(), null, baselineOrder()),
    (error: unknown) => error instanceof OrderAuthorizationInputError && error.code === 'credential-malformed',
  );
});

test('throws OrderAuthorizationInputError for a credential missing a required field', () => {
  const malformed = { ...baselineCredential(), validUntil: undefined };
  assert.throws(
    () => authorizeOrder(baselineMatrix(), malformed, baselineOrder()),
    (error: unknown) => error instanceof OrderAuthorizationInputError && error.code === 'credential-malformed',
  );
});

test('throws OrderAuthorizationInputError for a non-object order', () => {
  assert.throws(
    () => authorizeOrder(baselineMatrix(), baselineCredential(), 'not-an-object'),
    (error: unknown) => error instanceof OrderAuthorizationInputError && error.code === 'order-malformed',
  );
});

test('throws OrderAuthorizationInputError for an order missing a required field', () => {
  const malformed = { ...baselineOrder(), testClass: undefined };
  assert.throws(
    () => authorizeOrder(baselineMatrix(), baselineCredential(), malformed),
    (error: unknown) => error instanceof OrderAuthorizationInputError && error.code === 'order-malformed',
  );
});

test('explainOrderAuthorizationRule covers every rule code', () => {
  const codes: OrderAuthorizationRuleCode[] = [
    'timestamp-invalid',
    'test-class-unknown',
    'credential-not-yet-valid',
    'credential-expired',
    'role-not-authorized',
    'cosign-required',
    'cosigner-same-as-requester',
    'authorized-no-cosign-required',
    'authorized-with-cosign',
  ];
  for (const code of codes) {
    const explanation = explainOrderAuthorizationRule(code);
    assert.equal(typeof explanation, 'string');
    assert.ok(explanation.length > 0);
  }
});

// --- Timestamp handling edge cases ---

test('refuses fail-closed when the evaluation timestamp has no explicit UTC offset', () => {
  const summary = authorizeOrder(baselineMatrix(), baselineCredential(), baselineOrder({ timestamp: '2026-06-01T00:00:00' }));
  assert.deepEqual(summary, { orderId: 'order-synthetic-1', decision: 'REFUSED', rule: 'timestamp-invalid' });
});

test('refuses fail-closed when the evaluation timestamp is a calendar date that does not exist', () => {
  const summary = authorizeOrder(baselineMatrix(), baselineCredential(), baselineOrder({ timestamp: '2026-02-30T00:00:00Z' }));
  assert.deepEqual(summary, { orderId: 'order-synthetic-1', decision: 'REFUSED', rule: 'timestamp-invalid' });
});

test('produces the identical decision for the same instant written with different explicit offsets', () => {
  const utc = authorizeOrder(baselineMatrix(), baselineCredential(), baselineOrder({ timestamp: '2026-06-01T00:00:00Z' }));
  const offset = authorizeOrder(
    baselineMatrix(),
    baselineCredential(),
    baselineOrder({ timestamp: '2026-06-01T05:00:00+05:00' }),
  );
  assert.deepEqual(utc, offset);
});

test('fails closed when a credential validFrom has no explicit UTC offset', () => {
  const credential = baselineCredential({ validFrom: '2026-01-01T00:00:00' });
  const summary = authorizeOrder(baselineMatrix(), credential, baselineOrder());
  assert.deepEqual(summary, { orderId: 'order-synthetic-1', decision: 'REFUSED', rule: 'credential-expired' });
});

test('fails closed when a credential window is internally inconsistent (validFrom after validUntil)', () => {
  const credential = baselineCredential({ validFrom: '2026-12-01T00:00:00Z', validUntil: '2026-01-01T00:00:00Z' });
  const summary = authorizeOrder(baselineMatrix(), credential, baselineOrder());
  assert.deepEqual(summary, { orderId: 'order-synthetic-1', decision: 'REFUSED', rule: 'credential-expired' });
});

test('credential window inconsistency is judged identically regardless of explicit offset used', () => {
  const zulu = authorizeOrder(
    baselineMatrix(),
    baselineCredential({ validFrom: '2026-12-01T00:00:00Z', validUntil: '2026-01-01T00:00:00Z' }),
    baselineOrder(),
  );
  const offset = authorizeOrder(
    baselineMatrix(),
    baselineCredential({ validFrom: '2026-12-01T05:00:00+05:00', validUntil: '2026-01-01T05:00:00+05:00' }),
    baselineOrder(),
  );
  assert.deepEqual(zulu, offset);
  assert.deepEqual(zulu, { orderId: 'order-synthetic-1', decision: 'REFUSED', rule: 'credential-expired' });
});

test('authorizes exactly at the credential validFrom instant (inclusive boundary)', () => {
  const credential = baselineCredential({ validFrom: '2026-06-01T00:00:00Z', validUntil: '2027-01-01T00:00:00Z' });
  const summary = authorizeOrder(baselineMatrix(), credential, baselineOrder({ timestamp: '2026-06-01T00:00:00Z' }));
  assert.equal(summary.decision, 'AUTHORIZED');
});

test('refuses exactly at the credential validUntil instant (exclusive boundary)', () => {
  const credential = baselineCredential({ validFrom: '2026-01-01T00:00:00Z', validUntil: '2026-06-01T00:00:00Z' });
  const summary = authorizeOrder(baselineMatrix(), credential, baselineOrder({ timestamp: '2026-06-01T00:00:00Z' }));
  assert.deepEqual(summary, { orderId: 'order-synthetic-1', decision: 'REFUSED', rule: 'credential-expired' });
});
