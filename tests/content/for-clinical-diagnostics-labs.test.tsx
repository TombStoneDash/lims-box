// Source-backed copy checks for /for/clinical-labs and /for/diagnostics-labs
// (Main review of #451): every feature card must map to code that exists, and
// features that are not built may only appear in the "Not built yet" list.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ClinicalLabsPage, { metadata as clinicalMeta } from '../../app/for/clinical-labs/page';
import DiagnosticsLabsPage, { metadata as diagnosticsMeta } from '../../app/for/diagnostics-labs/page';
import sitemap from '../../app/sitemap';
import { matchCommercialClaim } from '../../lib/bot/commercial-claims';
import { corpus } from '../../lib/bot/corpus';

// tsx compiles this repository's preserved JSX in classic mode.
Object.assign(globalThis, { React });

const ROOT = path.join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
const EM_DASH = String.fromCharCode(0x2014);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

// Each feature card title and the code that implements it.
const FEATURE_SOURCES: Record<string, string[]> = {
  'Personnel competency records': ['app/admin/competencies', 'app/admin/people'],
  'Training log and director sign-offs': ['app/admin/trainings', 'app/admin/signoffs'],
  'Procedure authorizations': ['app/admin/procedures'],
  'Survey-ready export': ['app/admin/survey-ready', 'app/api/admin/personnel-pack/survey-export'],
  'QC review, in the synthetic demo': ['lib/senaite-demo-qc.ts', 'app/senaite-demo/qc'],
  'Calibration reminders, in the synthetic demo': ['lib/senaite-demo-calibration-schedule.ts', 'app/senaite-demo/page.tsx'],
};

// Capabilities that do not exist in app/ or lib/ today.
const UNBUILT = [
  /\bxml\b/i, /import(s)? (is|are) logged/i, /westgard/i, /levey/i, /colon(y|ies)/i, /per.run/i,
  /stability (timer|tracking)/i, /watch lims box flag/i, /run controls? that hold/i,
];

const pages = [
  { slug: 'clinical-labs', Page: ClinicalLabsPage, meta: clinicalMeta },
  { slug: 'diagnostics-labs', Page: DiagnosticsLabsPage, meta: diagnosticsMeta },
];

function split(html: string) {
  const featuresStart = html.indexOf('What LIMS BOX does for');
  const plannedStart = html.indexOf('>Not built yet<');
  assert.ok(featuresStart > 0 && plannedStart > featuresStart, 'features section precedes the Not built yet section');
  const plannedEnd = html.indexOf('</section>', plannedStart);
  return {
    features: html.slice(featuresStart, plannedStart),
    planned: html.slice(plannedStart, plannedEnd),
    outsidePlanned: html.slice(0, plannedStart) + html.slice(plannedEnd),
  };
}

for (const { slug, Page, meta } of pages) {
  const html = renderToStaticMarkup(React.createElement(Page));
  const parts = split(html);

  test(`/for/${slug}: every feature card maps to code that exists`, () => {
    const titles = [...parts.features.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map((m) => m[1]);
    assert.equal(titles.length, 6);
    for (const title of titles) {
      const sources = FEATURE_SOURCES[title];
      assert.ok(sources, `feature "${title}" has no source mapping`);
      for (const source of sources) assert.ok(existsSync(path.join(ROOT, source)), `${title}: ${source} is missing`);
    }
    assert.match(read('lib/senaite-demo-qc.ts'), /OUT_OF_RANGE_SD_THRESHOLD = 3;/, 'the 3 SD wording matches the demo code');
  });

  test(`/for/${slug}: unbuilt features appear only in the Not built yet list`, () => {
    for (const pattern of UNBUILT) assert.doesNotMatch(text(parts.outsidePlanned), pattern);
    assert.doesNotMatch(`${meta.title} ${meta.description} ${JSON.stringify(meta.keywords)}`, /xml|westgard|colony|run control/i);
    const items = [...parts.planned.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => m[1].trim());
    assert.ok(items.length >= 4, 'the Not built yet list is populated');
    assert.match(text(parts.planned), /None of them exists in LIMS BOX today/);
  });

  test(`/for/${slug}: positioning matches /clinical and pricing matches /pricing`, () => {
    const body = text(html);
    assert.match(body, /Not a LIS replacement/);
    assert.match(body, /It does not replace it/);
    assert.match(read('app/clinical/page.tsx'), /Not a LIMS replacement/);
    assert.match(body, /Personnel Pack is part of the Growth plan at \$1,200\/mo/);
    assert.doesNotMatch(body, /\$500/);
    const pricing = read('app/pricing/page.tsx');
    const growth = pricing.slice(pricing.indexOf("name: 'Growth'"), pricing.indexOf("name: 'Enterprise'"));
    assert.match(growth, /price: '\$1,200'/);
    assert.match(growth, /Personnel competency records/);
  });

  test(`/for/${slug}: only Next.js page exports, and no test-system claim`, () => {
    const source = read(`app/for/${slug}/page.tsx`);
    const exported = [...source.matchAll(/^export\s+(?:default\s+function\s+(\w+)|const\s+(\w+))/gm)].map((m) => m[1] ? 'default' : m[2]);
    assert.deepEqual(exported.sort(), ['default', 'metadata']);
    assert.doesNotMatch(text(parts.features), /test system/i, 'the Competency model has no test-system field');
    assert.match(read('prisma/schema.prisma'), /model Competency \{[^}]*\btype\b[^}]*\bexpiresAt\b/);
  });

  test(`/for/${slug}: canonical, breadcrumb, links, no forbidden claim, no em dash`, () => {
    assert.equal(meta.alternates?.canonical, `/for/${slug}`);
    assert.ok(html.includes(`https://lims.bot/for/${slug}`));
    for (const href of ['/demo', '/contact', '/pricing']) assert.ok(html.includes(`href="${href}"`), href);
    assert.equal(matchCommercialClaim(text(html)), null);
    assert.equal(matchCommercialClaim(`${meta.title} ${meta.description}`), null);
    assert.ok(!read(`app/for/${slug}/page.tsx`).includes(EM_DASH));
  });
}

