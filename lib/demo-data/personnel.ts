export interface StaffMember {
  name: string;
  role: string;
  employeeId: string;
  competencies: Competency[];
  signatureEnabled: boolean;
  hireDate: string;
}

export interface Competency {
  name: string;
  certifiedDate: string;
  expirationDate: string;
  status: 'Current' | 'Expiring Soon' | 'Expired';
  assessedBy: string;
}

export const staff: StaffMember[] = [
  {
    name: 'Sarah Chen',
    role: 'Lab Director',
    employeeId: 'EMP-001',
    signatureEnabled: true,
    hireDate: '2019-03-15',
    competencies: [
      { name: 'Phlebotomy', certifiedDate: '2025-11-10', expirationDate: '2026-11-10', status: 'Current', assessedBy: 'External — ASCP' },
      { name: 'Chemistry Analysis', certifiedDate: '2025-12-01', expirationDate: '2026-12-01', status: 'Current', assessedBy: 'External — ASCP' },
      { name: 'Hematology Analysis', certifiedDate: '2025-12-01', expirationDate: '2026-12-01', status: 'Current', assessedBy: 'External — ASCP' },
      { name: 'QC Review & Approval', certifiedDate: '2026-01-15', expirationDate: '2027-01-15', status: 'Current', assessedBy: 'Self — Lab Director' },
      { name: 'Laboratory Safety', certifiedDate: '2026-02-01', expirationDate: '2027-02-01', status: 'Current', assessedBy: 'External — OSHA' },
    ],
  },
  {
    name: 'Mike Torres',
    role: 'Medical Technologist',
    employeeId: 'EMP-002',
    signatureEnabled: true,
    hireDate: '2021-06-01',
    competencies: [
      { name: 'Phlebotomy', certifiedDate: '2025-10-20', expirationDate: '2026-10-20', status: 'Current', assessedBy: 'Sarah Chen' },
      { name: 'Chemistry Analysis', certifiedDate: '2025-11-15', expirationDate: '2026-11-15', status: 'Current', assessedBy: 'Sarah Chen' },
      { name: 'Hematology Analysis', certifiedDate: '2025-11-15', expirationDate: '2026-11-15', status: 'Current', assessedBy: 'Sarah Chen' },
      { name: 'QC Daily Operations', certifiedDate: '2026-01-10', expirationDate: '2027-01-10', status: 'Current', assessedBy: 'Sarah Chen' },
      { name: 'Laboratory Safety', certifiedDate: '2026-02-01', expirationDate: '2027-02-01', status: 'Current', assessedBy: 'External — OSHA' },
    ],
  },
  {
    name: 'Ana Patel',
    role: 'Medical Technologist',
    employeeId: 'EMP-003',
    signatureEnabled: true,
    hireDate: '2022-09-12',
    competencies: [
      { name: 'Phlebotomy', certifiedDate: '2025-12-05', expirationDate: '2026-06-05', status: 'Current', assessedBy: 'Sarah Chen' },
      { name: 'Chemistry Analysis', certifiedDate: '2026-01-20', expirationDate: '2026-07-20', status: 'Current', assessedBy: 'Sarah Chen' },
      { name: 'Specimen Processing', certifiedDate: '2025-12-05', expirationDate: '2026-06-05', status: 'Current', assessedBy: 'Mike Torres' },
      { name: 'QC Daily Operations', certifiedDate: '2026-01-20', expirationDate: '2026-07-20', status: 'Current', assessedBy: 'Sarah Chen' },
      { name: 'Laboratory Safety', certifiedDate: '2026-02-01', expirationDate: '2027-02-01', status: 'Current', assessedBy: 'External — OSHA' },
    ],
  },
  {
    name: 'James Kim',
    role: 'Lab Technician',
    employeeId: 'EMP-004',
    signatureEnabled: true,
    hireDate: '2024-01-08',
    competencies: [
      { name: 'Phlebotomy', certifiedDate: '2026-02-10', expirationDate: '2026-08-10', status: 'Current', assessedBy: 'Sarah Chen' },
      { name: 'Specimen Processing', certifiedDate: '2026-02-10', expirationDate: '2026-08-10', status: 'Current', assessedBy: 'Mike Torres' },
      { name: 'Hematology Analysis', certifiedDate: '2026-03-01', expirationDate: '2026-09-01', status: 'Current', assessedBy: 'Sarah Chen' },
      { name: 'QC Daily Operations', certifiedDate: '2026-03-01', expirationDate: '2026-09-01', status: 'Current', assessedBy: 'Sarah Chen' },
      { name: 'Laboratory Safety', certifiedDate: '2026-02-01', expirationDate: '2027-02-01', status: 'Current', assessedBy: 'External — OSHA' },
    ],
  },
];

export const trainingSummary = {
  totalStaff: staff.length,
  allCurrent: true,
  nextExpiration: '2026-06-05',
  nextExpirationName: 'Ana Patel — Phlebotomy',
  electronicSignatures: staff.every(s => s.signatureEnabled),
};
