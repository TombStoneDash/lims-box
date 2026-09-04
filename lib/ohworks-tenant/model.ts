export const TEST_TENANT_ID = 'ohworks-test-tenant';
export const TEST_DATA_DOMAIN = 'synthetic_test' as const;

export type TenantRole =
  | 'laboratory_manager'
  | 'receiving'
  | 'scientist'
  | 'reviewer'
  | 'approver'
  | 'auditor';

export type TenantPermission =
  | 'sample:read'
  | 'sample:accession'
  | 'sample:queue'
  | 'result:read'
  | 'result:record'
  | 'result:retest'
  | 'result:quarantine'
  | 'result:reject'
  | 'result:review'
  | 'result:release'
  | 'report:read'
  | 'personnel:read'
  | 'audit:read';

export type SampleState =
  | 'Accessioned'
  | 'Queued'
  | 'Result available'
  | 'Retest requested'
  | 'Quarantined'
  | 'Rejected'
  | 'Technical review'
  | 'Released';

export type SampleAction =
  | 'accession'
  | 'queue'
  | 'record_result'
  | 'request_retest'
  | 'quarantine'
  | 'reject'
  | 'technical_review'
  | 'release';

export interface TenantPrincipal {
  accountId: string;
  username: string;
  displayName: string;
  role: TenantRole;
}

export interface ResultValue {
  code: string;
  analyte: string;
  value: string;
  units: string;
  reference: string;
  flag: 'Within range' | 'Out of range';
}

export interface SampleRecord {
  id: string;
  tenantId: typeof TEST_TENANT_ID;
  dataDomain: typeof TEST_DATA_DOMAIN;
  orderId: string;
  subjectReference: string;
  panel: string;
  specimen: string;
  receivedAt: string;
  priority: 'Routine' | 'Urgent';
  state: SampleState;
  instrument: 'LIAISON XL';
  rackPosition: string;
  results: ResultValue[];
  review?: { accountId: string; actor: string; at: string; outcome: 'Accepted' };
  release?: { accountId: string; actor: string; at: string; reportId: string };
  exception?: { reason: string; at: string };
  revision: number;
}

export interface PersonnelRecord {
  id: string;
  tenantId: typeof TEST_TENANT_ID;
  dataDomain: typeof TEST_DATA_DOMAIN;
  name: string;
  jobTitle: string;
  competency: 'Current' | 'Due soon';
  instrumentAuthorization: string;
  nextReview: string;
}

export interface AuditRecord {
  id: string;
  tenantId: typeof TEST_TENANT_ID;
  dataDomain: typeof TEST_DATA_DOMAIN;
  at: string;
  actor: string;
  action: string;
  objectId: string;
  detail: string;
}

export interface InstrumentRecord {
  id: string;
  tenantId: typeof TEST_TENANT_ID;
  dataDomain: typeof TEST_DATA_DOMAIN;
  name: 'LIAISON XL';
  status: 'Ready';
  queueDepth: number;
  lastImportAt: string;
  connection: 'Test file import';
}

export interface TenantStore {
  schemaVersion: 2;
  tenantId: typeof TEST_TENANT_ID;
  dataDomain: typeof TEST_DATA_DOMAIN;
  sequence: number;
  samples: SampleRecord[];
  personnel: PersonnelRecord[];
  instruments: InstrumentRecord[];
  audit: AuditRecord[];
}
