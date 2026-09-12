import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { GET } from '../../app/pilot/ohworks/audit/export/route';
import {
  buildOHWorksAuditCsv,
  OHWORKS_AUDIT_CSV_COLUMNS,
  serializeOHWorksAuditCsv,
} from '../../lib/ohworks-audit-export';
import {
  getRoleViews,
  getVisibleAudit,
  type AuditFixture,
} from '../../lib/ohworks-pilot';

const exportUrl = (query = '') => `http://localhost/pilot/ohworks/audit/export${query}`;

test('every supported role exports exactly its existing visible audit records', async () => {
  for (const role of getRoleViews()) {
    const response = GET(new Request(exportUrl(`?role=${role.id}`)));
    const body = await response.text();

    assert.equal(response.status, 200, role.id);
    assert.equal(body, buildOHWorksAuditCsv(role.id), role.id);
    assert.equal(
      body.split('\r\n').filter(Boolean).length,
      getVisibleAudit(role.id).length + 1,
      role.id,
    );
  }
});

test('outcome-only roles cannot export hidden admin audit records', async () => {
  for (const roleId of ['worker', 'employer'] as const) {
    const body = await GET(new Request(exportUrl(`?role=${roleId}`))).text();
    assert.match(body, /ohworks-audit-001/u, roleId);
    assert.doesNotMatch(body, /ohworks-audit-002|ohworks-audit-003/u, roleId);
    assert.doesNotMatch(body, /ohworks-actor-technical-reviewer-001/u, roleId);
  }
});

test('an empty role-filtered result remains a valid header-only CSV', () => {
  assert.equal(
    serializeOHWorksAuditCsv([]),
    `${OHWORKS_AUDIT_CSV_COLUMNS.join(',')}\r\n`,
  );
});

test('missing, empty, invalid, case-shifted, and duplicate roles fail closed', async () => {
  for (const query of ['', '?role=', '?role=unknown', '?role=ADMIN', '?role=worker&role=admin']) {
    const response = GET(new Request(exportUrl(query)));
    const body = await response.text();

    assert.equal(response.status, 400, query || 'missing');
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.match(body, /explicit supported synthetic role/u);
    assert.doesNotMatch(body, /ohworks-audit-/u);
  }
});

test('successful export uses safe deterministic attachment headers', () => {
  const response = GET(new Request(exportUrl('?role=reviewer')));

  assert.equal(response.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(
    response.headers.get('content-disposition'),
    'attachment; filename="ohworks-synthetic-audit-reviewer.csv"',
  );
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('CSV columns and event ordering are stable across input order', () => {
  const events: AuditFixture[] = [
    auditEvent({ id: 'event-z', at: '2026-09-03 09:00' }),
    auditEvent({ id: 'event-early', at: '2026-09-03 08:00' }),
    auditEvent({ id: 'event-a', at: '2026-09-03 09:00' }),
  ];

  const rows = serializeOHWorksAuditCsv(events).trimEnd().split('\r\n');
  assert.equal(rows[0], 'event_id,occurred_at,actor_id,action,object,note');
  assert.deepEqual(rows.slice(1).map((row) => row.split(',')[0]), [
    'event-early',
    'event-a',
    'event-z',
  ]);
  assert.equal(serializeOHWorksAuditCsv(events), serializeOHWorksAuditCsv([...events].reverse()));
});

test('CSV escaping covers commas, quotes, newlines, and formula prefixes', () => {
  const csv = serializeOHWorksAuditCsv([
    auditEvent({
      id: 'event,quoted',
      actorId: 'actor "quoted"',
      action: 'line one\nline two',
      object: '=2+2',
      note: ' \t@SUM(A1:A2)',
    }),
  ]);

  assert.match(csv, /"event,quoted"/u);
  assert.match(csv, /"actor ""quoted"""/u);
  assert.match(csv, /"line one\nline two"/u);
  assert.match(csv, /,'=2\+2,/u);
  assert.match(csv, /,' \t@SUM\(A1:A2\)\r\n/u);

  for (const prefix of ['=1', '+1', '-1', '@x', ' \t=1']) {
    const row = serializeOHWorksAuditCsv([auditEvent({ id: prefix })]).split('\r\n')[1];
    assert.ok(row.startsWith(`'${prefix},`), prefix);
  }
});

test('audit page links the download to the resolved role and preserves warnings', () => {
  const page = readFileSync(
    resolve(import.meta.dirname, '../../app/pilot/ohworks/audit/page.tsx'),
    'utf8',
  );

  assert.match(page, /audit\/export\?role=\$\{encodeURIComponent\(role\.id\)\}/u);
  assert.match(page, /Synthetic demonstration data only/u);
  assert.match(page, /does not certify compliance, accreditation, validation, or customer readiness/u);
});

function auditEvent(overrides: Partial<AuditFixture>): AuditFixture {
  return {
    id: 'event-001',
    tenantId: 'tenant-ohworks-supervised-demo',
    dataClass: 'admin',
    at: '2026-09-03 09:00',
    actorId: 'actor-001',
    action: 'Synthetic action',
    object: 'OW-SYN-S2-10000',
    note: 'Synthetic note',
    ...overrides,
  };
}
