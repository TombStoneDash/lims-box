// Run: node --test scripts/seed/clinical-diagnostics/results.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { FLAGS, SEED } from './data.mjs';
import { buildQcRuns, buildResults, formatQcRuns, main } from './results.mjs';
import { applyResults } from '../environmental/results.mjs';
import { calibrationDue, isCalibrationOverdue, isDeltaFailure, priorWithinWindow, validateSeed } from './validate.mjs';

const clone = () => structuredClone(SEED);
const pairs = SEED.samples.reduce((n, s) => n + s.analyses.length, 0);
const findAnalysis = (seed, sampleId, keyword) =>
  seed.samples.find((s) => s.id === sampleId).analyses.find((a) => a.keyword === keyword);

test('delta check: exactly one, SYN-CLN-SER-0005 creatinine 0.9 vs a prior 0.5 inside 48 h', () => {
  const { deltaFailures } = validateSeed(SEED).summary;
  assert.deepEqual(deltaFailures.map((d) => [d.sampleId, d.keyword, d.current, d.prior]), [['SYN-CLN-SER-0005', 'CREA', 0.9, 0.5]]);
  const rule = SEED.deltaRules[0];
  assert.equal(isDeltaFailure('0.9', { value: 0.5 }, rule), true);
  assert.equal(isDeltaFailure('1.0', { value: 1.1 }, rule), false, 'a 0.1 change is inside the limit');
  assert.equal(isDeltaFailure('0.8', { value: 0.5 }, rule), false, 'exactly at the limit is not a failure');
  assert.equal(priorWithinWindow(SEED.priorResults, 'SYN-SUBJ-CLN-003', rule, '2026-09-23T13:00:00Z'), null, 'a 5-day-old prior is outside the window');
});

test('calibration: exactly one overdue instrument, and only results run after its due date are flagged', () => {
  const { overdueResults } = validateSeed(SEED).summary;
  assert.deepEqual([...new Set(overdueResults.map((r) => r.instrument))], ['SYN-INST-HEME-01']);
  assert.equal(calibrationDue(SEED.instruments.find((x) => x.id === 'SYN-INST-HEME-01')), '2026-09-14');
  assert.equal(overdueResults.length, 8, 'every WBC and HbA1c result');
  const heme = SEED.instruments.find((x) => x.id === 'SYN-INST-HEME-01');
  assert.equal(isCalibrationOverdue(heme, '2026-09-13T23:00:00Z'), false);
  assert.equal(isCalibrationOverdue(heme, '2026-09-14T01:00:00Z'), true);
});

test('validator rejects an unflagged delta, a second delta, and a second overdue instrument', () => {
  const unflagged = clone();
  findAnalysis(unflagged, 'SYN-CLN-SER-0005', 'CREA').flags = [];
  assert.ok(validateSeed(unflagged).errors.some((e) => e.includes('SER-0005/CREA: delta flag false but computed true')));

  const second = clone();
  second.priorResults.push({ subjectCode: 'SYN-SUBJ-CLN-001', keyword: 'CREA', value: 0.2, at: '2026-09-20T13:00:00Z' });
  const errors = validateSeed(second).errors;
  assert.ok(errors.some((e) => e.includes('SER-0001/CREA: delta flag false but computed true')));
  assert.ok(errors.some((e) => e.includes('expected exactly one delta check failure, found 2')));

  const twoOverdue = clone();
  twoOverdue.instruments.find((x) => x.id === 'SYN-INST-PCR-01').lastCalibrated = '2026-01-01';
  assert.ok(validateSeed(twoOverdue).errors.some((e) => e.includes('expected exactly one overdue instrument, found 2')));
});

test('validator rejects a non-synthetic prior subject and an unlabelled calibration interval', () => {
  const real = clone();
  real.priorResults[0].subjectCode = 'MRN-12345';
  assert.ok(validateSeed(real).errors.some((e) => e.includes('subject must be synthetic')));
  const unlabelled = clone();
  unlabelled.instruments[0].basis = 'manufacturer';
  assert.ok(validateSeed(unlabelled).errors.some((e) => e.includes('must be labelled example')));
});

