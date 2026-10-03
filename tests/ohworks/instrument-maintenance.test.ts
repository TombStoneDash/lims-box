import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MaintenanceGateInputError,
  evaluateInstrumentMaintenanceGate,
  explainMaintenanceGateReason,
  type InstrumentMaintenanceRegistry,
  type InstrumentMaintenanceScheduleInput,
  type MaintenanceGateOptions,
  type MaintenanceReasonCode,
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
    instrumentId: 'instrument-synthetic-001',
    tasks,
    ...overrides,
  };
}

function registryOf(entry: InstrumentMaintenanceScheduleInput): InstrumentMaintenanceRegistry {
  return { [entry.instrumentId]: entry };
}

const ALL_REASON_CODES: MaintenanceReasonCode[] = [
  'unknown-instrument',
  'run-timestamp-invalid',
  'unknown-task-code',
  'task-interval-invalid',
  'task-timestamp-invalid',
  'run-before-task-last-done',
  'task-overdue',
  'task-due-soon',
  'task-current',
  'no-scheduled-tasks',
  'all-tasks-current',
];

const FORBIDDEN_WORDS = [/compliant/i, /accredited/i, /released?\b.*\bresult/i];

// ---------------------------------------------------------------------------
// Golden paths
// ---------------------------------------------------------------------------

test('a schedule where every task is well inside its interval is usable', () => {
  const entry = schedule();
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'usable');
  assert.equal(result.reasonCode, 'all-tasks-current');
  assert.equal(result.governingTaskCode, null);
  assert.deepEqual(result.overdueTasks, []);
  assert.deepEqual(result.dueSoonTasks, []);
});

test('an instrument with no scheduled tasks is usable by default', () => {
  const entry = schedule({}, []);
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'usable');
  assert.equal(result.reasonCode, 'no-scheduled-tasks');
  assert.equal(result.governingTaskCode, null);
});

test('a run at the exact moment of last-done is usable', () => {
  const entry = schedule();
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, entry.tasks[0].lastDoneAt);
  assert.equal(result.decision, 'usable');
});

test('a task inside the default 3-day due-soon window is usable_with_flag', () => {
  const entry = schedule();
  // interval expires 2026-01-31T00:00:00.000Z; run 2 days before that.
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-29T00:00:00.000Z');
  assert.equal(result.decision, 'usable_with_flag');
  assert.equal(result.reasonCode, 'task-due-soon');
  assert.equal(result.governingTaskCode, 'cleaning');
  assert.equal(result.dueSoonTasks.length, 1);
  assert.equal(result.dueSoonTasks[0].taskCode, 'cleaning');
  assert.equal(result.overdueTasks.length, 0);
});

test('a task exactly dueSoonWarningDays before its due date is usable_with_flag', () => {
  const entry = schedule();
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-28T00:00:00.000Z');
  assert.equal(result.decision, 'usable_with_flag');
  assert.equal(result.reasonCode, 'task-due-soon');
});

test('a task one instant more than dueSoonWarningDays before its due date is usable', () => {
  const entry = schedule();
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-27T23:59:59.999Z');
  assert.equal(result.decision, 'usable');
  assert.equal(result.reasonCode, 'all-tasks-current');
});

test('a task at the exact due instant is blocked as overdue', () => {
  const entry = schedule();
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-31T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'task-overdue');
  assert.equal(result.governingTaskCode, 'cleaning');
  assert.equal(result.overdueTasks.length, 1);
});

test('a task well past its interval is blocked as overdue', () => {
  const entry = schedule();
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-03-01T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'task-overdue');
});

test('a custom dueSoonWarningDays of 0 disables the due-soon flag', () => {
  const entry = schedule();
  const options: MaintenanceGateOptions = { dueSoonWarningDays: 0 };
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-29T00:00:00.000Z', options);
  assert.equal(result.decision, 'usable');
  assert.equal(result.reasonCode, 'all-tasks-current');
});

test('a custom, wider dueSoonWarningDays flags earlier runs', () => {
  const entry = schedule();
  const options: MaintenanceGateOptions = { dueSoonWarningDays: 10 };
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-25T00:00:00.000Z', options);
  assert.equal(result.decision, 'usable_with_flag');
  assert.equal(result.reasonCode, 'task-due-soon');
});

// ---------------------------------------------------------------------------
// Multi-task lists and governing-task selection
// ---------------------------------------------------------------------------

test('multiple due-soon tasks are all listed, and the soonest-due one governs', () => {
  const entry = schedule({}, [
    task({ taskCode: 'cleaning', intervalDays: 30, lastDoneAt: '2026-01-01T00:00:00.000Z' }), // due 2026-01-31
    task({ taskCode: 'lubrication', intervalDays: 20, lastDoneAt: '2026-01-01T00:00:00.000Z' }), // due 2026-01-21
  ]);
  // run 2026-01-19: cleaning due-soon (12 days out is not, so widen window)
  const options: MaintenanceGateOptions = { dueSoonWarningDays: 15 };
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-19T00:00:00.000Z', options);
  assert.equal(result.decision, 'usable_with_flag');
  assert.equal(result.dueSoonTasks.length, 2);
  assert.equal(result.governingTaskCode, 'lubrication');
});

