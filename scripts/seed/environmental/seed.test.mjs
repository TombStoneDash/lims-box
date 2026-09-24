// Run: node --test scripts/seed/environmental/seed.test.mjs
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { findSyntheticPrivacyViolations } from '../../lib/synthetic-privacy.mjs';
import { FLAGS, SEED } from './data.mjs';
import { REQUIRED_ACK, applyPlan, buildPlan, main, readApplyConfig } from './load.mjs';
import { evaluateQc, hoursBetween, isHoldingTimeBreach, recoveryPercent, rpdPercent, validateSeed } from './validate.mjs';

const clone = () => structuredClone(SEED);
const findAnalysis = (seed, sampleId, keyword) =>
  seed.samples.find((s) => s.id === sampleId).analyses.find((a) => a.keyword === keyword);

test('committed seed validates with exactly one breach and one QC failure', () => {
  const result = validateSeed(SEED);
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.breaches.length, 1);
  assert.equal(result.summary.breaches[0].sampleId, 'SYN-ENV-WW-0003');
  assert.equal(result.summary.breaches[0].keyword, 'BOD5');
  assert.equal(result.summary.qcFailures.length, 1);
  assert.equal(result.summary.qcFailures[0].keyword, 'PB');
  assert.equal(result.summary.qcFailures[0].type, 'lcs');
  assert.ok(result.summary.samples >= 20 && result.summary.samples <= 40);
});

test('holding-time math', () => {
  assert.equal(hoursBetween('2026-09-14T14:00:00Z', '2026-09-16T14:00:00Z'), 48);
  assert.equal(isHoldingTimeBreach('2026-09-14T14:00:00Z', '2026-09-16T14:00:00Z', 48), false, 'exactly at limit is not a breach');
  assert.equal(isHoldingTimeBreach('2026-09-14T14:00:00Z', '2026-09-16T14:01:00Z', 48), true);
});

test('QC math', () => {
  assert.equal(recoveryPercent({ spike: 10, measured: 12.1 }), 121);
  assert.equal(recoveryPercent({ native: 2, spike: 10, measured: 11 }), 90);
  assert.equal(rpdPercent(10, 10), 0);
  assert.ok(Math.abs(rpdPercent(9, 11) - 20) < 1e-9);
  const method = { qc: { blank: 'lt_rl', lcs: [85, 115], ms: [70, 130], rpd: 20 } };
  assert.equal(evaluateQc({ type: 'method_blank', measured: 0.002 }, method, { rl: 0.001 }).pass, false);
  assert.equal(evaluateQc({ type: 'lcs', spike: 1, measured: 1.15 }, method, { rl: 0.001 }).pass, true);
  const ms = { type: 'ms', native: 0, spike: 10, measured: 10 };
  assert.equal(evaluateQc({ type: 'msd', native: 0, spike: 10, measured: 12.5 }, method, {}, ms).pass, false, 'RPD 22% fails');
});

test('unflagged breach is rejected', () => {
  const seed = clone();
  findAnalysis(seed, 'SYN-ENV-WW-0003', 'BOD5').flags = [];
  assert.ok(validateSeed(seed).errors.some((e) => e.includes('holding-time flag false but computed breach true')));
});

test('second breach is rejected', () => {
  const seed = clone();
  const s = seed.samples.find((x) => x.id === 'SYN-ENV-SW-0001');
  const a = s.analyses.find((x) => x.keyword === 'EC-MPN');
  a.analyzedAt = new Date(Date.parse(s.collectedAt) + 9 * 3_600_000).toISOString();
  a.flags = [FLAGS.HOLDING_TIME_BREACH];
  assert.ok(validateSeed(seed).errors.some((e) => e.includes('exactly one holding-time breach, found 2')));
});

test('QC failure that is fixed but still flagged is rejected, and zero failures is rejected', () => {
  const seed = clone();
  const lcs = seed.qcBatches.find((b) => b.method === 'EPA 200.8').qc.find((q) => q.keyword === 'PB' && q.type === 'lcs');
  lcs.measured = lcs.spike;
  const errors = validateSeed(seed).errors;
  assert.ok(errors.some((e) => e.includes('QC flag true but computed pass true')));
  assert.ok(errors.some((e) => e.includes('exactly one QC failure, found 0')));
});

