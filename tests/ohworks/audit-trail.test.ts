import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AuditTrailInputError,
  GENESIS_PREVIOUS_HASH,
  canonicalAuditEntryJson,
  explainAuditTrailNextAction,
  explainAuditTrailReason,
  hashAuditEntry,
  verifyAuditTrail,
  type AuditEntry,
  type AuditTrailReasonCode,
} from '../../lib/ohworks-audit-trail';

/**
 * All fabricated: synthetic roles, action codes, sequence numbers,
 * timestamps, and hashes. None of this represents a real actor, patient,
 * or lab record.
 */
function baselineChain(): AuditEntry[] {
  const entryZero: AuditEntry = {
    sequence: 1,
    actorRole: 'COLLECTOR',
    actionCode: 'SAMPLE_RECEIVED',
    timestamp: '2026-01-01T12:00:00.000Z',
    previousHash: GENESIS_PREVIOUS_HASH,
  };
  const entryOne: AuditEntry = {
    sequence: 2,
    actorRole: 'ANALYST',
    actionCode: 'RESULT_ENTERED',
    timestamp: '2026-01-01T13:00:00.000Z',
    previousHash: hashAuditEntry(entryZero),
  };
  const entryTwo: AuditEntry = {
    sequence: 3,
    actorRole: 'QC_REVIEWER',
    actionCode: 'RESULT_REVIEWED',
    timestamp: '2026-01-01T14:00:00.000Z',
    previousHash: hashAuditEntry(entryOne),
  };
  return [entryZero, entryOne, entryTwo];
}

test('verifies a well-formed chain with contiguous sequence and valid hash links', () => {
  const summary = verifyAuditTrail(baselineChain());
  assert.equal(summary.status, 'VERIFIED');
  assert.equal(summary.entryCount, 3);
  assert.equal(summary.failure, undefined);
});

test('accepts an empty entry list as trivially verified', () => {
  const summary = verifyAuditTrail([]);
  assert.equal(summary.status, 'VERIFIED');
  assert.equal(summary.entryCount, 0);
  assert.equal(summary.finalHash, undefined);
});

test('accepts a single-entry chain anchored at the genesis constant', () => {
  const summary = verifyAuditTrail([baselineChain()[0]]);
  assert.equal(summary.status, 'VERIFIED');
  assert.equal(summary.entryCount, 1);
});

test('verified summary carries finalHash equal to hashAuditEntry() of the last entry', () => {
  const chain = baselineChain();
  const summary = verifyAuditTrail(chain);
  assert.equal(summary.finalHash, hashAuditEntry(chain[2]));
});

test('rejects a first entry whose previousHash is not the genesis constant', () => {
  const chain = baselineChain();
  chain[0] = { ...chain[0], previousHash: 'not-genesis' };
  const summary = verifyAuditTrail(chain);
  assert.deepEqual(summary.failure, { entryIndex: 0, code: 'genesis-hash-invalid' });
});

test('rejects a sequence gap between entries', () => {
  const chain = baselineChain();
  chain[1] = { ...chain[1], sequence: 5 };
  const summary = verifyAuditTrail(chain);
  assert.deepEqual(summary.failure, { entryIndex: 1, code: 'sequence-gap' });
});

test('rejects a repeated sequence number', () => {
  const chain = baselineChain();
  chain[1] = { ...chain[1], sequence: chain[0].sequence };
  const summary = verifyAuditTrail(chain);
  assert.deepEqual(summary.failure, { entryIndex: 1, code: 'sequence-gap' });
});

test('rejects a broken hash link when an earlier entry field is tampered with', () => {
  const chain = baselineChain();
  chain[0] = { ...chain[0], timestamp: '2026-01-01T12:00:01.000Z' };
  const summary = verifyAuditTrail(chain);
  assert.deepEqual(summary.failure, { entryIndex: 1, code: 'previous-hash-mismatch' });
});

test('rejects a declared previousHash that does not match the computed hash', () => {
  const chain = baselineChain();
  chain[2] = { ...chain[2], previousHash: 'deadbeef' };
  const summary = verifyAuditTrail(chain);
  assert.deepEqual(summary.failure, { entryIndex: 2, code: 'previous-hash-mismatch' });
});

test('rejects an unparsable timestamp', () => {
  const chain = baselineChain();
  chain[1] = rechain(chain, 1, { timestamp: 'not-a-timestamp' });
  const summary = verifyAuditTrail(chain);
  assert.deepEqual(summary.failure, { entryIndex: 1, code: 'timestamp-invalid' });
});

test('rejects a duplicate timestamp', () => {
  const chain = baselineChain();
  chain[1] = rechain(chain, 1, { timestamp: chain[0].timestamp });
  const summary = verifyAuditTrail(chain);
  assert.deepEqual(summary.failure, { entryIndex: 1, code: 'timestamp-duplicate' });
});

