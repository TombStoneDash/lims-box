import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildInstrumentReadinessView, buildPilotInstrumentReadinessView, createPilotInstrumentReadinessFixture, DEMO_AS_OF } from '../../lib/ohworks-demo-instrument-readiness-view';
import { mapInstrumentFlags, explainFlagMappingReason } from '../../lib/ohworks-instrument-flags';
import { evaluateCalibrationVerificationSchedule, explainCalibrationVerificationReason } from '../../lib/ohworks-calibration-verification';
import { evaluateCalibratorLotTraceability, explainTraceabilityReason } from '../../lib/ohworks-calibrator-traceability';

function allGoodFixture() {
  const fixture = createPilotInstrumentReadinessFixture();
  return { ...fixture, messages: fixture.messages.slice(0, 1), schedules: fixture.schedules.slice(0, 1), lotIds: fixture.lotIds.slice(0, 1) };
}

test('fabricated rows contain every required decision from the real evaluators and explanations', () => {
  const fixture = createPilotInstrumentReadinessFixture();
  const view = buildPilotInstrumentReadinessView();
  assert.equal(view.asOf, DEMO_AS_OF);
  assert.deepEqual(view.flagRows.map((row) => row.decision), ['mapped', 'mapped', 'blocked']);
  assert.match(view.flagRows[0].detail, /action: report/);
  assert.match(view.flagRows[1].detail, /action: review/);
  assert.deepEqual(view.calibrationRows.map((row) => row.decision), ['CURRENT', 'DUE_SOON', 'OVERDUE', 'REQUIRED_BY_EVENT']);
  assert.deepEqual(view.traceabilityRows.map((row) => row.decision), ['traceable', 'not_traceable']);
  fixture.messages.forEach((message, index) => {
    const result = mapInstrumentFlags(fixture.flagTable, fixture.instrumentModel, message.rawFlagCodes);
    const row = view.flagRows[index];
    assert.equal(row.decision, result.decision);
    assert.equal(row.reasonCode, result.reasonCode);
    assert.equal(row.explanation, explainFlagMappingReason(result.reasonCode));
    assert.ok(row.detail.includes(result.requiredAction));
  });
  fixture.schedules.forEach((schedule, index) => {
    const result = evaluateCalibrationVerificationSchedule(schedule, fixture.asOf);
    const row = view.calibrationRows[index];
    assert.equal(row.decision, result.decision);
    assert.equal(row.reasonCode, result.reasonCode);
    assert.equal(row.explanation, explainCalibrationVerificationReason(result.reasonCode));
  });
  fixture.lotIds.forEach((lotId, index) => {
    const result = evaluateCalibratorLotTraceability(fixture.lotRegistry, lotId, fixture.asOf);
    const row = view.traceabilityRows[index];
    assert.equal(row.decision, result.decision);
    assert.equal(row.reasonCode, result.reasonCode);
    assert.equal(row.explanation, explainTraceabilityReason(result.reasonCode));
  });
  assert.equal(view.flagRows[2].reasonCode, 'unmapped-flag-code');
  assert.equal(view.traceabilityRows[1].reasonCode, 'certificate-expired');
  assert.match(view.calibrationRows[3].detail, /reagent-lot-change/);
  assert.equal(view.readyToRun, false);
  assert.equal(view.blockingFindings, 5);
  assert.equal(view.statusText, 'Not ready to run — 5 blocking findings');
});

test('all-good fixture is ready, and due-soon alone remains advisory', () => {
  const good = allGoodFixture();
  const view = buildInstrumentReadinessView(good);
  assert.equal(view.readyToRun, true);
  assert.equal(view.blockingFindings, 0);
  assert.match(view.statusText, /^Ready to run/);
  const dueSoon = createPilotInstrumentReadinessFixture().schedules[1];
  assert.equal(buildInstrumentReadinessView({ ...good, schedules: [dueSoon] }).readyToRun, true);
});

