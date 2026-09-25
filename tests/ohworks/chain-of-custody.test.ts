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

test('rejects an impossible calendar date instead of rolling it over', () => {
  const chain = baselineChain();
  chain[0] = { ...chain[0], timestamp: '2026-02-30T12:00:00Z' };
  const summary = validateCustodyChain('ref-synthetic-ts-impossible-day', chain);
  assert.deepEqual(summary.failure, { transferIndex: 0, code: 'timestamp-invalid' });
});

test('rejects February 29 in a non-leap year', () => {
  const chain = baselineChain();
  chain[0] = { ...chain[0], timestamp: '2026-02-29T12:00:00Z' };
  const summary = validateCustodyChain('ref-synthetic-ts-non-leap', chain);
  assert.deepEqual(summary.failure, { transferIndex: 0, code: 'timestamp-invalid' });
});

test('accepts February 29 in a leap year', () => {
  const summary = validateCustodyChain('ref-synthetic-ts-leap', [
    baselineTransfer({ timestamp: '2028-02-29T12:00:00Z' }),
  ]);
  assert.equal(summary.status, 'VALID');
});

test('rejects a month outside 1-12', () => {
  const chain = baselineChain();
  chain[0] = { ...chain[0], timestamp: '2026-13-01T12:00:00Z' };
  const summary = validateCustodyChain('ref-synthetic-ts-bad-month', chain);
  assert.deepEqual(summary.failure, { transferIndex: 0, code: 'timestamp-invalid' });
});

test('rejects an out-of-range hour, minute, or second', () => {
  for (const timestamp of ['2026-01-01T24:00:00Z', '2026-01-01T12:60:00Z', '2026-01-01T12:00:60Z']) {
    const summary = validateCustodyChain('ref-synthetic-ts-bad-clock', [baselineTransfer({ timestamp })]);
    assert.deepEqual(summary.failure, { transferIndex: 0, code: 'timestamp-invalid' }, `expected ${timestamp} to be rejected`);
  }
});

test('rejects a timestamp with no timezone designator', () => {
  for (const timestamp of ['2026-01-01T12:00:00', '2026-01-01T12:00:00.000', '2026-01-01']) {
    const summary = validateCustodyChain('ref-synthetic-ts-no-tz', [baselineTransfer({ timestamp })]);
    assert.deepEqual(summary.failure, { transferIndex: 0, code: 'timestamp-invalid' }, `expected ${timestamp} to be rejected`);
  }
});

test('rejects a timezone offset with an out-of-range hour or minute component', () => {
  for (const timestamp of ['2026-01-01T12:00:00+24:00', '2026-01-01T12:00:00+02:60']) {
    const summary = validateCustodyChain('ref-synthetic-ts-bad-offset', [baselineTransfer({ timestamp })]);
    assert.deepEqual(summary.failure, { transferIndex: 0, code: 'timestamp-invalid' }, `expected ${timestamp} to be rejected`);
  }
});

test('accepts a numeric-offset timestamp equivalent to Z and orders by absolute instant', () => {
  const summary = validateCustodyChain('ref-synthetic-ts-offset-order', [
    baselineTransfer({
      releasingActor: 'actor-synthetic-a',
      receivingActor: 'actor-synthetic-b',
      timestamp: '2026-01-01T12:00:00+02:00',
    }),
    baselineTransfer({
      releasingActor: 'actor-synthetic-b',
      receivingActor: 'actor-synthetic-c',
      timestamp: '2026-01-01T10:30:00.000Z',
    }),
  ]);
  assert.equal(summary.status, 'VALID');
});

test('validation and ordering are invariant across process timezones', () => {
  const originalTz = process.env.TZ;
  const chain = baselineChain();
  const noTzTimestamp = '2026-01-01T12:00:00.000';
  const impossibleDate = '2026-02-30T12:00:00Z';
  const zones = ['UTC', 'Pacific/Kiritimati', 'Pacific/Niue', 'Asia/Kathmandu'];

  try {
    const results = zones.map((zone) => {
      process.env.TZ = zone;
      return {
        wellFormed: validateCustodyChain('ref-synthetic-tz-well-formed', chain),
        noTz: validateCustodyChain('ref-synthetic-tz-no-tz', [baselineTransfer({ timestamp: noTzTimestamp })]),
        impossible: validateCustodyChain('ref-synthetic-tz-impossible', [
          baselineTransfer({ timestamp: impossibleDate }),
        ]),
      };
    });

    for (const result of results) {
      assert.deepEqual(result.wellFormed, results[0].wellFormed);
      assert.deepEqual(result.noTz, results[0].noTz);
      assert.deepEqual(result.impossible, results[0].impossible);
    }
    assert.equal(results[0].wellFormed.status, 'VALID');
    assert.deepEqual(results[0].noTz.failure, { transferIndex: 0, code: 'timestamp-invalid' });
    assert.deepEqual(results[0].impossible.failure, { transferIndex: 0, code: 'timestamp-invalid' });
  } finally {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  }
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
