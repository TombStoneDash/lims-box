import type { TenantStore } from './model';
import { TEST_DATA_DOMAIN, TEST_TENANT_ID } from './model';

const at = (hour: string) => `2026-09-04T${hour}:00.000Z`;

export function createInitialStore(): TenantStore {
  const common = { tenantId: TEST_TENANT_ID, dataDomain: TEST_DATA_DOMAIN, instrument: 'LIAISON XL' } as const;
  return {
    schemaVersion: 2,
    tenantId: TEST_TENANT_ID,
    dataDomain: TEST_DATA_DOMAIN,
    sequence: 109,
    samples: [
      { ...common, id: 'OW-260904-101', orderId: 'ORD-62041', subjectReference: 'EMP-4101', panel: 'Immunity screen', specimen: 'Serum', receivedAt: at('07:42'), priority: 'Routine', state: 'Accessioned', rackPosition: 'A01', results: [], revision: 1 },
      { ...common, id: 'OW-260904-102', orderId: 'ORD-62042', subjectReference: 'EMP-4102', panel: 'Hepatitis B immunity', specimen: 'Serum', receivedAt: at('07:48'), priority: 'Routine', state: 'Queued', rackPosition: 'A02', results: [], revision: 2 },
      { ...common, id: 'OW-260904-103', orderId: 'ORD-62043', subjectReference: 'EMP-4103', panel: 'Immunity screen', specimen: 'Serum', receivedAt: at('08:02'), priority: 'Routine', state: 'Result available', rackPosition: 'A03', results: [
        { code: 'RUB-IGG', analyte: 'Rubella IgG', value: '48.0', units: 'IU/mL', reference: '>= 10.0', flag: 'Within range' },
        { code: 'MEAS-IGG', analyte: 'Measles IgG', value: '172', units: 'AU/mL', reference: '>= 16.5', flag: 'Within range' },
      ], revision: 3 },
      { ...common, id: 'OW-260904-104', orderId: 'ORD-62044', subjectReference: 'EMP-4104', panel: 'Hepatitis B immunity', specimen: 'Serum', receivedAt: at('08:18'), priority: 'Urgent', state: 'Result available', rackPosition: 'A04', results: [
        { code: 'HBS-AB', analyte: 'Hepatitis B surface antibody', value: '6.2', units: 'mIU/mL', reference: '>= 10.0', flag: 'Out of range' },
      ], revision: 3 },
      { ...common, id: 'OW-260904-105', orderId: 'ORD-62045', subjectReference: 'EMP-4105', panel: 'Immunity screen', specimen: 'Serum', receivedAt: at('08:29'), priority: 'Routine', state: 'Retest requested', rackPosition: 'A05', results: [
        { code: 'MUMP-IGG', analyte: 'Mumps IgG', value: '8.1', units: 'AU/mL', reference: '>= 11.0', flag: 'Out of range' },
      ], exception: { reason: 'Repeat requested after control review', at: at('09:12') }, revision: 5 },
      { ...common, id: 'OW-260904-106', orderId: 'ORD-62046', subjectReference: 'EMP-4106', panel: 'Immunity screen', specimen: 'Serum', receivedAt: at('08:47'), priority: 'Routine', state: 'Quarantined', rackPosition: 'A06', results: [], exception: { reason: 'Sample barcode did not match the worklist', at: at('08:59') }, revision: 3 },
      { ...common, id: 'OW-260904-107', orderId: 'ORD-62047', subjectReference: 'EMP-4107', panel: 'Hepatitis B immunity', specimen: 'Serum', receivedAt: at('09:03'), priority: 'Routine', state: 'Technical review', rackPosition: 'A07', results: [
        { code: 'HBS-AB', analyte: 'Hepatitis B surface antibody', value: '32.0', units: 'mIU/mL', reference: '>= 10.0', flag: 'Within range' },
      ], review: { accountId: 'acct-reviewer', actor: 'Priya North', at: at('09:31'), outcome: 'Accepted' }, revision: 4 },
      { ...common, id: 'OW-260904-108', orderId: 'ORD-62048', subjectReference: 'EMP-4108', panel: 'Immunity screen', specimen: 'Serum', receivedAt: at('09:14'), priority: 'Routine', state: 'Released', rackPosition: 'A08', results: [
        { code: 'RUB-IGG', analyte: 'Rubella IgG', value: '61.0', units: 'IU/mL', reference: '>= 10.0', flag: 'Within range' },
        { code: 'MEAS-IGG', analyte: 'Measles IgG', value: '204', units: 'AU/mL', reference: '>= 16.5', flag: 'Within range' },
      ], review: { accountId: 'acct-reviewer', actor: 'Priya North', at: at('09:38'), outcome: 'Accepted' }, release: { accountId: 'acct-manager', actor: 'Morgan Vale', at: at('09:44'), reportId: 'RPT-260904-108' }, revision: 5 },
      { ...common, id: 'OW-260904-109', orderId: 'ORD-62049', subjectReference: 'EMP-4109', panel: 'Hepatitis B immunity', specimen: 'Serum', receivedAt: at('09:22'), priority: 'Routine', state: 'Rejected', rackPosition: 'A09', results: [
        { code: 'HBS-AB', analyte: 'Hepatitis B surface antibody', value: '4.8', units: 'mIU/mL', reference: '>= 10.0', flag: 'Out of range' },
      ], exception: { reason: 'Specimen integrity did not meet acceptance criteria', at: at('09:36') }, revision: 4 },
    ],
    personnel: [
      { tenantId: TEST_TENANT_ID, dataDomain: TEST_DATA_DOMAIN, id: 'PER-001', name: 'Morgan Vale', jobTitle: 'Laboratory Manager', competency: 'Current', instrumentAuthorization: 'Release approval', nextReview: '12 Feb 2027' },
      { tenantId: TEST_TENANT_ID, dataDomain: TEST_DATA_DOMAIN, id: 'PER-002', name: 'Priya North', jobTitle: 'Senior Biomedical Scientist', competency: 'Current', instrumentAuthorization: 'LIAISON XL operation and review', nextReview: '08 Jan 2027' },
      { tenantId: TEST_TENANT_ID, dataDomain: TEST_DATA_DOMAIN, id: 'PER-003', name: 'Elliot Mercer', jobTitle: 'Sample Reception Technician', competency: 'Due soon', instrumentAuthorization: 'Accession and queue', nextReview: '21 Sep 2026' },
    ],
    instruments: [
      { tenantId: TEST_TENANT_ID, dataDomain: TEST_DATA_DOMAIN, id: 'INS-XL-01', name: 'LIAISON XL', status: 'Ready', queueDepth: 1, lastImportAt: at('09:33'), connection: 'Test file import' },
    ],
    audit: [
      { tenantId: TEST_TENANT_ID, dataDomain: TEST_DATA_DOMAIN, id: 'AUD-001', at: at('09:44'), actor: 'Morgan Vale', action: 'Report released', objectId: 'OW-260904-108', detail: 'RPT-260904-108 created after technical review.' },
      { tenantId: TEST_TENANT_ID, dataDomain: TEST_DATA_DOMAIN, id: 'AUD-002', at: at('09:38'), actor: 'Priya North', action: 'Technical review completed', objectId: 'OW-260904-108', detail: 'Result set accepted for release.' },
      { tenantId: TEST_TENANT_ID, dataDomain: TEST_DATA_DOMAIN, id: 'AUD-003', at: at('09:12'), actor: 'Priya North', action: 'Retest requested', objectId: 'OW-260904-105', detail: 'Repeat added to the instrument worklist.' },
      { tenantId: TEST_TENANT_ID, dataDomain: TEST_DATA_DOMAIN, id: 'AUD-004', at: at('08:59'), actor: 'System', action: 'Sample quarantined', objectId: 'OW-260904-106', detail: 'Barcode mismatch prevented result import.' },
    ],
  };
}
