// LIMS BOX clinical and diagnostics demo seed data. ALL DATA IS SYNTHETIC.
//
// Two made-up labs for the multi-lab demo: ABC Clinical (chemistry and
// hematology) and ABC Diagnostics (molecular and microbiology). No patient
// names, birth dates, addresses or record numbers exist here: each sample
// carries only a synthetic sample ID and a synthetic subject code.
//
// Limits are EXAMPLES. Stability times, reference intervals and QC targets are
// illustrative values for a demo, marked basis 'example' and UNVERIFIED. A
// real lab uses its own validated limits and its manufacturers' instructions.

export const SYNTHETIC_MARKER = '(SYNTHETIC)';

export const LABS = Object.freeze([
  { id: 'ABC-CLN', name: `ABC Clinical ${SYNTHETIC_MARKER}` },
  { id: 'ABC-DX', name: `ABC Diagnostics ${SYNTHETIC_MARKER}` },
]);

export const SAMPLE_TYPES = Object.freeze([
  { code: 'SER', lab: 'ABC-CLN', title: 'Serum', prefix: 'SER', container: 'Gold-top SST, clotted and spun' },
  { code: 'WB', lab: 'ABC-CLN', title: 'Whole Blood (EDTA)', prefix: 'WB', container: 'Lavender-top EDTA tube' },
  { code: 'UR', lab: 'ABC-CLN', title: 'Urine', prefix: 'UR', container: 'Sterile screw-cap cup' },
  { code: 'NPS', lab: 'ABC-DX', title: 'Nasopharyngeal Swab', prefix: 'NPS', container: 'Flocked swab in 3 mL viral transport medium' },
  { code: 'TS', lab: 'ABC-DX', title: 'Throat Swab', prefix: 'TS', container: 'Flocked swab in transport medium' },
  { code: 'UC', lab: 'ABC-DX', title: 'Urine (culture)', prefix: 'UC', container: 'Boric acid preservative tube' },
]);

const example = (hours, note) => Object.freeze({ hours, basis: 'example', status: 'UNVERIFIED', note });

// Quantitative analyses carry an example reference interval; qualitative ones
// report Detected / Not detected, or a colony count for culture.
export const ANALYSES = Object.freeze([
  { keyword: 'GLU', lab: 'ABC-CLN', title: 'Glucose', category: 'Chemistry', unit: 'mg/dL', matrix: 'SER',
    stability: example(48, 'separated serum, refrigerated'), reference: { low: 70, high: 99 } },
  { keyword: 'K', lab: 'ABC-CLN', title: 'Potassium', category: 'Chemistry', unit: 'mmol/L', matrix: 'SER',
    stability: example(4, 'from collection to separation; delay can falsely raise K'), reference: { low: 3.5, high: 5.1 } },
  { keyword: 'CREA', lab: 'ABC-CLN', title: 'Creatinine', category: 'Chemistry', unit: 'mg/dL', matrix: 'SER',
    stability: example(72, 'separated serum, refrigerated'), reference: { low: 0.6, high: 1.3 } },
  { keyword: 'A1C', lab: 'ABC-CLN', title: 'Hemoglobin A1c', category: 'Chemistry', unit: '%', matrix: 'WB',
    stability: example(168, 'EDTA whole blood, refrigerated'), reference: { low: 4.0, high: 5.6 } },
  { keyword: 'WBC', lab: 'ABC-CLN', title: 'White Blood Cell Count', category: 'Hematology', unit: '10^3/uL', matrix: 'WB',
    stability: example(24, 'EDTA whole blood, room temperature'), reference: { low: 4.5, high: 11.0 } },
  { keyword: 'UPRO', lab: 'ABC-CLN', title: 'Urine Protein', category: 'Urinalysis', unit: 'mg/dL', matrix: 'UR',
    stability: example(2, 'unpreserved urine at room temperature'), reference: { low: 0, high: 14 } },
  { keyword: 'SARS2', lab: 'ABC-DX', title: 'SARS-CoV-2 RNA (RT-PCR)', category: 'Molecular', unit: 'qualitative', matrix: 'NPS',
    stability: example(72, 'swab in transport medium, refrigerated'), qualitative: true },
  { keyword: 'GAS', lab: 'ABC-DX', title: 'Group A Streptococcus DNA (PCR)', category: 'Molecular', unit: 'qualitative', matrix: 'TS',
    stability: example(72, 'swab in transport medium, refrigerated'), qualitative: true },
  { keyword: 'UCULT', lab: 'ABC-DX', title: 'Urine Culture', category: 'Microbiology', unit: 'CFU/mL', matrix: 'UC',
    stability: example(24, 'from collection to plating, boric acid tube'), qualitative: false },
]);

