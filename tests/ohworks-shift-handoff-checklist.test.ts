import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildShiftHandoffChecklist,
  STALE_STAT_MINUTES,
  QC_BLOCKING_THRESHOLD,
  type ShiftHandoffChecklistInput,
} from '../lib/ohworks-shift-handoff-checklist';

/**
 * All fabricated: synthetic specimen, analyte, and instrument identifiers.
 * No real patient or customer data.
 */
const NOW = '2026-01-01T12:00:00.000Z';

function minutesBefore(now: string, minutes: number): string {
  return new Date(Date.parse(now) - minutes * 60000).toISOString();
}

function baselineInput(): ShiftHandoffChecklistInput {
  return {
    openWorklistItems: [],
    pendingCriticalValues: [],
    qcOutOfRangeCount: 0,
    instrumentsDown: [],
    now: NOW,
  };
}

test('an entirely empty input is all-clear and ready for handoff', () => {
  const result = buildShiftHandoffChecklist(baselineInput());
  assert.deepEqual(result.items, []);
  assert.equal(result.readyForHandoff, true);
  assert.equal(result.blockingIssueCount, 0);
  assert.equal(result.generatedAt, NOW);
});

test('a pending critical value with notifiedAt null is blocking', () => {
  const input = baselineInput();
  input.pendingCriticalValues = [
    { specimenId: 'specimen-synthetic-0001', analyte: 'potassium', value: 7.2, notifiedAt: null },
  ];
  const result = buildShiftHandoffChecklist(input);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].category, 'critical_value');
  assert.equal(result.items[0].severity, 'blocking');
  assert.equal(result.readyForHandoff, false);
  assert.equal(result.blockingIssueCount, 1);
});

test('a pending critical value that has been notified is info, not blocking', () => {
  const input = baselineInput();
  input.pendingCriticalValues = [
    {
      specimenId: 'specimen-synthetic-0002',
      analyte: 'potassium',
      value: 7.2,
      notifiedAt: '2026-01-01T11:00:00.000Z',
    },
  ];
  const result = buildShiftHandoffChecklist(input);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].severity, 'info');
  assert.equal(result.readyForHandoff, true);
  assert.equal(result.blockingIssueCount, 0);
});

test('a stale stat open worklist item at exactly STALE_STAT_MINUTES is blocking', () => {
  const input = baselineInput();
  input.openWorklistItems = [
    {
      specimenId: 'specimen-synthetic-0003',
      testCode: 'CBC',
      status: 'pending',
      priority: 'stat',
      enteredAt: minutesBefore(NOW, STALE_STAT_MINUTES),
    },
  ];
  const result = buildShiftHandoffChecklist(input);
  assert.equal(result.items[0].severity, 'blocking');
  assert.equal(result.readyForHandoff, false);
});

test('a stat open worklist item one minute short of STALE_STAT_MINUTES is info', () => {
  const input = baselineInput();
  input.openWorklistItems = [
    {
      specimenId: 'specimen-synthetic-0004',
      testCode: 'CBC',
      status: 'pending',
      priority: 'stat',
      enteredAt: minutesBefore(NOW, STALE_STAT_MINUTES - 1),
    },
  ];
  const result = buildShiftHandoffChecklist(input);
  assert.equal(result.items[0].severity, 'info');
  assert.equal(result.readyForHandoff, true);
});

test('a stale critical-priority open worklist item is blocking', () => {
  const input = baselineInput();
  input.openWorklistItems = [
    {
      specimenId: 'specimen-synthetic-0005',
      testCode: 'TROP',
      status: 'in_progress',
      priority: 'critical',
      enteredAt: minutesBefore(NOW, STALE_STAT_MINUTES + 5),
    },
  ];
  const result = buildShiftHandoffChecklist(input);
  assert.equal(result.items[0].severity, 'blocking');
});

test('a fresh routine open worklist item is attention, never blocking regardless of age', () => {
  const input = baselineInput();
  input.openWorklistItems = [
    {
      specimenId: 'specimen-synthetic-0006',
      testCode: 'BMP',
      status: 'pending',
      priority: 'routine',
      enteredAt: minutesBefore(NOW, 5),
    },
  ];
  const stale = baselineInput();
  stale.openWorklistItems = [
    {
      specimenId: 'specimen-synthetic-0007',
      testCode: 'BMP',
      status: 'pending',
      priority: 'routine',
      enteredAt: minutesBefore(NOW, STALE_STAT_MINUTES + 500),
    },
  ];
  const freshResult = buildShiftHandoffChecklist(input);
  const staleResult = buildShiftHandoffChecklist(stale);
  assert.equal(freshResult.items[0].severity, 'attention');
  assert.equal(staleResult.items[0].severity, 'attention');
  assert.equal(freshResult.readyForHandoff, true);
  assert.equal(staleResult.readyForHandoff, true);
});

