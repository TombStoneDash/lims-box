import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateInstrumentMaintenanceGate,
  type InstrumentMaintenanceRegistry,
  type InstrumentMaintenanceScheduleInput,
  type MaintenanceTaskScheduleEntry,
} from '../../lib/ohworks-instrument-maintenance';

/**
 * All fabricated: synthetic instrument identifiers and made-up maintenance
 * schedules. None of this represents a real instrument, sample, or
 * customer.
 */
function task(overrides: Partial<MaintenanceTaskScheduleEntry> = {}): MaintenanceTaskScheduleEntry {
  return {
    taskCode: 'cleaning',
    intervalDays: 30,
    lastDoneAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function schedule(
  overrides: Partial<InstrumentMaintenanceScheduleInput> = {},
  tasks: MaintenanceTaskScheduleEntry[] = [task()],
): InstrumentMaintenanceScheduleInput {
  return {
    instrumentId: 'instrument-synthetic-calendar-001',
    tasks,
    ...overrides,
  };
}

function registryOf(entry: InstrumentMaintenanceScheduleInput): InstrumentMaintenanceRegistry {
  return { [entry.instrumentId]: entry };
}

// ---------------------------------------------------------------------------
// Invalid task last-done timestamps
// ---------------------------------------------------------------------------

test('a task last-done timestamp of February 30 is rejected as invalid', () => {
  const entry = schedule({}, [task({ lastDoneAt: '2026-02-30T12:00:00Z' })]);
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-03-15T12:00:00Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'task-timestamp-invalid');
  assert.equal(result.governingTaskCode, 'cleaning');
});

test('a task last-done timestamp of April 31 is rejected as invalid', () => {
  const entry = schedule({}, [task({ lastDoneAt: '2026-04-31T00:00:00Z' })]);
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-05-15T00:00:00Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'task-timestamp-invalid');
  assert.equal(result.governingTaskCode, 'cleaning');
});

test('a task last-done timestamp of February 29 in a non-leap year is rejected as invalid', () => {
  const entry = schedule({}, [task({ lastDoneAt: '2025-02-29T00:00:00Z' })]);
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2025-03-15T00:00:00Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'task-timestamp-invalid');
  assert.equal(result.governingTaskCode, 'cleaning');
});

test('a task last-done timestamp with hour 24 is rejected as invalid', () => {
  const entry = schedule({}, [task({ lastDoneAt: '2026-01-01T24:00:00Z' })]);
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-15T00:00:00Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'task-timestamp-invalid');
  assert.equal(result.governingTaskCode, 'cleaning');
});

// ---------------------------------------------------------------------------
// Invalid run timestamps
// ---------------------------------------------------------------------------

test('a run timestamp of February 30 is rejected as invalid', () => {
  const entry = schedule();
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-02-30T12:00:00Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'run-timestamp-invalid');
  assert.equal(result.governingTaskCode, null);
});

test('a run timestamp of April 31 is rejected as invalid', () => {
  const entry = schedule();
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-04-31T00:00:00Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'run-timestamp-invalid');
  assert.equal(result.governingTaskCode, null);
});

test('a run timestamp of February 29 in a non-leap year is rejected as invalid', () => {
  const entry = schedule();
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2025-02-29T00:00:00Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'run-timestamp-invalid');
  assert.equal(result.governingTaskCode, null);
});

test('a run timestamp with hour 24 is rejected as invalid', () => {
  const entry = schedule();
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-01T24:00:00Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'run-timestamp-invalid');
  assert.equal(result.governingTaskCode, null);
});

// ---------------------------------------------------------------------------
// Valid controls
// ---------------------------------------------------------------------------

test('a valid last-done timestamp without milliseconds is accepted', () => {
  const entry = schedule({}, [task({ lastDoneAt: '2026-01-01T00:00:00Z' })]);
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00Z');
  assert.equal(result.decision, 'usable');
  assert.equal(result.reasonCode, 'all-tasks-current');
});

test('a valid last-done timestamp with milliseconds is accepted', () => {
  const entry = schedule({}, [task({ lastDoneAt: '2026-01-01T00:00:00.123Z' })]);
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00Z');
  assert.equal(result.decision, 'usable');
  assert.equal(result.reasonCode, 'all-tasks-current');
});

test('a valid leap-day last-done timestamp (2028-02-29) is accepted', () => {
  const entry = schedule({}, [task({ lastDoneAt: '2028-02-29T00:00:00Z' })]);
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2028-03-05T00:00:00Z');
  assert.equal(result.decision, 'usable');
  assert.equal(result.reasonCode, 'all-tasks-current');
});

test('a valid leap-day run timestamp (2028-02-29) is accepted', () => {
  const entry = schedule({}, [task({ lastDoneAt: '2028-01-01T00:00:00Z', intervalDays: 365 })]);
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2028-02-29T00:00:00Z');
  assert.equal(result.decision, 'usable');
  assert.equal(result.reasonCode, 'all-tasks-current');
});

test('a valid run timestamp without milliseconds is accepted', () => {
  const entry = schedule();
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00Z');
  assert.equal(result.decision, 'usable');
  assert.equal(result.reasonCode, 'all-tasks-current');
});

test('a valid run timestamp with milliseconds is accepted', () => {
  const entry = schedule();
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.456Z');
  assert.equal(result.decision, 'usable');
  assert.equal(result.reasonCode, 'all-tasks-current');
});