test('each blocking condition independently prevents readiness, including an unknown flag mixed with a known flag', () => {
  const fixture = createPilotInstrumentReadinessFixture();
  const good = allGoodFixture();
  const cases = [
    { ...good, messages: [fixture.messages[1]] },
    { ...good, messages: [fixture.messages[2]] },
    { ...good, schedules: [fixture.schedules[2]] },
    { ...good, schedules: [fixture.schedules[3]] },
    { ...good, lotIds: [fixture.lotIds[1]] },
    { ...good, flagTable: { [good.instrumentModel]: { 'SYNTHETIC-F01': { canonicalFlag: 'SYNTHETIC-SUPPRESS', severity: 'critical' as const, action: 'suppress' as const } } } },
  ];
  for (const input of cases) {
    const view = buildInstrumentReadinessView(input);
    assert.equal(view.readyToRun, false);
    assert.equal(view.blockingFindings, 1);
  }
  const unknown = mapInstrumentFlags(fixture.flagTable, fixture.instrumentModel, fixture.messages[2].rawFlagCodes);
  assert.equal(unknown.decision, 'blocked');
  assert.deepEqual(unknown.canonicalFlags, []);
});

test('every fabricated identifier is SYNTHETIC-prefixed and view text contains no vendor names', () => {
  const fixture = createPilotInstrumentReadinessFixture();
  const ids = [fixture.instrumentModel, ...Object.keys(fixture.flagTable), ...fixture.lotIds];
  for (const definitions of Object.values(fixture.flagTable)) {
    ids.push(...Object.keys(definitions), ...Object.values(definitions).map((flag) => flag.canonicalFlag));
  }
  for (const message of fixture.messages) ids.push(message.id, ...message.rawFlagCodes);
  for (const schedule of fixture.schedules) ids.push(schedule.instrumentId, schedule.analyteId);
  for (const [key, lot] of Object.entries(fixture.lotRegistry)) {
    ids.push(key, lot.lotId);
    if (lot.parentReferenceId) ids.push(lot.parentReferenceId);
  }
  const view = buildPilotInstrumentReadinessView();
  ids.push(...[...view.flagRows, ...view.calibrationRows, ...view.traceabilityRows].map((row) => row.id));
  for (const id of ids) assert.match(id, /^SYNTHETIC-/);
  assert.equal(Object.keys(fixture.flagTable).length, 1);
  assert.equal(fixture.instrumentModel, 'SYNTHETIC-IMMUNOASSAY-ANALYZER');
  assert.doesNotMatch(JSON.stringify(view), /LIAISON|Orchidlive/i);
});

test('output is deterministic, does not mutate fixture, and has no clock, environment or fetching access', () => {
  const fixture = createPilotInstrumentReadinessFixture();
  const before = structuredClone(fixture);
  assert.deepEqual(buildInstrumentReadinessView(fixture), buildInstrumentReadinessView(structuredClone(fixture)));
  assert.deepEqual(fixture, before);
  assert.deepEqual(buildPilotInstrumentReadinessView(), buildPilotInstrumentReadinessView());
  const source = readFileSync('lib/ohworks-demo-instrument-readiness-view.ts', 'utf8');
  assert.doesNotMatch(source, /Date\.now\s*\(|process\.env|fetch\s*\(|new Date\s*\(\s*\)/);
});

test('page renders one read-only readiness section immediately before supplier questions', () => {
  const source = readFileSync('app/pilot/ohworks/instrument/page.tsx', 'utf8');
  assert.match(source, /const readiness = buildPilotInstrumentReadinessView\(\)/);
  assert.doesNotMatch(source, /['"]use client['"]|<form\b|fetch\s*\(|mapInstrumentFlags\(|evaluateCalibrationVerificationSchedule\(|evaluateCalibratorLotTraceability\(/);
  const title = 'Run-readiness checks (fabricated instrument)';
  assert.equal(source.split(title).length - 1, 1);
  const sectionEnd = source.indexOf('</section>', source.indexOf(title));
  const nextSectionEnd = source.indexOf('</section>', sectionEnd + 10);
  assert.ok(source.slice(sectionEnd, nextSectionEnd).includes('Supplier questions still open'));
});
