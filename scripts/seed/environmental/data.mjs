// LIMS BOX environmental-lab demo seed data. ALL DATA IS SYNTHETIC.
//
// Nothing here describes a real client, site, sample, or result. Client and
// contact names are invented and carry a "(SYNTHETIC)" marker.
//
// Status words used below:
//   CITED       value taken from the named source table (verify against the
//               current eCFR / method text before relying on it).
//   UNVERIFIED  value believed correct but not checked against the source
//               during this build. Treat as a placeholder.
//   example     illustrative only (regulatory and QC limits). Not a
//               compliance limit for any real permit or system.

export const SYNTHETIC_MARKER = '(SYNTHETIC)';

// 40 CFR 136.3 Table II expresses metals holding time as "6 months".
// This seed treats that as 180 days.
const SIX_MONTHS_HOURS = 180 * 24;

export const SOURCES = Object.freeze({
  CFR136_T2: '40 CFR 136.3 Table II (Required Containers, Preservation Techniques, and Holding Times)',
  M524_2: 'EPA Method 524.2 Rev 4.1, sample preservation and storage section',
  SW846_CH3: 'SW-846 Chapter Three (Inorganic Analytes), holding time table',
  SW846_CH4: 'SW-846 Chapter Four (Organic Analytes), holding time table for Method 5035 soil VOCs',
  CFR141_TC: '40 CFR 141 Subpart Y (Revised Total Coliform Rule) 30 hour holding time for drinking water coliform samples',
});

export const SAMPLE_TYPES = Object.freeze([
  { code: 'DW', title: 'Drinking Water', prefix: 'DW', description: 'Finished drinking water from a distribution system tap.' },
  { code: 'WW', title: 'Wastewater', prefix: 'WW', description: 'Treatment plant influent or effluent composite or grab.' },
  { code: 'SW', title: 'Surface Water', prefix: 'SW', description: 'Stream, river, or lake grab sample.' },
  { code: 'SO', title: 'Soil', prefix: 'SO', description: 'Surface soil grab, dry weight basis.' },
]);

// Bottle groups: container plus preservation. Referenced by analyses.
export const CONTAINERS = Object.freeze({
  METALS: { title: '250 mL HDPE', preservation: 'HNO3 to pH < 2' },
  ANIONS: { title: '250 mL HDPE', preservation: 'Cool to <= 6 C, unpreserved' },
  BOD_TSS: { title: '1 L HDPE', preservation: 'Cool to <= 6 C, unpreserved' },
  COD: { title: '250 mL HDPE', preservation: 'H2SO4 to pH < 2, cool to <= 6 C' },
  VOA_DW: { title: '2 x 40 mL glass VOA vial, PTFE septum, no headspace', preservation: 'HCl to pH < 2, ascorbic acid if chlorinated, cool to <= 6 C' },
  VOA_WW: { title: '2 x 40 mL glass VOA vial, PTFE septum, no headspace', preservation: 'HCl to pH < 2, cool to <= 6 C' },
  MICRO: { title: '120 mL sterile PS bottle with sodium thiosulfate', preservation: 'Cool to < 10 C, dechlorinated' },
  SOIL_JAR: { title: '4 oz glass jar, PTFE-lined lid', preservation: 'Cool to <= 6 C' },
  SOIL_VOA: { title: '40 mL VOA vial with methanol (Method 5035)', preservation: 'Methanol, cool to <= 6 C' },
});

