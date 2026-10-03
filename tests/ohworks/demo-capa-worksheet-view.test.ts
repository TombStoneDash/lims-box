import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildPilotCapaWorksheetView, createPilotCapaWorksheetFixtures, TENANT_ID,
} from '../../lib/ohworks-demo-capa-worksheet-view';
import { runCorrectiveActionWorkflow, explainCorrectiveActionBlock } from '../../lib/ohworks-corrective-action';
import { runWorksheetVerificationWorkflow, explainWorksheetVerificationBlock, isHighRiskWorksheetType } from '../../lib/ohworks-worksheet-verification';

test('four fabricated corrective-action scenarios match the real workflow on exported fixtures', () => {
  const view = buildPilotCapaWorksheetView();
  const fixtures = createPilotCapaWorksheetFixtures();
  assert.equal(fixtures.correctiveActions.length, 4);
  assert.deepEqual(view.correctiveActionRows.map((row) => [row.finalState, row.blocked, row.blockCode]), [
    ['closed', false, null],
    ['effectiveness_checked', true, 'effectiveness-not-confirmed'],
    ['opened', true, 'role-not-allowed-for-kind'],
    ['investigating', true, 'skipped-transition'],
  ]);
  fixtures.correctiveActions.forEach(({ context, events }, index) => {
    const result = runCorrectiveActionWorkflow(context, events);
    const lastStep = result.steps.at(-1);
    const blockCode = lastStep && lastStep.allowed === false ? lastStep.blockCode : null;
    const row = view.correctiveActionRows[index];
    assert.equal(row.recordId, context.recordId);
    assert.equal(row.finalState, result.finalState);
    assert.equal(row.stepsApplied, result.history.length);
    assert.equal(row.blocked, result.blocked);
    assert.equal(row.blockCode, blockCode);
    assert.equal(row.explanation, blockCode ? explainCorrectiveActionBlock(blockCode) : `No step was blocked; the fabricated record reached ${result.finalState}.`);
  });
  assert.deepEqual(view.correctiveActionRows.map((row) => row.rootCause), ['EQUIPMENT_MALFUNCTION', 'PROCEDURE_NOT_FOLLOWED', null, null]);
  assert.equal(view.counts.correctiveActionsBlocked, 3);
});

test('four fabricated worksheet scenarios match the real workflow on exported fixtures', () => {
  const view = buildPilotCapaWorksheetView();
  const fixtures = createPilotCapaWorksheetFixtures();
  assert.equal(fixtures.worksheets.length, 4);
  assert.deepEqual(view.worksheetRows.map((row) => [row.worksheetType, row.highRisk, row.finalState, row.blocked, row.blockCode]), [
    ['routine_chemistry', false, 'locked', false, null],
    ['routine_chemistry', false, 'prepared', true, 'self-verification-rejected'],
    ['molecular_pathology', true, 'verified', true, 'sign-off-required-for-high-risk'],
    ['molecular_pathology', true, 'locked', true, 'edit-rejected-worksheet-locked'],
  ]);
  fixtures.worksheets.forEach(({ context, events }, index) => {
    const result = runWorksheetVerificationWorkflow(context, events);
    const lastStep = result.steps.at(-1);
    const blockCode = lastStep && lastStep.allowed === false ? lastStep.blockCode : null;
    const row = view.worksheetRows[index];
    assert.equal(row.worksheetId, context.worksheetId);
    assert.equal(row.highRisk, isHighRiskWorksheetType(context.worksheetType));
    assert.equal(row.finalState, result.finalState);
    assert.equal(row.blocked, result.blocked);
    assert.equal(row.blockCode, blockCode);
    assert.deepEqual(row.stepTrail, events.map((event) => ({ kind: event.kind, role: event.actorRole })));
    assert.equal(row.explanation, blockCode ? explainWorksheetVerificationBlock(blockCode) : `No step was blocked; the fabricated worksheet reached ${result.finalState}.`);
  });
  assert.equal(view.counts.worksheetsBlocked, 3);
  assert.ok(fixtures.worksheets.some(({ context }) => isHighRiskWorksheetType(context.worksheetType)));
});

test('error rows do not throw and every explanation is non-empty', () => {
  assert.doesNotThrow(() => buildPilotCapaWorksheetView());
  const view = buildPilotCapaWorksheetView();
  for (const row of [...view.correctiveActionRows, ...view.worksheetRows]) {
    assert.ok(row.explanation.trim());
  }
});

test('all fabricated identifiers use synthetic prefixes', () => {
  const fixtures = createPilotCapaWorksheetFixtures();
  const view = buildPilotCapaWorksheetView();
  assert.match(TENANT_ID, /^synthetic-/);
  const capaIds = fixtures.correctiveActions.flatMap(({ context, events }) => [
    context.recordId, context.initialFindingReference, context.tenantId,
    ...events.map((event) => event.eventId), ...events.map((event) => event.actorId),
  ]);
  const worksheetIds = fixtures.worksheets.flatMap(({ context, events }) => [
    context.worksheetId, context.tenantId, ...events.map((event) => event.eventId), ...events.map((event) => event.actorId),
  ]);
  for (const id of capaIds) assert.match(id, /^(SYNTHETIC-|synthetic-)/);
  for (const id of worksheetIds) assert.match(id, /^(SYNTHETIC-|synthetic-)/);
  for (const row of view.correctiveActionRows) assert.match(row.recordId, /^SYNTHETIC-/);
  for (const row of view.worksheetRows) assert.match(row.worksheetId, /^SYNTHETIC-/);
});

test('builder is deterministic', () => {
  const first = buildPilotCapaWorksheetView();
  assert.deepEqual(first, buildPilotCapaWorksheetView());
});

test('view-model source has no ambient inputs', () => {
  const source = readFileSync('lib/ohworks-demo-capa-worksheet-view.ts', 'utf8');
  assert.doesNotMatch(source, /Date\.now\s*\(|new Date\s*\(\s*\)|Math\.random|process\.env|fetch\s*\(/);
});

test('panel is a read-only server component with no forbidden copy', () => {
  const source = readFileSync('app/pilot/ohworks/_components/capa-worksheet-panel.tsx', 'utf8');
  assert.doesNotMatch(source, /['"]use client['"]/);
  assert.match(source, /fabricated/);
  assert.match(source, /import \{ buildPilotCapaWorksheetView \} from '@\/lib\/ohworks-demo-capa-worksheet-view';/);
  assert.doesNotMatch(source, /production-ready/i);
  assert.doesNotMatch(source, /live integration is supported/i);
  assert.doesNotMatch(source, /\b(?:is|are|now)\s+(?:accredited|certified|validated)\b/i);
  assert.doesNotMatch(source, /<form\b|fetch\s*\(/);
});

test('personnel page imports and renders CapaWorksheetPanel exactly once', () => {
  const source = readFileSync('app/pilot/ohworks/personnel/page.tsx', 'utf8');
  assert.equal((source.match(/import \{ CapaWorksheetPanel \} from '@\/app\/pilot\/ohworks\/_components\/capa-worksheet-panel';/g) ?? []).length, 1);
  assert.equal((source.match(/<CapaWorksheetPanel\s*\/>/g) ?? []).length, 1);
});
