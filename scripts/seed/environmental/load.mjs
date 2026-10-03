#!/usr/bin/env node
// Loads the SYNTHETIC environmental demo seed into SENAITE via its JSON API.
//
// DEFAULT IS A DRY RUN: prints the planned create calls and makes no network
// calls. A real run needs --apply AND all of:
//   SENAITE_URL          base URL, e.g. http://127.0.0.1:8081 (no trailing /)
//   SENAITE_USER         SENAITE user
//   SENAITE_PASS         SENAITE password
//   SENAITE_SITE         site id (default: senaite)
//   SENAITE_PATCHED_ACK  must equal GHSA-jrw6-7x4q-w25j, confirming the target
//                        runs a SENAITE build with that advisory fixed
//
// Do not run --apply until Hudson has given GO for the demo droplet. See README.

import { pathToFileURL } from 'node:url';
import { SEED } from './data.mjs';
import { validateSeed } from './validate.mjs';

export const REQUIRED_ACK = 'GHSA-jrw6-7x4q-w25j';
const ref = (name) => ({ $ref: name });

// Builds the ordered list of create calls. Pure: no I/O.
export function buildPlan(seed = SEED, site = 'senaite') {
  const steps = [];
  const root = `/${site}`;
  const byType = new Map(seed.sampleTypes.map((t) => [t.code, t]));

  const categories = [...new Set(seed.analyses.map((a) => a.category))];
  for (const title of categories) {
    steps.push({
      ref: `category:${title}`,
      endpoint: 'create',
      lookup: { portal_type: 'AnalysisCategory', field: 'title', value: title },
      body: { portal_type: 'AnalysisCategory', parent_path: `${root}/setup/analysiscategories`, title },
    });
  }

  for (const [code, method] of Object.entries(seed.methods)) {
    steps.push({
      ref: `method:${code}`,
      endpoint: 'create',
      lookup: { portal_type: 'Method', field: 'title', value: method.title },
      body: {
        portal_type: 'Method',
        parent_path: `${root}/methods`,
        title: method.title,
        description: `SYNTHETIC DEMO. QC limits (${method.qcBasis}): ${JSON.stringify(method.qc)}`,
      },
    });
  }

  for (const t of seed.sampleTypes) {
    const bottles = [...new Set(seed.analyses.filter((a) => a.matrices.includes(t.code)).map((a) => a.container))]
      .map((key) => `${seed.containers[key].title} (${seed.containers[key].preservation})`);
    steps.push({
      ref: `sampletype:${t.code}`,
      endpoint: 'create',
      lookup: { portal_type: 'SampleType', field: 'title', value: t.title },
      body: {
        portal_type: 'SampleType',
        parent_path: `${root}/setup/sampletypes`,
        title: t.title,
        Prefix: t.prefix,
        description: `SYNTHETIC DEMO. ${t.description} Containers: ${bottles.join('; ')}`,
      },
    });
  }

  for (const a of seed.analyses) {
    const h = a.holdingTime;
    steps.push({
      ref: `service:${a.keyword}`,
      endpoint: 'create',
      lookup: { portal_type: 'AnalysisService', field: 'title', value: a.title },
      body: {
        portal_type: 'AnalysisService',
        parent_path: `${root}/bika_setup/bika_analysisservices`,
        title: a.title,
        ShortTitle: a.keyword,
        Keyword: a.keyword.replace(/-/g, '_'),
        Unit: a.unit,
        PointOfCapture: 'lab',
        Category: ref(`category:${a.category}`),
        description: `SYNTHETIC DEMO. Method ${a.method}. RL ${a.rl ?? 'n/a'} ${a.unit}. Holding time ${h.hours} h (${h.status}; ${h.source}).`,
      },
    });
  }

  for (const c of seed.clients) {
    steps.push({
      ref: `client:${c.id}`,
      endpoint: 'create',
      lookup: { portal_type: 'Client', field: 'title', value: c.name },
      body: { portal_type: 'Client', parent_path: `${root}/clients`, title: c.name, ClientID: c.id },
    });
    steps.push({
      ref: `contact:${c.id}`,
      endpoint: 'create',
      lookup: null,
      body: { portal_type: 'Contact', parent_uid: ref(`client:${c.id}`), Firstname: c.contact.first, Surname: c.contact.last },
    });
  }

  for (const s of seed.samples) {
    steps.push({
      ref: `sample:${s.id}`,
      endpoint: 'analysisrequest',
      lookup: null,
      body: {
        portal_type: 'AnalysisRequest',
        Client: ref(`client:${s.client}`),
        Contact: ref(`contact:${s.client}`),
        SampleType: ref(`sampletype:${byType.get(s.sampleType).code}`),
        Analyses: s.analyses.map((a) => ({ uid: ref(`service:${a.keyword}`) })),
        DateSampled: s.collectedAt,
        ClientSampleID: s.id,
        ClientReference: 'SYNTHETIC DEMO',
      },
    });
  }
  return steps;
}