// Methods and their QC acceptance limits. All QC limits are EXAMPLE values
// unless a note says otherwise; a real lab uses its own SOP limits.
export const METHODS = Object.freeze({
  'EPA 200.8': {
    title: 'EPA 200.8 Metals by ICP-MS (water)',
    qc: { blank: 'lt_rl', lcs: [85, 115], ms: [70, 130], rpd: 20 },
    qcBasis: 'example (LCS 85-115 believed to match Method 200.8 LFB criteria, UNVERIFIED)',
  },
  'SW-846 6020': {
    title: 'SW-846 6020 Metals by ICP-MS (soil)',
    qc: { blank: 'lt_rl', lcs: [80, 120], ms: [75, 125], rpd: 20 },
    qcBasis: 'example',
  },
  'EPA 300.0': {
    title: 'EPA 300.0 Inorganic Anions by Ion Chromatography',
    qc: { blank: 'lt_rl', lcs: [90, 110], ms: [80, 120], rpd: 20 },
    qcBasis: 'example',
  },
  'SM 5210B': {
    title: 'SM 5210B Biochemical Oxygen Demand, 5-day',
    // Glucose-glutamic acid check standard, 198 +/- 30.5 mg/L, expressed as % of 198.
    qc: { blank: 'lt_rl', lcs: [84.6, 115.4], ms: null, rpd: null },
    qcBasis: 'example (GGA 198 +/- 30.5 mg/L range, UNVERIFIED against current SM edition)',
  },
  'SM 2540D': {
    title: 'SM 2540D Total Suspended Solids dried at 103-105 C',
    qc: { blank: 'lt_rl', lcs: [90, 110], ms: null, rpd: null },
    qcBasis: 'example',
  },
  'SM 5220D': {
    title: 'SM 5220D Chemical Oxygen Demand, closed reflux colorimetric',
    qc: { blank: 'lt_rl', lcs: [90, 110], ms: [80, 120], rpd: 20 },
    qcBasis: 'example',
  },
  'EPA 524.2': {
    title: 'EPA 524.2 Purgeable Organics by GC/MS (drinking water)',
    qc: { blank: 'lt_rl', lcs: [70, 130], ms: [70, 130], rpd: 20 },
    qcBasis: 'example',
  },
  'SW-846 8260': {
    title: 'SW-846 8260 Volatile Organics by GC/MS',
    qc: { blank: 'lt_rl', lcs: [70, 130], ms: [70, 130], rpd: 30 },
    qcBasis: 'example',
  },
  'SM 9223B': {
    title: 'SM 9223B Colilert enzyme substrate, total coliform and E. coli',
    // Qualitative: blank must be absent, positive control must be present.
    qc: { blank: 'absent', lcs: 'present', ms: null, rpd: null },
    qcBasis: 'example (sterility blank and positive control organism)',
  },
});

// Holding time statuses: CITED or UNVERIFIED. See header.
function ht(hours, source, status, note) {
  return Object.freeze({ hours, source, status, ...(note ? { note } : {}) });
}

