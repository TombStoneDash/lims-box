#!/usr/bin/env node
// Enters SYNTHETIC results for the environmental demo seed, after load.mjs has
// created the samples. It gives the demo its two on-screen catches: the BOD5
// holding-time breach and the lead LCS failure, as remarks on those analyses.
//
// DEFAULT IS A DRY RUN: prints the planned calls and makes no network calls.
// --apply uses the same gate as load.mjs (SENAITE_URL, SENAITE_USER,
// SENAITE_PASS, SENAITE_PATCHED_ACK). Run it once, after load.mjs --apply.
//
// SENAITE calls: `analysis?getRequestID=`, `update {uid, Result}` and
// `update {uid, transition: 'submit'}` match the LIAISON importer that worked on
// the London demo box (lims-bot-demo tools/import_results.py). Looking a sample
// up by `getClientSampleID`, writing `Remarks`, and a text result such as
// "Absent" on a service with no result options are UNVERIFIED on this build.

import { pathToFileURL } from 'node:url';
import { SEED } from './data.mjs';
import { validateSeed, hoursBetween } from './validate.mjs';
import { readApplyConfig } from './load.mjs';

const NUMERIC_FACTORS = [0.12, 0.25, 0.4, 0.18, 0.33];
const RL_MULTIPLES = [3, 5, 8, 12, 4];

function round4(value) {
  return Number(value.toPrecision(4));
}

// Deterministic synthetic result. Numeric results stay below any example limit
// so the only problems on screen are the two seeded ones.
export function syntheticResult(def, matrix, index) {
  if (def.unit.startsWith('P/A')) return 'Absent';
  const limit = def.regLimit?.[matrix];
  if (limit && typeof limit.value === 'number') {
    return String(round4(limit.value * NUMERIC_FACTORS[index % NUMERIC_FACTORS.length]));
  }
  return String(round4(def.rl * RL_MULTIPLES[index % RL_MULTIPLES.length]));
}

export function buildResults(seed = SEED) {
  const validation = validateSeed(seed);
  if (!validation.ok) throw new Error(`seed invalid: ${validation.errors.join('; ')}`);
  const defs = new Map(seed.analyses.map((a) => [a.keyword, a]));
  const breaches = new Map(validation.summary.breaches.map((b) => [`${b.sampleId}|${b.keyword}`, b]));
  const qcHold = new Map();
  for (const failure of validation.summary.qcFailures) {
    const batch = seed.qcBatches.find((b) => b.id === failure.batchId);
    for (const sampleId of batch.sampleIds) qcHold.set(`${sampleId}|${failure.keyword}`, failure);
  }

  const results = [];
  let index = 0;
  for (const sample of seed.samples) {
    for (const analysis of sample.analyses) {
      const def = defs.get(analysis.keyword);
      const key = `${sample.id}|${analysis.keyword}`;
      const remarks = [];
      const breach = breaches.get(key);
      if (breach) {
        remarks.push(`HOLDING TIME EXCEEDED: set up ${breach.hours.toFixed(1)} h after collection; limit ${breach.limitHours} h (${def.holdingTime.source}). Report with a qualifier or recollect.`);
      }
      const qc = qcHold.get(key);
      if (qc) {
        remarks.push(`QC BATCH ${qc.batchId} FAILED: ${qc.detail} (example limits). Hold this result for review.`);
      }
      results.push({
        clientSampleId: sample.id,
        keyword: analysis.keyword,
        senaiteKeyword: analysis.keyword.replace(/-/g, '_'),
        unit: def.unit,
        result: syntheticResult(def, sample.sampleType, index),
        hoursToAnalysis: round4(hoursBetween(sample.collectedAt, analysis.analyzedAt)),
        remarks: remarks.join(' '),
      });
      index += 1;
    }
  }
  return results;
}

export function formatDryRun(results) {
  const lines = results.map((r, i) =>
    `${String(i + 1).padStart(3, '0')} ${r.clientSampleId} ${r.senaiteKeyword} = ${r.result} ${r.unit}${r.remarks ? ` | REMARK: ${r.remarks}` : ''}`);
  const flagged = results.filter((r) => r.remarks).length;
  return [
    'DRY RUN (default). No network calls made. Pass --apply to write (see README gates).',
    ...lines,
    `Planned results: ${results.length} (with remarks: ${flagged})`,
  ].join('\n');
}

export async function applyResults(results, { apiBase, auth }, fetchImpl = fetch, log = console.log) {
  const headers = { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' };
  async function call(method, endpoint, body) {
    const res = await fetchImpl(`${apiBase}/${endpoint}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${endpoint}: HTTP ${res.status} ${text.slice(0, 200)}`);
    return JSON.parse(text);
  }
  const bySample = new Map();
  for (const r of results) {
    if (!bySample.has(r.clientSampleId)) bySample.set(r.clientSampleId, []);
    bySample.get(r.clientSampleId).push(r);
  }
  let written = 0;
  for (const [clientSampleId, rows] of bySample) {
    const found = await call('GET', `analysisrequest?${new URLSearchParams({ getClientSampleID: clientSampleId })}`);
    const sample = found.items?.[0];
    if (!sample?.getId) throw new Error(`${clientSampleId}: sample not found; run load.mjs --apply first`);
    const analyses = (await call('GET', `analysis?${new URLSearchParams({ getRequestID: sample.getId })}`)).items ?? [];
    for (const r of rows) {
      const analysis = analyses.find((a) => a.getKeyword === r.senaiteKeyword);
      if (!analysis?.uid) throw new Error(`${clientSampleId}/${r.senaiteKeyword}: analysis not found`);
      await call('POST', 'update', { uid: analysis.uid, Result: r.result });
      if (r.remarks) await call('POST', 'update', { uid: analysis.uid, Remarks: r.remarks });
      await call('POST', 'update', { uid: analysis.uid, transition: 'submit' });
      written += 1;
      log(`result  ${clientSampleId}/${r.senaiteKeyword}`);
    }
  }
  return written;
}

export async function main(argv = process.argv.slice(2), env = process.env, fetchImpl = fetch) {
  const results = buildResults(SEED);
  if (!argv.includes('--apply')) {
    console.log(formatDryRun(results));
    return 0;
  }
  const config = readApplyConfig(env);
  const written = await applyResults(results, config, fetchImpl);
  console.log(`Apply finished. ${written} results entered and submitted for review; nothing verified.`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then((code) => process.exit(code), (error) => {
    console.error(error.message);
    process.exit(1);
  });
}
