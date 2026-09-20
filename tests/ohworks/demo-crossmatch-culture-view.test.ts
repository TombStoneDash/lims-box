import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildPilotCrossmatchCultureView,
  createPilotCrossmatchCultureFixtures,
  DEMO_NOW,
  DEMO_GRACE_PERIOD_HOURS,
} from '../../lib/ohworks-demo-crossmatch-culture-view';
import { evaluateCrossmatchHold } from '../../lib/ohworks-bloodbank-crossmatch-hold';
import { computeReadSchedule, isReadOverdue } from '../../lib/ohworks-micro-culture-incubation';

test('five crossmatch scenarios match the real evaluator on exported fixtures', () => {
  const view = buildPilotCrossmatchCultureView();
  const fixtures = createPilotCrossmatchCultureFixtures();
  assert.equal(view.now, DEMO_NOW);
  assert.equal(view.crossmatchRows.length, fixtures.crossmatchRequests.length);
  assert.deepEqual(view.crossmatchRows.map((row) => [row.status, row.requiresExtendedCrossmatch]), [
    ['clear_to_crossmatch', false],
    ['hold_antibody_workup', true],
    ['hold_pending_screen', false],
    ['hold_sample_expired', false],
    ['hold_antibody_workup', true],
  ]);
  fixtures.crossmatchRequests.forEach(({ id, input }, index) => {
    const expected = evaluateCrossmatchHold(input);
    const actual = view.crossmatchRows[index];
    assert.equal(actual.id, id);
    assert.equal(actual.status, expected.status);
    assert.equal(actual.requiresExtendedCrossmatch, expected.requiresExtendedCrossmatch);
    assert.equal(actual.reason, expected.reason);
    assert.deepEqual(
      { abo: actual.abo, rhD: actual.rhD, antibodyScreenResult: actual.antibodyScreenResult,
        priorAntibodyIdentified: actual.priorAntibodyIdentified, requestedUnitCount: actual.requestedUnitCount,
        sampleAgeHours: actual.sampleAgeHours, maxSampleAgeHoursForType: actual.maxSampleAgeHoursForType },
      input,
    );
  });
});

test('negative screen with prior antibody history still holds for antibody workup', () => {
  const view = buildPilotCrossmatchCultureView();
  const row = view.crossmatchRows.find((r) => r.id === 'SYNTHETIC-XM-005');
  assert.ok(row);
  assert.equal(row.antibodyScreenResult, 'negative');
  assert.ok(row.priorAntibodyIdentified.length > 0);
  assert.equal(row.status, 'hold_antibody_workup');
  assert.equal(row.requiresExtendedCrossmatch, true);
});

test('four culture scenarios match the real scheduler and overdue check on exported fixtures', () => {
  const view = buildPilotCrossmatchCultureView();
  const fixtures = createPilotCrossmatchCultureFixtures();
  assert.equal(view.gracePeriodHours, DEMO_GRACE_PERIOD_HOURS);
  assert.equal(view.cultureRows.length, fixtures.cultures.length);
  fixtures.cultures.forEach(({ id, specimenType, platedAt, requiresExtendedIncubation }, index) => {
    const expectedSchedule = computeReadSchedule({ specimenType, platedAt, requiresExtendedIncubation });
    const actual = view.cultureRows[index];
    assert.equal(actual.id, id);
    assert.equal(actual.specimenType, specimenType);
    assert.equal(actual.finalNegativeAt, expectedSchedule.finalNegativeAt);
    assert.equal(actual.reads.length, expectedSchedule.reads.length);
    expectedSchedule.reads.forEach((expectedRead, readIndex) => {
      const actualRead = actual.reads[readIndex];
      assert.equal(actualRead.label, expectedRead.label);
      assert.equal(actualRead.dueAt, expectedRead.dueAt);
      assert.equal(actualRead.overdue, isReadOverdue({ dueAt: expectedRead.dueAt, now: DEMO_NOW, gracePeriodHours: DEMO_GRACE_PERIOD_HOURS }));
    });
  });
});