test('rejects an out-of-order timestamp', () => {
  const chain = baselineChain();
  chain[1] = rechain(chain, 1, { timestamp: '2026-01-01T00:00:00.000Z' });
  const summary = verifyAuditTrail(chain);
  assert.deepEqual(summary.failure, { entryIndex: 1, code: 'timestamp-out-of-order' });
});

test('rejects an impossible calendar date instead of rolling it over', () => {
  const chain = baselineChain();
  chain[0] = { ...chain[0], timestamp: '2026-02-30T12:00:00Z' };
  const summary = verifyAuditTrail(chain);
  assert.deepEqual(summary.failure, { entryIndex: 0, code: 'timestamp-invalid' });
});

test('rejects a timestamp with no timezone designator', () => {
  const chain = baselineChain();
  chain[0] = { ...chain[0], timestamp: '2026-01-01T12:00:00' };
  const summary = verifyAuditTrail(chain);
  assert.deepEqual(summary.failure, { entryIndex: 0, code: 'timestamp-invalid' });
});

test('rejects an unknown actor role', () => {
  const chain = baselineChain();
  chain[1] = rechain(chain, 1, { actorRole: 'MYSTERY_ROLE' as AuditEntry['actorRole'] });
  const summary = verifyAuditTrail(chain);
  assert.deepEqual(summary.failure, { entryIndex: 1, code: 'actor-role-unknown' });
});

test('rejects an unknown action code', () => {
  const chain = baselineChain();
  chain[1] = rechain(chain, 1, { actionCode: 'MYSTERY_ACTION' as AuditEntry['actionCode'] });
  const summary = verifyAuditTrail(chain);
  assert.deepEqual(summary.failure, { entryIndex: 1, code: 'action-code-unknown' });
});

test('rejects an action code not permitted for the actor role', () => {
  const chain = baselineChain();
  chain[1] = rechain(chain, 1, { actionCode: 'REPORT_RELEASED' });
  const summary = verifyAuditTrail(chain);
  assert.deepEqual(summary.failure, { entryIndex: 1, code: 'action-not-permitted-for-role' });
});

test('every role has at least one permitted action and every permitted pairing verifies', () => {
  const pairs: Array<[AuditEntry['actorRole'], AuditEntry['actionCode']]> = [
    ['COLLECTOR', 'SAMPLE_RECEIVED'],
    ['ANALYST', 'RESULT_ENTERED'],
    ['ANALYST', 'RESULT_AMENDED'],
    ['QC_REVIEWER', 'RESULT_REVIEWED'],
    ['QC_REVIEWER', 'QC_OVERRIDE'],
    ['LAB_DIRECTOR', 'REPORT_RELEASED'],
    ['LAB_DIRECTOR', 'RECORD_VOIDED'],
    ['LAB_DIRECTOR', 'QC_OVERRIDE'],
  ];
  for (const [actorRole, actionCode] of pairs) {
    const entry: AuditEntry = {
      sequence: 1,
      actorRole,
      actionCode,
      timestamp: '2026-01-01T12:00:00.000Z',
      previousHash: GENESIS_PREVIOUS_HASH,
    };
    const summary = verifyAuditTrail([entry]);
    assert.equal(summary.status, 'VERIFIED', `${actorRole}/${actionCode}`);
  }
});

test('reports the first failing rule when multiple entries are broken', () => {
  const chain = baselineChain();
  chain[1] = { ...chain[1], sequence: 9, timestamp: chain[0].timestamp };
  chain[2] = { ...chain[2], sequence: 20 };
  const summary = verifyAuditTrail(chain);
  assert.deepEqual(summary.failure, { entryIndex: 1, code: 'sequence-gap' });
});

test('within one entry, checks rules in the documented priority order', () => {
  const chain = baselineChain();
  chain[1] = {
    ...chain[1],
    sequence: 9,
    previousHash: 'deadbeef',
    timestamp: 'not-a-timestamp',
    actorRole: 'MYSTERY_ROLE' as AuditEntry['actorRole'],
  };
  const summary = verifyAuditTrail(chain);
  assert.deepEqual(summary.failure, { entryIndex: 1, code: 'sequence-gap' });
});

test('broken summary carries only status, entryCount, and failure', () => {
  const chain = baselineChain();
  chain[0] = { ...chain[0], previousHash: 'not-genesis' };
  const summary = verifyAuditTrail(chain);
  assert.deepEqual(Object.keys(summary).sort(), ['entryCount', 'failure', 'status']);
  assert.deepEqual(Object.keys(summary.failure!).sort(), ['code', 'entryIndex']);
});

test('verified summary with entries carries status, entryCount, and finalHash only', () => {
  const summary = verifyAuditTrail(baselineChain());
  assert.deepEqual(Object.keys(summary).sort(), ['entryCount', 'finalHash', 'status']);
});

test('hashAuditEntry is pure and deterministic across repeated calls', () => {
  const entry: AuditEntry = {
    sequence: 1,
    actorRole: 'COLLECTOR',
    actionCode: 'SAMPLE_RECEIVED',
    timestamp: '2026-01-01T12:00:00.000Z',
    previousHash: GENESIS_PREVIOUS_HASH,
  };
  const first = hashAuditEntry(entry);
  const second = hashAuditEntry({ ...entry });
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{8}$/);
});

