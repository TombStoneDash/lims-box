import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildPilotMethodPerformanceView,
  createPilotMethodPerformanceFixtures,
  isUnresolvedComparisonRow,
  DEMO_RUN_AT,
  type PilotMethodComparisonRow,
} from '../../lib/ohworks-demo-method-performance-view';
import { evaluateMethodValidationGate } from '../../lib/ohworks-method-validation';
import { evaluateLinearityVerification } from '../../lib/ohworks-linearity';
import { evaluateMethodComparison, explainMethodComparisonCriterion, explainMethodComparisonError, MethodComparisonError } from '../../lib/ohworks-method-comparison';

test('six method validation gate scenarios match the real evaluator on exported fixtures', () => {
  const view = buildPilotMethodPerformanceView();
  const fixtures = createPilotMethodPerformanceFixtures();
  assert.equal(view.runAt, DEMO_RUN_AT);
  assert.deepEqual(view.validationRows.map((row) => [row.decision, row.reasonCode]), [
    ['reported', 'method-validated-and-current'],
    ['reported_with_flag', 'validation-near-expiry'],
    ['reported_with_flag', 'revalidation-due'],
    ['blocked', 'revalidation-interval-expired'],
    ['blocked', 'matrix-outside-validated-scope'],
    ['blocked', 'unknown-method'],
  ]);
  fixtures.validationRuns.forEach((run, index) => {
    const expected = evaluateMethodValidationGate(fixtures.registry, run.methodId, run.runAt, run.matrix);
    assert.deepEqual(view.validationRows[index], {
      methodId: expected.methodId, matrix: expected.matrix, decision: expected.decision,
      reasonCode: expected.reasonCode, reason: expected.reason,
    });
  });
});

test('three linearity sets match the real evaluator on exported fixtures', () => {
  const view = buildPilotMethodPerformanceView();
  const fixtures = createPilotMethodPerformanceFixtures();
  assert.deepEqual(view.linearityRows.map((row) => [row.decision, row.reasonCode]), [
    ['pass', 'linearity-verified'],
    ['fail', 'recovery-out-of-range'],
    ['blocked', 'insufficient-levels'],
  ]);
  fixtures.linearitySets.forEach(({ setId, levels }, index) => {
    const expected = evaluateLinearityVerification(levels, fixtures.linearityLimits);
    const actual = view.linearityRows[index];
    assert.equal(actual.setId, setId);
    assert.equal(actual.decision, expected.decision);
    assert.equal(actual.reasonCode, expected.reasonCode);
    assert.equal(actual.reason, expected.reason);
    assert.equal(actual.slope, expected.slope);
    assert.equal(actual.intercept, expected.intercept);
    assert.equal(actual.correlation, expected.correlation);
    assert.equal(actual.slopeDisplay, expected.slope === null ? 'n/a' : expected.slope.toFixed(4));
    assert.equal(actual.interceptDisplay, expected.intercept === null ? 'n/a' : expected.intercept.toFixed(4));
    assert.equal(actual.correlationDisplay, expected.correlation === null ? 'n/a' : expected.correlation.toFixed(4));
    assert.deepEqual(actual.levelRecoveries, expected.levelRecoveries.map((entry) => ({
      levelId: entry.levelId, expected: entry.expected, observed: entry.observed,
      recoveryPercent: entry.recoveryPercent, withinLimits: entry.withinLimits,
    })));
  });
  assert.equal(view.linearityRows[0].levelRecoveries.length, 5);
  assert.equal(view.linearityRows[1].levelRecoveries.filter((row) => !row.withinLimits).length, 1);
  assert.equal(view.linearityRows[2].levelRecoveries.length, 0);
});

test('three method comparison sets match the real evaluator on exported fixtures, including a caught MethodComparisonError', () => {
  const view = buildPilotMethodPerformanceView();
  const fixtures = createPilotMethodPerformanceFixtures();
  assert.equal(view.comparisonRows.length, 3);

  const [accepted, rejected, unresolved] = view.comparisonRows;
  assert.equal(accepted.unresolved, false);
  assert.equal(rejected.unresolved, false);
  assert.equal(unresolved.unresolved, true);

  if (isUnresolvedComparisonRow(accepted) || isUnresolvedComparisonRow(rejected) || !isUnresolvedComparisonRow(unresolved)) {
    assert.fail('unexpected comparison row shape');
  }
  assert.equal(accepted.decision, 'acceptable');
  assert.equal(accepted.governingCriterion, 'within-allowable-bias');
  assert.equal(rejected.decision, 'not-acceptable');
  assert.equal(rejected.governingCriterion, 'mean-difference-exceeded');
  assert.equal(unresolved.code, 'pairs-below-minimum');
  assert.equal(unresolved.explanation, explainMethodComparisonError('pairs-below-minimum'));

  fixtures.comparisonSets.forEach(({ setId, pairs }, index) => {
    const actual = view.comparisonRows[index] as PilotMethodComparisonRow;
    assert.equal(actual.setId, setId);
    try {
      const expected = evaluateMethodComparison(pairs, fixtures.comparisonDeclaration);
      assert.equal(actual.unresolved, false);
      if (isUnresolvedComparisonRow(actual)) {
        assert.fail('expected a resolved row');
      }
      assert.equal(actual.pairCount, expected.pairCount);
      assert.equal(actual.meanDifference, expected.meanDifference);
      assert.equal(actual.percentBias, expected.percentBias);
      assert.deepEqual(actual.limitsOfAgreement, expected.limitsOfAgreement);
      assert.deepEqual(actual.passingBablok, { slope: expected.passingBablok.slope, intercept: expected.passingBablok.intercept });
      assert.equal(actual.decision, expected.decision);
      assert.equal(actual.governingCriterion, expected.governingCriterion);
      assert.equal(actual.explanation, explainMethodComparisonCriterion(expected.governingCriterion));
    } catch (error) {
      assert.ok(error instanceof MethodComparisonError);
      assert.equal(actual.unresolved, true);
      if (!isUnresolvedComparisonRow(actual)) {
        assert.fail('expected an unresolved row');
      }
      assert.equal(actual.code, (error as MethodComparisonError).code);
      assert.equal(actual.explanation, explainMethodComparisonError((error as MethodComparisonError).code));
    }
  });
});

