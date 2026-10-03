import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePage from '../../app/page';

// tsx compiles this repository's preserved JSX in classic mode.
Object.assign(globalThis, { React });

const ROOT = path.join(__dirname, '..', '..');

function extractCliaAnchors(markup: string): string[] {
  const anchors: string[] = [];
  const anchorRegex = /<a\b[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(markup))) {
    const openTag = match[0];
    if (!/href="\/clia"/.test(openTag)) continue;
    const start = match.index + openTag.length;
    const end = markup.indexOf('</a>', start);
    anchors.push(markup.slice(start, end));
  }
  return anchors;
}

test('home page CLIA badge no longer promises a future June launch', async () => {
  let element = HomePage();
  if (element instanceof Promise) element = await element;
  const markup = renderToStaticMarkup(element as React.ReactElement);

  const cliaAnchors = extractCliaAnchors(markup);
  assert.ok(cliaAnchors.length > 0, 'expected at least one link to /clia');

  for (const text of cliaAnchors) {
    assert.doesNotMatch(text, /June launch|coming/i);
  }

  assert.ok(
    cliaAnchors.some((text) => text.includes('CLIA Tracker') && text.includes('available now')),
    'expected a /clia link whose text includes "CLIA Tracker" and "available now"',
  );
});

test('home page source no longer contains stale launch-timing language', () => {
  const source = readFileSync(path.join(ROOT, 'app', 'page.tsx'), 'utf8');
  assert.doesNotMatch(source, /June launch|coming soon/i);
});
