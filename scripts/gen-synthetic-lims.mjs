#!/usr/bin/env node

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SEED = 20260726;
const DEFAULT_SAMPLE_COUNT = 200;
const SAMPLE_MATRICES = ['serum', 'plasma', 'swab', 'urine'];

const MATRIX_CONFIG = {
  serum: { container: 'SST' },
  plasma: { container: 'EDTA' },
  swab: { container: 'VTM' },
  urine: { container: 'STERILE_CUP' },
  drinking_water: { container: 'STERILE_HDPE' },
  wastewater: { container: 'AMBER_GLASS' },
  surface_water: { container: 'STERILE_HDPE' },
};

const TURNAROUND_HOURS_BY_DISCIPLINE = {
  serology: 36,
  molecular: 24,
  chemistry: 18,
  tb: 48,
  environmental: 72,
};

const CATALOG_BLUEPRINT = [
  ['SER-AB-HAV', 'Hepatitis A IgM', 'serology', ['serum'], ['HAV IgM'], 'SST', 'IU/mL', 0.2],
  ['SER-AB-HBV', 'Hepatitis B Surface Antibody', 'serology', ['serum'], ['HBsAb'], 'SST', 'mIU/mL', 1],
  ['SER-AG-HBV', 'Hepatitis B Surface Antigen', 'serology', ['serum', 'plasma'], ['HBsAg'], 'SST', 'index', 0.05],
  ['SER-AB-HCV', 'Hepatitis C Antibody', 'serology', ['serum', 'plasma'], ['HCV Ab'], 'SST', 'index', 0.1],
  ['SER-AG-HIV', 'HIV Antigen Antibody Screen', 'serology', ['serum', 'plasma'], ['HIV Ag/Ab'], 'SST', 'index', 0.1],
  ['SER-SYPH', 'Syphilis Treponemal Antibody', 'serology', ['serum', 'plasma'], ['Treponemal Ab'], 'SST', 'index', 0.1],
  ['MOL-FLU-A', 'Influenza A PCR', 'molecular', ['swab'], ['Influenza A'], 'VTM', 'copies/mL', 120],
  ['MOL-FLU-B', 'Influenza B PCR', 'molecular', ['swab'], ['Influenza B'], 'VTM', 'copies/mL', 120],
  ['MOL-RSV', 'Respiratory Syncytial Virus PCR', 'molecular', ['swab'], ['RSV'], 'VTM', 'copies/mL', 150],
  ['MOL-COV2', 'Synthetic Coronavirus Target PCR', 'molecular', ['swab'], ['SCV-2 target'], 'VTM', 'copies/mL', 100],
  ['MOL-CT', 'Chlamydia trachomatis NAAT', 'molecular', ['swab', 'urine'], ['C. trachomatis'], 'VTM', 'copies/mL', 90],
  ['MOL-NG', 'Neisseria gonorrhoeae NAAT', 'molecular', ['swab', 'urine'], ['N. gonorrhoeae'], 'VTM', 'copies/mL', 90],
  ['CHEM-GLU', 'Glucose', 'chemistry', ['serum', 'plasma', 'urine'], ['Glucose'], 'SST', 'mg/dL', 2],
  ['CHEM-CREA', 'Creatinine', 'chemistry', ['serum', 'plasma', 'urine'], ['Creatinine'], 'SST', 'mg/dL', 0.1],
  ['CHEM-ALT', 'Alanine Aminotransferase', 'chemistry', ['serum', 'plasma'], ['ALT'], 'SST', 'U/L', 1],
  ['CHEM-AST', 'Aspartate Aminotransferase', 'chemistry', ['serum', 'plasma'], ['AST'], 'SST', 'U/L', 1],
  ['CHEM-BILI', 'Total Bilirubin', 'chemistry', ['serum', 'plasma'], ['Bilirubin'], 'SST', 'mg/dL', 0.1],
  ['CHEM-ALB', 'Albumin', 'chemistry', ['serum', 'plasma'], ['Albumin'], 'SST', 'g/dL', 0.1],
  ['CHEM-NA', 'Sodium', 'chemistry', ['serum', 'plasma', 'urine'], ['Sodium'], 'SST', 'mmol/L', 1],
  ['CHEM-K', 'Potassium', 'chemistry', ['serum', 'plasma', 'urine'], ['Potassium'], 'SST', 'mmol/L', 0.1],
  ['TB-IGRA-A', 'Synthetic TB Antigen A', 'tb', ['plasma'], ['TB Ag A response'], 'EDTA', 'IU/mL', 0.01],
  ['TB-IGRA-B', 'Synthetic TB Antigen B', 'tb', ['plasma'], ['TB Ag B response'], 'EDTA', 'IU/mL', 0.01],
  ['TB-NIL', 'Synthetic TB Nil Control', 'tb', ['plasma'], ['Nil control'], 'EDTA', 'IU/mL', 0.01],
  ['TB-MIT', 'Synthetic TB Mitogen Control', 'tb', ['plasma'], ['Mitogen control'], 'EDTA', 'IU/mL', 0.01],
  ['ENV-NIT', 'Synthetic Nitrate Screen', 'environmental', ['drinking_water', 'wastewater'], ['Nitrate surrogate'], 'STERILE_HDPE', 'mg/L', 0.05],
  ['ENV-PH', 'Synthetic pH Screen', 'environmental', ['drinking_water', 'wastewater', 'surface_water'], ['pH'], 'STERILE_HDPE', 'SU', 0.1],
  ['ENV-COND', 'Synthetic Conductivity Screen', 'environmental', ['drinking_water', 'surface_water'], ['Conductivity'], 'STERILE_HDPE', 'uS/cm', 1],
  ['ENV-MET-A', 'Synthetic Metals Panel A', 'environmental', ['drinking_water', 'wastewater'], ['Metal A', 'Metal B'], 'STERILE_HDPE', 'ug/L', 0.5],
  ['ENV-MET-B', 'Synthetic Metals Panel B', 'environmental', ['surface_water', 'wastewater'], ['Metal C', 'Metal D'], 'STERILE_HDPE', 'ug/L', 0.5],
  ['ENV-ORG', 'Synthetic Organics Screen', 'environmental', ['drinking_water', 'wastewater'], ['Organic surrogate'], 'AMBER_GLASS', 'ug/L', 0.2],
];

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

