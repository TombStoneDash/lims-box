#!/usr/bin/env node
// Pure validator for the clinical and diagnostics demo seed. No network, no writes.
// Usage: node scripts/seed/clinical-diagnostics/validate.mjs

import { pathToFileURL } from 'node:url';
import { FLAGS, SEED, SYNTHETIC_MARKER } from './data.mjs';

const HOUR = 3_600_000;
// A sample must never carry these, even as empty fields.
export const FORBIDDEN_SAMPLE_FIELDS = ['patientName', 'name', 'dob', 'dateOfBirth', 'mrn', 'address', 'phone', 'ssn'];

export function hoursBetween(startIso, endIso) {
  return (Date.parse(endIso) - Date.parse(startIso)) / HOUR;
}

export function isStabilityBreach(collectedAt, testedAt, limitHours) {
  return hoursBetween(collectedAt, testedAt) > limitHours;
}

export function zScore(control) {
  return (control.measured - control.mean) / control.sd;
}

// Westgard 1-3s for quantitative controls; expected result for qualitative ones.
export function evaluateControl(control) {
  if ('expected' in control) {
    return { pass: control.observed === control.expected, detail: `${control.control}: ${control.observed}, expected ${control.expected}` };
  }
  const z = zScore(control);
  return { pass: Math.abs(z) <= 3, detail: `${control.control}: ${control.measured} vs ${control.mean} +/- ${control.sd} (${z.toFixed(1)} SD)` };
}

export function validateSeed(seed = SEED) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (seed.synthetic !== true) err('seed must declare synthetic: true');

  const labs = new Set(seed.labs.map((l) => l.id));
  for (const l of seed.labs) if (!l.name.endsWith(SYNTHETIC_MARKER)) err(`${l.id}: lab name lacks ${SYNTHETIC_MARKER}`);
  const types = new Map(seed.sampleTypes.map((t) => [t.code, t]));
  const analyses = new Map(seed.analyses.map((a) => [a.keyword, a]));
  const clients = new Map(seed.clients.map((c) => [c.id, c]));
  for (const c of seed.clients) {
    if (!c.name.endsWith(SYNTHETIC_MARKER)) err(`${c.id}: client name lacks ${SYNTHETIC_MARKER}`);
    if (!labs.has(c.lab)) err(`${c.id}: unknown lab ${c.lab}`);
  }
  for (const a of seed.analyses) {
    if (!labs.has(a.lab)) err(`${a.keyword}: unknown lab ${a.lab}`);
    if (types.get(a.matrix)?.lab !== a.lab) err(`${a.keyword}: sample type ${a.matrix} belongs to another lab`);
    if (a.stability?.basis !== 'example') err(`${a.keyword}: stability limit must be labelled example`);
    if (!(a.stability?.hours > 0)) err(`${a.keyword}: stability hours must be positive`);
  }

  const breaches = [];
  const ids = new Set();
  for (const s of seed.samples) {
    if (ids.has(s.id)) err(`duplicate sample id ${s.id}`);
    ids.add(s.id);
    for (const field of FORBIDDEN_SAMPLE_FIELDS) if (field in s) err(`${s.id}: sample carries forbidden field ${field}`);
    if (!/^SYN-/.test(s.id) || !/^SYN-SUBJ-/.test(s.subjectCode ?? '')) err(`${s.id}: ids must be synthetic (SYN-)`);
    const client = clients.get(s.client);
    if (!client) { err(`${s.id}: unknown client ${s.client}`); continue; }
    if (client.lab !== s.lab || types.get(s.sampleType)?.lab !== s.lab) err(`${s.id}: client, sample type and lab disagree`);
    if (hoursBetween(s.collectedAt, s.receivedAt) < 0) err(`${s.id}: received before collected`);
    for (const a of s.analyses) {
      const def = analyses.get(a.keyword);
      if (!def) { err(`${s.id}: unknown analysis ${a.keyword}`); continue; }
      if (def.matrix !== s.sampleType) err(`${s.id}: ${a.keyword} is not run on ${s.sampleType}`);
      if (hoursBetween(s.collectedAt, a.testedAt) < 0) err(`${s.id}/${a.keyword}: tested before collected`);
      const breach = isStabilityBreach(s.collectedAt, a.testedAt, def.stability.hours);
      const flagged = a.flags.includes(FLAGS.HOLDING_TIME_BREACH);
      if (breach !== flagged) err(`${s.id}/${a.keyword}: holding-time flag ${flagged} but computed breach ${breach}`);
      if (breach) breaches.push({ lab: s.lab, sampleId: s.id, keyword: a.keyword, hours: hoursBetween(s.collectedAt, a.testedAt), limitHours: def.stability.hours });
    }
  }

  const qcFailures = [];
  for (const b of seed.qcBatches) {
    const def = analyses.get(b.keyword);
    if (!def || def.lab !== b.lab) { err(`${b.id}: ${b.keyword} is not a ${b.lab} analysis`); continue; }
    if (b.controls.length < 2) err(`${b.id}: needs at least two controls`);
    for (const c of b.controls) {
      const { pass, detail } = evaluateControl(c);
      const flagged = c.flags.includes(FLAGS.QC_FAILURE);
      if (pass === flagged) err(`${b.id}/${c.control}: QC flag ${flagged} but computed pass ${pass} (${detail})`);
      if (!pass) qcFailures.push({ lab: b.lab, batchId: b.id, keyword: b.keyword, control: c.control, detail });
    }
  }

  for (const lab of labs) {
    const nBreach = breaches.filter((b) => b.lab === lab).length;
    const nQc = qcFailures.filter((q) => q.lab === lab).length;
    if (nBreach !== 1) err(`${lab}: expected exactly one holding-time breach, found ${nBreach}`);
    if (nQc !== 1) err(`${lab}: expected exactly one QC failure, found ${nQc}`);
  }

  return { ok: errors.length === 0, errors, summary: { samples: seed.samples.length, breaches, qcFailures } };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = validateSeed();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
