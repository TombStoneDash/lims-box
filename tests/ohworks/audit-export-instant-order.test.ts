import assert from 'node:assert/strict';
import { test } from 'node:test';

import { serializeOHWorksAuditCsv } from '../../lib/ohworks-audit-export';
import type { AuditFixture } from '../../lib/ohworks-pilot';

function auditEvent(id: string, at: string): AuditFixture {
  return {
    id,
    tenantId: 'tenant-ohworks-supervised-demo',
    dataClass: 'admin',
    at,
    actorId: 'actor-001',
    action: 'Synthetic action',
    object: 'OW-SYN-S2-10000',
    note: 'Synthetic note',
  };
}

test('audit CSV orders instants, breaks ties by ID, and places invalid timestamps last', () => {
  const events = [
    auditEvent('fractional', '2026-01-01T00:00:00.100Z'),
    auditEvent('invalid-z', 'not-a-time-z'),
    auditEvent('tie-z', '2026-01-01T00:00:00Z'),
    auditEvent('minute', '2025-12-31 23:59'),
    auditEvent('invalid-a', 'not-a-time-a'),
    auditEvent('tie-a', '2025-12-31T19:00:00-05:00'),
  ];

  const csv = serializeOHWorksAuditCsv(events);
  const rows = csv.trimEnd().split('\r\n').slice(1);
  assert.deepEqual(rows.map((row) => row.split(',').slice(0, 2)), [
    ['minute', '2025-12-31 23:59'],
    ['tie-a', '2025-12-31T19:00:00-05:00'],
    ['tie-z', '2026-01-01T00:00:00Z'],
    ['fractional', '2026-01-01T00:00:00.100Z'],
    ['invalid-a', 'not-a-time-a'],
    ['invalid-z', 'not-a-time-z'],
  ]);
  assert.equal(csv, serializeOHWorksAuditCsv([...events].reverse()));
});
