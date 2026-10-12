import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPilotCriticalResultsView } from '../../lib/ohworks-demo-critical-results-view';

test('mutating every returned targetContact does not leak into a fresh rebuild', () => {
  const first = buildPilotCriticalResultsView();
  const firstJson = JSON.stringify(first);
  first.escalationRows.forEach((row) => {
    if (row.targetContact) {
      (row.targetContact as Record<string, unknown>).__mut = 1;
    }
  });
  const rebuilt = buildPilotCriticalResultsView();
  assert.equal(JSON.stringify(rebuilt), firstJson);
});

test('targetContact objects are not the same references across two builds', () => {
  const first = buildPilotCriticalResultsView();
  const second = buildPilotCriticalResultsView();
  first.escalationRows.forEach((row, index) => {
    const otherRow = second.escalationRows[index];
    if (row.targetContact && otherRow.targetContact) {
      assert.notEqual(row.targetContact, otherRow.targetContact);
    }
  });
});
