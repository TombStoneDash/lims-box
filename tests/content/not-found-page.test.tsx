import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import NotFound, { metadata } from '../../app/not-found';

const root = path.join(__dirname, '..', '..');
const markup = renderToStaticMarkup(<NotFound />);

test('not-found page has one clear heading and accessible recovery navigation', () => {
  assert.equal((markup.match(/<h1\b/g) ?? []).length, 1);
  assert.match(markup, /Page not found/);
  assert.match(markup, /<nav aria-label="Find your way">/);
  for (const anchor of markup.matchAll(/<a\b[^>]*>/g)) {
    assert.match(anchor[0], /focus-visible:outline-2/);
    assert.match(anchor[0], /focus-visible:outline-lab-teal/);
  }
  // The shared layout owns the main landmark; do not nest another inside it.
  const layout = readFileSync(path.join(root, 'app/layout.tsx'), 'utf8');
  assert.match(layout, /<main id=\{SKIP_LINK_TARGET_ID\}[^>]*>\s*\{children\}\s*<\/main>/);
  assert.doesNotMatch(markup, /<main\b/);
});

test('all six recovery destinations are present and every href has a page on disk', () => {
  const hrefs = [...markup.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  const expected = ['/', '/pricing', '/demo', '/personnel-pack', '/faq', '/contact'];
  assert.deepEqual([...new Set(hrefs)].sort(), [...expected].sort());
  for (const href of hrefs) {
    assert.ok(statSync(path.join(root, 'app', href.slice(1), 'page.tsx')).isFile(), href);
  }
});

test('not-found metadata prevents indexing and allows following recovery links', () => {
  assert.equal(metadata.title, 'Page not found | LIMS BOX');
  assert.deepEqual(metadata.robots, { index: false, follow: true });
});
