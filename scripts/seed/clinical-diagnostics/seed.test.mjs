// Run: node --test scripts/seed/clinical-diagnostics/seed.test.mjs
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { findSyntheticPrivacyViolations } from '../../lib/synthetic-privacy.mjs';
import { FLAGS, SEED } from './data.mjs';
import { buildPlan, main } from './load.mjs';
import { applyPlan, readApplyConfig } from '../environmental/load.mjs';
import { evaluateControl, hoursBetween, isStabilityBreach, validateSeed, zScore } from './validate.mjs';

const clone = () => structuredClone(SEED);
const findAnalysis = (seed, sampleId, keyword) =>
  seed.samples.find((s) => s.id === sampleId).analyses.find((a) => a.keyword === keyword);

test('committed seed validates with exactly one breach and one QC failure per lab', () => {
  const result = validateSeed(SEED);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.summary.breaches.map((b) => [b.lab, b.sampleId, b.keyword]), [
    ['ABC-CLN', 'SYN-CLN-SER-0004', 'K'],
    ['ABC-DX', 'SYN-DX-UC-0003', 'UCULT'],
  ]);
  assert.deepEqual(result.summary.qcFailures.map((q) => [q.lab, q.batchId, q.control]), [
    ['ABC-CLN', 'SYN-QC-CLN-01', 'Level 2'],
    ['ABC-DX', 'SYN-QC-DX-01', 'Negative control'],
  ]);
});

test('stability and QC math', () => {
  assert.equal(hoursBetween('2026-09-21T13:00:00Z', '2026-09-21T20:00:00Z'), 7);
  assert.equal(isStabilityBreach('2026-09-21T13:00:00Z', '2026-09-21T17:00:00Z', 4), false, 'exactly at the limit is not a breach');
  assert.equal(isStabilityBreach('2026-09-21T13:00:00Z', '2026-09-21T17:01:00Z', 4), true);
  assert.equal(zScore({ mean: 250, sd: 5, measured: 268 }), 3.6);
  assert.equal(evaluateControl({ control: 'L', mean: 100, sd: 2, measured: 106 }).pass, true, '3.0 SD passes 1-3s');
  assert.equal(evaluateControl({ control: 'L', mean: 100, sd: 2, measured: 106.2 }).pass, false);
  assert.equal(evaluateControl({ control: 'N', expected: 'Not detected', observed: 'Detected' }).pass, false);
});

test('an unflagged breach, or a second breach in one lab, is rejected', () => {
  const unflagged = clone();
  findAnalysis(unflagged, 'SYN-CLN-SER-0004', 'K').flags = [];
  assert.ok(validateSeed(unflagged).errors.some((e) => e.includes('computed breach true')));

  const second = clone();
  const a = findAnalysis(second, 'SYN-CLN-SER-0001', 'GLU');
  a.testedAt = '2026-09-24T00:00:00Z';
  a.flags = [FLAGS.HOLDING_TIME_BREACH];
  assert.ok(validateSeed(second).errors.some((e) => e.includes('ABC-CLN: expected exactly one holding-time breach, found 2')));
});

test('a fixed QC value still flagged, or a lab with no QC failure, is rejected', () => {
  const fixed = clone();
  fixed.qcBatches[0].controls[1].measured = 251;
  const errors = validateSeed(fixed).errors;
  assert.ok(errors.some((e) => e.includes('QC flag true but computed pass true')));
  fixed.qcBatches[0].controls[1].flags = [];
  assert.ok(validateSeed(fixed).errors.some((e) => e.includes('ABC-CLN: expected exactly one QC failure, found 0')));
});

test('patient identifiers and non-synthetic ids are rejected', () => {
  const withName = clone();
  withName.samples[0].patientName = 'Anyone';
  assert.ok(validateSeed(withName).errors.some((e) => e.includes('forbidden field patientName')));
  const realId = clone();
  realId.samples[0].id = 'CLN-0001';
  assert.ok(validateSeed(realId).errors.some((e) => e.includes('ids must be synthetic')));
});

