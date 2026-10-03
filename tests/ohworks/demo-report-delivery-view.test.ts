import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildPilotReportDeliveryView } from '../../lib/ohworks-demo-report-delivery-view';
import { formatReportedResult, ReportingFormatError, explainReportingFormatError } from '../../lib/ohworks-reporting-format';
import { computeReportDistribution, explainDistributionBlockReason, explainDistributionBlockNextAction } from '../../lib/ohworks-report-distribution';
import { applyReportAmendments, explainAmendmentChainReason, explainAmendmentChainNextAction } from '../../lib/ohworks-report-amendment';

test('five fabricated formatting scenarios come from the real formatter, including the typed unresolved error', () => {
  const view = buildPilotReportDeliveryView();
  assert.equal(view.formatting.length, 5);
  for (const row of view.formatting.slice(0, 4)) {
    assert.deepEqual(row.outcome, formatReportedResult({ analyteCode: row.analyteCode, value: row.value, formats: view.formats }));
    assert.equal(row.errorCode, null);
  }
  assert.deepEqual(view.formatting.map((row) => row.outcome?.reportString ?? null), [
    '12.35 synthetic-units', '<1 synthetic-units', '>100 synthetic-units', '20.00 synthetic-units', null,
  ]);
  assert.deepEqual(view.formatting.slice(0, 4).map((row) => row.outcome?.censoring), [null, 'below-detection', 'above-quantitation', null]);
  assert.equal(view.formatting[3].outcome?.qualitativeLabel, 'synthetic-high-band');
  const missing = view.formatting[4];
  assert.equal(missing.errorCode, 'unknown-analyte');
  assert.ok(missing.explanation?.trim());
  assert.throws(() => formatReportedResult({ ...missing, formats: view.formats }), (error: unknown) => {
    assert.ok(error instanceof ReportingFormatError);
    assert.equal(missing.errorCode, error.code);
    assert.equal(missing.explanation, explainReportingFormatError(error.code));
    return true;
  });
});

test('four fabricated distribution scenarios reproduce routing, unrouted classes and fail-closed outcomes', () => {
  const { distribution } = buildPilotReportDeliveryView();
  assert.equal(distribution.length, 4);
  for (const row of distribution) {
    assert.deepEqual(row.outcome, computeReportDistribution(row.report, row.matrix));
    if (row.outcome.block) {
      assert.equal(row.explanation, explainDistributionBlockReason(row.outcome.block.code));
      assert.equal(row.nextAction, explainDistributionBlockNextAction(row.outcome.block.code));
      assert.ok(row.explanation?.trim());
      assert.ok(row.nextAction?.trim());
      assert.deepEqual(row.outcome.routedEntries, []);
    }
  }
  assert.deepEqual(distribution.map((row) => row.outcome.status), ['DISTRIBUTED', 'DISTRIBUTED', 'BLOCKED', 'BLOCKED']);
  assert.deepEqual(distribution.map((row) => row.report.kind), ['FINAL', 'FINAL', 'PRELIMINARY', 'FINAL']);
  assert.equal(distribution[0].outcome.recipientRoles.length, 3);
  assert.equal(distribution[0].outcome.routedEntries.length, 5);
  assert.deepEqual(distribution[0].outcome.unroutedTestClasses, []);
  assert.deepEqual(distribution[0].outcome.routedEntries.filter((entry) => entry.recipientRole === 'SYNTHETIC-EMPLOYER-OUTCOME-ONLY').map((entry) => entry.testClass), ['SYNTHETIC-FITNESS-OUTCOME']);
  assert.deepEqual(distribution[1].outcome.unroutedTestClasses, ['SYNTHETIC-UNROUTED']);
  assert.equal(distribution[1].outcome.routedEntries.length, 2);
  assert.equal(distribution[2].outcome.block?.code, 'final-only-class-on-preliminary-report');
  assert.equal(distribution[3].outcome.block?.code, 'channel-type-unknown');
});

test('three fabricated amendment chains reproduce accepted links and invalid reasons', () => {
  const { amendments } = buildPilotReportDeliveryView();
  assert.equal(amendments.length, 3);
  for (const row of amendments) {
    assert.deepEqual(row.outcome, applyReportAmendments(row.reportReferenceToken, row.amendments));
    if (row.outcome.failure) {
      assert.equal(row.explanation, explainAmendmentChainReason(row.outcome.failure.code));
      assert.equal(row.nextAction, explainAmendmentChainNextAction(row.outcome.failure.code));
      assert.ok(row.explanation?.trim());
      assert.ok(row.nextAction?.trim());
    }
  }
  assert.deepEqual(amendments.map((row) => row.outcome.status), ['VALID', 'INVALID', 'INVALID']);
  assert.equal(amendments[0].outcome.currentEffectiveVersion, 3);
  assert.deepEqual(amendments[0].outcome.supersedeChain, amendments[0].amendments);
  assert.deepEqual(amendments[0].outcome.supersedeChain.map((entry) => [entry.supersedesVersion, entry.versionNumber]), [[1, 2], [2, 3]]);
  assert.equal(amendments[1].outcome.failure?.code, 'author-role-unauthorized');
  assert.equal(amendments[2].outcome.failure?.code, 'version-skipped');
  assert.deepEqual(amendments.slice(1).map((row) => row.outcome.currentEffectiveVersion), [1, 1]);
});

test('headline counts, identifiers and all output remain synthetic, contact-free and deterministic', () => {
  const view = buildPilotReportDeliveryView();
  assert.deepEqual(view.counts, { censoredResults: 2, blockedReports: 2, invalidChains: 2 });
  for (const row of view.formatting) assert.match(row.analyteCode, /^SYNTHETIC-/);
  for (const format of view.formats) assert.match(format.analyteCode, /^SYNTHETIC-/);
  for (const row of view.distribution) {
    assert.match(row.report.reportReferenceToken, /^SYNTHETIC-RPT-\d{3}$/);
    for (const testClass of row.report.testClasses) assert.match(testClass, /^SYNTHETIC-/);
    for (const rule of row.matrix) {
      assert.match(rule.recipientRole, /^SYNTHETIC-/);
      for (const testClass of rule.allowedTestClasses) assert.match(testClass, /^SYNTHETIC-/);
    }
  }
  for (const row of view.amendments) assert.match(row.reportReferenceToken, /^SYNTHETIC-RPT-\d{3}$/);
  const text = JSON.stringify(view);
  assert.doesNotMatch(text, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  assert.doesNotMatch(text, /(?:\+?\d{1,3}[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}|\b\d{10,}\b/);
  assert.doesNotMatch(text, /(?:phone|fax|tel)\s*[:=]\s*[+\d(]/i);
  assert.deepEqual(view, buildPilotReportDeliveryView());
  view.formats[0].decimalPlaces = 0;
  assert.notDeepEqual(view, buildPilotReportDeliveryView());
});

test('builder has no ambient dependencies and page only renders its results', () => {
  const source = readFileSync('lib/ohworks-demo-report-delivery-view.ts', 'utf8');
  assert.doesNotMatch(source, /Date\.now\s*\(|new Date\s*\(\s*\)|process\.env|fetch\s*\(/);
  const page = readFileSync('app/pilot/ohworks/reports/page.tsx', 'utf8');
  assert.match(page, /buildPilotReportDeliveryView\(\)/);
  assert.match(page, /NOTHING is sent/);
  assert.doesNotMatch(page, /use client|<form\b|fetch\s*\(|formatReportedResult\(|computeReportDistribution\(|applyReportAmendments\(/);
});
