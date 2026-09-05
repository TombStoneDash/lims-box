import type { PersonnelRecord } from './model';
import { TEST_DATA_DOMAIN, TEST_TENANT_ID } from './model';

// Personnel is intentionally independent from SENAITE laboratory state. These
// synthetic test-tenant records are the only local operational data retained.
export function createInitialPersonnel(): PersonnelRecord[] {
  return [
    { tenantId: TEST_TENANT_ID, dataDomain: TEST_DATA_DOMAIN, id: 'PER-001', name: 'Morgan Vale', jobTitle: 'Laboratory Manager', competency: 'Current', instrumentAuthorization: 'Release approval', nextReview: '12 Feb 2027' },
    { tenantId: TEST_TENANT_ID, dataDomain: TEST_DATA_DOMAIN, id: 'PER-002', name: 'Priya North', jobTitle: 'Senior Biomedical Scientist', competency: 'Current', instrumentAuthorization: 'LIAISON XL operation and review', nextReview: '08 Jan 2027' },
    { tenantId: TEST_TENANT_ID, dataDomain: TEST_DATA_DOMAIN, id: 'PER-003', name: 'Elliot Mercer', jobTitle: 'Sample Reception Technician', competency: 'Due soon', instrumentAuthorization: 'Accession and queue', nextReview: '21 Sep 2026' },
  ];
}
