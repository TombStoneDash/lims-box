import type { LabProfile } from './types';

/**
 * Diagnostics profile: a thin synthetic reference/diagnostics workflow under a
 * fictional lab name. Its own test menu (clinical panels distinct from the
 * clinical profile) proves the dynamic /demo/labs/[labType] route serves N=3.
 */
export const DIAGNOSTICS_LAB_PROFILE: LabProfile = Object.freeze({
  slug: 'diagnostics',
  displayName: 'Harborview Diagnostics Laboratory',
  sector: 'diagnostics',
  testMenu: Object.freeze([
    Object.freeze({ code: 'DX-CMP', name: 'Comprehensive metabolic panel (synthetic)', matrix: 'serum' }),
    Object.freeze({ code: 'DX-LIPID', name: 'Lipid panel (synthetic)', matrix: 'serum' }),
    Object.freeze({ code: 'DX-CBC', name: 'Complete blood count with differential (synthetic)', matrix: 'whole blood' }),
    Object.freeze({ code: 'DX-A1C', name: 'Hemoglobin A1c (synthetic)', matrix: 'whole blood' }),
    Object.freeze({ code: 'DX-TSH', name: 'Thyroid stimulating hormone (synthetic)', matrix: 'serum' }),
    Object.freeze({ code: 'DX-UA', name: 'Urinalysis with microscopy (synthetic)', matrix: 'urine' }),
  ]),
  instruments: Object.freeze([
    Object.freeze({ id: 'inst-synthetic-dx-chem', name: 'Synthetic chemistry analyzer', methods: Object.freeze(['DX-CMP', 'DX-LIPID', 'DX-A1C', 'DX-TSH']) }),
    Object.freeze({ id: 'inst-synthetic-dx-heme', name: 'Synthetic hematology analyzer', methods: Object.freeze(['DX-CBC']) }),
    Object.freeze({ id: 'inst-synthetic-dx-ua', name: 'Synthetic urinalysis analyzer', methods: Object.freeze(['DX-UA']) }),
  ]),
  volumeRange: Object.freeze({ min: 60_000, max: 90_000, unit: 'samples/yr', label: 'planning range' }),
  roles: Object.freeze(['worker', 'employer', 'reviewer', 'admin']),
  qcRules: Object.freeze(['Two-level QC per shift', 'Delta check on repeat patients', 'Critical value call-back before release']),
  reportTemplates: Object.freeze(['Panel result report (synthetic)', 'Audit export CSV']),
  complianceFrame: Object.freeze(['CLIA', 'CAP']),
  brand: Object.freeze({
    labName: 'SYNTHETIC-Diagnostics-Laboratory',
    legalName: 'SYNTHETIC-Diagnostics-Laboratory Example',
    primaryColor: '#1F3A5F',
    accentColor: '#4FB3BF',
    logoPath: 'SYNTHETIC-assets/SYNTHETIC-dx-logo.svg',
    reportFooter: 'SYNTHETIC-Report for demonstration only',
    supportEmail: 'SYNTHETIC-support@SYNTHETIC-example.invalid',
  }),
} as const) as LabProfile;
