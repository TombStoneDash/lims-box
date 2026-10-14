import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { CLINICAL_LAB_PROFILE, getLabProfile, LAB_SLUGS, labDemoPath } from '../lib/demo-labs';
import {
  LEGACY_PILOT_BASE,
  LEGACY_PILOT_REDIRECTS,
  LEGACY_PILOT_SUBPATHS,
  legacyPilotRedirectTarget,
  resolveLegacyPilotRedirect,
} from '../lib/demo-labs/redirects';
import { DEFAULT_SYNTHETIC_BRAND } from '../lib/ohworks-brand';
import {
  discoveryGates,
  getApprovedSourceIds,
  pilotMeta,
  syntheticSamples,
  workflowEvaluations,
} from '../lib/ohworks-pilot';

// Pages are compiled with the classic JSX runtime under tsx, so expose React globally.
(globalThis as { React?: typeof React }).React = React;

const root = resolve(import.meta.dirname, '..');
const demoRoot = 'app/demo/labs/[labType]';
const routeFiles = [
  `${demoRoot}/layout.tsx`,
  `${demoRoot}/_components/role-switch.tsx`,
  `${demoRoot}/page.tsx`,
  `${demoRoot}/samples/page.tsx`,
  `${demoRoot}/instrument/page.tsx`,
  `${demoRoot}/qc/page.tsx`,
  `${demoRoot}/result-review/page.tsx`,
  `${demoRoot}/critical-results/page.tsx`,
  `${demoRoot}/reports/page.tsx`,
  `${demoRoot}/personnel/page.tsx`,
  `${demoRoot}/audit/page.tsx`,
  `${demoRoot}/bot/page.tsx`,
  `${demoRoot}/bot/assistant-console.tsx`,
  `${demoRoot}/bot/api/route.ts`,
];
const docs = [
  'README.md',
  'SOURCE_REGISTER.md',
  'REQUIREMENTS.md',
  'ARCHITECTURE.md',
  'DATA_DICTIONARY.md',
  'SECURITY_AND_PRIVACY.md',
  'UAT_SCRIPT.md',
  'DEPLOY_CHECKLIST.md',
  'RISK_REGISTER.md',
  'ROLLBACK.md',
  'CHANGE_LOG.md',
  'DEMO_CONTRACT.md',
  'GARY_QUESTION_ANSWER_MATRIX.md',
];

// Page modules under the dynamic segment, keyed by profile-relative path.
const pageModules: Record<string, string> = {
  '': `../${demoRoot}/page`,
  '/samples': `../${demoRoot}/samples/page`,
  '/accessions': `../${demoRoot}/accessions/page`,
  '/instrument': `../${demoRoot}/instrument/page`,
  '/qc': `../${demoRoot}/qc/page`,
  '/result-review': `../${demoRoot}/result-review/page`,
  '/critical-results': `../${demoRoot}/critical-results/page`,
  '/reports': `../${demoRoot}/reports/page`,
  '/personnel': `../${demoRoot}/personnel/page`,
  '/audit': `../${demoRoot}/audit/page`,
  '/bot': `../${demoRoot}/bot/page`,
};

type PageModule = {
  default: (props: {
    params: Promise<{ labType: string }>;
    searchParams?: Promise<{ role?: string }>;
  }) => Promise<React.ReactElement>;
};

async function renderPage(path: string, labType: string, role = 'reviewer'): Promise<string> {
  const page = (await import(pageModules[path])) as PageModule;
  const element = await page.default({
    params: Promise.resolve({ labType }),
    searchParams: Promise.resolve({ role }),
  });
  return renderToStaticMarkup(element);
}

test('demo remains synthetic, supervised, and discovery-only in route copy', () => {
  const combined = routeFiles.map((file) => readFileSync(resolve(root, file), 'utf8')).join('\n');
  assert.match(combined, /Synthetic demonstration data only/i);
  assert.match(combined, /Demo role simulator - not authentication/i);
  assert.match(combined, /LIAISON XL.*Orchidlive.*hypothesis/i);
  assert.match(combined, /distinct authorized technical-review event/i);
  assert.doesNotMatch(combined, /production[- ]ready/i);
  assert.doesNotMatch(combined, /live integration is supported/i);
  assert.doesNotMatch(combined, /\b(?:is|are|now)\s+(?:accredited|certified|validated)\b/i);
});

test('no page under /demo/labs shows the retired pilot customer name', () => {
  // Identifiers such as askOHWorksAssistant come from lib/ohworks-* (renamed in a later packet);
  // the check is for the standalone word a visitor could read, not import paths or symbols.
  const standaloneName = /(?<![A-Za-z])OHWorks(?![A-Za-z])/;
  for (const file of routeFiles.concat(`${demoRoot}/accessions/page.tsx`)) {
    const source = readFileSync(resolve(root, file), 'utf8')
      .split('\n')
      .filter((line) => !/^\s*import\b/.test(line))
      .join('\n');
    assert.doesNotMatch(source, standaloneName, `${file} still names the retired pilot`);
  }
});

