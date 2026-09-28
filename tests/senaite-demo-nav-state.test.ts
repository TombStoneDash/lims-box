import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { isSenaiteDemoNavCurrent } from '../lib/senaite-demo-nav-state';

test('dashboard href matches only the exact dashboard path', () => {
  assert.equal(isSenaiteDemoNavCurrent('/senaite-demo', '/senaite-demo'), true);
  assert.equal(isSenaiteDemoNavCurrent('/senaite-demo/', '/senaite-demo'), true);
  assert.equal(isSenaiteDemoNavCurrent('/senaite-demo/qc', '/senaite-demo'), false);
});

test('sample detail href matches any sample id, query strings and hashes are ignored, and missing pathnames are false', () => {
  assert.equal(
    isSenaiteDemoNavCurrent('/senaite-demo/samples/SA-2026-0999', '/senaite-demo/samples/SA-2026-0847'),
    true,
  );
  assert.equal(isSenaiteDemoNavCurrent('/senaite-demo/qc?analyte=Lead#chart', '/senaite-demo/qc'), true);
  assert.equal(isSenaiteDemoNavCurrent('/senaite-demo/qcx', '/senaite-demo/qc'), false);
  assert.equal(isSenaiteDemoNavCurrent(null, '/senaite-demo'), false);
  assert.equal(isSenaiteDemoNavCurrent(undefined, '/senaite-demo/qc'), false);
});

const source = readFileSync(path.join(process.cwd(), 'app/senaite-demo/layout.tsx'), 'utf8');
const hrefs = [...source.matchAll(/href:\s*'([^']+)'/g)].map(match => match[1]);

test('exactly one nav href is current for a representative pathname of each page', () => {
  const representativePathnames = [
    '/senaite-demo',
    '/senaite-demo/samples/SA-2026-0123',
    '/senaite-demo/qc',
    '/senaite-demo/equipment',
    '/senaite-demo/training',
  ];

  for (const pathname of representativePathnames) {
    const currentHrefs = hrefs.filter(href => isSenaiteDemoNavCurrent(pathname, href));
    assert.equal(
      currentHrefs.length,
      1,
      `expected exactly one current href for ${pathname}, got ${JSON.stringify(currentHrefs)}`,
    );
  }
});

const navLinkSource = readFileSync(
  path.join(process.cwd(), 'components/senaite-demo/DemoNavLink.tsx'),
  'utf8',
);

test('DemoNavLink is a client component with aria-current and aria-hidden icons', () => {
  assert.match(navLinkSource, /^'use client'/);
  assert.match(navLinkSource, /aria-current=\{[^}]*'page'/);
  assert.match(navLinkSource, /aria-hidden="true"/);
});

test('senaite-demo layout has a named, horizontally scrollable nav rendering DemoNavLink', () => {
  assert.match(source, /aria-label="SENAITE demo sections"/);
  assert.match(source, /overflow-x-auto/);
  assert.match(source, /<DemoNavLink/);
});
