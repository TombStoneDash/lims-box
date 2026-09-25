import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildPilotResultReviewView } from '../../lib/ohworks-demo-result-review-view';

const view = buildPilotResultReviewView();
function row(id: string) {
  const entry = view.rows.find((candidate) => candidate.resultId === `SYNTHETIC-RES-${id}`);
  assert.ok(entry);
  return entry;
}

test('fabricated results expose real chain decisions for all nine scenarios', () => {
  assert.equal(view.rows.length, 9);
  assert.equal(row('001').outcome, 'AUTO_RELEASE');
  assert.deepEqual(row('001').holdReasonCodes, []);
  assert.deepEqual(row('001').reported, { value: 5.05, unit: 'mmol/L' });
  assert.equal(row('002').runId, row('003').runId);
  for (const id of ['002', '003']) {
    assert.equal(row(id).outcome, 'HOLD_FOR_REVIEW');
    assert.deepEqual(row(id).holdReasonCodes, ['qc-out-of-control']);
    assert.deepEqual(row(id).trace.find((entry) => entry.step === 'qc-rules')?.reasonCodes, ['1_3s']);
  }
  assert.equal(row('004').outcome, 'HOLD_FOR_REVIEW');
  assert.deepEqual(row('004').holdReasonCodes, ['delta-check-blocked']);
  assert.equal(row('004').trace.find((entry) => entry.step === 'delta-check')?.decision, 'block');
  assert.equal(row('005').outcome, 'HOLD');
  assert.deepEqual(row('005').holdReasonCodes, ['analyte-unknown']);
  assert.equal(row('005').reported, null);
  assert.equal(row('005').reference, null);
  assert.equal(row('005').turnaround, null);
  assert.equal(row('006').catalogueVersionId, 'SYNTHETIC-V1');
  assert.equal(row('007').catalogueVersionId, 'SYNTHETIC-V2');
  assert.deepEqual(row('006').referenceInterval, { lowerBound: 3, upperBound: 4 });
  assert.deepEqual(row('007').referenceInterval, { lowerBound: 3, upperBound: 6 });
  assert.equal(row('006').reference?.classification, 'above_range');
  assert.equal(row('007').reference?.classification, 'within_range');
  assert.ok(row('006').reference?.flag);
  assert.equal(row('008').outcome, 'HOLD');
  assert.deepEqual(row('008').holdReasonCodes, ['over-consumption']);
  assert.match(row('008').trace.find((entry) => entry.step === 'volume-ledger')!.explanation, /exceeds/);
  assert.equal(row('009').outcome, 'AUTO_RELEASE');
  assert.deepEqual(row('009').turnaround, { status: 'breached', totalMinutes: 150 });
});

test('totals reconcile and held reasons are sorted and counted from the rows', () => {
  assert.equal(view.totals.released + view.totals.held, view.rows.length);
  assert.equal(view.totals.released, 4);
  assert.equal(view.totals.held, 5);
  assert.equal(view.totals.tatBreaches, 1);
  const counts: Record<string, number> = {};
  for (const entry of view.rows) for (const code of entry.holdReasonCodes) counts[code] = (counts[code] ?? 0) + 1;
  assert.deepEqual(view.totals.heldByReason, counts);
  assert.deepEqual(view.heldByReason, Object.keys(counts).sort().map((code) => ({ code, count: counts[code] })));
});

test('ordered trace explains every decision and conversion failure stops early', () => {
  assert.deepEqual(row('001').trace.map((entry) => entry.step), [
    'effective-definition', 'unit-conversion', 'reference-range', 'delta-check',
    'qc-rules', 'volume-ledger', 'autoverification', 'turnaround-time',
  ]);
  assert.deepEqual(row('005').trace.map((entry) => entry.step), ['effective-definition', 'unit-conversion']);
  for (const entry of view.rows) for (const trace of entry.trace) assert.ok(trace.explanation.trim().length > 0);
});

test('identifiers are fabricated and repeated calls are deeply equal', () => {
  for (const entry of view.rows) {
    for (const id of [entry.resultId, entry.subjectId, entry.specimenId, entry.runId, entry.testCode, entry.catalogueVersionId]) {
      assert.match(id!, /^SYNTHETIC-/);
    }
  }
  assert.deepEqual(buildPilotResultReviewView(), buildPilotResultReviewView());
});

test('pure view source has no ambient clock, environment or network access', () => {
  const source = readFileSync(new URL('../../lib/ohworks-demo-result-review-view.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Date\.now\s*\(|new\s+Date\s*\(\s*\)|process\.env|fetch\s*\(/);
});