function shuffle(random, values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function parseArgs(argv) {
  const options = {
    outDir: resolve('data/synthetic'),
    seed: DEFAULT_SEED,
    sampleCount: DEFAULT_SAMPLE_COUNT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--out-dir') options.outDir = resolve(argv[++index]);
    else if (argument === '--seed') options.seed = Number(argv[++index]);
    else if (argument === '--samples') options.sampleCount = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }

  if (!Number.isInteger(options.seed) || options.seed < 1) {
    throw new Error('--seed must be a positive integer');
  }
  if (!Number.isInteger(options.sampleCount) || options.sampleCount < 1) {
    throw new Error('--samples must be a positive integer');
  }

  return options;
}

function buildCatalog() {
  return CATALOG_BLUEPRINT.map(
    ([code, name, discipline, validMatrices, analytes, container, units, detectionLimit]) => ({
      code,
      name,
      discipline,
      valid_matrices: validMatrices,
      analytes,
      containers_per_test: validMatrices.map((matrix) => ({
        matrix,
        type: SAMPLE_MATRICES.includes(matrix) ? MATRIX_CONFIG[matrix].container : container,
        quantity: 1,
      })),
      units,
      detection_limit: detectionLimit,
      turnaround_hours: TURNAROUND_HOURS_BY_DISCIPLINE[discipline],
      synthetic: true,
    }),
  );
}

function statusFor(index) {
  if (index % 20 < 12) return 'in_progress';
  if (index % 20 < 15) return 'received';
  if (index % 20 < 17) return 'pending_review';
  return 'completed';
}

function generateSamples(random, catalog, sampleCount) {
  const matrices = SAMPLE_MATRICES;
  return Array.from({ length: sampleCount }, (_, index) => {
    const matrix = matrices[index % matrices.length];
    const validTests = catalog.filter((test) => test.valid_matrices.includes(matrix));
    const orderedTests = shuffle(random, validTests)
      .slice(0, 1 + Math.floor(random() * 3))
      .map((test) => test.code)
      .sort();
    const dayOfYear = String(41 + (index % 180)).padStart(3, '0');
    const sequence = String(index + 1).padStart(4, '0');
    const receivedHour = String(8 + (index % 9)).padStart(2, '0');

    const receivedAt = `2026-02-${String((index % 24) + 1).padStart(2, '0')}T${receivedHour}:00:00Z`;
    const turnaroundHours = Math.max(
      ...orderedTests.map((code) => catalog.find((test) => test.code === code).turnaround_hours),
    );
    const expectedReportAt = new Date(
      new Date(receivedAt).getTime() + turnaroundHours * 60 * 60 * 1000,
    ).toISOString();

    return {
      id: `SYN-26${dayOfYear}-${sequence}`,
      customer_id: `SYN-CUST-${String((index % 24) + 1).padStart(3, '0')}`,
      matrix,
      container: MATRIX_CONFIG[matrix].container,
      status: statusFor(index),
      priority: index % 13 === 0 ? 'rush' : 'routine',
      received_at: receivedAt,
      expected_report_at: expectedReportAt,
      test_codes: orderedTests,
      synthetic: true,
    };
  });
}

function generateResults(random, samples, catalog) {
  const catalogByCode = new Map(catalog.map((test) => [test.code, test]));
  const flags = ['normal', 'below_detection', 'above_range'];
  const results = [];

  for (const sample of samples) {
    if (sample.status === 'received') continue;
    for (const testCode of sample.test_codes) {
      const test = catalogByCode.get(testCode);
      const flag = pick(random, flags);
      const detectionLimit = test.detection_limit;
      const measured =
        flag === 'below_detection'
          ? null
          : Number((detectionLimit * (flag === 'above_range' ? 24 + random() * 12 : 2 + random() * 8)).toFixed(3));

      results.push({
        id: `SYN-RES-${String(results.length + 1).padStart(5, '0')}`,
        sample_id: sample.id,
        test_code: test.code,
        analyte: test.analytes[0],
        value: measured,
        flag,
        units: test.units,
        detection_limit: detectionLimit,
        reportable: sample.status === 'completed',
        synthetic: true,
      });
    }
  }

  return results;
}

function generatePersonnel() {
  const roles = ['General Supervisor', 'Technical Consultant', 'Testing Personnel'];
  return Array.from({ length: 12 }, (_, index) => ({
    id: `SYN-STAFF-${String(index + 1).padStart(3, '0')}`,
    display_name: `Synthetic Staff ${String(index + 1).padStart(2, '0')}`,
    role: roles[index % roles.length],
    competencies: [
      {
        area: ['sample_receiving', 'result_review', 'instrument_operation'][index % 3],
        assessed_on: `2026-${String((index % 6) + 1).padStart(2, '0')}-15`,
        outcome: index % 5 === 0 ? 'follow_up_required' : 'authorized',
      },
    ],
    authorizations: index % 5 === 0 ? [] : [`SYN-AUTH-${String(index + 1).padStart(3, '0')}`],
    synthetic: true,
  }));
}

function escapeHl7(value) {
  return String(value).replaceAll('|', '\\F\\').replaceAll('^', '\\S\\');
}

function buildHl7(sample, result, index) {
  const timestamp = `202607${String(index + 10).padStart(2, '0')}120000`;
  const numericValue = result.value === null ? '<DL' : result.value;
  return [
    `MSH|^~\\&|SYNTHETIC_ANALYZER|SYNTHETIC_LAB|LIMS_BOX_DEMO|SYNTHETIC|${timestamp}||ORU^R01|SYN-MSG-${String(index + 1).padStart(3, '0')}|P|2.5.1`,
    `PID|1||SYNTHETIC-SUBJECT-${String(index + 1).padStart(3, '0')}^^^DEMO||SYNTHETIC^SUBJECT`,
    `OBR|1|${escapeHl7(sample.id)}|${escapeHl7(result.id)}|${escapeHl7(result.test_code)}^${escapeHl7(result.analyte)}|||${timestamp}`,
    `OBX|1|NM|${escapeHl7(result.test_code)}^${escapeHl7(result.analyte)}||${numericValue}|${escapeHl7(result.units)}|||${result.flag === 'above_range' ? 'H' : result.flag === 'below_detection' ? 'L' : 'N'}|||F`,
    'NTE|1|L|FABRICATED SYNTHETIC DEMO MESSAGE - NO PATIENT OR CLIENT DATA',
    '',
  ].join('\n');
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function generateSyntheticLims({ outDir, seed, sampleCount }) {
  const random = mulberry32(seed);
  const catalog = buildCatalog();
  const samples = generateSamples(random, catalog, sampleCount);
  const results = generateResults(random, samples, catalog);
  const personnel = generatePersonnel();

  await rm(outDir, { recursive: true, force: true });
  await mkdir(join(outDir, 'hl7/oru_r01_samples'), { recursive: true });
  await writeJson(join(outDir, 'samples.json'), samples);
  await writeJson(join(outDir, 'tests.json'), catalog);
  await writeJson(join(outDir, 'results.json'), results);
  await writeJson(join(outDir, 'personnel.json'), personnel);
  await writeJson(join(outDir, 'manifest.json'), {
    dataset: 'LIMS BOX fabricated synthetic demo dataset',
    seed,
    sample_count: samples.length,
    test_count: catalog.length,
    result_count: results.length,
    personnel_count: personnel.length,
    hl7_message_count: 5,
    contains_real_data: false,
  });

  const hl7Candidates = results.filter((result) => result.value !== null).slice(0, 5);
  for (const [index, result] of hl7Candidates.entries()) {
    const sample = samples.find((candidate) => candidate.id === result.sample_id);
    await writeFile(
      join(outDir, 'hl7/oru_r01_samples', `oru_r01_${String(index + 1).padStart(2, '0')}.hl7`),
      buildHl7(sample, result, index),
    );
  }

  return { catalog, samples, results, personnel };
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  const options = parseArgs(process.argv.slice(2));
  const output = await generateSyntheticLims(options);
  process.stdout.write(
    `Generated ${output.samples.length} samples, ${output.catalog.length} tests, ` +
      `${output.results.length} results, and ${output.personnel.length} personnel at ${options.outDir}\n`,
  );
}
