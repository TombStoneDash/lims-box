import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildPilotUnitsInterferenceView,
  createPilotUnitsInterferenceFixtures,
} from '../../lib/ohworks-demo-units-interference-view';
import {
  convertResultToCanonicalUnit,
  explainResultUnitConversionError,
  ResultUnitConversionError,
} from '../../lib/ohworks-result-units';
import { evaluateSpecimenInterference } from '../../lib/ohworks-interference';

test('every unit-conversion scenario matches the real conversion module on exported fixtures, and refusals do not throw', () => {
  const view = buildPilotUnitsInterferenceView();
  const fixtures = createPilotUnitsInterferenceFixtures();
  assert.equal(view.conversionRows.length, fixtures.conversions.length);
  assert.equal(view.conversionRows.length, 7);

  assert.deepEqual(view.conversionRows.map((row) => row.outcome), [
    'converted', 'converted', 'converted', 'converted', 'converted', 'refused', 'refused',
  ]);

  fixtures.conversions.forEach((fixture, index) => {
    const { id, ...input } = fixture;
    const row = view.conversionRows[index];
    assert.equal(row.id, id);
    try {
      const expected = convertResultToCanonicalUnit(input);
      assert.equal(row.outcome, 'converted');
      assert.equal(row.canonicalText, expected.valueText);
      assert.equal(row.canonicalUnit, expected.canonicalUnit);
      assert.equal(row.significantFigures, expected.significantFigures);
      assert.equal(row.errorCode, null);
    } catch (error) {
      assert.ok(error instanceof ResultUnitConversionError);
      assert.equal(row.outcome, 'refused');
      assert.equal(row.canonicalText, null);
      assert.equal(row.canonicalUnit, null);
      assert.equal(row.significantFigures, null);
      assert.equal(row.errorCode, (error as ResultUnitConversionError).code);
      assert.equal(row.explanation, explainResultUnitConversionError((error as ResultUnitConversionError).code));
    }
  });

  // µg/L -> mg/L keeps the trailing zero written by the caller.
  assert.equal(view.conversionRows[0].canonicalText, '1.230');
  assert.equal(view.conversionRows[0].canonicalUnit, 'mg/L');
  // g/L -> mg/L.
  assert.equal(view.conversionRows[1].canonicalText, '2500');
  // % -> mL/L.
  assert.equal(view.conversionRows[2].canonicalText, '35');
  // count/100mL -> count/L.
  assert.equal(view.conversionRows[3].canonicalText, '2500');
  // Value already reported in the canonical unit.
  assert.equal(view.conversionRows[4].canonicalText, '12.5');
  assert.equal(view.conversionRows[4].canonicalUnit, 'mg/L');
  // Cross-family: mg/L is not in the count-per-volume family.
  assert.equal(view.conversionRows[5].errorCode, 'cross-family-conversion');
  // Unknown source unit.
  assert.equal(view.conversionRows[6].errorCode, 'from-unit-unknown');
});

test('every interference scenario matches the real evaluator on exported fixtures, including index-missing', () => {
  const view = buildPilotUnitsInterferenceView();
  const fixtures = createPilotUnitsInterferenceFixtures();
  assert.equal(view.specimenRows.length, 4);
  assert.equal(view.specimenRows.length, fixtures.specimens.length);

  fixtures.specimens.forEach((input, index) => {
    const expected = evaluateSpecimenInterference(input);
    const row = view.specimenRows[index];
    assert.equal(row.specimenId, expected.specimenId);
    assert.equal(row.hemolysisIndex, input.indices.hemolysisIndex ?? null);
    assert.equal(row.icterusIndex, input.indices.icterusIndex ?? null);
    assert.equal(row.lipemiaIndex, input.indices.lipemiaIndex ?? null);
    assert.deepEqual(
      row.decisions,
      expected.decisions.map((decision) => ({
        analyteCode: decision.analyteCode, status: decision.status,
        reasonCode: decision.reasonCode, commentCodes: decision.commentCodes,
      })),
    );
    assert.deepEqual(row.summary, expected.summary);
  });

  // All indices low: every ordered analyte reports cleanly.
  assert.deepEqual(view.specimenRows[0].decisions.map((decision) => decision.status),
    ['report', 'report', 'report', 'report']);

  // Hemolysis above the comment threshold, below the suppress threshold.
  const commented = view.specimenRows[1].decisions[0];
  assert.equal(commented.analyteCode, 'SYNTHETIC-ANALYTE-K');
  assert.equal(commented.status, 'report_with_comment');
  assert.equal(commented.reasonCode, 'comment-threshold-exceeded');
  assert.deepEqual(commented.commentCodes, ['SYNTHETIC-HEM-COMMENT']);

  // Hemolysis above the suppress threshold.
  const suppressed = view.specimenRows[2].decisions[0];
  assert.equal(suppressed.analyteCode, 'SYNTHETIC-ANALYTE-K');
  assert.equal(suppressed.status, 'suppress');
  assert.equal(suppressed.reasonCode, 'suppress-threshold-exceeded');

  // Lipemia index not measured for an analyte that declares a lipemia rule.
  const missing = view.specimenRows[3].decisions.find((decision) => decision.analyteCode === 'SYNTHETIC-ANALYTE-TBIL');
  assert.ok(missing);
  assert.equal(missing?.status, 'suppress');
  assert.equal(missing?.reasonCode, 'index-missing');
  assert.equal(view.specimenRows[3].lipemiaIndex, null);
});