test('the clinical profile is fictional, frozen, and owns the synthetic brand tokens', () => {
  assert.deepEqual([...LAB_SLUGS], ['clinical']);
  assert.equal(getLabProfile('clinical'), CLINICAL_LAB_PROFILE);
  assert.equal(getLabProfile('nope'), undefined);
  assert.equal(getLabProfile(undefined), undefined);
  assert.equal(CLINICAL_LAB_PROFILE.sector, 'clinical');
  assert.doesNotMatch(CLINICAL_LAB_PROFILE.displayName, /ohworks/i);
  assert.equal(CLINICAL_LAB_PROFILE.volumeRange.unit, 'samples/yr');
  assert.ok(Object.isFrozen(CLINICAL_LAB_PROFILE));
  assert.equal(DEFAULT_SYNTHETIC_BRAND, CLINICAL_LAB_PROFILE.brand);
  assert.equal(labDemoPath('clinical'), '/demo/labs/clinical');
  assert.equal(labDemoPath('clinical', '/qc'), '/demo/labs/clinical/qc');
});

test('/demo/labs/clinical renders every panel with the fictional profile name and no pilot name', async () => {
  for (const path of Object.keys(pageModules)) {
    const markup = await renderPage(path, 'clinical');
    assert.ok(markup.length > 500, `${path || '/'} should render`);
    // Page copy carries no pilot name. Fixture strings inside lib/ohworks-pilot.ts (readiness rows,
    // refusal text) are untouched by design until the lib/ohworks-* rename follow-up.
    assert.doesNotMatch(markup, /OHWorks (?:supervised|expert|sample|demo tenant|workflow demo)/, `${path || '/'} markup names the retired pilot`);
    assert.match(markup, /[Ss]ynthetic/, `${path || '/'} must label synthetic data`);
  }
  const overview = await renderPage('', 'clinical');
  assert.match(overview, new RegExp(CLINICAL_LAB_PROFILE.displayName));
  assert.match(overview, /href="\/demo\/labs\/clinical\/samples\?role=reviewer"/);
  const audit = await renderPage('/audit', 'clinical');
  assert.match(audit, /href="\/demo\/labs\/clinical\/audit\/export\?role=reviewer"/);
});

test('/demo/labs/<unknown> hits notFound() in the layout and on every page', async () => {
  const layout = readFileSync(resolve(root, `${demoRoot}/layout.tsx`), 'utf8');
  assert.match(layout, /resolveLabProfileOrNotFound\(params\)/);
  const resolver = readFileSync(resolve(root, 'lib/demo-labs/resolve.ts'), 'utf8');
  assert.match(resolver, /if \(!profile\) notFound\(\);/);
  // /accessions is a synchronous read-only page (its own test forbids `export default async`);
  // the shared layout's resolver is what 404s it for an unknown slug.
  for (const path of Object.keys(pageModules).filter((entry) => entry !== '/accessions')) {
    await assert.rejects(renderPage(path, 'nope'), (error: unknown) => {
      // next/navigation's notFound() throws a NEXT_HTTP_ERROR_FALLBACK;404 digest.
      const digest = (error as { digest?: string }).digest ?? String(error);
      return /NOT_FOUND|404/.test(digest);
    }, `${path || '/'} must 404 for an unknown slug`);
  }
});