export const ANALYSES = Object.freeze([
  // Metals, drinking/surface water
  { keyword: 'AS', title: 'Arsenic, total', method: 'EPA 200.8', category: 'Metals', unit: 'mg/L', rl: 0.001, matrices: ['DW', 'SW'], container: 'METALS',
    holdingTime: ht(SIX_MONTHS_HOURS, SOURCES.CFR136_T2, 'CITED', '6 months, treated as 180 days'),
    regLimit: { DW: { value: 0.010, label: 'MCL', basis: 'example', hint: '40 CFR 141.62' } } },
  { keyword: 'PB', title: 'Lead, total', method: 'EPA 200.8', category: 'Metals', unit: 'mg/L', rl: 0.001, matrices: ['DW'], container: 'METALS',
    holdingTime: ht(SIX_MONTHS_HOURS, SOURCES.CFR136_T2, 'CITED', '6 months, treated as 180 days'),
    regLimit: { DW: { value: 0.015, label: 'Action level', basis: 'example', hint: '40 CFR 141.80' } } },
  { keyword: 'CU', title: 'Copper, total', method: 'EPA 200.8', category: 'Metals', unit: 'mg/L', rl: 0.002, matrices: ['DW'], container: 'METALS',
    holdingTime: ht(SIX_MONTHS_HOURS, SOURCES.CFR136_T2, 'CITED', '6 months, treated as 180 days'),
    regLimit: { DW: { value: 1.3, label: 'Action level', basis: 'example', hint: '40 CFR 141.80' } } },
  // Metals, soil
  { keyword: 'AS-S', title: 'Arsenic, total (soil)', method: 'SW-846 6020', category: 'Metals', unit: 'mg/kg', rl: 0.5, matrices: ['SO'], container: 'SOIL_JAR',
    holdingTime: ht(SIX_MONTHS_HOURS, SOURCES.SW846_CH3, 'UNVERIFIED', '6 months, treated as 180 days'),
    regLimit: { SO: { value: 12, label: 'Screening level', basis: 'example', hint: 'not sourced, illustrative only' } } },
  { keyword: 'PB-S', title: 'Lead, total (soil)', method: 'SW-846 6020', category: 'Metals', unit: 'mg/kg', rl: 0.5, matrices: ['SO'], container: 'SOIL_JAR',
    holdingTime: ht(SIX_MONTHS_HOURS, SOURCES.SW846_CH3, 'UNVERIFIED', '6 months, treated as 180 days'),
    regLimit: { SO: { value: 200, label: 'Screening level', basis: 'example', hint: 'not sourced, illustrative only' } } },
  // Anions
  { keyword: 'CL', title: 'Chloride', method: 'EPA 300.0', category: 'Anions', unit: 'mg/L', rl: 1, matrices: ['DW', 'SW'], container: 'ANIONS',
    holdingTime: ht(28 * 24, SOURCES.CFR136_T2, 'CITED'),
    regLimit: { DW: { value: 250, label: 'Secondary MCL', basis: 'example', hint: '40 CFR 143.3' } } },
  { keyword: 'SO4', title: 'Sulfate', method: 'EPA 300.0', category: 'Anions', unit: 'mg/L', rl: 1, matrices: ['DW'], container: 'ANIONS',
    holdingTime: ht(28 * 24, SOURCES.CFR136_T2, 'CITED'),
    regLimit: { DW: { value: 250, label: 'Secondary MCL', basis: 'example', hint: '40 CFR 143.3' } } },
  { keyword: 'F', title: 'Fluoride', method: 'EPA 300.0', category: 'Anions', unit: 'mg/L', rl: 0.1, matrices: ['DW'], container: 'ANIONS',
    holdingTime: ht(28 * 24, SOURCES.CFR136_T2, 'CITED'),
    regLimit: { DW: { value: 4.0, label: 'MCL', basis: 'example', hint: '40 CFR 141.62' } } },
  { keyword: 'NO3N', title: 'Nitrate as N', method: 'EPA 300.0', category: 'Anions', unit: 'mg/L', rl: 0.1, matrices: ['DW', 'SW'], container: 'ANIONS',
    holdingTime: ht(48, SOURCES.CFR136_T2, 'CITED', 'unpreserved nitrate'),
    regLimit: { DW: { value: 10, label: 'MCL', basis: 'example', hint: '40 CFR 141.62' } } },
  // Conventionals
  { keyword: 'BOD5', title: 'Biochemical Oxygen Demand, 5-day', method: 'SM 5210B', category: 'Conventionals', unit: 'mg/L', rl: 2, matrices: ['WW'], container: 'BOD_TSS',
    holdingTime: ht(48, SOURCES.CFR136_T2, 'CITED'),
    regLimit: { WW: { value: 30, label: '30-day average, secondary treatment', basis: 'example', hint: '40 CFR 133.102' } } },
  { keyword: 'TSS', title: 'Total Suspended Solids', method: 'SM 2540D', category: 'Conventionals', unit: 'mg/L', rl: 2, matrices: ['WW', 'SW'], container: 'BOD_TSS',
    holdingTime: ht(7 * 24, SOURCES.CFR136_T2, 'CITED'),
    regLimit: { WW: { value: 30, label: '30-day average, secondary treatment', basis: 'example', hint: '40 CFR 133.102' } } },
  { keyword: 'COD', title: 'Chemical Oxygen Demand', method: 'SM 5220D', category: 'Conventionals', unit: 'mg/L', rl: 10, matrices: ['WW'], container: 'COD',
    holdingTime: ht(28 * 24, SOURCES.CFR136_T2, 'CITED'),
    regLimit: {} },
  // VOCs, drinking water
  { keyword: 'BENZ-DW', title: 'Benzene', method: 'EPA 524.2', category: 'Volatile Organics', unit: 'mg/L', rl: 0.0005, matrices: ['DW'], container: 'VOA_DW',
    holdingTime: ht(14 * 24, SOURCES.M524_2, 'UNVERIFIED'),
    regLimit: { DW: { value: 0.005, label: 'MCL', basis: 'example', hint: '40 CFR 141.61' } } },
  { keyword: 'TCE-DW', title: 'Trichloroethene', method: 'EPA 524.2', category: 'Volatile Organics', unit: 'mg/L', rl: 0.0005, matrices: ['DW'], container: 'VOA_DW',
    holdingTime: ht(14 * 24, SOURCES.M524_2, 'UNVERIFIED'),
    regLimit: { DW: { value: 0.005, label: 'MCL', basis: 'example', hint: '40 CFR 141.61' } } },
  { keyword: 'PCE-DW', title: 'Tetrachloroethene', method: 'EPA 524.2', category: 'Volatile Organics', unit: 'mg/L', rl: 0.0005, matrices: ['DW'], container: 'VOA_DW',
    holdingTime: ht(14 * 24, SOURCES.M524_2, 'UNVERIFIED'),
    regLimit: { DW: { value: 0.005, label: 'MCL', basis: 'example', hint: '40 CFR 141.61' } } },
  // VOCs, wastewater and soil
  { keyword: 'BENZ-W', title: 'Benzene (wastewater)', method: 'SW-846 8260', category: 'Volatile Organics', unit: 'ug/L', rl: 1, matrices: ['WW'], container: 'VOA_WW',
    holdingTime: ht(14 * 24, SOURCES.CFR136_T2, 'CITED', 'purgeable aromatics, HCl preserved'),
    regLimit: {} },
  { keyword: 'BENZ-S', title: 'Benzene (soil)', method: 'SW-846 8260', category: 'Volatile Organics', unit: 'ug/kg', rl: 5, matrices: ['SO'], container: 'SOIL_VOA',
    holdingTime: ht(14 * 24, SOURCES.SW846_CH4, 'UNVERIFIED', 'methanol preserved per Method 5035'),
    regLimit: { SO: { value: 1200, label: 'Screening level', basis: 'example', hint: 'not sourced, illustrative only' } } },
  // Microbiology
  { keyword: 'TC-PA', title: 'Total coliform, presence/absence', method: 'SM 9223B', category: 'Microbiology', unit: 'P/A per 100 mL', rl: null, matrices: ['DW'], container: 'MICRO',
    holdingTime: ht(30, SOURCES.CFR141_TC, 'UNVERIFIED', 'exact CFR section not checked'),
    regLimit: { DW: { value: 'Absent', label: 'Treatment technique trigger', basis: 'example', hint: '40 CFR 141 Subpart Y' } } },
  { keyword: 'EC-PA', title: 'E. coli, presence/absence', method: 'SM 9223B', category: 'Microbiology', unit: 'P/A per 100 mL', rl: null, matrices: ['DW'], container: 'MICRO',
    holdingTime: ht(30, SOURCES.CFR141_TC, 'UNVERIFIED', 'exact CFR section not checked'),
    regLimit: { DW: { value: 'Absent', label: 'MCL', basis: 'example', hint: '40 CFR 141.63' } } },
  { keyword: 'EC-MPN', title: 'E. coli, Quanti-Tray MPN', method: 'SM 9223B', category: 'Microbiology', unit: 'MPN/100 mL', rl: 1, matrices: ['WW', 'SW'], container: 'MICRO',
    holdingTime: ht(8, SOURCES.CFR136_T2, 'CITED', 'Table II footnote also allows 2 h for processing; not modeled (UNVERIFIED)'),
    regLimit: { SW: { value: 126, label: 'Recreational geometric mean', basis: 'example', hint: 'EPA 2012 Recreational Water Quality Criteria' } } },
]);

