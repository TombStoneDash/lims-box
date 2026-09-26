import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ClinicalLabsPage, { metadata as clinicalMeta } from '../../app/for/clinical-labs/page';
import DiagnosticsLabsPage, { metadata as diagnosticsMeta } from '../../app/for/diagnostics-labs/page';
import sitemap from '../../app/sitemap';
import { matchCommercialClaim } from '../../lib/bot/commercial-claims';

// tsx compiles this repository's preserved JSX in classic mode.
Object.assign(globalThis, { React });

const ROOT = path.join(__dirname, '..', '..');
const EM_DASH = String.fromCharCode(0x2014);
const pages = [
  { slug: 'clinical-labs', Page: ClinicalLabsPage, meta: clinicalMeta, h1: 'LIMS for Clinical Labs That Run Lean' },
  { slug: 'diagnostics-labs', Page: DiagnosticsLabsPage, meta: diagnosticsMeta, h1: 'LIMS for Diagnostics Labs Where Every Control Counts' },
];

for (const { slug, Page, meta, h1 } of pages) {
  test(`/for/${slug} renders like the environmental page, with its own canonical and breadcrumb`, () => {
    const html = renderToStaticMarkup(React.createElement(Page));
    assert.ok(html.includes(`>${h1}</h1>`));
    assert.equal(meta.alternates?.canonical, `/for/${slug}`);
    assert.ok(html.includes(`https://lims.bot/for/${slug}`), 'breadcrumb JSON-LD points at this page');
    for (const href of ['/demo', '/contact', '/pricing']) assert.ok(html.includes(`href="${href}"`), href);
    assert.ok(html.includes('Synthetic demo data'));
  });

  test(`/for/${slug} makes no forbidden commercial claim and uses no em dash`, () => {
    const source = readFileSync(path.join(ROOT, `app/for/${slug}/page.tsx`), 'utf8');
    const html = renderToStaticMarkup(React.createElement(Page));
    assert.equal(matchCommercialClaim(html.replace(/<[^>]+>/g, ' ')), null);
    assert.equal(matchCommercialClaim(`${meta.title} ${meta.description}`), null);
    assert.ok(!source.includes(EM_DASH));
  });
}

test('both pages are in the sitemap and the footer', () => {
  const urls = sitemap().map((entry) => entry.url);
  for (const slug of ['clinical-labs', 'diagnostics-labs']) assert.ok(urls.some((u) => u.endsWith(`/for/${slug}`)), slug);
  const footer = readFileSync(path.join(ROOT, 'components/WaitlistFooter.tsx'), 'utf8');
  assert.ok(footer.includes('href="/for/clinical-labs"') && footer.includes('href="/for/diagnostics-labs"'));
});

test('/demo mentions the synthetic clinical and diagnostics demo data honestly', () => {
  const source = readFileSync(path.join(ROOT, 'app/demo/page.tsx'), 'utf8');
  const start = source.indexOf('{/* Clinical and diagnostics demo data */}');
  const block = source.slice(start, source.indexOf('{/* Calendly Scheduling Section */}'));
  assert.ok(start >= 0);
  assert.match(block, /ABC Clinical/);
  assert.match(block, /ABC Diagnostics/);
  assert.match(block, /synthetic, with no patient data/);
  assert.match(block, /Guided demos can also run/, 'offered as a guided demo, not claimed as a page on /demo today');
  assert.ok(block.includes('href="/for/clinical-labs"') && block.includes('href="/for/diagnostics-labs"'));
  assert.ok(!block.includes(EM_DASH));
});