test('multiple overdue tasks are all listed, and the first-scheduled overdue task governs', () => {
  const entry = schedule({}, [
    task({ taskCode: 'cleaning', intervalDays: 10, lastDoneAt: '2026-01-01T00:00:00.000Z' }),
    task({ taskCode: 'lubrication', intervalDays: 5, lastDoneAt: '2026-01-01T00:00:00.000Z' }),
  ]);
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-02-01T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.overdueTasks.length, 2);
  assert.equal(result.governingTaskCode, 'cleaning');
});

test('an overdue task takes precedence over a due-soon task', () => {
  const entry = schedule({}, [
    task({ taskCode: 'cleaning', intervalDays: 30, lastDoneAt: '2026-01-01T00:00:00.000Z' }), // due 2026-01-31, due-soon at run below
    task({ taskCode: 'lubrication', intervalDays: 10, lastDoneAt: '2026-01-01T00:00:00.000Z' }), // due 2026-01-11, overdue at run below
  ]);
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-29T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'task-overdue');
  assert.equal(result.governingTaskCode, 'lubrication');
  assert.equal(result.dueSoonTasks.length, 1);
  assert.equal(result.overdueTasks.length, 1);
});

test('an unknown task code takes precedence over an overdue task', () => {
  const entry = schedule({}, [
    task({ taskCode: 'cleaning', intervalDays: 5, lastDoneAt: '2026-01-01T00:00:00.000Z' }), // overdue
    task({ taskCode: 'bogus-task' as MaintenanceTaskScheduleEntry['taskCode'], intervalDays: 30, lastDoneAt: '2026-01-01T00:00:00.000Z' }),
  ]);
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'unknown-task-code');
  assert.equal(result.governingTaskCode, 'bogus-task');
});

// ---------------------------------------------------------------------------
// Fail closed: unknown instrument
// ---------------------------------------------------------------------------

test('an instrument absent from the registry is blocked as unknown', () => {
  const entry = schedule();
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), 'instrument-synthetic-does-not-exist', '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'unknown-instrument');
});

test('an empty registry blocks every lookup as unknown', () => {
  const result = evaluateInstrumentMaintenanceGate({}, 'instrument-synthetic-001', '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'unknown-instrument');
});

// ---------------------------------------------------------------------------
// Fail closed: unknown task codes
// ---------------------------------------------------------------------------

test('an unrecognized task code is blocked', () => {
  const entry = schedule({}, [task({ taskCode: 'looks-fine-probably' as MaintenanceTaskScheduleEntry['taskCode'] })]);
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'unknown-task-code');
  assert.equal(result.governingTaskCode, 'looks-fine-probably');
});

// ---------------------------------------------------------------------------
// Fail closed: negative / non-positive intervals
// ---------------------------------------------------------------------------

test('a zero task interval is blocked as invalid', () => {
  const entry = schedule({}, [task({ intervalDays: 0 })]);
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'task-interval-invalid');
});

test('a negative task interval is blocked as invalid', () => {
  const entry = schedule({}, [task({ intervalDays: -30 })]);
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'task-interval-invalid');
});

test('a non-integer task interval is blocked as invalid', () => {
  const entry = schedule({}, [task({ intervalDays: 30.5 })]);
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'task-interval-invalid');
});

// ---------------------------------------------------------------------------
// Fail closed: non-monotonic / malformed timestamps
// ---------------------------------------------------------------------------

test('a run timestamp before a task last-done timestamp is blocked (non-monotonic)', () => {
  const entry = schedule();
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2025-12-31T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'run-before-task-last-done');
});

test('an unparsable run timestamp is blocked', () => {
  const entry = schedule();
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, 'not-a-timestamp');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'run-timestamp-invalid');
});

test('a non-UTC (offset, non-"Z") run timestamp is blocked', () => {
  const entry = schedule();
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000+00:00');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'run-timestamp-invalid');
});

test('an unparsable task last-done timestamp is blocked', () => {
  const entry = schedule({}, [task({ lastDoneAt: 'not-a-timestamp' })]);
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'task-timestamp-invalid');
});

test('a non-UTC task last-done timestamp is blocked', () => {
  const entry = schedule({}, [task({ lastDoneAt: '2026-01-01T00:00:00.000+05:00' })]);
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'task-timestamp-invalid');
});

// ---------------------------------------------------------------------------
// Structurally malformed input throws, rather than guessing
// ---------------------------------------------------------------------------

test('a null registry throws a sanitized typed error', () => {
  assert.throws(
    () => evaluateInstrumentMaintenanceGate(null as unknown as InstrumentMaintenanceRegistry, 'instrument-synthetic-001', '2026-01-05T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof MaintenanceGateInputError);
      assert.equal((error as MaintenanceGateInputError).code, 'registry-malformed');
      return true;
    },
  );
});

