import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildShiftHandoffChecklist,
  type OpenWorklistItemPriority,
  type ShiftHandoffChecklistInput,
} from '../../lib/ohworks-shift-handoff-checklist';

// Synthetic fixtures only; no patient or customer records.
const NOW = '2026-01-01T12:00:00.000Z';
const invalidTimestamps = [
  '', '   ', 'not-a-date', '2026-02-29T11:00:00Z', '2026-02-30T11:00:00Z',
  '2026-04-31T11:00:00Z', '1900-02-29T11:00:00Z', '2026-13-01T11:00:00Z',
  '2026-01-00T11:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01T11:60:00Z',
  '2026-01-01T11:00:60Z', '2026-01-01T11:00:00+24:00', '2026-01-01T11:00:00+00:60',
  '2026-01-01', '2026-01-01T11:00:00',
];

function baseline(): ShiftHandoffChecklistInput {
  return { now: NOW, openWorklistItems: [], pendingCriticalValues: [], qcOutOfRangeCount: 0, instrumentsDown: [] };
}

function worklist(enteredAt: string, priority: OpenWorklistItemPriority = 'stat') {
  return { specimenId: 'synthetic-specimen', testCode: 'SYNTHETIC', status: 'pending' as const, priority, enteredAt };
}

for (const timestamp of invalidTimestamps) {
  test(`invalid enteredAt ${JSON.stringify(timestamp)} blocks every priority`, () => {
    for (const priority of ['stat', 'critical', 'routine'] as const) {
      const result = buildShiftHandoffChecklist({ ...baseline(), openWorklistItems: [worklist(timestamp, priority)] });
      assert.equal(result.readyForHandoff, false);
      assert.equal(result.blockingIssueCount, 1);
      assert.equal(result.items[0].severity, 'blocking');
      assert.match(result.items[0].description, /age cannot be determined.*enteredAt is invalid/);
    }
  });

  test(`invalid now ${JSON.stringify(timestamp)} blocks empty and populated checklists`, () => {
    for (const openWorklistItems of [[], [worklist('2026-01-01T11:59:00Z')]]) {
      const result = buildShiftHandoffChecklist({ ...baseline(), now: timestamp, openWorklistItems });
      assert.equal(result.generatedAt, timestamp);
      assert.equal(result.readyForHandoff, false);
      assert.equal(result.blockingIssueCount, 1 + openWorklistItems.length);
      assert.ok(result.items.every((item) => item.severity === 'blocking'));
      assert.match(result.items[0].description, /now timestamp is invalid/);
      if (openWorklistItems.length) assert.match(result.items[1].description, /age cannot be determined.*now is invalid/);
    }
  });
}

for (const notifiedAt of [null, ...invalidTimestamps]) {
  test(`unverified notification ${JSON.stringify(notifiedAt)} stays blocking`, () => {
    const result = buildShiftHandoffChecklist({
      ...baseline(),
      pendingCriticalValues: [{ specimenId: 'synthetic-specimen', analyte: 'synthetic-analyte', value: 7, notifiedAt }],
    });
    assert.equal(result.readyForHandoff, false);
    assert.equal(result.blockingIssueCount, 1);
    assert.equal(result.items[0].severity, 'blocking');
    assert.match(result.items[0].description, /no valid notification timestamp; notification is unverified/);
    assert.doesNotMatch(result.items[0].description, /was notified at/);
  });
}

for (const [priority, enteredAt, severity] of [
  ['stat', '2026-01-01T11:59:00Z', 'info'],
  ['stat', '2026-01-01T11:00:00.001Z', 'info'],
  ['stat', '2026-01-01T11:00:00Z', 'blocking'],
  ['stat', '2026-01-01T10:59:00Z', 'blocking'],
  ['stat', '2026-01-01T12:00:00+01:00', 'blocking'],
  ['critical', '2026-01-01T11:59:00Z', 'info'],
  ['critical', '2026-01-01T11:00:00Z', 'blocking'],
  ['routine', '2026-01-01T11:59:00Z', 'attention'],
  ['routine', '2026-01-01T10:00:00Z', 'attention'],
] as const) {
  test(`${priority} entered ${enteredAt} remains ${severity}`, () => {
    const result = buildShiftHandoffChecklist({ ...baseline(), openWorklistItems: [worklist(enteredAt, priority)] });
    assert.equal(result.items[0].severity, severity);
    assert.equal(result.readyForHandoff, severity !== 'blocking');
    assert.equal(result.blockingIssueCount, severity === 'blocking' ? 1 : 0);
  });
}

for (const notifiedAt of ['2026-01-01T11:59:00.000Z', '2024-02-29T11:00:00Z', '2000-02-29T11:00:00Z', '2026-01-01T06:59:00-05:00']) {
  test(`valid notification ${notifiedAt} remains info`, () => {
    const result = buildShiftHandoffChecklist({
      ...baseline(),
      pendingCriticalValues: [{ specimenId: 'synthetic-specimen', analyte: 'synthetic-analyte', value: 7, notifiedAt }],
    });
    assert.equal(result.items[0].severity, 'info');
    assert.equal(result.readyForHandoff, true);
    assert.equal(result.blockingIssueCount, 0);
    assert.match(result.items[0].description, /was notified at/);
  });
}