test('normal quantitative results sit inside their example reference interval', () => {
  const defs = new Map(SEED.analyses.map((a) => [a.keyword, a]));
  for (const s of SEED.samples) {
    for (const a of s.analyses) {
      const def = defs.get(a.keyword);
      if (!def.reference) continue;
      const v = Number(a.result);
      assert.ok(v >= def.reference.low && v <= def.reference.high, `${s.id}/${a.keyword} = ${a.result}`);
    }
  }
});

test('dry run is the default and makes no network calls', async () => {
  const calls = [];
  const out = [];
  const original = console.log;
  console.log = (line) => out.push(line);
  try {
    assert.equal(await main([], { SENAITE_URL: 'http://example.invalid', SENAITE_USER: 'u', SENAITE_PASS: 'p' }, async () => { calls.push(1); }), 0);
  } finally {
    console.log = original;
  }
  assert.equal(calls.length, 0);
  assert.match(out.join('\n'), /^DRY RUN/);
  assert.match(out.join('\n'), new RegExp(`Planned create calls: ${buildPlan(SEED).length}`));
});

test('--apply refuses without env and without the patched acknowledgement', async () => {
  const calls = [];
  await assert.rejects(main(['--apply'], {}, async () => { calls.push(1); }), /missing env/);
  await assert.rejects(main(['--apply'], { SENAITE_URL: 'http://x', SENAITE_USER: 'u', SENAITE_PASS: 'p' }, async () => { calls.push(1); }), /SENAITE_PATCHED_ACK/);
  assert.equal(calls.length, 0);
  assert.throws(() => readApplyConfig({}), /missing env/);
});

test('plan covers every seed object and apply resolves references against a stub', async () => {
  const plan = buildPlan(SEED, 'senaite');
  const count = (type) => plan.filter((s) => s.body.portal_type === type).length;
  assert.equal(count('AnalysisRequest'), SEED.samples.length);
  assert.equal(count('AnalysisService'), SEED.analyses.length);
  assert.equal(count('SampleType'), SEED.sampleTypes.length);
  assert.equal(count('Client'), SEED.clients.length);
  assert.equal(count('Contact'), SEED.clients.length);
  let n = 0;
  const posted = [];
  const stub = async (url, init) => {
    if (init.method === 'GET') return { ok: true, status: 200, text: async () => '{"items":[]}' };
    posted.push(JSON.parse(init.body));
    n += 1;
    return { ok: true, status: 200, text: async () => JSON.stringify({ items: [{ uid: `uid-${n}` }] }) };
  };
  await applyPlan(plan, { apiBase: 'http://stub/senaite/@@API/senaite/v1', auth: 'Basic x' }, stub, () => {});
  assert.equal(posted.length, plan.length);
  assert.ok(!JSON.stringify(posted).includes('$ref'), 'all references resolved');
  assert.ok(posted.filter((p) => p.portal_type === 'AnalysisRequest').every((p) => p.ClientReference.startsWith('SYNTHETIC DEMO SYN-SUBJ-')));
});

test('seed folder is synthetic-clean: no private identifiers and no em dashes', async () => {
  const dir = import.meta.dirname;
  const files = (await readdir(dir)).filter((f) => /\.(mjs|md)$/.test(f));
  const artifacts = await Promise.all(files.map(async (f) => ({ path: f, content: await readFile(join(dir, f), 'utf8') })));
  const dataOnly = artifacts.filter((a) => a.path === 'data.mjs');
  assert.deepEqual(findSyntheticPrivacyViolations([...dataOnly, { path: 'SEED', content: JSON.stringify(SEED) }]), []);
  for (const a of artifacts) assert.ok(!a.content.includes(String.fromCharCode(0x2014)), `${a.path} contains an em dash`);
  for (const x of [...SEED.labs, ...SEED.clients]) assert.match(x.name, /\(SYNTHETIC\)$/);
});