test('hashAuditEntry is computed over canonicalAuditEntryJson', () => {
  const entry: AuditEntry = {
    sequence: 1,
    actorRole: 'COLLECTOR',
    actionCode: 'SAMPLE_RECEIVED',
    timestamp: '2026-01-01T12:00:00.000Z',
    previousHash: GENESIS_PREVIOUS_HASH,
  };
  assert.equal(
    canonicalAuditEntryJson(entry),
    '{"sequence":1,"actorRole":"COLLECTOR","actionCode":"SAMPLE_RECEIVED","timestamp":"2026-01-01T12:00:00.000Z","previousHash":"GENESIS"}',
  );
});

test('hashAuditEntry changes if any declared field changes', () => {
  const base: AuditEntry = {
    sequence: 1,
    actorRole: 'COLLECTOR',
    actionCode: 'SAMPLE_RECEIVED',
    timestamp: '2026-01-01T12:00:00.000Z',
    previousHash: GENESIS_PREVIOUS_HASH,
  };
  const baseHash = hashAuditEntry(base);
  assert.notEqual(hashAuditEntry({ ...base, sequence: 2 }), baseHash);
  assert.notEqual(hashAuditEntry({ ...base, actorRole: 'ANALYST' }), baseHash);
  assert.notEqual(hashAuditEntry({ ...base, actionCode: 'RECORD_VOIDED' }), baseHash);
  assert.notEqual(hashAuditEntry({ ...base, timestamp: '2026-01-01T12:00:01.000Z' }), baseHash);
  assert.notEqual(hashAuditEntry({ ...base, previousHash: 'other' }), baseHash);
});

test('throws AuditTrailInputError when entries is not an array', () => {
  assert.throws(
    () => verifyAuditTrail('not-an-array'),
    (error: unknown) => error instanceof AuditTrailInputError && error.code === 'entries-not-array',
  );
});

test('throws AuditTrailInputError for an entry missing a required field', () => {
  const malformed = { ...baselineChain()[0], actorRole: undefined };
  assert.throws(
    () => verifyAuditTrail([malformed]),
    (error: unknown) => error instanceof AuditTrailInputError && error.code === 'entry-malformed',
  );
});

test('throws AuditTrailInputError for a non-object entry', () => {
  assert.throws(
    () => verifyAuditTrail([null]),
    (error: unknown) => error instanceof AuditTrailInputError && error.code === 'entry-malformed',
  );
});

test('throws AuditTrailInputError for a non-integer sequence number', () => {
  const malformed = { ...baselineChain()[0], sequence: 1.5 };
  assert.throws(
    () => verifyAuditTrail([malformed]),
    (error: unknown) => error instanceof AuditTrailInputError && error.code === 'entry-malformed',
  );
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
        wellFormed: verifyAuditTrail(chain),
        noTz: verifyAuditTrail([{ ...chain[0], timestamp: noTzTimestamp }]),
        impossible: verifyAuditTrail([{ ...chain[0], timestamp: impossibleDate }]),
      };
    });

    for (const result of results) {
      assert.deepEqual(result.wellFormed, results[0].wellFormed);
      assert.deepEqual(result.noTz, results[0].noTz);
      assert.deepEqual(result.impossible, results[0].impossible);
    }
    assert.equal(results[0].wellFormed.status, 'VERIFIED');
    assert.deepEqual(results[0].noTz.failure, { entryIndex: 0, code: 'timestamp-invalid' });
    assert.deepEqual(results[0].impossible.failure, { entryIndex: 0, code: 'timestamp-invalid' });
  } finally {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  }
});

test('explainAuditTrailReason and explainAuditTrailNextAction cover every reason code', () => {
  const codes: AuditTrailReasonCode[] = [
    'genesis-hash-invalid',
    'sequence-gap',
    'previous-hash-mismatch',
    'timestamp-invalid',
    'timestamp-duplicate',
    'timestamp-out-of-order',
    'actor-role-unknown',
    'action-code-unknown',
    'action-not-permitted-for-role',
  ];
  for (const code of codes) {
    const reason = explainAuditTrailReason(code);
    const nextAction = explainAuditTrailNextAction(code);
    assert.equal(typeof reason, 'string');
    assert.ok(reason.length > 0);
    assert.equal(typeof nextAction, 'string');
    assert.ok(nextAction.length > 0);
  }
});

/**
 * Applies overrides to chain[index] and recomputes previousHash so the
 * entry stays correctly hash-linked to its (unmodified) predecessor,
 * isolating the rule under test from an incidental hash-link break.
 */
function rechain(chain: AuditEntry[], index: number, overrides: Partial<AuditEntry>): AuditEntry {
  const previousHash = index === 0 ? GENESIS_PREVIOUS_HASH : hashAuditEntry(chain[index - 1]);
  return { ...chain[index], ...overrides, previousHash };
}
