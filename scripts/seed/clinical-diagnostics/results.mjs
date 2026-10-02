#!/usr/bin/env node
// Enters SYNTHETIC results for the clinical and diagnostics demo seed, after
// load.mjs has created the samples, and reports the QC runs. Remarks carry
// the seeded problems, all recomputed by the validator:
//   - holding-time breaches (one per lab)
//   - failed QC controls (one per lab); every result of that analysis is held
//   - one delta check (creatinine moved too far from the subject's prior result)
//   - one overdue instrument calibration (every result run on it after the due date)
//
// DEFAULT IS A DRY RUN: prints the planned results and QC runs and makes no
// network calls. --apply uses the same gate and SENAITE calls as the
// environmental results step (../environmental/results.mjs), submits results
// for review and never verifies. QC runs are reported, not written as SENAITE
// reference samples; the remarks carry the QC outcome.

import { pathToFileURL } from 'node:url';
import { SEED } from './data.mjs';
import { calibrationDue, evaluateControl, validateSeed } from './validate.mjs';
import { readApplyConfig } from '../environmental/load.mjs';
import { applyResults, formatDryRun } from '../environmental/results.mjs';

export function buildResults(seed = SEED) {
  const validation = validateSeed(seed);
  if (!validation.ok) throw new Error(`seed invalid: ${validation.errors.join('; ')}`);
  const defs = new Map(seed.analyses.map((a) => [a.keyword, a]));
  const { breaches, qcFailures, deltaFailures, overdueResults } = validation.summary;
  const key = (sampleId, keyword) => `${sampleId}|${keyword}`;
  const breachAt = new Map(breaches.map((b) => [key(b.sampleId, b.keyword), b]));
  const deltaAt = new Map(deltaFailures.map((d) => [key(d.sampleId, d.keyword), d]));
  const overdueAt = new Map(overdueResults.map((o) => [key(o.sampleId, o.keyword), o]));
  const failedQc = new Map(qcFailures.map((q) => [`${q.lab}|${q.keyword}`, q]));
  const instrumentName = new Map((seed.instruments ?? []).map((x) => [x.id, x.name]));

  const results = [];
  for (const sample of seed.samples) {
    for (const a of sample.analyses) {
      const def = defs.get(a.keyword);
      const remarks = [];
      const breach = breachAt.get(key(sample.id, a.keyword));
      if (breach) remarks.push(`HOLDING TIME EXCEEDED: tested ${breach.hours} h after collection; example limit ${breach.limitHours} h. Recollect or report with a comment.`);
      const qc = failedQc.get(`${sample.lab}|${a.keyword}`);
      if (qc) remarks.push(`QC FAILED in ${qc.batchId}: ${qc.detail}. Hold this result for review.`);
      const delta = deltaAt.get(key(sample.id, a.keyword));
      if (delta) remarks.push(`DELTA CHECK: ${delta.current} vs ${delta.prior} ${def.unit} on ${delta.priorAt.slice(0, 10)}; example limit ${delta.maxAbsChange} within ${delta.windowHours} h. Confirm before release.`);
      const overdue = overdueAt.get(key(sample.id, a.keyword));
      if (overdue) remarks.push(`CALIBRATION OVERDUE: run on ${instrumentName.get(overdue.instrument)}, calibration was due ${overdue.due}. Hold for review.`);
      results.push({
        clientSampleId: sample.id,
        keyword: a.keyword,
        senaiteKeyword: a.keyword,
        unit: def.unit,
        result: a.result,
        remarks: remarks.join(' '),
      });
    }
  }
  return results;
}

export function buildQcRuns(seed = SEED) {
  return seed.qcBatches.map((b) => ({
    batchId: b.id,
    lab: b.lab,
    keyword: b.keyword,
    runAt: b.runAt,
    controls: b.controls.map((c) => ({ control: c.control, ...evaluateControl(c) })),
  }));
}

export function formatQcRuns(runs, instruments = SEED.instruments ?? []) {
  const lines = runs.map((r) => {
    const failed = r.controls.filter((c) => !c.pass);
    return `QC ${r.batchId} ${r.keyword} ${r.runAt} ${failed.length ? `FAIL: ${failed.map((c) => c.detail).join('; ')}` : 'PASS'}`;
  });
  const calibration = instruments.map((x) => `CAL ${x.id} last ${x.lastCalibrated}, due ${calibrationDue(x)}`);
  return [...lines, ...calibration].join('\n');
}

export async function main(argv = process.argv.slice(2), env = process.env, fetchImpl = fetch) {
  const results = buildResults(SEED);
  if (!argv.includes('--apply')) {
    console.log(formatDryRun(results));
    console.log(formatQcRuns(buildQcRuns(SEED)));
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