export const CLIENTS = Object.freeze([
  { id: 'SYN-CLN-CLI-01', lab: 'ABC-CLN', name: `Example Family Practice ${SYNTHETIC_MARKER}`, contact: { first: 'Synthetic', last: 'Contact Echo' } },
  { id: 'SYN-CLN-CLI-02', lab: 'ABC-CLN', name: `Placeholder Occupational Health ${SYNTHETIC_MARKER}`, contact: { first: 'Synthetic', last: 'Contact Foxtrot' } },
  { id: 'SYN-DX-CLI-01', lab: 'ABC-DX', name: `Demo Urgent Care ${SYNTHETIC_MARKER}`, contact: { first: 'Synthetic', last: 'Contact Golf' } },
  { id: 'SYN-DX-CLI-02', lab: 'ABC-DX', name: `Fictional Pediatrics Group ${SYNTHETIC_MARKER}`, contact: { first: 'Synthetic', last: 'Contact Hotel' } },
]);

export const FLAGS = Object.freeze({
  HOLDING_TIME_BREACH: 'HOLDING_TIME_BREACH',
  QC_FAILURE: 'QC_FAILURE',
});

// ---------------------------------------------------------------------------
// Samples. Deterministic: fixed base time, fixed lags, no RNG. UTC.

const BASE_TIME = Date.parse('2026-09-21T13:00:00Z');
const HOUR = 3_600_000;
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');

// Hours from collection to testing for normal samples, all inside the example limits.
const LAG_HOURS = { GLU: 3, K: 1.5, CREA: 3, A1C: 6, WBC: 4, UPRO: 1, SARS2: 20, GAS: 18, UCULT: 6 };

// The seeded holding-time breaches, one per lab.
export const PLANNED_BREACHES = Object.freeze([
  { sampleId: 'SYN-CLN-SER-0004', keyword: 'K', lagHours: 7, story: 'tube sat unspun at the draw site' },
  { sampleId: 'SYN-DX-UC-0003', keyword: 'UCULT', lagHours: 30, story: 'courier held the tube overnight' },
]);

const PANELS = {
  SER: ['GLU', 'K', 'CREA'],
  WB: ['A1C', 'WBC'],
  UR: ['UPRO'],
  NPS: ['SARS2'],
  TS: ['GAS'],
  UC: ['UCULT'],
};

const PLAN = [
  { client: 'SYN-CLN-CLI-01', matrix: 'SER', count: 6 },
  { client: 'SYN-CLN-CLI-02', matrix: 'WB', count: 4 },
  { client: 'SYN-CLN-CLI-01', matrix: 'UR', count: 3 },
  { client: 'SYN-DX-CLI-01', matrix: 'NPS', count: 6 },
  { client: 'SYN-DX-CLI-02', matrix: 'TS', count: 4 },
  { client: 'SYN-DX-CLI-01', matrix: 'UC', count: 4 },
];

// Result values cycle through fixed in-range positions of each reference interval.
const POSITIONS = [0.35, 0.55, 0.2, 0.7, 0.45, 0.6];
const QUALITATIVE = { SARS2: ['Not detected', 'Detected', 'Not detected'], GAS: ['Not detected', 'Not detected', 'Detected'] };
const CULTURE = ['<10,000 CFU/mL (no growth)', '>100,000 CFU/mL E. coli', '10,000-50,000 CFU/mL mixed flora'];

function round(value, digits) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function resultFor(analysis, index) {
  if (analysis.keyword === 'UCULT') return CULTURE[index % CULTURE.length];
  if (analysis.qualitative) return QUALITATIVE[analysis.keyword][index % QUALITATIVE[analysis.keyword].length];
  const { low, high } = analysis.reference;
  const digits = high < 20 ? 1 : 0;
  return String(round(low + (high - low) * POSITIONS[index % POSITIONS.length], digits));
}

