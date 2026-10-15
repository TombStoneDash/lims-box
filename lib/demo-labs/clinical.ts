import type { LabProfile } from './types';

/**
 * Clinical profile: the synthetic workflow the former pilot exercised, under a
 * fictional name. Brand tokens are the pilot's DEFAULT_SYNTHETIC_BRAND values,
 * now owned here and re-exported by lib/ohworks-brand.ts.
 */
export const CLINICAL_LAB_PROFILE: LabProfile = Object.freeze({
  slug: 'clinical',
  displayName: 'Northline Clinical Laboratory',
  sector: 'clinical',
  testMenu: Object.freeze([
    Object.freeze({ code: 'IMM-01', name: 'Immunoassay panel (synthetic)', matrix: 'serum' }),
    Object.freeze({ code: 'CUL-01', name: 'Culture and sensitivity (synthetic)', matrix: 'swab' }),
    Object.freeze({ code: 'XM-01', name: 'Crossmatch (synthetic)', matrix: 'whole blood' }),
  ]),
  instruments: Object.freeze([
    Object.freeze({ id: 'inst-synthetic-01', name: 'Synthetic immunoassay analyzer', methods: Object.freeze(['IMM-01']) }),
  ]),
  volumeRange: Object.freeze({ min: 30_000, max: 40_000, unit: 'samples/yr', label: 'planning range' }),
  roles: Object.freeze(['worker', 'employer', 'reviewer', 'admin']),
  qcRules: Object.freeze(['Two-level QC per run', 'Bracket lot change', 'Technical review before release']),
  reportTemplates: Object.freeze(['Result report (synthetic)', 'Audit export CSV']),
  complianceFrame: Object.freeze(['CLIA', 'COLA']),
  brand: Object.freeze({
    labName: 'SYNTHETIC-Laboratory',
    legalName: 'SYNTHETIC-Laboratory Example',
    primaryColor: '#123456',
    accentColor: '#55AACC',
    logoPath: 'SYNTHETIC-assets/SYNTHETIC-logo.svg',
    reportFooter: 'SYNTHETIC-Report for demonstration only',
    supportEmail: 'SYNTHETIC-support@SYNTHETIC-example.invalid',
  }),
} as const) as LabProfile;
