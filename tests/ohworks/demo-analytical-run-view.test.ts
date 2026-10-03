import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildPilotAnalyticalRunView, createPilotAnalyticalRunFixture } from '../../lib/ohworks-demo-analytical-run-view';
import { evaluateCarryoverRisk, explainCarryoverReason } from '../../lib/ohworks-carryover';
import { evaluateDilutionRerun, explainDilutionRerunReason } from '../../lib/ohworks-dilution-rerun';

test('eight fabricated carryover positions match the real evaluator including wash resets and rounding', () => {
  const fixture = createPilotAnalyticalRunFixture();
  const view = buildPilotAnalyticalRunView();
  assert.equal(fixture.carryoverRun.rules.length, 1);
  assert.equal(new Set(fixture.carryoverRun.results.map((row) => row.analyteCode)).size, 1);
  assert.deepEqual(view.carryoverRows.map((row) => row.status), ['clear', 'clear', 'must_repeat', 'clear', 'at_risk', 'clear', 'clear', 'clear']);
  const expected = evaluateCarryoverRisk(fixture.carryoverRun);
  view.carryoverRows.forEach((row, index) => {
    const input = fixture.carryoverRun.results[index];
    const result = expected[index];
    assert.equal(row.position, input.position);
    assert.equal(row.resultId, input.resultId);
    assert.equal(row.value, input.value);
    assert.equal(row.washBefore, input.washBefore);
    for (const key of ['status', 'reasonCode', 'contribution', 'sourcePosition'] as const) assert.equal(row[key], result[key]);
    assert.equal(row.contributionText, result.contribution === null ? '—' : result.contribution.toFixed(3));
    assert.equal(row.sourcePositionText, result.sourcePosition === null ? '—' : `SYNTHETIC-POS-${String(result.sourcePosition).padStart(2, '0')}`);
    assert.equal(row.explanation, explainCarryoverReason(result.reasonCode));
    assert.ok(row.explanation.trim());
  });
  assert.equal(view.carryoverRows[0].reasonCode, 'no-preceding-high');
  assert.equal(view.carryoverRows[2].contributionText, '12.345');
  assert.equal(view.carryoverRows[2].sourcePosition, 2);
  assert.equal(view.carryoverRows[4].contributionText, '2.469');
  assert.equal(view.carryoverRows[4].sourcePosition, 4);
  assert.equal(view.carryoverRows[6].reasonCode, 'reset-by-wash');
  assert.equal(view.carryoverRows[6].contribution, null);
});

test('five dilution scenarios reproduce decisions, reason text and applicable numeric outputs', () => {
  const fixture = createPilotAnalyticalRunFixture();
  const view = buildPilotAnalyticalRunView();
  assert.deepEqual(view.dilutionRows.map((row) => row.decision), ['report_as_is', 'rerun_with_dilution', 'report_as_greater_than', 'block', 'block']);
  assert.deepEqual(view.dilutionRows.map((row) => row.reasonCode), ['within-range', 'rerun-required', 'max-dilution-reached', 'max-reruns-exceeded', 'unknown-analyte']);
  fixture.dilutionReadings.forEach(({ id, label, request }, index) => {
    const result = evaluateDilutionRerun(request);
    const row = view.dilutionRows[index];
    for (const key of ['decision', 'reasonCode', 'reason', 'correctedResult', 'nextDilutionFactor', 'greaterThanLimit'] as const) assert.equal(row[key], result[key]);
    assert.equal(row.id, id);
    assert.equal(row.label, label);
    assert.equal(row.rawReading, request.result.rawReading);
    assert.equal(row.appliedDilutionFactor, request.result.appliedDilutionFactor);
    assert.equal(row.reason, explainDilutionRerunReason(result.reasonCode));
    assert.ok(row.reason.trim());
  });
  assert.equal(view.dilutionRows[0].correctedResult, 80);
  assert.equal(view.dilutionRows[0].outcomeText, 'Corrected result: 80 synthetic-units');
  assert.equal(view.dilutionRows[1].nextDilutionFactor, 5);
  assert.equal(view.dilutionRows[1].outcomeText, 'Next factor: 5');
  assert.equal(view.dilutionRows[2].greaterThanLimit, 2000);
  assert.equal(view.dilutionRows[2].outcomeText, 'Greater than: > 2000 synthetic-units');
  assert.equal(view.dilutionRows[3].outcomeText, '—');
  assert.equal(view.dilutionRows[4].outcomeText, '—');
  assert.deepEqual(view.counts, { mustRepeat: 1, rerunsRequired: 1, blocked: 2 });
});

test('identifiers are synthetic and fixtures and view are deterministic and isolated', () => {
  const fixture = createPilotAnalyticalRunFixture();
  const view = buildPilotAnalyticalRunView();
  const ids = [
    ...fixture.carryoverRun.rules.map((row) => row.analyteCode),
    ...fixture.carryoverRun.results.flatMap((row) => [row.resultId, row.analyteCode]),
    ...fixture.dilutionReadings.flatMap((row) => [row.id, row.request.result.analyteCode, row.request.ladder.analyteCode, ...row.request.measuringRanges.map((range) => range.analyteCode)]),
    ...view.carryoverRows.flatMap((row) => [row.positionId, row.resultId, ...(row.sourcePositionText === '—' ? [] : [row.sourcePositionText])]),
    ...view.dilutionRows.map((row) => row.id),
  ];
  for (const id of ids) assert.match(id, /^SYNTHETIC-/);
  assert.deepEqual(fixture, createPilotAnalyticalRunFixture());
  assert.deepEqual(view, buildPilotAnalyticalRunView());
  fixture.carryoverRun.results[0].value = 9999;
  view.dilutionRows[0].correctedResult = -1;
  assert.notDeepEqual(fixture, createPilotAnalyticalRunFixture());
  assert.notDeepEqual(view, buildPilotAnalyticalRunView());
  const source = readFileSync('lib/ohworks-demo-analytical-run-view.ts', 'utf8');
  assert.doesNotMatch(source, /Date\.now\s*\(|new Date\s*\(\s*\)|process\.env|fetch\s*\(/);
});

test('one read-only analytical section follows readiness and immediately precedes supplier questions', () => {
  const source = readFileSync('app/pilot/ohworks/instrument/page.tsx', 'utf8');
  const title = 'Analytical run checks — carryover and dilution (fabricated run)';
  assert.equal(source.split(title).length - 1, 1);
  assert.match(source, /const analyticalRun = buildPilotAnalyticalRunView\(\)/);
  assert.doesNotMatch(source, /['"]use client['"]|<form\b|fetch\s*\(|evaluateCarryoverRisk\(|evaluateDilutionRerun\(/);
  const readinessEnd = source.indexOf('</section>', source.indexOf('Run-readiness checks (fabricated instrument)'));
  const panelEnd = source.indexOf('</section>', source.indexOf(title));
  assert.ok(source.slice(readinessEnd, panelEnd).includes(title));
  assert.equal((source.slice(readinessEnd, panelEnd).match(/<section\b/g) ?? []).length, 1);
  assert.equal((source.slice(readinessEnd, panelEnd).match(/<table\b/g) ?? []).length, 2);
  assert.ok(source.slice(panelEnd, source.indexOf('</section>', panelEnd + 10)).includes('Supplier questions still open'));
  assert.match(source, /fabricated examples, not LIAISON XL specifications, and no instrument is connected/);
});
