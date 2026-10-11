import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeAnalystRelease,
  type AnalystRecord,
  type ReleaseCandidate,
} from '../../lib/ohworks-analyst-authorization';

// Synthetic fixtures follow the neighboring authorization tests.
const candidate: ReleaseCandidate = {
  resultId: 'result-synthetic-1',
  method: 'EPA-200.8',
  flag: 'ROUTINE',
  timestamp: '2026-06-01T12:00:00Z',
};

function analyst(): AnalystRecord {
  return {
    analystId: 'analyst-synthetic-a',
    role: 'ANALYST',
    competencies: [{
      method: 'EPA-200.8',
      assessedAt: '2026-01-01T00:00:00Z',
      expiresAt: '2027-01-01T00:00:00Z',
    }],
  };
}

const authorized = { resultId: candidate.resultId, decision: 'AUTHORIZED', rule: 'routine-authorized' };
const refused = (rule: string) => ({ resultId: candidate.resultId, decision: 'REFUSED', rule });

for (const offset of ['+00:60', '+00:99', '+24:00', '+99:00']) {
  test(`rejects malformed candidate offset ${offset}`, () => {
    assert.deepEqual(
      authorizeAnalystRelease(analyst(), { ...candidate, timestamp: `2026-06-01T12:00:00${offset}` }),
      refused('timestamp-invalid'),
    );
  });

  for (const field of ['assessedAt', 'expiresAt'] as const) {
    test(`does not count competency with malformed ${field} offset ${offset}`, () => {
      const record = analyst();
      record.competencies[0][field] = `${field === 'assessedAt' ? '2026' : '2027'}-01-01T00:00:00${offset}`;
      assert.deepEqual(authorizeAnalystRelease(record, candidate), refused('competency-expired'));
    });
  }

  for (const field of ['startsAt', 'endsAt'] as const) {
    test(`treats malformed suspension ${field} offset ${offset} as active`, () => {
      const record = analyst();
      record.suspension = {
        startsAt: field === 'startsAt' ? `2026-12-01T00:00:00${offset}` : '2026-01-01T00:00:00Z',
        endsAt: field === 'endsAt' ? `2026-02-01T00:00:00${offset}` : '2027-01-01T00:00:00Z',
      };
      assert.deepEqual(authorizeAnalystRelease(record, candidate), refused('analyst-suspended'));
    });
  }
}

test('Z and equivalent valid numeric candidate offsets authorize identically', () => {
  for (const timestamp of [
    '2026-06-01T12:00:00Z',
    '2026-06-01T17:00:00+05:00',
    '2026-06-01T07:00:00-05:00',
    '2026-06-01T12:59:00+00:59',
    '2026-06-02T11:59:00+23:59',
  ]) {
    assert.deepEqual(authorizeAnalystRelease(analyst(), { ...candidate, timestamp }), authorized);
  }
});

test('Z and equivalent valid numeric competency offsets authorize identically', () => {
  const record = analyst();
  record.competencies[0].assessedAt = '2026-01-01T05:00:00+05:00';
  record.competencies[0].expiresAt = '2026-12-31T19:00:00-05:00';
  assert.deepEqual(authorizeAnalystRelease(record, candidate), authorized);
});

test('Z and equivalent valid numeric suspension offsets refuse identically', () => {
  const record = analyst();
  record.suspension = {
    startsAt: '2026-05-01T05:00:00+05:00',
    endsAt: '2026-06-30T19:00:00-05:00',
  };
  assert.deepEqual(authorizeAnalystRelease(record, candidate), refused('analyst-suspended'));
  record.suspension = { startsAt: '2026-05-01T00:00:00Z', endsAt: '2026-07-01T00:00:00Z' };
  assert.deepEqual(authorizeAnalystRelease(record, candidate), refused('analyst-suspended'));
});