export const CLIENTS = Object.freeze([
  { id: 'SYN-CLI-01', name: `Example Township Water District ${SYNTHETIC_MARKER}`, contact: { first: 'Synthetic', last: 'Contact Alpha' } },
  { id: 'SYN-CLI-02', name: `Fictional Creek Wastewater Authority ${SYNTHETIC_MARKER}`, contact: { first: 'Synthetic', last: 'Contact Bravo' } },
  { id: 'SYN-CLI-03', name: `Demo Valley Watershed Council ${SYNTHETIC_MARKER}`, contact: { first: 'Synthetic', last: 'Contact Charlie' } },
  { id: 'SYN-CLI-04', name: `Placeholder Brownfield Redevelopment Co ${SYNTHETIC_MARKER}`, contact: { first: 'Synthetic', last: 'Contact Delta' } },
]);

// Flag vocabulary.
export const FLAGS = Object.freeze({
  HOLDING_TIME_BREACH: 'HOLDING_TIME_BREACH',
  QC_FAILURE: 'QC_FAILURE',
});

// ---------------------------------------------------------------------------
// Sample generation. Deterministic: fixed base time, fixed lags, no RNG.
// All timestamps are UTC.

const BASE_TIME = Date.parse('2026-09-14T14:00:00Z');
const HOUR = 3_600_000;
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');

