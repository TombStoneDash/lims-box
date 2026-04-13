import { NextResponse } from 'next/server';

/**
 * GET /api/demo — Returns sample LIMS data for integration demos.
 * No authentication required. All data is synthetic.
 *
 * Query params:
 *   ?type=samples|results|qc|coc|methods  (default: samples)
 *   ?limit=N  (default: 10, max: 50)
 */

const DEMO_SAMPLES = [
  { id: 'WS-2026-0384', type: 'Drinking Water', client: 'City of Mesa Water Dept', collected: '2026-04-10T10:30:00Z', received: '2026-04-10T14:15:00Z', status: 'in_progress', priority: 'normal', holding_time_expires: '2026-04-24T10:30:00Z', analyst: 'J. Martinez', methods: ['EPA 200.8', 'EPA 524.2', 'SM 4500-H+'] },
  { id: 'WS-2026-0385', type: 'Groundwater', client: 'Apex Environmental Consulting', collected: '2026-04-10T08:00:00Z', received: '2026-04-10T12:30:00Z', status: 'pending_review', priority: 'rush', holding_time_expires: '2026-04-12T08:00:00Z', analyst: 'K. Chen', methods: ['EPA 8260D', 'EPA 8270E'] },
  { id: 'WS-2026-0386', type: 'Wastewater', client: 'San Marcos WWTP', collected: '2026-04-09T06:00:00Z', received: '2026-04-09T10:00:00Z', status: 'completed', priority: 'normal', holding_time_expires: '2026-04-23T06:00:00Z', analyst: 'R. Nguyen', methods: ['EPA 200.8', 'EPA 300.0', 'EPA 365.1'] },
  { id: 'SW-2026-0112', type: 'Soil', client: 'Pacific Remediation Group', collected: '2026-04-08T09:00:00Z', received: '2026-04-08T16:45:00Z', status: 'in_progress', priority: 'normal', holding_time_expires: '2026-04-22T09:00:00Z', analyst: 'J. Martinez', methods: ['EPA 6010D', 'EPA 8015D'] },
  { id: 'WS-2026-0387', type: 'Drinking Water', client: 'Fallbrook PUD', collected: '2026-04-11T07:30:00Z', received: '2026-04-11T11:00:00Z', status: 'received', priority: 'normal', holding_time_expires: '2026-04-25T07:30:00Z', analyst: null, methods: ['EPA 200.8', 'SM 9223B'] },
  { id: 'WS-2026-0388', type: 'Surface Water', client: 'County of San Diego DEH', collected: '2026-04-11T06:00:00Z', received: '2026-04-11T09:30:00Z', status: 'received', priority: 'rush', holding_time_expires: '2026-04-11T12:00:00Z', analyst: null, methods: ['SM 9221B', 'SM 9222B'] },
  { id: 'WS-2026-0389', type: 'Drinking Water', client: 'Ramona MWD', collected: '2026-04-11T10:00:00Z', received: '2026-04-11T14:00:00Z', status: 'received', priority: 'normal', holding_time_expires: '2026-04-25T10:00:00Z', analyst: null, methods: ['EPA 200.8', 'EPA 524.2'] },
  { id: 'WW-2026-0045', type: 'Wastewater', client: 'Vista WWTP', collected: '2026-04-10T05:30:00Z', received: '2026-04-10T09:00:00Z', status: 'completed', priority: 'normal', holding_time_expires: '2026-04-24T05:30:00Z', analyst: 'K. Chen', methods: ['EPA 200.8', 'EPA 300.0'] },
  { id: 'SW-2026-0113', type: 'Soil', client: 'Apex Environmental Consulting', collected: '2026-04-09T11:00:00Z', received: '2026-04-09T15:30:00Z', status: 'in_progress', priority: 'normal', holding_time_expires: '2026-04-23T11:00:00Z', analyst: 'R. Nguyen', methods: ['EPA 8260D', 'EPA 6010D'] },
  { id: 'WS-2026-0390', type: 'Stormwater', client: 'Caltrans District 11', collected: '2026-04-11T13:00:00Z', received: '2026-04-11T16:00:00Z', status: 'received', priority: 'normal', holding_time_expires: '2026-04-25T13:00:00Z', analyst: null, methods: ['EPA 200.8', 'EPA 300.0', 'EPA 8015D'] },
];