test('unflagged blank contamination is rejected', () => {
  const seed = clone();
  const blank = seed.qcBatches.find((b) => b.method === 'EPA 300.0').qc.find((q) => q.type === 'method_blank');
  blank.measured = 50;
  assert.ok(validateSeed(seed).errors.some((e) => e.includes('method_blank: QC flag false but computed pass false')));
});

test('every holding time is CITED or UNVERIFIED and every regulatory limit is labeled example', () => {
  for (const a of SEED.analyses) {
    assert.ok(['CITED', 'UNVERIFIED'].includes(a.holdingTime.status), a.keyword);
    for (const limit of Object.values(a.regLimit)) assert.equal(limit.basis, 'example', a.keyword);
  }
  const seed = clone();
  seed.analyses[0].regLimit.DW.basis = 'regulatory';
  assert.ok(validateSeed(seed).errors.some((e) => e.includes('must be labeled example')));
});

test('dry run is the default and makes no network calls', async () => {
  const calls = [];
  const fetchSpy = async (...args) => { calls.push(args); throw new Error('network used'); };
  const out = [];
  const original = console.log;
  console.log = (line) => out.push(line);
  try {
    const code = await main([], { SENAITE_URL: 'http://example.invalid', SENAITE_USER: 'u', SENAITE_PASS: 'p' }, fetchSpy);
    assert.equal(code, 0);
  } finally {
    console.log = original;
  }
  assert.equal(calls.length, 0);
  assert.match(out.join('\n'), /^DRY RUN/);
  assert.match(out.join('\n'), /Planned create calls: \d+/);
});

test('--apply refuses without env and without the patched acknowledgement', async () => {
  assert.throws(() => readApplyConfig({}), /missing env SENAITE_URL, SENAITE_USER, SENAITE_PASS/);
  assert.throws(() => readApplyConfig({ SENAITE_URL: 'http://x', SENAITE_USER: 'u', SENAITE_PASS: 'p' }), /SENAITE_PATCHED_ACK/);
  const calls = [];
  await assert.rejects(main(['--apply'], {}, async () => { calls.push(1); }), /missing env/);
  assert.equal(calls.length, 0);
  const cfg = readApplyConfig({ SENAITE_URL: 'http://x/', SENAITE_USER: 'u', SENAITE_PASS: 'p', SENAITE_PATCHED_ACK: REQUIRED_ACK });
  assert.equal(cfg.apiBase, 'http://x/senaite/@@API/senaite/v1');
});

test('plan covers every seed object and apply resolves references against a stub', async () => {
  const plan = buildPlan(SEED, 'senaite');
  const count = (type) => plan.filter((s) => s.body.portal_type === type).length;
  assert.equal(count('AnalysisRequest'), SEED.samples.length);
  assert.equal(count('AnalysisService'), SEED.analyses.length);
  assert.equal(count('SampleType'), SEED.sampleTypes.length);
  assert.equal(count('Client'), SEED.clients.length);

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
});

test('seed folder is synthetic-clean: no private identifiers and no em dashes', async () => {
  const dir = import.meta.dirname;
  const files = (await readdir(dir)).filter((f) => /\.(mjs|md)$/.test(f));
  const artifacts = await Promise.all(files.map(async (f) => ({ path: f, content: await readFile(join(dir, f), 'utf8') })));
  const dataOnly = artifacts.filter((a) => a.path === 'data.mjs');
  assert.deepEqual(findSyntheticPrivacyViolations([...dataOnly, { path: 'SEED', content: JSON.stringify(SEED) }]), []);
  for (const a of artifacts) assert.ok(!a.content.includes(String.fromCharCode(0x2014)), `${a.path} contains an em dash`);
  for (const c of SEED.clients) assert.match(c.name, /\(SYNTHETIC\)$/);
});
