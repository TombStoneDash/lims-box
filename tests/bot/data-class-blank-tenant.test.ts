import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterByDataClass, type DataClassRecord, type PrincipalContext } from '../../lib/bot/data-class';

function blankTenantPrincipal(tenantId: PrincipalContext['tenantId']): PrincipalContext {
  return {
    tenantId,
    subjectId: 'subject-blank-tenant',
    role: 'quality',
    allowedDataClasses: ['clinical_detail'],
  };
}

test('blank, whitespace, undefined, and null principal tenantId yield zero records', () => {
  const record: DataClassRecord = { id: 'r', tenantId: '', dataClass: 'clinical_detail' };

  assert.deepEqual(filterByDataClass([record], blankTenantPrincipal('')), []);
  assert.deepEqual(filterByDataClass([record], blankTenantPrincipal('   ')), []);
  assert.deepEqual(
    filterByDataClass([record], blankTenantPrincipal(undefined as unknown as string)),
    [],
  );
  assert.deepEqual(filterByDataClass([record], blankTenantPrincipal(null as unknown as string)), []);
});

test('blank, whitespace, undefined, and null record tenantId never match a blank principal tenantId', () => {
  const principal = blankTenantPrincipal('');
  const records = [
    { id: 'r-empty', tenantId: '', dataClass: 'clinical_detail' },
    { id: 'r-whitespace', tenantId: '   ', dataClass: 'clinical_detail' },
    { id: 'r-undefined', tenantId: undefined as unknown as string, dataClass: 'clinical_detail' },
    { id: 'r-null', tenantId: null as unknown as string, dataClass: 'clinical_detail' },
  ] as DataClassRecord[];

  assert.deepEqual(filterByDataClass(records, principal), []);
});

test('a principal with a real tenant never receives records with blank tenant ids', () => {
  const principal: PrincipalContext = {
    tenantId: 'tenant-real',
    subjectId: 'subject-real',
    role: 'quality',
    allowedDataClasses: ['clinical_detail'],
  };
  const records = [
    { id: 'r-empty', tenantId: '', dataClass: 'clinical_detail' },
    { id: 'r-whitespace', tenantId: '   ', dataClass: 'clinical_detail' },
    { id: 'r-undefined', tenantId: undefined as unknown as string, dataClass: 'clinical_detail' },
    { id: 'r-null', tenantId: null as unknown as string, dataClass: 'clinical_detail' },
  ] as DataClassRecord[];

  assert.deepEqual(filterByDataClass(records, principal), []);
});

test('normal same-tenant, allowed-class record is still returned', () => {
  const principal: PrincipalContext = {
    tenantId: 'tenant-real',
    subjectId: 'subject-real',
    role: 'quality',
    allowedDataClasses: ['clinical_detail'],
  };
  const records: DataClassRecord[] = [
    { id: 'r-match', tenantId: 'tenant-real', dataClass: 'clinical_detail' },
    { id: 'r-other-tenant', tenantId: 'tenant-other', dataClass: 'clinical_detail' },
    { id: 'r-disallowed-class', tenantId: 'tenant-real', dataClass: 'admin' },
  ];

  const visible = filterByDataClass(records, principal);
  assert.deepEqual(visible.map((r) => r.id), ['r-match']);
});
