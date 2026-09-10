import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { filterByDataClass, type DataClass, type DataClassRecord, type PrincipalContext } from '../../lib/bot/data-class';

const ROLES_FIXTURE = path.join(__dirname, '..', '..', 'fixtures', 'bot', 'data-class-roles.json');
const roleDefaults = JSON.parse(readFileSync(ROLES_FIXTURE, 'utf8')) as Record<string, DataClass[]>;

function principalFor(role: PrincipalContext['role'], tenantId = 'tenant-ohworks'): PrincipalContext {
  return {
    tenantId,
    subjectId: `subject-${role}`,
    role,
    allowedDataClasses: roleDefaults[role],
  };
}

const SYNTHETIC_RECORDS: DataClassRecord[] = [
  { id: 'rec-outcome-1', tenantId: 'tenant-ohworks', dataClass: 'outcome_only' },
  { id: 'rec-clinical-1', tenantId: 'tenant-ohworks', dataClass: 'clinical_detail' },
  { id: 'rec-admin-1', tenantId: 'tenant-ohworks', dataClass: 'admin' },
  { id: 'rec-other-tenant-1', tenantId: 'tenant-other', dataClass: 'outcome_only' },
];

test('employer role receives outcome_only records and zero clinical_detail records', () => {
  const employer = principalFor('employer');
  const visible = filterByDataClass(SYNTHETIC_RECORDS, employer);

  assert.ok(visible.every((record) => record.dataClass !== 'clinical_detail'));
  assert.ok(visible.some((record) => record.id === 'rec-outcome-1'));
  assert.ok(!visible.some((record) => record.id === 'rec-clinical-1'));
  assert.ok(!visible.some((record) => record.id === 'rec-admin-1'));
});

test('employer query for a known worker subject still yields zero clinical_detail records', () => {
  const employer: PrincipalContext = {
    tenantId: 'tenant-ohworks',
    subjectId: 'employer-hr-lead',
    role: 'employer',
    allowedDataClasses: roleDefaults.employer,
  };
  const workerScopedRecords: DataClassRecord[] = [
    { id: 'rec-worker-outcome-1', tenantId: 'tenant-ohworks', dataClass: 'outcome_only' },
    { id: 'rec-worker-clinical-1', tenantId: 'tenant-ohworks', dataClass: 'clinical_detail' },
  ];

  const visible = filterByDataClass(workerScopedRecords, employer);
  assert.deepEqual(
    visible.map((r) => r.id),
    ['rec-worker-outcome-1'],
  );
});

test('record-supplied overrides cannot change the principal-driven decision', () => {
  const employer = principalFor('employer');
  const recordsWithSpoofedOverride = [
    {
      id: 'rec-spoofed-1',
      tenantId: 'tenant-ohworks',
      dataClass: 'clinical_detail',
      // A malicious/mistaken record-level override that must be ignored entirely.
      allowedDataClasses: ['clinical_detail', 'admin'],
      forceInclude: true,
    },
  ] as unknown as DataClassRecord[];

  const visible = filterByDataClass(recordsWithSpoofedOverride, employer);
  assert.deepEqual(visible, []);
});

test('clinician and quality roles can see clinical_detail records within their tenant', () => {
  const clinician = principalFor('clinician');
  const visibleToClinician = filterByDataClass(SYNTHETIC_RECORDS, clinician);
  assert.ok(visibleToClinician.some((record) => record.id === 'rec-clinical-1'));
  assert.ok(!visibleToClinician.some((record) => record.id === 'rec-admin-1'));

  const quality = principalFor('quality');
  const visibleToQuality = filterByDataClass(SYNTHETIC_RECORDS, quality);
  assert.ok(visibleToQuality.some((record) => record.id === 'rec-admin-1'));
});

test('cross-tenant records are never returned regardless of role', () => {
  const admin = principalFor('admin');
  const visible = filterByDataClass(SYNTHETIC_RECORDS, admin);
  assert.ok(!visible.some((record) => record.id === 'rec-other-tenant-1'));
});