const DEMO_RESULTS = [
  { sample_id: 'WS-2026-0384', analyte: 'Lead', method: 'EPA 200.8', result: 0.0032, units: 'mg/L', mdl: 0.001, rl: 0.005, mcl: 0.015, status: 'below_mcl', analyzed_at: '2026-04-11T10:00:00Z' },
  { sample_id: 'WS-2026-0384', analyte: 'Copper', method: 'EPA 200.8', result: 0.42, units: 'mg/L', mdl: 0.005, rl: 0.01, mcl: 1.3, status: 'below_mcl', analyzed_at: '2026-04-11T10:00:00Z' },
  { sample_id: 'WS-2026-0384', analyte: 'Arsenic', method: 'EPA 200.8', result: 0.008, units: 'mg/L', mdl: 0.001, rl: 0.005, mcl: 0.01, status: 'below_mcl', analyzed_at: '2026-04-11T10:00:00Z' },
  { sample_id: 'WS-2026-0384', analyte: 'Benzene', method: 'EPA 524.2', result: null, units: 'ug/L', mdl: 0.2, rl: 0.5, mcl: 5.0, status: 'non_detect', analyzed_at: '2026-04-11T14:30:00Z' },
  { sample_id: 'WS-2026-0384', analyte: 'pH', method: 'SM 4500-H+', result: 7.2, units: 'SU', mdl: null, rl: null, mcl: null, status: 'complete', analyzed_at: '2026-04-10T15:00:00Z' },
  { sample_id: 'WS-2026-0385', analyte: 'Trichloroethylene', method: 'EPA 8260D', result: 12.4, units: 'ug/L', mdl: 0.5, rl: 1.0, mcl: 5.0, status: 'exceeds_mcl', analyzed_at: '2026-04-11T09:00:00Z' },
  { sample_id: 'WS-2026-0385', analyte: 'Tetrachloroethylene', method: 'EPA 8260D', result: 3.1, units: 'ug/L', mdl: 0.5, rl: 1.0, mcl: 5.0, status: 'below_mcl', analyzed_at: '2026-04-11T09:00:00Z' },
  { sample_id: 'WS-2026-0386', analyte: 'Nitrate', method: 'EPA 300.0', result: 8.7, units: 'mg/L', mdl: 0.05, rl: 0.1, mcl: 10.0, status: 'below_mcl', analyzed_at: '2026-04-10T11:00:00Z' },
  { sample_id: 'WS-2026-0386', analyte: 'Phosphorus', method: 'EPA 365.1', result: 2.3, units: 'mg/L', mdl: 0.01, rl: 0.05, mcl: null, status: 'complete', analyzed_at: '2026-04-10T11:30:00Z' },
  { sample_id: 'WS-2026-0386', analyte: 'Lead', method: 'EPA 200.8', result: 0.0018, units: 'mg/L', mdl: 0.001, rl: 0.005, mcl: null, status: 'below_rl', analyzed_at: '2026-04-10T12:00:00Z' },
];

const DEMO_QC = [
  { batch_id: 'QC-2026-0411-01', method: 'EPA 200.8', type: 'Method Blank', analyte: 'Lead', result: 0.0002, acceptance: '< 0.001 mg/L', status: 'pass', analyst: 'J. Martinez', run_date: '2026-04-11' },
  { batch_id: 'QC-2026-0411-01', method: 'EPA 200.8', type: 'LCS', analyte: 'Lead', result: 96.2, acceptance: '85-115% recovery', status: 'pass', analyst: 'J. Martinez', run_date: '2026-04-11' },
  { batch_id: 'QC-2026-0411-01', method: 'EPA 200.8', type: 'LCS Duplicate', analyte: 'Lead', result: 94.8, acceptance: '85-115% recovery, RPD < 20%', status: 'pass', analyst: 'J. Martinez', run_date: '2026-04-11' },
  { batch_id: 'QC-2026-0411-01', method: 'EPA 200.8', type: 'Matrix Spike', analyte: 'Lead', result: 88.5, acceptance: '75-125% recovery', status: 'pass', analyst: 'J. Martinez', run_date: '2026-04-11' },
  { batch_id: 'QC-2026-0411-02', method: 'EPA 524.2', type: 'Method Blank', analyte: 'Benzene', result: null, acceptance: '< 0.2 ug/L', status: 'pass', analyst: 'K. Chen', run_date: '2026-04-11' },
  { batch_id: 'QC-2026-0411-02', method: 'EPA 524.2', type: 'LCS', analyte: 'Benzene', result: 102.1, acceptance: '70-130% recovery', status: 'pass', analyst: 'K. Chen', run_date: '2026-04-11' },
];

