import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { ENVIRONMENTAL_LAB_PROFILE } from '../lib/demo-labs';
import { checkHoldTime, ENVIRONMENTAL_QC_RULES, evaluateBatchQc } from '../lib/demo-labs/environmental-qc';

const root = resolve(import.meta.dirname, '..');

test('every environmental test-menu method has a QC rule and a cited source', () => {
  const sources = readFileSync(resolve(root, 'docs/demo-labs/METHODS_SOURCES.md'), 'utf8');
  for (const method of ENVIRONMENTAL_LAB_PROFILE.testMenu) {
    assert.ok(ENVIRONMENTAL_QC_RULES[method.code], `missing QC rule for ${method.code}`);
    assert.ok(sources.includes(`| ${method.code} |`), `missing source row for ${method.code}`);
  }
});

test('a clean batch passes', () => {
  const result = evaluateBatchQc('EPA-200.8', [
    { kind: 'method_blank', value: 0.2 },
    { kind: 'lcs', value: 98 },
    { kind: 'ms', value: 92 },
    { kind: 'msd', value: 95 },
    { kind: 'duplicate', value: 4 },
  ]);
  assert.equal(result.status, 'pass');
});

test('a failing LCS recovery sends the batch to needs_review, never auto-release', () => {
  const result = evaluateBatchQc('EPA-200.8', [
    { kind: 'method_blank', value: 0.2 },
    { kind: 'lcs', value: 72 },
  ]);
  assert.equal(result.status, 'needs_review');
  assert.match(result.findings.find((f) => f.kind === 'lcs')!.reason, /outside 85-115%/);
});

test('a contaminated blank, high RPD, missing LCS or unknown method → needs_review', () => {
  assert.equal(evaluateBatchQc('EPA-300.0', [{ kind: 'method_blank', value: 2 }, { kind: 'lcs', value: 100 }]).status, 'needs_review');
  assert.equal(evaluateBatchQc('SM-2540D', [{ kind: 'method_blank', value: 0 }, { kind: 'lcs', value: 100 }, { kind: 'duplicate', value: 35 }]).status, 'needs_review');
  assert.equal(evaluateBatchQc('SM-5220D', [{ kind: 'method_blank', value: 0 }]).status, 'needs_review');
  assert.equal(evaluateBatchQc('NOPE', [{ kind: 'method_blank', value: 0 }, { kind: 'lcs', value: 100 }]).status, 'needs_review');
  assert.equal(evaluateBatchQc('EPA-524.2', [{ kind: 'method_blank', value: 0 }, { kind: 'lcs', value: Number.NaN }]).status, 'needs_review');
});

test('hold-time exceedance flags the sample', () => {
  const late = checkHoldTime('SM-5210B', '2026-10-01T08:00:00Z', '2026-10-03T09:00:00Z');
  assert.equal(late.flag, 'hold_time_exceeded');
  assert.equal(late.exceeded, true);
  const onTime = checkHoldTime('SM-9223B', '2026-10-01T08:00:00Z', '2026-10-02T08:00:00Z');
  assert.equal(onTime.flag, 'ok');
  assert.equal(checkHoldTime('SM-5210B', '2026-10-03T08:00:00Z', '2026-10-01T08:00:00Z').flag, 'invalid_time');
  assert.equal(checkHoldTime('NOPE', '2026-10-01T08:00:00Z', '2026-10-01T09:00:00Z').flag, 'unknown_method');
});

test('the /environmental marketing page links to the environmental demo', () => {
  const page = readFileSync(resolve(root, 'app/environmental/page.tsx'), 'utf8');
  assert.ok(page.includes('href="/demo/labs/environmental"'));
});
