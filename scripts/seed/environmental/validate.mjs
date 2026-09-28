#!/usr/bin/env node
// Pure validator for the environmental demo seed. No network, no file writes.
// Usage: node scripts/seed/environmental/validate.mjs

import { pathToFileURL } from 'node:url';
import { FLAGS, SEED, SYNTHETIC_MARKER } from './data.mjs';

const HOUR = 3_600_000;
const HT_STATUSES = new Set(['SOURCED', 'CITED', 'UNVERIFIED']);

export function hoursBetween(startIso, endIso) {
  return (Date.parse(endIso) - Date.parse(startIso)) / HOUR;
}

export function isHoldingTimeBreach(collectedAt, analyzedAt, limitHours) {
  return hoursBetween(collectedAt, analyzedAt) > limitHours;
}

export function recoveryPercent(entry) {
  const native = entry.native ?? 0;
  return ((entry.measured - native) / entry.spike) * 100;
}

export function rpdPercent(a, b) {
  const mean = (a + b) / 2;
  return mean === 0 ? 0 : (Math.abs(a - b) / mean) * 100;
}

function inRange(value, [low, high]) {
  return value >= low && value <= high;
}

// Returns { pass, detail } for one QC entry.
export function evaluateQc(entry, method, analysis, pairedMsd) {
  const limits = method.qc;
  if (entry.type === 'method_blank') {
    if (limits.blank === 'absent') return { pass: entry.observed === 'Absent', detail: `blank observed ${entry.observed}` };
    return { pass: entry.measured < analysis.rl, detail: `blank ${entry.measured} vs RL ${analysis.rl}` };
  }
  if (entry.type === 'lcs') {
    if (limits.lcs === 'present') return { pass: entry.observed === 'Present', detail: `positive control ${entry.observed}` };
    const rec = recoveryPercent(entry);
    return { pass: inRange(rec, limits.lcs), detail: `LCS recovery ${rec.toFixed(1)}% vs ${limits.lcs.join('-')}%` };
  }
  if (entry.type === 'ms' || entry.type === 'msd') {
    if (!limits.ms) return { pass: false, detail: `${entry.type} not defined for this method` };
    const rec = recoveryPercent(entry);
    let pass = inRange(rec, limits.ms);
    let detail = `${entry.type.toUpperCase()} recovery ${rec.toFixed(1)}% vs ${limits.ms.join('-')}%`;
    if (entry.type === 'msd' && pairedMsd) {
      const rpd = rpdPercent(pairedMsd.measured, entry.measured);
      pass = pass && rpd <= limits.rpd;
      detail += `, RPD ${rpd.toFixed(1)}% vs <= ${limits.rpd}%`;
    }
    return { pass, detail };
  }
  return { pass: false, detail: `unknown QC type ${entry.type}` };
}

