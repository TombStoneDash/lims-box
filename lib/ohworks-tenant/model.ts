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
  | 'sample:queue'
  | 'result:read'
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
  | 'Awaiting verification'
  | 'Retest requested'
  | 'Quarantined'
  | 'Rejected'
  | 'Technical review'
  | 'Released'
  | 'Unknown';

export type SampleAction =
  | 'queue'
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
  uid: string;
  code: string;
  analyte: string;
  value: string;
  units?: string;
  reference?: string;
  flag?: string;
  reviewState: string;
}

export interface SampleRecord {
  uid: string;
  id: string;
  tenantId: typeof TEST_TENANT_ID;
  dataDomain: 'senaite';
  orderId?: string;
  subjectReference?: string;
  panel?: string;
  specimen?: string;
  receivedAt?: string;
  priority?: string;
  state: SampleState;
  senaiteState: string;
  results: ResultValue[];
  review?: { accountId?: string; actor: string; at?: string; outcome: string };
  release?: { accountId?: string; actor: string; at?: string; reportId: string };
  exception?: { reason: string; at?: string };
  remarks?: string;
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
  dataDomain: 'senaite';
  at: string;
  actor: string;
  action: string;
  objectId: string;
  detail: string;
}

export interface InstrumentRecord {
  id: string;
  tenantId: typeof TEST_TENANT_ID;
  dataDomain: 'senaite';
  name: string;
  status: string;
  queueDepth: number;
  lastImportAt?: string;
  connection: 'SENAITE result importer';
}

export interface LaboratoryAvailability {
  available: boolean;
  source: 'senaite';
  checkedAt: string;
  reason?: string;
}

export interface TenantStore {
  schemaVersion: 3;
  tenantId: typeof TEST_TENANT_ID;
  laboratory: LaboratoryAvailability;
  samples: SampleRecord[];
  personnel: PersonnelRecord[];
  instruments: InstrumentRecord[];
  audit: AuditRecord[];
}
