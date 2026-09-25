import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildPilotQualityIndicatorsView, buildQualityIndicatorsFixture, buildQualityPtFixtures } from '../../lib/ohworks-demo-quality-indicators-view';
import { computeQualityIndicators } from '../../lib/ohworks-quality-indicators';
import { evaluatePtEvent, explainPtClassification, explainPtEventFailReason } from '../../lib/ohworks-pt-scoring';

test('all indicator numbers and formatting reproduce the real evaluator', () => {
  const fixture = buildQualityIndicatorsFixture();
  const report = computeQualityIndicators(fixture);
  const view = buildPilotQualityIndicatorsView();
  assert.equal(view.period, 'SYNTHETIC-2026-08');
  assert.equal(fixture.specimensReceived.length, 40);
  assert.ok(fixture.criticalValues.some((value) => value.acknowledgedAfterMinutes === null));
  const results = [...Object.values(report.rejectionRateByReason), ...Object.values(report.turnaroundComplianceByPriority), report.correctedReportRate, report.criticalValueAckCompliance];
  assert.equal(view.indicators.length, results.length);
  view.indicators.forEach((row, i) => {
    const result = results[i];
    assert.deepEqual({ numerator: row.numerator, denominator: row.denominator, ratePercent: row.ratePercent, targetPercent: row.targetPercent }, result);
    assert.equal(row.rate, result.ratePercent === null ? 'not measurable this period' : `${result.ratePercent.toFixed(1)}%`);
    assert.equal(row.target, `${row.direction === 'lower' ? '≤' : '≥'} ${result.targetPercent.toFixed(1)}%`);
  });
  assert.equal(Object.values(report.rejectionRateByReason).filter((r) => r.ratePercent! > r.targetPercent).length, 1);
});

test('zero denominator remains unmeasurable and both target directions include met and missed', () => {
  const rows = buildPilotQualityIndicatorsView().indicators;
  const empty = rows.filter((row) => row.denominator === 0);
  assert.equal(empty.length, 1);
  assert.equal(empty[0].rate, 'not measurable this period');
  assert.equal(empty[0].ratePercent, null);
  assert.equal(empty[0].meetsTarget, null);
  assert.equal(empty[0].status, 'not measurable');
  for (const direction of ['lower', 'higher'] as const) {
    const measurable = rows.filter((row) => row.direction === direction && row.ratePercent !== null);
    assert.ok(measurable.some((row) => row.meetsTarget === true));
    assert.ok(measurable.some((row) => row.meetsTarget === false));
    for (const row of measurable) {
      assert.equal(row.meetsTarget, direction === 'lower' ? row.ratePercent! <= row.targetPercent : row.ratePercent! >= row.targetPercent);
      assert.equal(row.status, row.meetsTarget ? 'met' : 'missed');
    }
  }
  const corrected = rows.find((row) => row.label === 'Fabricated corrected reports')!;
  assert.equal(corrected.ratePercent, corrected.targetPercent);
  assert.equal(corrected.meetsTarget, true);
});

test('PT counts, scores, outcomes and explanations come from the real evaluator', () => {
  const events = buildPilotQualityIndicatorsView().ptEvents;
  assert.deepEqual(events.map((event) => event.outcome), ['pass', 'fail']);
  assert.deepEqual(events.map((event) => event.consensusSource), ['declared', 'robust-statistics']);
  assert.equal(events[0].satisfactoryCount, events[0].participantScores.length);
  assert.equal(events[1].unsatisfactoryCount, 1);
  assert.ok(events[1].failReasons.includes('unsatisfactory-count-exceeded'));
  buildQualityPtFixtures().forEach((fixture, i) => {
    const result = evaluatePtEvent(fixture.results, fixture.consensus, fixture.limits);
    const row = events[i];
    assert.equal(row.label, fixture.label);
    for (const key of ['consensusSource', 'outcome', 'satisfactoryCount', 'questionableCount', 'unsatisfactoryCount'] as const) assert.equal(row[key], result[key]);
    assert.equal(row.assignedValue, result.assignedValue.toFixed(2));
    assert.equal(row.standardDeviation, result.standardDeviation.toFixed(2));
    assert.equal(row.satisfactoryRate, `${(result.satisfactoryRate * 100).toFixed(1)}%`);
    assert.deepEqual(row.failReasons, result.failReasons);
    assert.deepEqual(row.failReasonExplanations, result.failReasons.map(explainPtEventFailReason));
    assert.deepEqual(row.participantScores, result.participantScores.map((score) => ({ participantId: score.participantId, zScore: score.zScore.toFixed(2), classification: score.classification, explanation: explainPtClassification(score.classification) })));
  });
});

test('every fabricated identifier and declared code has a synthetic prefix', () => {
  const fixture = buildQualityIndicatorsFixture();
  const ids = [fixture.period, ...fixture.specimensReceived.map((r) => r.specimenId), ...fixture.specimensRejected.flatMap((r) => [r.specimenId, r.reasonCode]), ...fixture.resultsReported.flatMap((r) => [r.resultId, r.priority]), ...fixture.correctedReports.map((r) => r.resultId), ...fixture.criticalValues.map((r) => r.criticalValueId), ...Object.keys(fixture.targets.rejectionRatePercentByReason), ...Object.keys(fixture.targets.turnaroundTargetMinutesByPriority), ...Object.keys(fixture.targets.turnaroundCompliancePercentByPriority)];
  for (const event of buildQualityPtFixtures()) ids.push(event.label, ...event.results.map((r) => r.participantId));
  for (const id of ids) assert.ok(id.startsWith('SYNTHETIC-'), id);
});

test('fixtures and view are deterministic and isolated from caller mutation', () => {
  const original = buildPilotQualityIndicatorsView();
  assert.deepEqual(original, buildPilotQualityIndicatorsView());
  assert.deepEqual(buildQualityIndicatorsFixture(), buildQualityIndicatorsFixture());
  assert.deepEqual(buildQualityPtFixtures(), buildQualityPtFixtures());
  original.indicators[0].numerator = 999;
  original.ptEvents[0].participantScores[0].zScore = '999';
  assert.notDeepEqual(original, buildPilotQualityIndicatorsView());
});

test('pure view has no clock, randomness, environment or network dependency', () => {
  const source = readFileSync(new URL('../../lib/ohworks-demo-quality-indicators-view.ts', import.meta.url), 'utf8');
  for (const forbidden of ['Date.now(', 'new Date()', 'Math.random', 'process.env', 'fetch(']) assert.ok(!source.includes(forbidden));
  assert.doesNotMatch(source, /new Date\(\s*\)/);
});