test('a fresh stat open worklist item well under the threshold is info', () => {
  const input = baselineInput();
  input.openWorklistItems = [
    {
      specimenId: 'specimen-synthetic-0008',
      testCode: 'CBC',
      status: 'held',
      priority: 'stat',
      enteredAt: minutesBefore(NOW, 1),
    },
  ];
  const result = buildShiftHandoffChecklist(input);
  assert.equal(result.items[0].severity, 'info');
});

test('qcOutOfRangeCount of zero produces no QC item', () => {
  const input = baselineInput();
  input.qcOutOfRangeCount = 0;
  const result = buildShiftHandoffChecklist(input);
  assert.equal(result.items.filter((item) => item.category === 'qc').length, 0);
});

test('qcOutOfRangeCount below QC_BLOCKING_THRESHOLD is attention', () => {
  const input = baselineInput();
  input.qcOutOfRangeCount = QC_BLOCKING_THRESHOLD - 1;
  const result = buildShiftHandoffChecklist(input);
  const qcItem = result.items.find((item) => item.category === 'qc');
  assert.equal(qcItem?.severity, 'attention');
  assert.equal(result.readyForHandoff, true);
});

test('qcOutOfRangeCount at exactly QC_BLOCKING_THRESHOLD is blocking', () => {
  const input = baselineInput();
  input.qcOutOfRangeCount = QC_BLOCKING_THRESHOLD;
  const result = buildShiftHandoffChecklist(input);
  const qcItem = result.items.find((item) => item.category === 'qc');
  assert.equal(qcItem?.severity, 'blocking');
  assert.equal(result.readyForHandoff, false);
  assert.equal(result.blockingIssueCount, 1);
});

test('qcOutOfRangeCount above QC_BLOCKING_THRESHOLD remains blocking', () => {
  const input = baselineInput();
  input.qcOutOfRangeCount = QC_BLOCKING_THRESHOLD + 10;
  const result = buildShiftHandoffChecklist(input);
  const qcItem = result.items.find((item) => item.category === 'qc');
  assert.equal(qcItem?.severity, 'blocking');
});

test('any down instrument is attention', () => {
  const input = baselineInput();
  input.instrumentsDown = [{ instrumentId: 'instrument-synthetic-01', reason: 'reagent depleted' }];
  const result = buildShiftHandoffChecklist(input);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].category, 'instrument');
  assert.equal(result.items[0].severity, 'attention');
  assert.equal(result.readyForHandoff, true);
});

test('multiple down instruments each produce their own attention item', () => {
  const input = baselineInput();
  input.instrumentsDown = [
    { instrumentId: 'instrument-synthetic-01', reason: 'reagent depleted' },
    { instrumentId: 'instrument-synthetic-02', reason: 'maintenance in progress' },
  ];
  const result = buildShiftHandoffChecklist(input);
  assert.equal(result.items.length, 2);
  assert.ok(result.items.every((item) => item.category === 'instrument' && item.severity === 'attention'));
});

test('sorts a mixed set blocking-first, then attention, then info, and by category within each group', () => {
  const input: ShiftHandoffChecklistInput = {
    openWorklistItems: [
      {
        specimenId: 'specimen-synthetic-0010',
        testCode: 'CBC',
        status: 'pending',
        priority: 'stat',
        enteredAt: minutesBefore(NOW, STALE_STAT_MINUTES + 1),
      },
      {
        specimenId: 'specimen-synthetic-0011',
        testCode: 'BMP',
        status: 'pending',
        priority: 'routine',
        enteredAt: minutesBefore(NOW, 5),
      },
    ],
    pendingCriticalValues: [
      { specimenId: 'specimen-synthetic-0012', analyte: 'potassium', value: 7.2, notifiedAt: null },
      {
        specimenId: 'specimen-synthetic-0013',
        analyte: 'glucose',
        value: 500,
        notifiedAt: '2026-01-01T11:00:00.000Z',
      },
    ],
    qcOutOfRangeCount: 1,
    instrumentsDown: [{ instrumentId: 'instrument-synthetic-01', reason: 'reagent depleted' }],
    now: NOW,
  };

  const result = buildShiftHandoffChecklist(input);

  assert.equal(result.items.length, 6);
  assert.equal(result.blockingIssueCount, 2);
  assert.equal(result.readyForHandoff, false);

  const severities = result.items.map((item) => item.severity);
  assert.deepEqual(severities, ['blocking', 'blocking', 'attention', 'attention', 'attention', 'info']);

  const blockingCategories = result.items
    .filter((item) => item.severity === 'blocking')
    .map((item) => item.category);
  assert.deepEqual([...blockingCategories].sort(), blockingCategories);

  const attentionCategories = result.items
    .filter((item) => item.severity === 'attention')
    .map((item) => item.category);
  assert.deepEqual([...attentionCategories].sort(), attentionCategories);

  assert.equal(result.items[result.items.length - 1].category, 'critical_value');
  assert.equal(result.items[result.items.length - 1].severity, 'info');
});
