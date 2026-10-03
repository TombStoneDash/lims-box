import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { toneLabel } from '../../lib/compare-tone';

const source = readFileSync(path.join(__dirname, '../../app/compare/page.tsx'), 'utf8');

test('toneLabel provides a text verdict for every tone', () => {
  assert.equal(toneLabel('yes'), 'Yes');
  assert.equal(toneLabel('no'), 'No');
  assert.equal(toneLabel('partial'), 'Partial');
});

test('comparison table has a hidden caption and scoped column headers', () => {
  assert.match(source, /<caption className="sr-only">LIMS BOX compared with other LIMS options, by capability<\/caption>/);
  const head = source.match(/<thead>([\s\S]*?)<\/thead>/)?.[1];
  assert.ok(head, 'table head exists');
  const headers = [...head.matchAll(/<th\b[^>]*>/g)];
  assert.equal(headers.length, 2, 'capability header and mapped product header');
  for (const [header] of headers) assert.match(header, /scope="col"/);
});

test('every ToneIcon is hidden from assistive technology', () => {
  const body = source.match(/function ToneIcon\([\s\S]*?\n\}/)?.[0];
  assert.ok(body, 'ToneIcon exists');
  for (const icon of ['CheckCircle2', 'XCircle', 'Minus']) {
    assert.match(body, new RegExp(`<${icon}\\b[^>]*aria-hidden="true"`));
  }
});

test('desktop and mobile both announce the verdict before the visible value', () => {
  assert.match(source, /import\s*\{\s*toneLabel\s*\}\s*from ['"]@\/lib\/compare-tone['"]/);
  assert.ok((source.match(/toneLabel\(cell\.tone\)/g) ?? []).length >= 2);
  const [desktop, mobile] = source.split('{/* Comparison cards — mobile */}');
  assert.ok(mobile, 'mobile layout exists');
  for (const layout of [desktop, mobile]) {
    assert.match(layout, /<ToneIcon tone=\{cell\.tone\} \/>\s*<span className="sr-only">\{toneLabel\(cell\.tone\)\}: <\/span>\s*(?:<span[^>]*>)?\{cell\.value\}/);
  }
});
