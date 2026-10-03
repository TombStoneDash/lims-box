import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildPilotQcBracketLotView, createPilotQcBracketLotFixtures, DEMO_USE_AT } from '../../lib/ohworks-demo-qc-bracket-lot-view';
import { evaluateQCBracketing, explainQCBracketRule } from '../../lib/ohworks-qc-bracket';
import { evaluateReagentLot, explainReagentLotError, ReagentLotError } from '../../lib/ohworks-reagent-lot';
import { evaluateLotComparison, explainLotComparisonCriterion } from '../../lib/ohworks-lot-comparison';

test('all five bracket scenarios match the real evaluator on exported fixtures', () => {
  const view = buildPilotQcBracketLotView();
  const fixtures = createPilotQcBracketLotFixtures();
  assert.deepEqual(view.bracketRows.map(({ disposition, rule }) => [disposition, rule]), [
    ['rejected', 'no-preceding-qc'],
    ['releasable', 'bracketed-by-passing-qc'],
    ['rejected', 'trailing-qc-failed'],
    ['rejected', 'preceding-qc-window-exceeded'],
    ['held_for_repeat_qc', 'awaiting-trailing-qc'],
  ]);
  for (const run of fixtures.runs) {
    const actual = view.bracketRows.filter((row) => row.runId === run.runId);
    const expected = evaluateQCBracketing(run);
    assert.equal(actual.length, expected.length);
    expected.forEach((decision, index) => {
      assert.deepEqual(actual[index], { ...decision, runId: run.runId, runStatus: run.status,
        timestamp: run.patientResults[index].timestamp, explanation: explainQCBracketRule(decision.rule) });
    });
    for (const records of [run.qcResults, run.patientResults]) {
      assert.deepEqual(records.map((row) => row.timestamp), records.map((row) => row.timestamp).sort());
    }
  }
  assert.equal(fixtures.runs.filter((run) => run.status === 'complete').length, 2);
  assert.equal(view.bracketRows.at(-1)?.runStatus, 'in-progress');
});

test('five reagent scenarios retain real status, limit, hours and typed unknown-lot explanation', () => {
  const view = buildPilotQcBracketLotView();
  const fixtures = createPilotQcBracketLotFixtures();
  assert.equal(view.useAt, DEMO_USE_AT);
  assert.deepEqual(view.lotRows.map(({ status, ruleCode }) => [status, ruleCode]), [
    ['usable', 'within-manufacturer-expiry'], ['usable_with_flag', 'near-manufacturer-expiry'],
    ['expired', 'open-vial-window-exceeded'], ['expired', 'lot-recalled'], ['unresolved', 'lot-unknown'],
  ]);
  fixtures.lots.slice(0, 4).forEach((lot, index) => {
    const expected = evaluateReagentLot(lot, DEMO_USE_AT, fixtures.registry);
    const actual = view.lotRows[index];
    assert.equal(actual.lotId, lot.lotId);
    assert.equal(actual.status, expected.status);
    assert.equal(actual.ruleCode, expected.ruleCode);
    assert.equal(actual.governingLimitAt, expected.governingLimitAt);
    assert.equal(actual.wholeHours, Math.floor(('remainingMs' in expected ? expected.remainingMs : expected.overdueMs) / 3600000));
    assert.equal(actual.explanation, expected.ruleCode.replaceAll('-', ' '));
  });
  assert.deepEqual(view.lotRows.map((row) => row.wholeHours), [264, 24, 4, 0, null]);
  assert.deepEqual(view.lotRows.map((row) => row.timeLabel), ['remaining', 'remaining', 'overdue', 'recall effective', 'unresolved']);
  assert.equal(view.lotRows[2].governingLimitAt, '2026-09-19T08:00:00.000Z');
  assert.equal(view.lotRows[3].governingLimitAt, DEMO_USE_AT);
  const unknown = view.lotRows[4];
  assert.equal(unknown.lotId, fixtures.lots[4].lotId);
  assert.equal(unknown.governingLimitAt, null);
  assert.throws(() => evaluateReagentLot(fixtures.lots[4], DEMO_USE_AT, fixtures.registry), (error: unknown) => {
    assert.ok(error instanceof ReagentLotError);
    assert.equal(unknown.ruleCode, error.code);
    assert.equal(unknown.explanation, explainReagentLotError(error.code));
    return true;
  });
});