test('results: one per analysis, remarks exactly on the seeded problems', () => {
  const results = buildResults(SEED);
  assert.equal(results.length, pairs);
  const count = (re) => results.filter((r) => re.test(r.remarks)).length;
  assert.equal(count(/HOLDING TIME EXCEEDED/), 2);
  assert.equal(count(/QC FAILED in SYN-QC-CLN-01/), SEED.samples.filter((s) => s.analyses.some((a) => a.keyword === 'GLU')).length);
  assert.equal(count(/QC FAILED in SYN-QC-DX-01/), SEED.samples.filter((s) => s.analyses.some((a) => a.keyword === 'SARS2')).length);
  assert.equal(count(/DELTA CHECK: 0\.9 vs 0\.5 mg\/dL/), 1);
  assert.equal(count(/CALIBRATION OVERDUE: run on Hematology analyzer \(SYNTHETIC\), calibration was due 2026-09-14/), 8);
  assert.ok(results.filter((r) => !r.remarks).every((r) => {
    const a = findAnalysis(SEED, r.clientSampleId, r.keyword);
    return a.flags.length === 0;
  }), 'no remark without a flag');
  assert.deepEqual(buildResults(SEED), results, 'deterministic');
});

test('QC runs: the two failed controls are reported and the rest pass', () => {
  const runs = buildQcRuns(SEED);
  const failed = runs.flatMap((r) => r.controls.filter((c) => !c.pass).map((c) => `${r.batchId}/${c.control}`));
  assert.deepEqual(failed, ['SYN-QC-CLN-01/Level 2', 'SYN-QC-DX-01/Negative control']);
  const text = formatQcRuns(runs);
  assert.match(text, /QC SYN-QC-CLN-01 GLU .* FAIL: Level 2: 268 vs 250/);
  assert.match(text, /CAL SYN-INST-HEME-01 last 2026-08-15, due 2026-09-14/);
});

test('dry run is the default and makes no network calls', async () => {
  const calls = [];
  const out = [];
  const original = console.log;
  console.log = (line) => out.push(line);
  try {
    assert.equal(await main([], {}, async () => { calls.push(1); }), 0);
  } finally {
    console.log = original;
  }
  assert.equal(calls.length, 0);
  const all = out.join('\n');
  assert.match(all, /^DRY RUN/);
  assert.match(all, new RegExp(`Planned results: ${pairs} \\(with remarks: 23\\)`));
  assert.match(all, /QC SYN-QC-DX-01 SARS2 .* FAIL/);
});

test('--apply refuses without env and without the patched acknowledgement', async () => {
  const calls = [];
  await assert.rejects(main(['--apply'], {}, async () => { calls.push(1); }), /missing env/);
  await assert.rejects(main(['--apply'], { SENAITE_URL: 'http://x', SENAITE_USER: 'u', SENAITE_PASS: 'p' }, async () => { calls.push(1); }), /SENAITE_PATCHED_ACK/);
  assert.equal(calls.length, 0);
});

test('apply against a stub: result, remark and submit per analysis, never verify', async () => {
  const results = buildResults(SEED);
  const posts = [];
  const stub = async (url, init) => {
    const u = new URL(url);
    if (init.method === 'GET') {
      if (u.pathname.endsWith('/analysisrequest')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ items: [{ getId: `S-${u.searchParams.get('getClientSampleID')}` }] }) };
      }
      const id = u.searchParams.get('getRequestID').slice(2);
      const rows = results.filter((r) => r.clientSampleId === id);
      return { ok: true, status: 200, text: async () => JSON.stringify({ items: rows.map((r) => ({ uid: `${id}:${r.senaiteKeyword}`, getKeyword: r.senaiteKeyword })) }) };
    }
    posts.push(JSON.parse(init.body));
    return { ok: true, status: 200, text: async () => '{"items":[{}]}' };
  };
  const written = await applyResults(results, { apiBase: 'http://stub/senaite/@@API/senaite/v1', auth: 'Basic x' }, stub, () => {});
  assert.equal(written, results.length);
  assert.equal(posts.filter((p) => 'Result' in p).length, results.length);
  assert.equal(posts.filter((p) => 'Remarks' in p).length, 23);
  assert.ok(posts.every((p) => !p.transition || p.transition === 'submit'), 'never verifies or publishes');
});

test('every flagged analysis in the seed carries a known flag', () => {
  const known = new Set(Object.values(FLAGS));
  for (const s of SEED.samples) for (const a of s.analyses) for (const f of a.flags) assert.ok(known.has(f), `${s.id}/${a.keyword}: ${f}`);
});