function buildSamples() {
  const byKeyword = new Map(ANALYSES.map((a) => [a.keyword, a]));
  const samples = [];
  PLAN.forEach((group, groupIndex) => {
    const lab = SAMPLE_TYPES.find((t) => t.code === group.matrix).lab;
    const labPrefix = lab === 'ABC-CLN' ? 'CLN' : 'DX';
    for (let i = 0; i < group.count; i += 1) {
      const id = `SYN-${labPrefix}-${group.matrix}-${String(i + 1).padStart(4, '0')}`;
      const collected = BASE_TIME + (i * 24 + groupIndex) * HOUR;
      const analyses = PANELS[group.matrix].map((keyword) => {
        const breach = PLANNED_BREACHES.find((b) => b.sampleId === id && b.keyword === keyword);
        const lag = breach ? breach.lagHours : LAG_HOURS[keyword];
        return {
          keyword,
          testedAt: iso(collected + lag * HOUR),
          result: resultFor(byKeyword.get(keyword), i),
          flags: breach ? [FLAGS.HOLDING_TIME_BREACH] : [],
        };
      });
      samples.push({
        id,
        lab,
        client: group.client,
        sampleType: group.matrix,
        subjectCode: `SYN-SUBJ-${labPrefix}-${String(samples.length + 1).padStart(3, '0')}`,
        collectedAt: iso(collected),
        receivedAt: iso(collected + 2 * HOUR),
        analyses,
      });
    }
  });
  return samples;
}

// ---------------------------------------------------------------------------
// QC. Quantitative controls are judged against an example mean and SD
// (reject beyond 3 SD, Westgard 1-3s). Qualitative runs carry a positive and a
// negative control that must read as expected.

export const PLANNED_QC_FAILURES = Object.freeze([
  { batchId: 'SYN-QC-CLN-01', keyword: 'GLU', control: 'Level 2', story: 'glucose Level 2 control read 3.6 SD high' },
  { batchId: 'SYN-QC-DX-01', keyword: 'SARS2', control: 'Negative control', story: 'negative control amplified: possible contamination' },
]);

export const QC_BATCHES = Object.freeze([
  { id: 'SYN-QC-CLN-01', lab: 'ABC-CLN', keyword: 'GLU', runAt: '2026-09-21T15:00:00Z', controls: [
    { control: 'Level 1', mean: 90, sd: 2.5, measured: 91.2, flags: [] },
    { control: 'Level 2', mean: 250, sd: 5, measured: 268, flags: [FLAGS.QC_FAILURE] },
  ] },
  { id: 'SYN-QC-CLN-02', lab: 'ABC-CLN', keyword: 'K', runAt: '2026-09-21T15:00:00Z', controls: [
    { control: 'Level 1', mean: 3.8, sd: 0.08, measured: 3.83, flags: [] },
    { control: 'Level 2', mean: 6.2, sd: 0.12, measured: 6.1, flags: [] },
  ] },
  { id: 'SYN-QC-CLN-03', lab: 'ABC-CLN', keyword: 'WBC', runAt: '2026-09-21T16:00:00Z', controls: [
    { control: 'Low', mean: 3.0, sd: 0.15, measured: 3.1, flags: [] },
    { control: 'High', mean: 18.0, sd: 0.6, measured: 17.6, flags: [] },
  ] },
  { id: 'SYN-QC-DX-01', lab: 'ABC-DX', keyword: 'SARS2', runAt: '2026-09-22T10:00:00Z', controls: [
    { control: 'Positive control', expected: 'Detected', observed: 'Detected', flags: [] },
    { control: 'Negative control', expected: 'Not detected', observed: 'Detected', flags: [FLAGS.QC_FAILURE] },
  ] },
  { id: 'SYN-QC-DX-02', lab: 'ABC-DX', keyword: 'GAS', runAt: '2026-09-22T11:00:00Z', controls: [
    { control: 'Positive control', expected: 'Detected', observed: 'Detected', flags: [] },
    { control: 'Negative control', expected: 'Not detected', observed: 'Not detected', flags: [] },
  ] },
]);

export const SAMPLES = Object.freeze(buildSamples());

export const SEED = Object.freeze({
  synthetic: true,
  labs: LABS,
  sampleTypes: SAMPLE_TYPES,
  analyses: ANALYSES,
  clients: CLIENTS,
  samples: SAMPLES,
  qcBatches: QC_BATCHES,
});
