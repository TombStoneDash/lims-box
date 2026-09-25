import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildPilotQualityEventsView } from '../../lib/ohworks-demo-quality-events-view';
import {
  createNonconformanceRecord,
  explainNonconformanceRefusal,
  NONCONFORMANCE_TRANSITIONS,
  transitionNonconformance,
} from '../../lib/ohworks-nonconformance';
import { diffResultVersions, explainSignificanceReason } from '../../lib/ohworks-result-diff';

test('fabricated lifecycle replays real transitions to terminal CLOSED with an unchanged refused record', () => {
  const view = buildPilotQualityEventsView();
  let record = createNonconformanceRecord('SYNTHETIC-NC-001', 'tenant-synthetic-ohworks');
  assert.equal(view.timeline.length, 7);
  for (const entry of view.timeline) {
    assert.deepEqual(entry.recordBefore, record);
    const before = JSON.stringify(record);
    const result = transitionNonconformance(record, entry.action, entry.actorRole, entry.occurredAt);
    assert.equal(entry.fromState, record.state);
    if (result.ok === true) {
      assert.equal(entry.status, 'accepted');
      assert.equal(entry.refusalCode, null);
      assert.equal(entry.state, NONCONFORMANCE_TRANSITIONS[entry.action.kind][record.state]);
      record = result.record;
    } else {
      assert.equal(entry.status, 'refused');
      assert.equal(result.refusalCode, 'role-not-allowed-for-action');
      assert.equal(entry.refusalCode, result.refusalCode);
      assert.equal(entry.explanation, explainNonconformanceRefusal(result.refusalCode));
      assert.strictEqual(entry.recordAfter, entry.recordBefore);
      assert.equal(JSON.stringify(record), before);
    }
    assert.equal(entry.state, record.state);
    assert.deepEqual(entry.recordAfter, record);
  }
  assert.deepEqual(view.record, record);
  assert.equal(record.state, 'CLOSED');
  assert.deepEqual(record.history.map((entry) => entry.action.kind), [
    'CONTAIN', 'RECORD_ROOT_CAUSE', 'ASSIGN_CORRECTIVE_ACTION',
    'SCHEDULE_EFFECTIVENESS_CHECK', 'RECORD_EFFECTIVENESS_CHECK', 'CLOSE',
  ]);
  assert.notEqual(record.history[2].action.actorId, record.history[4].action.actorId);
  for (const transitions of Object.values(NONCONFORMANCE_TRANSITIONS)) {
    assert.equal(transitions.CLOSED, undefined);
  }
});

test('real diff marks only above-threshold and flag-only fabricated changes significant', () => {
  const view = buildPilotQualityEventsView();
  assert.deepEqual(view.diff, diffResultVersions(view.originalVersion, view.amendedVersion, view.thresholds));
  assert.deepEqual(view.diffEntries.filter((entry) => entry.significant).map((entry) => entry.analyte), [
    'SYNTHETIC-ANALYTE-ABOVE', 'SYNTHETIC-ANALYTE-FLAG',
  ]);
  assert.deepEqual(view.counts, { accepted: 6, refused: 1, changed: 3, added: 1, unchanged: 1, significant: 2 });
  for (const entry of view.diff.changed) {
    const rendered = view.diffEntries.find((row) => row.analyte === entry.analyteCode)!;
    assert.equal(rendered.reason, entry.significanceReason);
    assert.equal(rendered.explanation, explainSignificanceReason(entry.significanceReason));
    assert.equal(rendered.significant, entry.significant);
  }
  assert.equal(view.diff.changed.find((entry) => entry.analyteCode.endsWith('-ABOVE'))?.delta?.absolute, 20);
  assert.equal(view.diff.changed.find((entry) => entry.analyteCode.endsWith('-BELOW'))?.significanceReason, 'within-threshold');
  const flag = view.diffEntries.find((entry) => entry.analyte.endsWith('-FLAG'))!;
  assert.match(flag.old, /synthetic-normal/);
  assert.match(flag.new, /synthetic-review/);
  assert.equal(flag.reason, 'flag-changed');
  assert.equal(view.diffEntries.find((entry) => entry.kind === 'added')?.significant, null);
  assert.equal(view.diffEntries.find((entry) => entry.kind === 'unchanged')?.significant, false);
});

test('all invented identifiers are synthetic, with the explicitly required tenant identifier', () => {
  const view = buildPilotQualityEventsView();
  assert.equal(view.record.tenantId, 'tenant-synthetic-ohworks');
  const ids = [view.record.recordId, view.sampleId,
    ...view.timeline.flatMap((entry) => [entry.action.actorId, ...(entry.action.correctiveActionId ? [entry.action.correctiveActionId] : [])]),
    ...view.originalVersion.map((row) => row.analyteCode),
    ...view.amendedVersion.map((row) => row.analyteCode),
    ...view.thresholds.map((row) => row.analyteCode),
  ];
  for (const id of ids) assert.match(id, /^(SYNTHETIC-|synthetic-)/);
});

test('builder is deterministic and contains no environment, clock, or network reads', () => {
  assert.deepEqual(buildPilotQualityEventsView(), buildPilotQualityEventsView());
  const source = readFileSync(new URL('../../lib/ohworks-demo-quality-events-view.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Date\.now\s*\(|new Date\s*\(\s*\)|process\.env|fetch\s*\(/);
});

test('audit panel stays server-rendered and immediately precedes the real-data stop', () => {
  const source = readFileSync(new URL('../../app/pilot/ohworks/audit/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /use client|<form\b|fetch\s*\(/);
  assert.match(source, /const qualityEvents = buildPilotQualityEventsView\(\)/);
  const panel = source.slice(source.indexOf('Quality events (fabricated)'), source.indexOf('Real-data stop'));
  assert.equal((panel.match(/<section\b/g) ?? []).length, 1);
  assert.match(panel, /border-amber-200 bg-amber-50/);
  assert.match(panel, /entry\.explanation/);
});
