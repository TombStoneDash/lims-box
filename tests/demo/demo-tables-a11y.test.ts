import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../app/demo/page.tsx', import.meta.url), 'utf8');

test('every table header cell declares a scope', () => {
  const headers = [...source.matchAll(/<th\b[^>]*>/g)];
  assert.ok(headers.length > 0, 'file contains table header cells');
  for (const [header] of headers) {
    assert.match(header, /scope=/, `expected scope= on ${header}`);
  }
});

test('exactly two hidden captions name the synthetic sample', () => {
  const captions = [...source.matchAll(/<caption className="sr-only">([^<]*)<\/caption>/g)];
  assert.equal(captions.length, 2, 'expected exactly two sr-only captions');
  for (const [, text] of captions) {
    assert.ok(text.trim().length > 0, 'caption text is non-empty');
    assert.match(text, /synthetic/i);
    assert.match(text, /WS-2026-0384/);
  }
});

test('chain of custody table headers stay Event, Date/Time, Person, Signature', () => {
  const head = source.match(/Chain of Custody[\s\S]*?<thead>([\s\S]*?)<\/thead>/)?.[1];
  assert.ok(head, 'custody table head exists');
  const labels = [...head.matchAll(/<th\b[^>]*>([^<]*)<\/th>/g)].map(([, text]) => text.trim());
  assert.deepEqual(labels, ['Event', 'Date/Time', 'Person', 'Signature']);
});

test('analytical results table headers stay Sample ID, Analyte, Result, MCL, Method, Status', () => {
  const head = source.match(/Analytical Results[\s\S]*?<thead>([\s\S]*?)<\/thead>/)?.[1];
  assert.ok(head, 'results table head exists');
  const labels = [...head.matchAll(/<th\b[^>]*>([^<]*)<\/th>/g)].map(([, text]) => text.trim());
  assert.deepEqual(labels, ['Sample ID', 'Analyte', 'Result', 'MCL', 'Method', 'Status']);
});

test('the sign button names the custody step it signs while keeping its visible label', () => {
  const button = source.match(/<button\s+onClick=\{\(\) => setSigned\(true\)\}[\s\S]*?<\/button>/)?.[0];
  assert.ok(button, 'sign button exists');
  assert.match(button, /aria-label="[^"]*Received at Lab[^"]*"/);
  // Label in Name (WCAG 2.5.3): the accessible name starts with the visible text.
  assert.match(button, /aria-label="Click to Sign[^"]*"/);
  assert.match(button, />\s*Click to Sign\s*</);
});
