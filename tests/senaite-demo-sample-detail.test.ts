import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { sampleResults } from '../lib/demo-data';
import { resolveDemoSampleId, resultFlagTone, RESULT_FLAG_TONE_CLASS } from '../lib/senaite-demo-sample';

test('sample IDs resolve to the canonical ID after decoding and normalization', () => {
  for (const raw of ['SA-2026-0847', 'sa-2026-0847', ' sa-2026-0847 ', '%53A-2026-0847', '%20sa-2026-0847%20']) {
    assert.equal(resolveDemoSampleId(raw, 'SA-2026-0847'), 'SA-2026-0847', raw);
  }
});

test('unknown, absent, and malformed sample IDs return null without throwing', () => {
  for (const raw of ['SA-2026-0848', '', undefined, null, 'SA-2026-0847/extra', 'SA-2026-0847%2Fextra', '%E0%A4%A']) {
    assert.equal(resolveDemoSampleId(raw, 'SA-2026-0847'), null, String(raw));
  }
});

test('result flags use their text to select a tone with attention taking priority', () => {
  for (const flag of ['Below MCL', 'In range', 'BELOW MCL', 'normal', 'PASS']) {
    assert.equal(resultFlagTone(flag), 'ok', flag);
  }
  for (const flag of ['Above MCL', 'Exceeds MCL', 'HIGH', 'Low', 'Out of range', 'Critical', 'Fail', 'Below MCL but critical', 'Below MCL / low']) {
    assert.equal(resultFlagTone(flag), 'attention', flag);
  }
  for (const flag of ['', 'Pending']) {
    assert.equal(resultFlagTone(flag), 'neutral', flag);
  }
});

test('current demo flags remain green and each tone has distinct classes', () => {
  for (const result of sampleResults) {
    assert.equal(resultFlagTone(result.flag), 'ok', result.analyte);
  }
  const classes = Object.values(RESULT_FLAG_TONE_CLASS);
  assert.ok(classes.every(value => typeof value === 'string' && value.length > 0));
  assert.equal(new Set(classes).size, 3);
});

test('sample detail wires ID validation, static params, and flag tones without changing links', () => {
  const source = readFileSync(path.join(process.cwd(), 'app/senaite-demo/samples/[id]/page.tsx'), 'utf8');
  for (const required of ['notFound(', 'await params', 'resolveDemoSampleId(', 'resultFlagTone(', 'generateStaticParams']) {
    assert.ok(source.includes(required), required);
  }
  assert.ok(!source.includes('bg-green-100 text-green-700'));
  const hrefs = [...source.matchAll(/href=["']([^"']+)["']/g)].map(match => match[1]);
  assert.deepEqual(hrefs, ['/senaite-demo']);
});