// Hours from collection to preparation/analysis, per analysis, for normal samples.
const LAG_HOURS = {
  AS: 96, PB: 96, CU: 96, 'AS-S': 120, 'PB-S': 120,
  CL: 50, SO4: 50, F: 50, NO3N: 26,
  BOD5: 20, TSS: 44, COD: 72,
  'BENZ-DW': 100, 'TCE-DW': 100, 'PCE-DW': 100, 'BENZ-W': 110, 'BENZ-S': 130,
  'TC-PA': 18, 'EC-PA': 18, 'EC-MPN': 5,
};

// The single seeded holding-time breach: this sample's BOD5 set up 55 h after
// collection, past the 48 h limit (for example, incubator was full).
export const PLANNED_BREACH = Object.freeze({ sampleId: 'SYN-ENV-WW-0003', keyword: 'BOD5', lagHours: 55 });

const PANELS = {
  DW: [
    ['AS', 'PB', 'CU', 'CL', 'SO4', 'F', 'NO3N', 'TC-PA', 'EC-PA'],
    ['BENZ-DW', 'TCE-DW', 'PCE-DW', 'TC-PA', 'EC-PA'],
  ],
  WW: [['BOD5', 'TSS', 'COD', 'EC-MPN'], ['BOD5', 'TSS', 'COD', 'BENZ-W']],
  SW: [['TSS', 'NO3N', 'CL', 'AS', 'EC-MPN']],
  SO: [['AS-S', 'PB-S', 'BENZ-S']],
};

const PLAN = [
  { client: 'SYN-CLI-01', matrix: 'DW', count: 10, point: 'Distribution tap' },
  { client: 'SYN-CLI-02', matrix: 'WW', count: 8, point: 'Effluent outfall' },
  { client: 'SYN-CLI-03', matrix: 'SW', count: 6, point: 'Stream station' },
  { client: 'SYN-CLI-04', matrix: 'SO', count: 6, point: 'Grid cell' },
];

function buildSamples() {
  const samples = [];
  PLAN.forEach((group, groupIndex) => {
    const panels = PANELS[group.matrix];
    for (let i = 0; i < group.count; i += 1) {
      const id = `SYN-ENV-${group.matrix}-${String(i + 1).padStart(4, '0')}`;
      const collected = BASE_TIME + (i * 24 + groupIndex) * HOUR;
      const received = collected + 3 * HOUR;
      const analyses = panels[i % panels.length].map((keyword) => {
        const breach = id === PLANNED_BREACH.sampleId && keyword === PLANNED_BREACH.keyword;
        const lag = breach ? PLANNED_BREACH.lagHours : LAG_HOURS[keyword];
        return {
          keyword,
          analyzedAt: iso(collected + lag * HOUR),
          flags: breach ? [FLAGS.HOLDING_TIME_BREACH] : [],
        };
      });
      samples.push({
        id,
        client: group.client,
        sampleType: group.matrix,
        samplePoint: `${group.point} ${String(i + 1).padStart(2, '0')} ${SYNTHETIC_MARKER}`,
        collectedAt: iso(collected),
        receivedAt: iso(received),
        analyses,
      });
    }
  });
  return samples;
}