export function validateSeed(seed = SEED) {
  const errors = [];
  const err = (msg) => errors.push(msg);
  const analyses = new Map(seed.analyses.map((a) => [a.keyword, a]));
  const clients = new Map(seed.clients.map((c) => [c.id, c]));
  const types = new Set(seed.sampleTypes.map((t) => t.code));
  const breaches = [];
  const qcFailures = [];

  if (seed.synthetic !== true) err('seed.synthetic must be true');

  // Catalog
  for (const a of seed.analyses) {
    if (!seed.methods[a.method]) err(`${a.keyword}: unknown method ${a.method}`);
    if (!seed.containers[a.container]) err(`${a.keyword}: unknown container ${a.container}`);
    for (const m of a.matrices) if (!types.has(m)) err(`${a.keyword}: unknown matrix ${m}`);
    const h = a.holdingTime;
    if (!h || !(h.hours > 0)) err(`${a.keyword}: holding time missing`);
    else {
      if (!h.source) err(`${a.keyword}: holding time has no source`);
      if (!HT_STATUSES.has(h.status)) err(`${a.keyword}: holding time status must be SOURCED, CITED or UNVERIFIED`);
      if (h.status === 'SOURCED' && !(h.ref && /^https:\/\/(www\.ecfr\.gov|www\.epa\.gov)\//.test(h.url ?? ''))) {
        err(`${a.keyword}: SOURCED holding time needs a ref and an official ecfr.gov or epa.gov url`);
      }
    }
    for (const [matrix, limit] of Object.entries(a.regLimit ?? {})) {
      if (limit.basis !== 'example') err(`${a.keyword}/${matrix}: regulatory limit must be labeled example`);
    }
  }
  for (const c of seed.clients) {
    if (!c.name.includes(SYNTHETIC_MARKER)) err(`${c.id}: client name lacks ${SYNTHETIC_MARKER}`);
  }

  // Samples and holding times
  const count = seed.samples.length;
  if (count < 20 || count > 40) err(`sample count ${count} outside 20-40`);
  const ids = new Set();
  for (const s of seed.samples) {
    if (ids.has(s.id)) err(`duplicate sample id ${s.id}`);
    ids.add(s.id);
    if (!clients.has(s.client)) err(`${s.id}: unknown client ${s.client}`);
    if (!types.has(s.sampleType)) err(`${s.id}: unknown sample type ${s.sampleType}`);
    if (hoursBetween(s.collectedAt, s.receivedAt) < 0) err(`${s.id}: received before collected`);
    for (const a of s.analyses) {
      const def = analyses.get(a.keyword);
      if (!def) { err(`${s.id}: unknown analysis ${a.keyword}`); continue; }
      if (!def.matrices.includes(s.sampleType)) err(`${s.id}: ${a.keyword} not valid for ${s.sampleType}`);
      if (hoursBetween(s.collectedAt, a.analyzedAt) < 0) err(`${s.id}/${a.keyword}: analyzed before collected`);
      const breach = isHoldingTimeBreach(s.collectedAt, a.analyzedAt, def.holdingTime.hours);
      const flagged = a.flags.includes(FLAGS.HOLDING_TIME_BREACH);
      if (breach !== flagged) err(`${s.id}/${a.keyword}: holding-time flag ${flagged} but computed breach ${breach}`);
      if (breach) breaches.push({ sampleId: s.id, keyword: a.keyword, hours: hoursBetween(s.collectedAt, a.analyzedAt), limitHours: def.holdingTime.hours });
    }
  }
  if (breaches.length !== 1) err(`expected exactly one holding-time breach, found ${breaches.length}`);

  // QC
  const covered = new Set();
  for (const b of seed.qcBatches) {
    const method = seed.methods[b.method];
    if (!method) { err(`${b.id}: unknown method ${b.method}`); continue; }
    for (const id of b.sampleIds) if (!ids.has(id)) err(`${b.id}: unknown sample ${id}`);
    const keywords = new Set(b.qc.map((q) => q.keyword));
    for (const keyword of keywords) {
      const def = analyses.get(keyword);
      if (!def || def.method !== b.method) { err(`${b.id}: ${keyword} is not a ${b.method} analysis`); continue; }
      const entries = b.qc.filter((q) => q.keyword === keyword);
      const needed = ['method_blank', 'lcs', ...(method.qc.ms ? ['ms', 'msd'] : [])];
      for (const type of needed) if (!entries.some((q) => q.type === type)) err(`${b.id}/${keyword}: missing ${type}`);
      const ms = entries.find((q) => q.type === 'ms');
      for (const q of entries) {
        if ((q.type === 'ms' || q.type === 'msd') && !b.sampleIds.includes(q.sampleId)) err(`${b.id}/${keyword}: ${q.type} parent not in batch`);
        const { pass, detail } = evaluateQc(q, method, def, q.type === 'msd' ? ms : undefined);
        const flagged = q.flags.includes(FLAGS.QC_FAILURE);
        if (pass === flagged) err(`${b.id}/${keyword}/${q.type}: QC flag ${flagged} but computed pass ${pass} (${detail})`);
        if (!pass) qcFailures.push({ batchId: b.id, method: b.method, keyword, type: q.type, detail });
      }
    }
    for (const id of b.sampleIds) {
      const sample = seed.samples.find((s) => s.id === id);
      for (const a of sample?.analyses ?? []) if (analyses.get(a.keyword)?.method === b.method) covered.add(`${id}|${a.keyword}`);
    }
  }
  for (const s of seed.samples) {
    for (const a of s.analyses) if (!covered.has(`${s.id}|${a.keyword}`)) err(`${s.id}/${a.keyword}: not in any QC batch`);
  }
  if (qcFailures.length !== 1) err(`expected exactly one QC failure, found ${qcFailures.length}`);

  return { ok: errors.length === 0, errors, summary: { samples: count, breaches, qcFailures } };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = validateSeed();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
