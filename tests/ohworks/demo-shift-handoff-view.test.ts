import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildPilotShiftHandoffView,
  createPilotShiftHandoffFixtures,
} from '../../lib/ohworks-demo-shift-handoff-view';
import {
  buildShiftHandoffChecklist,
  STALE_STAT_MINUTES,
  QC_BLOCKING_THRESHOLD,
} from '../../lib/ohworks-shift-handoff-checklist';

test('view rows match buildShiftHandoffChecklist on the exported fixtures, row by row', () => {
  const view = buildPilotShiftHandoffView();
  const expected = buildShiftHandoffChecklist(createPilotShiftHandoffFixtures());

  assert.equal(view.rows.length, expected.items.length);
  expected.items.forEach((item, index) => {
    assert.equal(view.rows[index].category, item.category);
    assert.equal(view.rows[index].severity, item.severity);
    assert.equal(view.rows[index].description, item.description);
  });

  assert.equal(view.generatedAt, expected.generatedAt);
  assert.equal(view.readyForHandoff, expected.readyForHandoff);
  assert.equal(view.blockingIssueCount, expected.blockingIssueCount);
});

test('sort contract: blocking before attention before info, and category non-decreasing within a severity', () => {
  const view = buildPilotShiftHandoffView();
  const severityRank = { blocking: 0, attention: 1, info: 2 };

  for (let i = 1; i < view.rows.length; i += 1) {
    assert.ok(severityRank[view.rows[i - 1].severity] <= severityRank[view.rows[i].severity]);
  }

  for (const severity of ['blocking', 'attention', 'info'] as const) {
    const categories = view.rows.filter((row) => row.severity === severity).map((row) => row.category);
    assert.deepEqual([...categories].sort(), categories);
  }
});

test('the fixture exercises all three severities and is not ready for handoff with two blocking items', () => {
  const view = buildPilotShiftHandoffView();
  const severities = new Set(view.rows.map((row) => row.severity));
  assert.deepEqual([...severities].sort(), ['attention', 'blocking', 'info']);
  assert.equal(view.readyForHandoff, false);
  assert.equal(view.blockingIssueCount, 2);
});

test('the two blocking rows are the stale critical worklist item and the unnotified critical value', () => {
  const view = buildPilotShiftHandoffView();
  const blocking = view.rows.filter((row) => row.severity === 'blocking');
  assert.equal(blocking.length, 2);
  assert.deepEqual(
    blocking.map((row) => row.category).sort(),
    ['critical_value', 'open_worklist'],
  );
});

test('threshold wiring: re-running the rule module on the exported fixtures at the threshold flips QC severity', () => {
  const fixtures = createPilotShiftHandoffFixtures();

  const atThreshold = buildShiftHandoffChecklist({ ...fixtures, qcOutOfRangeCount: QC_BLOCKING_THRESHOLD });
  const qcAtThreshold = atThreshold.items.find((item) => item.category === 'qc');
  assert.equal(qcAtThreshold?.severity, 'blocking');

  const belowThreshold = buildShiftHandoffChecklist({ ...fixtures, qcOutOfRangeCount: QC_BLOCKING_THRESHOLD - 1 });
  const qcBelowThreshold = belowThreshold.items.find((item) => item.category === 'qc');
  assert.equal(qcBelowThreshold?.severity, 'attention');

  const view = buildPilotShiftHandoffView();
  assert.equal(view.staleStatMinutes, STALE_STAT_MINUTES);
  assert.equal(view.qcBlockingThreshold, QC_BLOCKING_THRESHOLD);
});

test('result-review page imports and renders ShiftHandoffPanel', () => {
  const source = readFileSync(
    new URL('../../app/pilot/ohworks/result-review/page.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /from '@\/app\/pilot\/ohworks\/_components\/shift-handoff-panel'/);
  assert.match(source, /<ShiftHandoffPanel \/>/);
});

test('shift-handoff-panel is a server component with accessible severity labels', () => {
  const source = readFileSync(
    new URL('../../app/pilot/ohworks/_components/shift-handoff-panel.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /scope="col"/);
  assert.match(source, /Blocking - must be resolved before handoff/);
  assert.match(source, /Attention - hand over with a note/);
  assert.match(source, /Info - no action required/);
  assert.match(source, /fabricated/);
  assert.doesNotMatch(source, /'use client'/);
});
