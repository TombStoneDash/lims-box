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
    Object.freeze({ code: 'EPA-200.8', name: 'Trace metals by ICP-MS, EPA 200.8 / 6020 (synthetic)', matrix: 'drinking water' }),
    Object.freeze({ code: 'EPA-300.0', name: 'Inorganic anions by ion chromatography, EPA 300.0 (synthetic)', matrix: 'drinking water' }),
    Object.freeze({ code: 'SM-9223B', name: 'Total coliform and E. coli, SM 9223B / 9222 (synthetic)', matrix: 'drinking water' }),
    Object.freeze({ code: 'SM-5210B', name: 'BOD5, SM 5210B (synthetic)', matrix: 'wastewater' }),
    Object.freeze({ code: 'SM-2540D', name: 'Total suspended solids, SM 2540D (synthetic)', matrix: 'wastewater' }),
    Object.freeze({ code: 'SM-5220D', name: 'COD, SM 5220D (synthetic)', matrix: 'wastewater' }),
    Object.freeze({ code: 'EPA-524.2', name: 'Volatile organics by GC/MS, EPA 524.2 / 8260 (synthetic)', matrix: 'drinking water' }),
  ]),
  instruments: Object.freeze([
    Object.freeze({ id: 'inst-synthetic-02', name: 'Synthetic ICP-MS analyzer', methods: Object.freeze(['EPA-200.8']) }),
    Object.freeze({ id: 'inst-synthetic-03', name: 'Synthetic ion chromatograph', methods: Object.freeze(['EPA-300.0']) }),
    Object.freeze({ id: 'inst-synthetic-04', name: 'Synthetic GC/MS', methods: Object.freeze(['EPA-524.2']) }),
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