test('culture reads cover overdue, within-grace and future examples', () => {
  const view = buildPilotCrossmatchCultureView();
  const allReads = view.cultureRows.flatMap((row) => row.reads);
  assert.ok(allReads.some((read) => read.overdue === true), 'expected at least one overdue read');
  assert.ok(
    allReads.some((read) => !read.overdue && Date.parse(read.dueAt) <= Date.parse(DEMO_NOW)),
    'expected at least one read past due but within its grace period',
  );
  assert.ok(
    allReads.some((read) => !read.overdue && Date.parse(read.dueAt) > Date.parse(DEMO_NOW)),
    'expected at least one read still in the future',
  );
});

test('blood, urine, wound and a respiratory extended-incubation culture are all represented', () => {
  const view = buildPilotCrossmatchCultureView();
  const bySpecimen = Object.fromEntries(view.cultureRows.map((row) => [row.specimenType, row]));
  assert.ok(bySpecimen.blood);
  assert.ok(bySpecimen.urine);
  assert.ok(bySpecimen.wound);
  assert.ok(bySpecimen.respiratory);
  assert.equal(bySpecimen.respiratory.requiresExtendedIncubation, true);
});

test('headline counts, explanations and synthetic identifiers cover every fixture and row', () => {
  const view = buildPilotCrossmatchCultureView();
  const fixtures = createPilotCrossmatchCultureFixtures();
  assert.deepEqual(view.counts, {
    crossmatchOnHold: view.crossmatchRows.filter((row) => row.status !== 'clear_to_crossmatch').length,
    cultureReadsOverdue: view.cultureRows.reduce((sum, row) => sum + row.reads.filter((read) => read.overdue).length, 0),
  });
  assert.ok(view.counts.crossmatchOnHold > 0);
  assert.ok(view.counts.cultureReadsOverdue > 0);
  for (const row of view.crossmatchRows) assert.ok(row.reason.trim().length > 0);
  const ids = [
    ...fixtures.crossmatchRequests.map((r) => r.id),
    ...fixtures.cultures.map((c) => c.id),
    ...view.crossmatchRows.map((r) => r.id),
    ...view.cultureRows.map((r) => r.id),
  ];
  for (const id of ids) assert.match(id, /^SYNTHETIC-/);
});

test('builder is deterministic and isolated from fixture mutation, without ambient inputs', () => {
  const first = buildPilotCrossmatchCultureView();
  assert.deepEqual(first, buildPilotCrossmatchCultureView());
  const fixtures = createPilotCrossmatchCultureFixtures();
  fixtures.crossmatchRequests[0].input.antibodyScreenResult = 'positive';
  fixtures.cultures[0].platedAt = DEMO_NOW;
  assert.deepEqual(first, buildPilotCrossmatchCultureView());
  first.crossmatchRows[0].reason = '';
  assert.notDeepEqual(first, buildPilotCrossmatchCultureView());

  const source = readFileSync('lib/ohworks-demo-crossmatch-culture-view.ts', 'utf8');
  assert.doesNotMatch(source, /Date\.now\s*\(|new Date\s*\(\s*\)|Math\.random|process\.env|fetch\s*\(/);
});

test('panel is a read-only server component that calls the builder and stays within copy rules', () => {
  const source = readFileSync('app/pilot/ohworks/_components/crossmatch-culture-panel.tsx', 'utf8');
  assert.doesNotMatch(source, /use client/);
  assert.match(source, /fabricated/);
  assert.match(source, /buildPilotCrossmatchCultureView/);
  assert.doesNotMatch(source, /production-ready/i);
  assert.doesNotMatch(source, /live integration is supported/i);
  assert.doesNotMatch(source, /\b(is|are|now)\s+(accredited|certified|validated)\b/i);
});

test('critical-results page imports and renders CrossmatchCulturePanel exactly once', () => {
  const source = readFileSync('app/pilot/ohworks/critical-results/page.tsx', 'utf8');
  assert.equal((source.match(/CrossmatchCulturePanel/g) ?? []).length, 2);
  assert.match(source, /import\s*\{\s*CrossmatchCulturePanel\s*\}\s*from\s*['"]@\/app\/pilot\/ohworks\/_components\/crossmatch-culture-panel['"]/);
  assert.match(source, /<CrossmatchCulturePanel\s*\/>/);
});