test('headline counts match the underlying rows and every non-passing row carries a non-empty explanation', () => {
  const view = buildPilotUnitsInterferenceView();
  assert.deepEqual(view.counts, {
    conversionsRefused: 2,
    analytesSuppressed: 2,
    analytesReportedWithComment: 1,
  });
  assert.equal(view.counts.conversionsRefused, view.conversionRows.filter((row) => row.outcome === 'refused').length);
  assert.equal(
    view.counts.analytesSuppressed,
    view.specimenRows.reduce((sum, row) => sum + row.decisions.filter((decision) => decision.status === 'suppress').length, 0),
  );
  assert.equal(
    view.counts.analytesReportedWithComment,
    view.specimenRows.reduce((sum, row) => sum + row.decisions.filter((decision) => decision.status === 'report_with_comment').length, 0),
  );

  for (const row of view.conversionRows) {
    if (row.outcome === 'refused') {
      assert.ok(row.explanation.trim());
    }
  }
});

test('every fabricated identifier is clearly marked synthetic', () => {
  const view = buildPilotUnitsInterferenceView();
  const fixtures = createPilotUnitsInterferenceFixtures();
  const ids = [
    ...fixtures.conversions.map((fixture) => fixture.id),
    ...fixtures.specimens.map((specimen) => specimen.specimenId),
    ...Object.keys(fixtures.toleranceTable),
    ...view.conversionRows.map((row) => row.id),
    ...view.specimenRows.map((row) => row.specimenId),
    ...view.specimenRows.flatMap((row) => row.decisions.map((decision) => decision.analyteCode)),
    ...view.specimenRows.flatMap((row) => row.decisions.flatMap((decision) => decision.commentCodes)),
  ];
  for (const id of ids) {
    assert.match(id, /^SYNTHETIC-/);
  }
});

test('builder is deterministic and isolated from fixture and row mutation, without ambient inputs', () => {
  const first = buildPilotUnitsInterferenceView();
  assert.deepEqual(first, buildPilotUnitsInterferenceView());

  const fixtures = createPilotUnitsInterferenceFixtures();
  fixtures.conversions[0].valueText = '999';
  fixtures.specimens[0].indices.hemolysisIndex = 999;
  assert.deepEqual(first, buildPilotUnitsInterferenceView());

  first.conversionRows[0].explanation = '';
  assert.notDeepEqual(first, buildPilotUnitsInterferenceView());

  const source = readFileSync('lib/ohworks-demo-units-interference-view.ts', 'utf8');
  assert.doesNotMatch(source, /Date\.now\s*\(|new Date\s*\(\s*\)|Math\.random|process\.env|fetch\s*\(/);
});

test('panel is a read-only, dependency-free server component that renders the real view-model with no compliance claims', () => {
  const source = readFileSync('app/pilot/ohworks/_components/units-interference-panel.tsx', 'utf8');
  assert.doesNotMatch(source, /use client/);
  assert.match(source, /fabricated/);
  assert.match(source, /import \{ buildPilotUnitsInterferenceView \} from '@\/lib\/ohworks-demo-units-interference-view';/);
  assert.doesNotMatch(source, /production-ready/i);
  assert.doesNotMatch(source, /live integration is supported/i);
  assert.doesNotMatch(source, /\b(is|are|now)\s+(accredited|certified|validated)\b/i);
});

test('result-review page mounts the units-and-interference panel exactly once', () => {
  const source = readFileSync('app/pilot/ohworks/result-review/page.tsx', 'utf8');
  assert.match(source, /import \{ UnitsInterferencePanel \} from '@\/app\/pilot\/ohworks\/_components\/units-interference-panel';/);
  assert.equal(source.split('<UnitsInterferencePanel />').length - 1, 1);
});