// ---------------------------------------------------------------------------
// QC batches: one per method. Each analyte gets a method blank and LCS; methods
// with MS limits also get an MS/MSD pair on the first sample in the batch.

// The single seeded QC failure: lead LCS recovers 121% (limit 85-115%).
export const PLANNED_QC_FAILURE = Object.freeze({ method: 'EPA 200.8', keyword: 'PB', type: 'lcs', recovery: 121 });

const RECOVERY_CYCLE = [0.98, 1.03, 0.96, 1.01, 0.99, 1.05];

function round(value, digits = 6) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function buildQcBatches(samples) {
  const byKeyword = new Map(ANALYSES.map((a) => [a.keyword, a]));
  const batches = [];
  let cycle = 0;
  const nextFactor = () => RECOVERY_CYCLE[cycle++ % RECOVERY_CYCLE.length];

  Object.entries(METHODS).forEach(([methodCode, method], methodIndex) => {
    const members = samples.filter((s) => s.analyses.some((a) => byKeyword.get(a.keyword).method === methodCode));
    if (members.length === 0) return;
    const keywords = [...new Set(members.flatMap((s) => s.analyses.map((a) => a.keyword)))]
      .filter((k) => byKeyword.get(k).method === methodCode);
    const qc = [];
    for (const keyword of keywords) {
      const analysis = byKeyword.get(keyword);
      if (method.qc.blank === 'absent') {
        qc.push({ type: 'method_blank', keyword, observed: 'Absent', flags: [] });
        qc.push({ type: 'lcs', keyword, observed: 'Present', note: 'positive control organism', flags: [] });
        continue;
      }
      const spike = round(analysis.rl * 20, 6);
      qc.push({ type: 'method_blank', keyword, measured: round(analysis.rl * 0.3), flags: [] });
      const failing = methodCode === PLANNED_QC_FAILURE.method && keyword === PLANNED_QC_FAILURE.keyword;
      const lcsFactor = failing ? PLANNED_QC_FAILURE.recovery / 100 : nextFactor();
      qc.push({ type: 'lcs', keyword, spike, measured: round(spike * lcsFactor), flags: failing ? [FLAGS.QC_FAILURE] : [] });
      if (method.qc.ms) {
        const parent = members.find((s) => s.analyses.some((a) => a.keyword === keyword));
        const native = round(analysis.rl * 2);
        const msMeasured = round(native + spike * nextFactor());
        const msdMeasured = round(native + spike * nextFactor());
        qc.push({ type: 'ms', keyword, sampleId: parent.id, native, spike, measured: msMeasured, flags: [] });
        qc.push({ type: 'msd', keyword, sampleId: parent.id, native, spike, measured: msdMeasured, flags: [] });
      }
    }
    batches.push({
      id: `SYN-QC-${String(methodIndex + 1).padStart(2, '0')}`,
      method: methodCode,
      sampleIds: members.map((s) => s.id),
      qc,
    });
  });
  return batches;
}

export const SAMPLES = Object.freeze(buildSamples());
export const QC_BATCHES = Object.freeze(buildQcBatches(SAMPLES));

export const SEED = Object.freeze({
  synthetic: true,
  sampleTypes: SAMPLE_TYPES,
  containers: CONTAINERS,
  methods: METHODS,
  analyses: ANALYSES,
  clients: CLIENTS,
  samples: SAMPLES,
  qcBatches: QC_BATCHES,
});