test('/faq and the LIMS BOT corpus no longer claim general CSV/XML instrument import', () => {
  const faq = read('app/faq/page.tsx');
  const entry = corpus.find((c) => c.id === 'instruments');
  assert.ok(entry);
  for (const source of [faq, entry.text, read('app/clinical/page.tsx'), read('app/evidence/page.tsx')]) {
    assert.doesNotMatch(source, /CSV, XML|CSV\/XML/);
  }
  assert.match(entry.text, /Today there is a CSV reader for one analyzer, used in testing only/);
  assert.ok(faq.includes(entry.text), 'the bot answer stays verbatim with /faq');
  assert.ok(existsSync(path.join(ROOT, 'lib/ohworks-liaison-import.ts')), 'the one analyzer reader the copy mentions exists');
});

test('/demo describes the clinical and diagnostics seed as planned, not live', () => {
  const source = read('app/demo/page.tsx');
  const start = source.indexOf('{/* Clinical and diagnostics demo data */}');
  const block = source.slice(start, source.indexOf('{/* Calendly Scheduling Section */}'));
  assert.ok(start >= 0);
  assert.match(block, /Planned, not live yet/);
  assert.match(block, /does not\s+yet include results or QC runs/);
  for (const pattern of UNBUILT) assert.doesNotMatch(block, pattern);
  assert.ok(!block.includes(EM_DASH));
  assert.ok(existsSync(path.join(ROOT, 'scripts/seed/clinical-diagnostics/load.mjs')), 'the seed the copy refers to exists');
});

test('sitemap lists both pages and footer link labels are unique', () => {
  const urls = sitemap().map((entry) => entry.url);
  for (const slug of ['clinical-labs', 'diagnostics-labs']) assert.ok(urls.some((u) => u.endsWith(`/for/${slug}`)), slug);
  const footer = read('components/WaitlistFooter.tsx');
  const labels = [...footer.matchAll(/<Link href="[^"]+"[^>]*>([^<]+)<\/Link>/g)].map((m) => m[1].trim());
  assert.equal(new Set(labels).size, labels.length, `duplicate footer labels: ${labels.join(', ')}`);
  assert.ok(footer.includes('href="/for/clinical-labs"') && footer.includes('href="/for/diagnostics-labs"'));
});

test('Growth "instrument integration" is labelled planned everywhere and absent from structured data', () => {
  const faq = read('app/faq/page.tsx');
  const pricing = read('app/pricing/page.tsx');
  const pricingEntry = corpus.find((c) => c.id === 'pricing');
  assert.ok(pricingEntry);
  for (const [name, source] of [['faq', faq], ['pricing', pricing], ['corpus pricing', pricingEntry.text]] as const) {
    for (const m of source.matchAll(/[^.'\n]*instrument integration[^.'\n]*/gi)) {
      assert.match(m[0], /planned/i, `${name}: "${m[0].trim()}" must be labelled planned`);
    }
  }
  assert.ok(faq.includes(pricingEntry.text), 'the bot pricing answer stays verbatim with /faq');
  assert.doesNotMatch(read('app/layout.tsx'), /Instrument integration/i, 'structured data must not list a planned feature');
});

test('/demo links to the new pages with accurate text', () => {
  const source = read('app/demo/page.tsx');
  assert.ok(source.includes('>Personnel records for clinical labs</Link>'));
  assert.ok(source.includes('>Personnel records for diagnostics labs</Link>'));
  assert.doesNotMatch(source, />LIMS for (clinical|diagnostics) labs</);
});