test('every former /pilot/ohworks path is a permanent (308) redirect into the clinical demo', () => {
  assert.equal(LEGACY_PILOT_REDIRECTS.length, LEGACY_PILOT_SUBPATHS.length);
  for (const subPath of LEGACY_PILOT_SUBPATHS) {
    const from = `${LEGACY_PILOT_BASE}${subPath}`;
    const to = `/demo/labs/clinical${subPath}`;
    assert.equal(resolveLegacyPilotRedirect(from), to);
    assert.equal(resolveLegacyPilotRedirect(`${from}/`), to);
    assert.ok(existsSync(resolve(root, `app/demo/labs/[labType]${subPath}`, subPath.endsWith('/export') || subPath.endsWith('/api') ? 'route.ts' : 'page.tsx')),
      `${to} must exist under the dynamic segment`);
    if (subPath.endsWith('/export') || subPath.endsWith('/api')) {
      const source = readFileSync(resolve(root, `app${from}/route.ts`), 'utf8');
      assert.match(source, /from '@\/app\/demo\/labs\/\[labType\]/, `${from} must forward to the demo-lab handler`);
      assert.match(source, /LEGACY_PILOT_TARGET_SLUG/);
    } else {
      const source = readFileSync(resolve(root, `app${from}/page.tsx`), 'utf8');
      assert.match(source, /permanentRedirect\(legacyPilotRedirectTarget\('([^']*)'/, `${from} must call permanentRedirect`);
      const declared = source.match(/legacyPilotRedirectTarget\('([^']*)'/)?.[1];
      assert.equal(declared, subPath, `${from} redirects to the wrong sub-path`);
      assert.doesNotMatch(source, /export const metadata/);
    }
  }
  assert.equal(resolveLegacyPilotRedirect('/pilot/other'), undefined);
  assert.equal(legacyPilotRedirectTarget('/qc', 'admin'), '/demo/labs/clinical/qc?role=admin');
  assert.equal(legacyPilotRedirectTarget('', undefined), '/demo/labs/clinical');
});

test('legacy pilot pages throw the permanent-redirect digest when rendered', async () => {
  const page = (await import('../app/pilot/ohworks/qc/page')) as {
    default: (props: { searchParams?: Promise<{ role?: string }> }) => Promise<unknown>;
  };
  await assert.rejects(page.default({ searchParams: Promise.resolve({ role: 'admin' }) }), (error: unknown) => {
    const digest = (error as { digest?: string }).digest ?? '';
    // Digest shape: NEXT_REDIRECT;replace;<url>;308;
    return digest.startsWith('NEXT_REDIRECT;') && digest.includes('/demo/labs/clinical/qc?role=admin') && digest.includes(';308');
  });
});

test('synthetic workflow fixtures cover all six states and validate successfully', () => {
  assert.equal(pilotMeta.dataClass, 'Synthetic demonstration data only');
  const fixtureStates = new Set<string>(syntheticSamples.map((sample) => sample.state));
  for (const stage of ['Accessioned', 'Queued', 'Instrument result', 'Quarantined', 'Technical review', 'Released']) {
    assert.ok(fixtureStates.has(stage), `${stage} should have a synthetic fixture`);
  }
  assert.ok(workflowEvaluations.every((evaluation) => evaluation.valid), 'every workflow case should validate');
});

test('approved assistant sources exclude pending discovery notes', () => {
  assert.deepEqual(
    getApprovedSourceIds().sort(),
    [
      'ohworks-source-orchidlive-001',
      'ohworks-source-policy-001',
      'ohworks-source-unsafe-001',
      'ohworks-source-workflow-001',
    ],
  );
});

test('discovery gates enumerate the unresolved supplier packet', () => {
  const gateText = discoveryGates.map((gate) => `${gate.area} ${gate.question}`).join(' ');
  for (const phrase of [
    'topology',
    'protocol and transport',
    'versions',
    'interface guide',
    'sample messages',
    'test environment',
    'licensing',
    'source of truth',
    'acknowledgements',
    'replay and error behavior',
    'supported fields',
  ]) {
    assert.match(gateText.toLowerCase(), new RegExp(phrase.replaceAll(' ', '\\s+')));
  }
});

test('the archived pilot document set exists only under docs/clients/_archive', () => {
  assert.ok(!existsSync(resolve(root, 'docs/clients/ohworks')), 'docs/clients/ohworks must be archived, not live');
  for (const doc of docs) {
    const content = readFileSync(resolve(root, 'docs/clients/_archive/ohworks', doc), 'utf8');
    assert.ok(content.length > 200, `${doc} should contain substantive guidance`);
  }
  const readme = readFileSync(resolve(root, 'docs/clients/_archive/ohworks/README.md'), 'utf8');
  assert.match(readme.split('\n')[0], /Pilot closed 2026-09-23/);
});

test('deployment guide keeps external and production gates stopped', () => {
  const deploy = readFileSync(resolve(root, 'docs/clients/_archive/ohworks/DEPLOY_CHECKLIST.md'), 'utf8');
  for (const gate of ['G-AUTH', 'G-PRODWRITE', 'G-SEND', 'G-PUBLISH', 'G-SPEND', 'G-DNSBILL']) {
    assert.match(deploy, new RegExp(gate));
  }
  assert.match(deploy, /No item.*authorization to deploy/i);
});

test('assistant client bundle boundary contains no fixture or server assistant imports', () => {
  const client = readFileSync(resolve(root, `${demoRoot}/bot/assistant-console.tsx`), 'utf8');
  const roleSwitch = readFileSync(resolve(root, `${demoRoot}/_components/role-switch.tsx`), 'utf8');
  const route = readFileSync(resolve(root, `${demoRoot}/bot/api/route.ts`), 'utf8');
  const botPage = readFileSync(resolve(root, `${demoRoot}/bot/page.tsx`), 'utf8');
  assert.doesNotMatch(client, /@\/lib\/ohworks-pilot|fixtures\/ohworks|askOHWorksAssistant/);
  assert.doesNotMatch(roleSwitch, /@\/lib\/ohworks-pilot|fixtures\/ohworks|workflowCases|assistantKnowledge/);
  assert.match(client, /fetch\(apiPath, \{/);
  assert.match(botPage, /apiPath=\{labDemoPath\(profile\.slug, '\/bot\/api'\)\}/);
  assert.match(route, /import 'server-only'/);
  assert.match(route, /askOHWorksAssistant/);
  assert.match(route, /getLabProfile\(labType\)/);
});
