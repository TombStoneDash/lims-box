#!/usr/bin/env node
// Loads the SYNTHETIC clinical and diagnostics demo seed into SENAITE.
//
// DEFAULT IS A DRY RUN: prints the planned create calls and makes no network
// calls. --apply uses the same gate and SENAITE calls as the environmental
// loader (../environmental/load.mjs): SENAITE_URL, SENAITE_USER, SENAITE_PASS,
// optional SENAITE_SITE, and SENAITE_PATCHED_ACK. Do not run --apply until the
// demo droplet copy is approved and patched. See README.

import { pathToFileURL } from 'node:url';
import { SEED } from './data.mjs';
import { validateSeed } from './validate.mjs';
import { applyPlan, formatDryRun, readApplyConfig } from '../environmental/load.mjs';

const ref = (name) => ({ $ref: name });

// Builds the ordered list of create calls. Pure: no I/O.
export function buildPlan(seed = SEED, site = 'senaite') {
  const steps = [];
  const root = `/${site}`;
  const categories = [...new Set(seed.analyses.map((a) => a.category))];
  for (const title of categories) {
    steps.push({
      ref: `category:${title}`,
      endpoint: 'create',
      lookup: { portal_type: 'AnalysisCategory', field: 'title', value: title },
      body: { portal_type: 'AnalysisCategory', parent_path: `${root}/setup/analysiscategories`, title },
    });
  }
  for (const t of seed.sampleTypes) {
    steps.push({
      ref: `sampletype:${t.code}`,
      endpoint: 'create',
      lookup: { portal_type: 'SampleType', field: 'title', value: t.title },
      body: {
        portal_type: 'SampleType',
        parent_path: `${root}/setup/sampletypes`,
        title: t.title,
        Prefix: t.prefix,
        description: `SYNTHETIC DEMO (${t.lab}). Container: ${t.container}.`,
      },
    });
  }
  for (const a of seed.analyses) {
    const range = a.reference ? ` Example reference interval ${a.reference.low}-${a.reference.high} ${a.unit}.` : '';
    steps.push({
      ref: `service:${a.keyword}`,
      endpoint: 'create',
      lookup: { portal_type: 'AnalysisService', field: 'title', value: a.title },
      body: {
        portal_type: 'AnalysisService',
        parent_path: `${root}/bika_setup/bika_analysisservices`,
        title: a.title,
        ShortTitle: a.keyword,
        Keyword: a.keyword,
        Unit: a.unit,
        PointOfCapture: 'lab',
        Category: ref(`category:${a.category}`),
        description: `SYNTHETIC DEMO (${a.lab}).${range} Example stability ${a.stability.hours} h (${a.stability.note}; ${a.stability.status}).`,
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
        SampleType: ref(`sampletype:${s.sampleType}`),
        Analyses: s.analyses.map((a) => ({ uid: ref(`service:${a.keyword}`) })),
        DateSampled: s.collectedAt,
        ClientSampleID: s.id,
        ClientReference: `SYNTHETIC DEMO ${s.subjectCode}`,
      },
    });
  }
  return steps;
}

export async function main(argv = process.argv.slice(2), env = process.env, fetchImpl = fetch) {
  const validation = validateSeed(SEED);
  if (!validation.ok) {
    console.error(validation.errors.join('\n'));
    return 1;
  }
  if (!argv.includes('--apply')) {
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