const DEMO_COC = [
  { coc_id: 'COC-2026-0384', sample_ids: ['WS-2026-0384'], client: 'City of Mesa Water Dept', collected_by: 'T. Ramirez', collection_date: '2026-04-10T10:30:00Z', received_by: 'S. Lee', received_date: '2026-04-10T14:15:00Z', temp_on_receipt: 4.2, temp_acceptable: true, custody_seals_intact: true, preservation_correct: true, comments: null },
  { coc_id: 'COC-2026-0385', sample_ids: ['WS-2026-0385'], client: 'Apex Environmental Consulting', collected_by: 'M. Torres', collection_date: '2026-04-10T08:00:00Z', received_by: 'S. Lee', received_date: '2026-04-10T12:30:00Z', temp_on_receipt: 3.8, temp_acceptable: true, custody_seals_intact: true, preservation_correct: true, comments: 'Rush analysis requested — 48hr TAT' },
  { coc_id: 'COC-2026-0386', sample_ids: ['WS-2026-0386'], client: 'San Marcos WWTP', collected_by: 'D. Patel', collection_date: '2026-04-09T06:00:00Z', received_by: 'J. Kim', received_date: '2026-04-09T10:00:00Z', temp_on_receipt: 5.1, temp_acceptable: true, custody_seals_intact: true, preservation_correct: true, comments: null },
];

const DEMO_METHODS = [
  { id: 'EPA-200.8', name: 'EPA 200.8', title: 'Metals by ICP-MS', analytes: ['Lead', 'Copper', 'Arsenic', 'Chromium', 'Cadmium', 'Mercury', 'Selenium', 'Barium'], matrix: ['Drinking Water', 'Groundwater', 'Wastewater', 'Surface Water'], holding_time_days: 180, preservation: 'HNO3 to pH < 2', qc_requirements: 'MB, LCS, LCSD, MS, MSD per 20 samples' },
  { id: 'EPA-524.2', name: 'EPA 524.2', title: 'VOCs by GC-MS (Purge and Trap)', analytes: ['Benzene', 'Toluene', 'Ethylbenzene', 'Xylenes', 'TCE', 'PCE', 'Chloroform', 'Carbon Tetrachloride'], matrix: ['Drinking Water'], holding_time_days: 14, preservation: 'HCl to pH < 2, Na2S2O3 if chlorinated', qc_requirements: 'MB, LCS, LCSD, MS, MSD per 20 samples' },
  { id: 'EPA-300.0', name: 'EPA 300.0', title: 'Anions by Ion Chromatography', analytes: ['Nitrate', 'Nitrite', 'Fluoride', 'Chloride', 'Sulfate', 'Phosphate'], matrix: ['Drinking Water', 'Groundwater', 'Wastewater'], holding_time_days: 28, preservation: 'Cool to 4°C', qc_requirements: 'MB, LCS, LCSD per 20 samples' },
  { id: 'EPA-8260D', name: 'EPA 8260D', title: 'VOCs by GC-MS', analytes: ['TCE', 'PCE', 'Benzene', 'Vinyl Chloride', 'MTBE', '1,4-Dioxane'], matrix: ['Groundwater', 'Soil', 'Wastewater'], holding_time_days: 14, preservation: 'HCl to pH < 2, cool to 4°C', qc_requirements: 'MB, LCS, LCSD, MS, MSD per 20 samples' },
  { id: 'SM-9223B', name: 'SM 9223B', title: 'Total Coliforms / E. coli by Colilert', analytes: ['Total Coliform', 'E. coli'], matrix: ['Drinking Water'], holding_time_days: 1, preservation: 'Na2S2O3, cool to 4°C', qc_requirements: 'Sterility blank, positive/negative control per batch' },
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'samples';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);

  let data: unknown[];
  let description: string;

  switch (type) {
    case 'results':
      data = DEMO_RESULTS.slice(0, limit);
      description = 'Analytical results with regulatory limits (MCLs), detection limits, and status flags.';
      break;
    case 'qc':
      data = DEMO_QC.slice(0, limit);
      description = 'Quality control records — method blanks, LCS, LCS duplicates, matrix spikes.';
      break;
    case 'coc':
      data = DEMO_COC.slice(0, limit);
      description = 'Chain of custody records with receipt conditions and custody transfer documentation.';
      break;
    case 'methods':
      data = DEMO_METHODS.slice(0, limit);
      description = 'Analytical method configurations with analyte lists, holding times, and QC requirements.';
      break;
    case 'samples':
    default:
      data = DEMO_SAMPLES.slice(0, limit);
      description = 'Sample records with collection/receipt dates, methods, holding times, and status.';
      break;
  }

  return NextResponse.json({
    demo: true,
    description,
    type,
    count: data.length,
    data,
    _links: {
      samples: '/api/demo?type=samples',
      results: '/api/demo?type=results',
      qc: '/api/demo?type=qc',
      coc: '/api/demo?type=coc',
      methods: '/api/demo?type=methods',
    },
    _note: 'This is synthetic demo data. No real laboratory results are represented.',
  });
}