test('accepted and bias-rejected paired sets meet minimum size and match real calculations', () => {
  const view = buildPilotQcBracketLotView();
  const fixtures = createPilotQcBracketLotFixtures();
  assert.deepEqual(view.comparisonRows.map(({ decision, governingCriterion }) => [decision, governingCriterion]), [
    ['accept', 'within-limits'], ['reject', 'percent-bias-exceeded'],
  ]);
  fixtures.comparisons.forEach(({ label, pairs, limits }, index) => {
    assert.ok(pairs.length >= limits.minPairs);
    const expected = evaluateLotComparison(pairs, limits);
    assert.deepEqual(view.comparisonRows[index], {
      label, decision: expected.decision, governingCriterion: expected.governingCriterion,
      pairCount: expected.pairCount, meanDifference: expected.meanDifference.toFixed(2),
      percentBias: expected.percentBias?.toFixed(2) ?? 'Undefined', unit: limits.unit,
      outlierCount: expected.outlierCount, explanation: explainLotComparisonCriterion(expected.governingCriterion),
    });
  });
  assert.deepEqual(view.comparisonRows.map((row) => [row.meanDifference, row.percentBias]), [['0.12', '1.12'], ['1.23', '11.22']]);
});

test('headline counts, explanations and synthetic identifiers cover every fixture and row', () => {
  const view = buildPilotQcBracketLotView();
  const fixtures = createPilotQcBracketLotFixtures();
  assert.deepEqual(view.counts, { resultsNotReleasable: 4, lotsNotUsable: 4, comparisonsRejected: 1 });
  assert.equal(view.counts.resultsNotReleasable, view.bracketRows.filter((row) => row.disposition !== 'releasable').length);
  assert.equal(view.counts.lotsNotUsable, view.lotRows.filter((row) => row.status !== 'usable').length);
  assert.equal(view.counts.comparisonsRejected, view.comparisonRows.filter((row) => row.decision === 'reject').length);
  for (const row of [...view.bracketRows, ...view.lotRows, ...view.comparisonRows]) assert.ok(row.explanation.trim());
  const ids = [
    ...fixtures.runs.flatMap((run) => [run.runId, ...run.qcResults.map((qc) => qc.qcId), ...run.patientResults.map((result) => result.resultId)]),
    ...fixtures.lots.map((lot) => lot.lotId), ...fixtures.registry.knownLotIds, ...fixtures.registry.recalledLotIds ?? [],
    ...fixtures.comparisons.flatMap((comparison) => comparison.pairs.map((pair) => pair.specimenId)),
    ...view.bracketRows.flatMap((row) => [row.runId, row.resultId]), ...view.lotRows.map((row) => row.lotId),
  ];
  for (const id of ids) assert.match(id, /^SYNTHETIC-/);
});

test('builder is deterministic and isolated from fixture and row mutation, without ambient inputs', () => {
  const first = buildPilotQcBracketLotView();
  assert.deepEqual(first, buildPilotQcBracketLotView());
  const fixtures = createPilotQcBracketLotFixtures();
  fixtures.runs[0].qcResults[0].outcome = 'fail';
  fixtures.lots[0].manufacturerExpiresAt = DEMO_USE_AT;
  assert.deepEqual(first, buildPilotQcBracketLotView());
  first.bracketRows[0].explanation = '';
  assert.notDeepEqual(first, buildPilotQcBracketLotView());
  const source = readFileSync('lib/ohworks-demo-qc-bracket-lot-view.ts', 'utf8');
  assert.doesNotMatch(source, /Date\.now\s*\(|new Date\s*\(\s*\)|process\.env|fetch\s*\(/);
});

test('page adds exactly one final read-only section with three tables after Westgard runs', () => {
  const source = readFileSync('app/pilot/ohworks/qc/page.tsx', 'utf8');
  const title = 'QC bracketing, reagent lots and lot-to-lot comparison (fabricated)';
  assert.equal(source.split(title).length - 1, 1);
  assert.ok(source.indexOf(title) > source.indexOf('run.firedRules.map'));
  const panel = source.slice(source.indexOf(title));
  assert.equal((panel.match(/<h3\b/g) ?? []).length, 3);
  assert.equal((panel.match(/<table\b/g) ?? []).length, 3);
  assert.equal((panel.match(/<\/section>/g) ?? []).length, 1);
  assert.doesNotMatch(panel, /<section\b/);
  assert.match(source, /const bracketLot = buildPilotQcBracketLotView\(\)/);
  assert.doesNotMatch(source, /use client|<form\b|fetch\s*\(|evaluateQCBracketing\(|evaluateReagentLot\(|evaluateLotComparison\(/);
});