test('an array registry throws a sanitized typed error', () => {
  assert.throws(
    () => evaluateInstrumentMaintenanceGate([] as unknown as InstrumentMaintenanceRegistry, 'instrument-synthetic-001', '2026-01-05T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof MaintenanceGateInputError);
      assert.equal((error as MaintenanceGateInputError).code, 'registry-malformed');
      return true;
    },
  );
});

test('an empty-string instrument id throws a sanitized typed error', () => {
  const entry = schedule();
  assert.throws(
    () => evaluateInstrumentMaintenanceGate(registryOf(entry), '', '2026-01-05T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof MaintenanceGateInputError);
      assert.equal((error as MaintenanceGateInputError).code, 'instrument-id-malformed');
      return true;
    },
  );
});

test('a non-string run timestamp throws a sanitized typed error', () => {
  const entry = schedule();
  assert.throws(
    () => evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, 12345 as unknown as string),
    (error: unknown) => {
      assert.ok(error instanceof MaintenanceGateInputError);
      assert.equal((error as MaintenanceGateInputError).code, 'run-timestamp-malformed');
      return true;
    },
  );
});

test('a negative dueSoonWarningDays option throws a sanitized typed error', () => {
  const entry = schedule();
  assert.throws(
    () => evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z', { dueSoonWarningDays: -1 }),
    (error: unknown) => {
      assert.ok(error instanceof MaintenanceGateInputError);
      assert.equal((error as MaintenanceGateInputError).code, 'options-malformed');
      return true;
    },
  );
});

test('a schedule entry missing a required field throws a sanitized typed error', () => {
  const malformed = schedule();
  delete (malformed as Partial<InstrumentMaintenanceScheduleInput>).tasks;
  assert.throws(
    () =>
      evaluateInstrumentMaintenanceGate(
        { [malformed.instrumentId]: malformed } as unknown as InstrumentMaintenanceRegistry,
        malformed.instrumentId,
        '2026-01-05T00:00:00.000Z',
      ),
    (error: unknown) => {
      assert.ok(error instanceof MaintenanceGateInputError);
      assert.equal((error as MaintenanceGateInputError).code, 'schedule-malformed');
      return true;
    },
  );
});

test('a task entry missing a required field throws a sanitized typed error', () => {
  const malformedTask = task();
  delete (malformedTask as Partial<MaintenanceTaskScheduleEntry>).intervalDays;
  const entry = schedule({}, [malformedTask]);
  assert.throws(
    () => evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof MaintenanceGateInputError);
      assert.equal((error as MaintenanceGateInputError).code, 'task-entry-malformed');
      return true;
    },
  );
});

test('a schedule with a duplicated task code throws a sanitized typed error', () => {
  const entry = schedule({}, [task({ taskCode: 'cleaning' }), task({ taskCode: 'cleaning', lastDoneAt: '2026-01-02T00:00:00.000Z' })]);
  assert.throws(
    () => evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof MaintenanceGateInputError);
      assert.equal((error as MaintenanceGateInputError).code, 'duplicate-task-code');
      return true;
    },
  );
});

test('a typed input error message never echoes any submitted data', () => {
  try {
    evaluateInstrumentMaintenanceGate(null as unknown as InstrumentMaintenanceRegistry, 'instrument-secret-token-abc123', '2026-01-05T00:00:00.000Z');
    assert.fail('expected evaluateInstrumentMaintenanceGate to throw');
  } catch (error) {
    assert.ok(error instanceof MaintenanceGateInputError);
    assert.doesNotMatch((error as Error).message, /instrument-secret-token-abc123/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch((error as Error).message, pattern);
    }
  }
});

// ---------------------------------------------------------------------------
// Determinism, purity, and immutability
// ---------------------------------------------------------------------------

test('the result is deterministic across repeated calls with equivalent input', () => {
  const entry = schedule();
  const first = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  const second = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.deepEqual(first, second);
});

test('the result object and its task lists are frozen', () => {
  const entry = schedule();
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-29T00:00:00.000Z');
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.dueSoonTasks));
  assert.ok(Object.isFrozen(result.dueSoonTasks[0]));
  const mutationSucceeded = Reflect.set(result, 'decision', 'usable');
  assert.equal(mutationSucceeded, false);
  assert.equal(result.decision, 'usable_with_flag');
});

test('evaluateInstrumentMaintenanceGate does not mutate its registry input', () => {
  const entry = schedule();
  const registry = registryOf(entry);
  const before = JSON.stringify(registry);
  evaluateInstrumentMaintenanceGate(registry, entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(JSON.stringify(registry), before);
});

// ---------------------------------------------------------------------------
// Explanations
// ---------------------------------------------------------------------------

test('every reason code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainMaintenanceGateReason(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /instrument-synthetic/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(explainMaintenanceGateReason('task-overdue'), explainMaintenanceGateReason('task-overdue'));
});

test('the reason field on a result matches explainMaintenanceGateReason for its reasonCode', () => {
  const entry = schedule();
  const result = evaluateInstrumentMaintenanceGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.reason, explainMaintenanceGateReason(result.reasonCode));
});