test('the builder never throws out of any error row and headline counts are correct', () => {
  assert.doesNotThrow(() => buildPilotMethodPerformanceView());
  const view = buildPilotMethodPerformanceView();
  assert.deepEqual(view.counts, { runsBlocked: 3, linearitySetsNotPassing: 2, comparisonsNotAcceptable: 2 });
  assert.equal(view.counts.runsBlocked, view.validationRows.filter((row) => row.decision === 'blocked').length);
  assert.equal(view.counts.linearitySetsNotPassing, view.linearityRows.filter((row) => row.decision !== 'pass').length);
  assert.equal(view.counts.comparisonsNotAcceptable, view.comparisonRows.filter((row) => isUnresolvedComparisonRow(row) || row.decision !== 'acceptable').length);
});

test('every explanation string is non-empty and every fabricated identifier is prefixed', () => {
  const view = buildPilotMethodPerformanceView();
  const fixtures = createPilotMethodPerformanceFixtures();

  for (const row of view.validationRows) assert.ok(row.reason.trim().length > 0);
  for (const row of view.linearityRows) assert.ok(row.reason.trim().length > 0);
  for (const row of view.comparisonRows) assert.ok(row.explanation.trim().length > 0);

  const ids = [
    ...Object.keys(fixtures.registry),
    ...fixtures.validationRuns.map((run) => run.methodId),
    ...fixtures.linearitySets.flatMap((set) => [set.setId, ...set.levels.map((level) => level.levelId)]),
    ...fixtures.comparisonSets.flatMap((set) => [set.setId, ...set.pairs.map((pair) => pair.specimenId)]),
    ...view.validationRows.map((row) => row.methodId),
    ...view.linearityRows.flatMap((row) => [row.setId, ...row.levelRecoveries.map((level) => level.levelId)]),
    ...view.comparisonRows.map((row) => row.setId),
  ];
  for (const id of ids) assert.match(id, /^SYNTHETIC-/);
  for (const run of fixtures.validationRuns) assert.match(run.matrix, /^synthetic-/);
});

test('builder is deterministic and isolated from fixture and row mutation, without ambient inputs', () => {
  const first = buildPilotMethodPerformanceView();
  assert.deepEqual(first, buildPilotMethodPerformanceView());
  const fixtures = createPilotMethodPerformanceFixtures();
  fixtures.registry['SYNTHETIC-METHOD-001'].validationState = 'retired';
  fixtures.linearitySets[0].levels[0].observed = 999;
  fixtures.comparisonSets[0].pairs[0].referenceValue = 999;
  assert.deepEqual(first, buildPilotMethodPerformanceView());

  const source = readFileSync('lib/ohworks-demo-method-performance-view.ts', 'utf8');
  assert.doesNotMatch(source, /Date\.now\s*\(|new Date\s*\(\s*\)|Math\.random|process\.env|fetch\s*\(/);
});

test('the panel is a read-only server component that imports the builder, mentions fabricated, and avoids forbidden compliance claims', () => {
  const source = readFileSync('app/pilot/ohworks/_components/method-performance-panel.tsx', 'utf8');
  assert.doesNotMatch(source, /use client/);
  assert.match(source, /fabricated/);
  assert.match(source, /buildPilotMethodPerformanceView/);
  assert.doesNotMatch(source, /production-ready/i);
  assert.doesNotMatch(source, /live integration is supported/i);
  assert.doesNotMatch(source, /\b(is|are|now)\s+(accredited|certified|validated)\b/i);
});

test('the QC page imports and renders MethodPerformancePanel exactly once', () => {
  const source = readFileSync('app/pilot/ohworks/qc/page.tsx', 'utf8');
  assert.equal((source.match(/import\s*\{\s*MethodPerformancePanel\s*\}\s*from\s*'@\/app\/pilot\/ohworks\/_components\/method-performance-panel';/g) ?? []).length, 1);
  assert.equal((source.match(/<MethodPerformancePanel\s*\/>/g) ?? []).length, 1);
});
