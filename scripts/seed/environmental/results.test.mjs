import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED } from './data.mjs';
import { buildResults, applyResults, main, syntheticResult } from './results.mjs';
import { REQUIRED_ACK } from './load.mjs';

const pairs = SEED.samples.reduce((n, s) => n + s.analyses.length, 0);

test('one deterministic result per sample analysis', () => {
  const first = buildResults(SEED);
  assert.equal(first.length, pairs);
  assert.deepEqual(buildResults(SEED), first);
});

test('remarks appear only on the seeded breach and on the failed QC batch analytes', () => {
  const flagged = buildResults(SEED).filter((r) => r.remarks);
  const breach = flagged.filter((r) => r.remarks.includes('HOLDING TIME EXCEEDED'));
  assert.equal(breach.length, 1);
  assert.equal(breach[0].clientSampleId, 'SYN-ENV-WW-0003');
  assert.equal(breach[0].keyword, 'BOD5');
  assert.match(breach[0].remarks, /55\.0 h after collection; limit 48 h/);

  const qcBatch = SEED.qcBatches.find((b) => b.id === 'SYN-QC-01');
  const qc = flagged.filter((r) => r.remarks.includes('QC BATCH SYN-QC-01 FAILED'));
  const expected = qcBatch.sampleIds.filter((id) => SEED.samples.find((s) => s.id === id).analyses.some((a) => a.keyword === 'PB'));
  assert.deepEqual(qc.map((r) => r.clientSampleId), expected);
  assert.ok(qc.every((r) => r.keyword === 'PB'));
  assert.equal(flagged.length, breach.length + qc.length);
});

test('no synthetic result exceeds its example regulatory limit', () => {
  const defs = new Map(SEED.analyses.map((a) => [a.keyword, a]));
  for (const r of buildResults(SEED)) {
    const sample = SEED.samples.find((s) => s.id === r.clientSampleId);
    const limit = defs.get(r.keyword).regLimit?.[sample.sampleType];
    if (limit && typeof limit.value === 'number') assert.ok(Number(r.result) < limit.value, `${r.clientSampleId}/${r.keyword}`);
    if (r.unit.startsWith('P/A')) assert.equal(r.result, 'Absent');
  }
});

test('numeric results without a limit are above the reporting limit', () => {
  const def = SEED.analyses.find((a) => a.keyword === 'TSS');
  assert.ok(Number(syntheticResult(def, 'SO', 0)) > def.rl);
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
  assert.match(out.join('\n'), /^DRY RUN/);
  assert.match(out.join('\n'), new RegExp(`Planned results: ${pairs} \\(with remarks: 6\\)`));
});

test('--apply refuses without env and without the patched acknowledgement', async () => {
  const calls = [];
  await assert.rejects(main(['--apply'], {}, async () => { calls.push(1); }), /missing env/);
  await assert.rejects(main(['--apply'], { SENAITE_URL: 'http://x', SENAITE_USER: 'u', SENAITE_PASS: 'p' }, async () => { calls.push(1); }), /SENAITE_PATCHED_ACK/);
  assert.equal(calls.length, 0);
});

test('apply looks up each sample once, then sets result, remark and submit per analysis', async () => {
  const results = buildResults(SEED);
  const posts = [];
  let gets = 0;
  const stub = async (url, init) => {
    const u = new URL(url);
    if (init.method === 'GET') {
      gets += 1;
      if (u.pathname.endsWith('/analysisrequest')) {
        const id = u.searchParams.get('getClientSampleID');
        return { ok: true, status: 200, text: async () => JSON.stringify({ items: [{ getId: `S-${id}` }] }) };
      }
      const sampleId = u.searchParams.get('getRequestID').slice(2);
      const rows = results.filter((r) => r.clientSampleId === sampleId);
      return { ok: true, status: 200, text: async () => JSON.stringify({ items: rows.map((r) => ({ uid: `${sampleId}:${r.senaiteKeyword}`, getKeyword: r.senaiteKeyword })) }) };
    }
    posts.push(JSON.parse(init.body));
    return { ok: true, status: 200, text: async () => '{"items":[{}]}' };
  };
  const written = await applyResults(results, { apiBase: 'http://stub/senaite/@@API/senaite/v1', auth: 'Basic x', site: 'senaite' }, stub, () => {});
  assert.equal(written, results.length);
  assert.equal(gets, SEED.samples.length * 2);
  assert.equal(posts.filter((p) => 'Result' in p).length, results.length);
  assert.equal(posts.filter((p) => 'Remarks' in p).length, 6);
  assert.equal(posts.filter((p) => p.transition === 'submit').length, results.length);
  assert.ok(!posts.some((p) => p.transition && p.transition !== 'submit'), 'never verifies or publishes');
});

test('apply stops at the first sample that load.mjs has not created', async () => {
  const stub = async () => ({ ok: true, status: 200, text: async () => '{"items":[]}' });
  await assert.rejects(
    applyResults(buildResults(SEED), { apiBase: 'http://stub', auth: 'Basic x' }, stub, () => {}),
    /sample not found; run load\.mjs --apply first/,
  );
});

test('the acknowledgement constant is shared with the loader', () => {
  assert.equal(REQUIRED_ACK, 'GHSA-jrw6-7x4q-w25j');
});
