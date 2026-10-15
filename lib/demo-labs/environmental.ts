import type { LabProfile } from './types';

/**
 * Environmental profile: a synthetic drinking-water/wastewater/soil workflow
 * under a fictional lab name. Mirrors the structure CLINICAL_LAB_PROFILE froze.
 */
export const ENVIRONMENTAL_LAB_PROFILE: LabProfile = Object.freeze({
  slug: 'environmental',
  displayName: 'Riverbend Environmental Laboratory',
  sector: 'environmental',
  testMenu: Object.freeze([
    Object.freeze({ code: 'MET-ICPMS-01', name: 'Drinking-water metals by ICP-MS (synthetic)', matrix: 'drinking water' }),
    Object.freeze({ code: 'MICRO-COLI-01', name: 'Total coliform and E. coli (synthetic)', matrix: 'drinking water' }),
    Object.freeze({ code: 'NUT-NN-01', name: 'Nitrate/nitrite (synthetic)', matrix: 'wastewater' }),
    Object.freeze({ code: 'FLD-PHCOND-01', name: 'pH/conductivity (synthetic)', matrix: 'soil' }),
  ]),
  instruments: Object.freeze([
    Object.freeze({ id: 'inst-synthetic-02', name: 'Synthetic ICP-MS analyzer', methods: Object.freeze(['MET-ICPMS-01']) }),
    Object.freeze({ id: 'inst-synthetic-03', name: 'Synthetic field meter', methods: Object.freeze(['FLD-PHCOND-01']) }),
  ]),
  volumeRange: Object.freeze({ min: 15_000, max: 25_000, unit: 'samples/yr', label: 'planning range' }),
  roles: Object.freeze(['worker', 'employer', 'reviewer', 'admin']),
  qcRules: Object.freeze(['Method blank per batch', 'Lab control sample per batch', 'Matrix spike/duplicate per batch', 'Holding-time check before analysis']),
  reportTemplates: Object.freeze(['Certificate of analysis (synthetic)', 'Audit export CSV']),
  complianceFrame: Object.freeze(['NELAP/TNI', 'EPA 40 CFR 136']),
  brand: Object.freeze({
    labName: 'SYNTHETIC-Riverbend',
    legalName: 'SYNTHETIC-Riverbend Environmental Example',
    primaryColor: '#1C4532',
    accentColor: '#38A169',
    logoPath: 'SYNTHETIC-assets/SYNTHETIC-riverbend-logo.svg',
    reportFooter: 'SYNTHETIC-Report for demonstration only',
    supportEmail: 'SYNTHETIC-support@SYNTHETIC-riverbend.invalid',
  }),
} as const) as LabProfile;
