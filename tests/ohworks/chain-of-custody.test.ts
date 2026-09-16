import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CustodyChainInputError,
  explainCustodyChainNextAction,
  explainCustodyChainReason,
  validateCustodyChain,
  type CustodyChainReasonCode,
  type CustodyTransfer,
} from '../../lib/ohworks-chain-of-custody';

/**
 * All fabricated: synthetic actor identifiers, roles, timestamps, and seal
 * ids. None of this represents a real specimen, patient, or lab record.
 */
function baselineTransfer(overrides: Partial<CustodyTransfer> = {}): CustodyTransfer {
  return {
    releasingActor: 'actor-synthetic-a',
    releasingRole: 'COLLECTOR',
    receivingActor: 'actor-synthetic-b',
    receivingRole: 'COURIER',
    timestamp: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

function baselineChain(): CustodyTransfer[] {
  return [
    baselineTransfer({
      releasingActor: 'actor-synthetic-a',
      releasingRole: 'COLLECTOR',
      receivingActor: 'actor-synthetic-b',
      receivingRole: 'COURIER',
      timestamp: '2026-01-01T12:00:00.000Z',
      sealId: 'SEAL0001',
    }),
    baselineTransfer({
      releasingActor: 'actor-synthetic-b',
      releasingRole: 'COURIER',
      receivingActor: 'actor-synthetic-c',
      receivingRole: 'RECEIVING_ANALYST',
      timestamp: '2026-01-01T13:00:00.000Z',
      sealId: 'SEAL0002',
    }),
    baselineTransfer({
      releasingActor: 'actor-synthetic-c',
      releasingRole: 'RECEIVING_ANALYST',
      receivingActor: 'actor-synthetic-d',
      receivingRole: 'STORAGE_CUSTODIAN',
      timestamp: '2026-01-01T14:00:00.000Z',
      sealId: 'SEAL0003',
    }),
  ];
}

test('validates a well-formed chain with no seal reuse or gaps', () => {
  const summary = validateCustodyChain('ref-synthetic-1', baselineChain());
  assert.equal(summary.status, 'VALID');
  assert.equal(summary.failure, undefined);
  assert.equal(summary.referenceToken, 'ref-synthetic-1');
});

test('accepts an empty transfer list as trivially valid', () => {
  const summary = validateCustodyChain('ref-synthetic-empty', []);
  assert.equal(summary.status, 'VALID');
});

test('accepts a single-transfer chain with no seal id', () => {
  const summary = validateCustodyChain('ref-synthetic-single', [baselineTransfer()]);
  assert.equal(summary.status, 'VALID');
});

test('accepts a terminal disposal as the final transfer', () => {
  const chain = baselineChain();
  chain[2] = { ...chain[2], eventType: 'DISPOSAL', receivingRole: 'DISPOSAL_AGENT' };
  const summary = validateCustodyChain('ref-synthetic-disposal', chain);
  assert.equal(summary.status, 'VALID');
});

test('rejects a custody gap between transfers', () => {
  const chain = baselineChain();
  chain[1] = { ...chain[1], releasingActor: 'actor-synthetic-not-b' };
  const summary = validateCustodyChain('ref-synthetic-gap', chain);
  assert.equal(summary.status, 'INVALID');
  assert.deepEqual(summary.failure, { transferIndex: 1, code: 'custody-gap' });
});

test('rejects an unparsable timestamp', () => {
  const chain = baselineChain();
  chain[0] = { ...chain[0], timestamp: 'not-a-timestamp' };
  const summary = validateCustodyChain('ref-synthetic-ts-invalid', chain);
  assert.deepEqual(summary.failure, { transferIndex: 0, code: 'timestamp-invalid' });
});

test('rejects a duplicate timestamp', () => {
  const chain = baselineChain();
  chain[1] = { ...chain[1], timestamp: chain[0].timestamp };
  const summary = validateCustodyChain('ref-synthetic-ts-dup', chain);
  assert.deepEqual(summary.failure, { transferIndex: 1, code: 'timestamp-duplicate' });
});

test('rejects an out-of-order timestamp', () => {
  const chain = baselineChain();
  chain[1] = { ...chain[1], timestamp: '2026-01-01T00:00:00.000Z' };
  const summary = validateCustodyChain('ref-synthetic-ts-order', chain);
  assert.deepEqual(summary.failure, { transferIndex: 1, code: 'timestamp-out-of-order' });
});

test('rejects a self-transfer', () => {
  const summary = validateCustodyChain('ref-synthetic-self', [
    baselineTransfer({ releasingActor: 'actor-synthetic-same', receivingActor: 'actor-synthetic-same' }),
  ]);
  assert.deepEqual(summary.failure, { transferIndex: 0, code: 'self-transfer' });
});

test('rejects an unknown releasing role', () => {
  const summary = validateCustodyChain('ref-synthetic-role-a', [baselineTransfer({ releasingRole: 'MYSTERY_ROLE' })]);
  assert.deepEqual(summary.failure, { transferIndex: 0, code: 'releasing-role-unknown' });
});

test('rejects an unknown receiving role', () => {
  const summary = validateCustodyChain('ref-synthetic-role-b', [baselineTransfer({ receivingRole: 'MYSTERY_ROLE' })]);
  assert.deepEqual(summary.failure, { transferIndex: 0, code: 'receiving-role-unknown' });
});

test('rejects a malformed seal id', () => {
  const summary = validateCustodyChain('ref-synthetic-seal-malformed', [baselineTransfer({ sealId: 'not-a-seal!' })]);
  assert.deepEqual(summary.failure, { transferIndex: 0, code: 'seal-id-invalid' });
});

test('rejects a reused seal id', () => {
  const chain = baselineChain();
  chain[1] = { ...chain[1], sealId: chain[0].sealId };
  const summary = validateCustodyChain('ref-synthetic-seal-reused', chain);
  assert.deepEqual(summary.failure, { transferIndex: 1, code: 'seal-id-reused' });
});

test('rejects any transfer after a terminal disposal event', () => {
  const chain = baselineChain();
  chain[1] = { ...chain[1], eventType: 'DISPOSAL' };
  const summary = validateCustodyChain('ref-synthetic-post-disposal', chain);
  assert.deepEqual(summary.failure, { transferIndex: 2, code: 'transfer-after-disposal' });
});

test('reports the first failing rule when multiple transfers are broken', () => {
  const chain = baselineChain();
  chain[1] = { ...chain[1], releasingActor: 'actor-synthetic-not-b', timestamp: chain[0].timestamp };
  chain[2] = { ...chain[2], releasingActor: 'actor-synthetic-not-c' };
  const summary = validateCustodyChain('ref-synthetic-first-failure', chain);
  assert.deepEqual(summary.failure, { transferIndex: 1, code: 'custody-gap' });
});

test('within one transfer, checks rules in the documented priority order', () => {
  const chain = baselineChain();
  chain[1] = {
    ...chain[1],
    releasingActor: 'actor-synthetic-not-b',
    timestamp: 'not-a-timestamp',
    releasingRole: 'MYSTERY_ROLE',
    sealId: 'not-a-seal!',
  };
  const summary = validateCustodyChain('ref-synthetic-priority', chain);
  assert.deepEqual(summary.failure, { transferIndex: 1, code: 'custody-gap' });
});

test('summary excludes actor, role, timestamp, and seal id values', () => {
  const summary = validateCustodyChain('ref-synthetic-privacy', baselineChain());
  const serialized = JSON.stringify(summary);
  assert.ok(!serialized.includes('actor-synthetic'));
  assert.ok(!serialized.includes('SEAL'));
  assert.ok(!serialized.includes('2026-01-01'));
});

test('invalid summary carries only referenceToken, status, and failure', () => {
  const summary = validateCustodyChain('ref-synthetic-shape', [baselineTransfer({ releasingRole: 'MYSTERY_ROLE' })]);
  assert.deepEqual(Object.keys(summary).sort(), ['failure', 'referenceToken', 'status']);
  assert.deepEqual(Object.keys(summary.failure!).sort(), ['code', 'transferIndex']);
});

test('valid summary carries no failure field', () => {
  const summary = validateCustodyChain('ref-synthetic-valid-shape', baselineChain());
  assert.deepEqual(Object.keys(summary).sort(), ['referenceToken', 'status']);
});

test('throws CustodyChainInputError for an invalid reference token', () => {
  assert.throws(
    () => validateCustodyChain('', baselineChain()),
    (error: unknown) => error instanceof CustodyChainInputError && error.code === 'reference-token-invalid',
  );
});

test('throws CustodyChainInputError when transfers is not an array', () => {
  assert.throws(
    () => validateCustodyChain('ref-synthetic-not-array', 'not-an-array' as unknown as unknown[]),
    (error: unknown) => error instanceof CustodyChainInputError && error.code === 'transfers-not-array',
  );
});

test('throws CustodyChainInputError for a transfer missing a required field', () => {
  const malformed = { ...baselineTransfer(), releasingActor: undefined };
  assert.throws(
    () => validateCustodyChain('ref-synthetic-malformed', [malformed]),
    (error: unknown) => error instanceof CustodyChainInputError && error.code === 'transfer-malformed',
  );
});

test('throws CustodyChainInputError for a non-object transfer', () => {
  assert.throws(
    () => validateCustodyChain('ref-synthetic-non-object', [null]),
    (error: unknown) => error instanceof CustodyChainInputError && error.code === 'transfer-malformed',
  );
});

test('throws CustodyChainInputError for an invalid eventType value', () => {
  const malformed = { ...baselineTransfer(), eventType: 'BOGUS' };
  assert.throws(
    () => validateCustodyChain('ref-synthetic-bad-event', [malformed]),
    (error: unknown) => error instanceof CustodyChainInputError && error.code === 'transfer-malformed',
  );
});

test('explainCustodyChainReason and explainCustodyChainNextAction cover every reason code', () => {
  const codes: CustodyChainReasonCode[] = [
    'custody-gap',
    'timestamp-invalid',
    'timestamp-duplicate',
    'timestamp-out-of-order',
    'self-transfer',
    'releasing-role-unknown',
    'receiving-role-unknown',
    'seal-id-invalid',
    'seal-id-reused',
    'transfer-after-disposal',
  ];
  for (const code of codes) {
    const reason = explainCustodyChainReason(code);
    const nextAction = explainCustodyChainNextAction(code);
    assert.equal(typeof reason, 'string');
    assert.ok(reason.length > 0);
    assert.equal(typeof nextAction, 'string');
    assert.ok(nextAction.length > 0);
  }
});