function resolveRefs(value, uids) {
  if (Array.isArray(value)) return value.map((v) => resolveRefs(v, uids));
  if (value && typeof value === 'object') {
    if ('$ref' in value) {
      const uid = uids.get(value.$ref);
      if (!uid) throw new Error(`unresolved reference ${value.$ref}`);
      return uid;
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveRefs(v, uids)]));
  }
  return value;
}

export function formatDryRun(plan) {
  const lines = plan.map((s, i) => `${String(i + 1).padStart(3, '0')} POST ${s.endpoint} ${JSON.stringify(s.body)}`);
  return [
    'DRY RUN (default). No network calls made. Pass --apply to write (see README gates).',
    ...lines,
    `Planned create calls: ${plan.length}`,
  ].join('\n');
}

export function readApplyConfig(env) {
  const missing = ['SENAITE_URL', 'SENAITE_USER', 'SENAITE_PASS'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`--apply refused: missing env ${missing.join(', ')}`);
  if (env.SENAITE_PATCHED_ACK !== REQUIRED_ACK) {
    throw new Error(`--apply refused: set SENAITE_PATCHED_ACK=${REQUIRED_ACK} only after confirming the target SENAITE is patched`);
  }
  return {
    apiBase: `${env.SENAITE_URL.replace(/\/+$/, '')}/${env.SENAITE_SITE || 'senaite'}/@@API/senaite/v1`,
    auth: `Basic ${Buffer.from(`${env.SENAITE_USER}:${env.SENAITE_PASS}`).toString('base64')}`,
    site: env.SENAITE_SITE || 'senaite',
  };
}

export async function applyPlan(plan, { apiBase, auth }, fetchImpl = fetch, log = console.log) {
  const headers = { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' };
  async function call(method, endpoint, body) {
    const res = await fetchImpl(`${apiBase}/${endpoint}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${endpoint}: HTTP ${res.status} ${text.slice(0, 200)}`);
    return JSON.parse(text);
  }
  const uids = new Map();
  for (const step of plan) {
    if (step.lookup) {
      const q = `search?portal_type=${encodeURIComponent(step.lookup.portal_type)}&${step.lookup.field}=${encodeURIComponent(step.lookup.value)}&limit=1`;
      const found = await call('GET', q);
      if (found.items?.length) {
        uids.set(step.ref, found.items[0].uid);
        log(`exists  ${step.ref}`);
        continue;
      }
    }
    const created = await call('POST', step.endpoint, resolveRefs(step.body, uids));
    const item = created.items?.[0] ?? created;
    if (!item.uid) throw new Error(`${step.ref}: create returned no uid`);
    uids.set(step.ref, item.uid);
    log(`created ${step.ref}`);
  }
  return uids;
}

export async function main(argv = process.argv.slice(2), env = process.env, fetchImpl = fetch) {
  const apply = argv.includes('--apply');
  const validation = validateSeed(SEED);
  if (!validation.ok) {
    console.error(validation.errors.join('\n'));
    return 1;
  }
  if (!apply) {
    console.log(formatDryRun(buildPlan(SEED, env.SENAITE_SITE || 'senaite')));
    return 0;
  }
  const config = readApplyConfig(env);
  await applyPlan(buildPlan(SEED, config.site), config, fetchImpl);
  console.log('Apply finished. Samples are created without results; see README.');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then((code) => process.exit(code), (error) => {
    console.error(error.message);
    process.exit(1);
  });
}
