import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyWorksheetVerificationEvent,
  runWorksheetVerificationWorkflow,
  type WorksheetContext,
  type WorksheetEventInput,
} from '../../lib/ohworks-worksheet-verification';

// Fabricated identifiers, actors, notes, and timestamps only.
const CONTEXT: WorksheetContext = {
  tenantId: 'tenant-synthetic-1',
  worksheetId: 'ws-synthetic-1',
  worksheetType: 'routine_chemistry',
};

function prepare(occurredAt: string): WorksheetEventInput {
  return {
    eventId: 'evt-1',
    worksheetId: CONTEXT.worksheetId,
    tenantId: CONTEXT.tenantId,
    kind: 'prepare',
    actorRole: 'preparer',
    actorId: 'actor-synthetic-preparer',
    occurredAt,
    preparationNotes: 'Prepared synthetic worksheet.',
  };
}

function verify(occurredAt: string): WorksheetEventInput {
  return {
    ...prepare(occurredAt),
    eventId: 'evt-2',
    kind: 'verify',
    actorRole: 'verifier',
    actorId: 'actor-synthetic-verifier',
    verificationNotes: 'Independently verified synthetic worksheet.',
  };
}

const invalidTimestamps = [
  '2026-02-30T12:00:00Z',
  '2026-02-29T12:00:00Z',
  '2026-04-31T12:00:00Z',
  '2026-01-02T24:00:00Z',
  '2100-02-29T12:00:00Z',
  '2026-00-01T12:00:00Z',
  '2026-13-01T12:00:00Z',
  '2026-01-00T12:00:00Z',
  '2026-01-02T12:60:00Z',
  '2026-01-02T12:00:60Z',
];

for (const occurredAt of invalidTimestamps) {
  test(`blocks prepare at ${occurredAt} without changing state or history`, () => {
    const event = prepare(occurredAt);
    assert.deepEqual(applyWorksheetVerificationEvent('draft', event, [], CONTEXT), {
      allowed: false, nextState: 'draft', blockCode: 'timestamp-invalid',
    });
    const result = runWorksheetVerificationWorkflow(CONTEXT, [event]);
    assert.equal(result.blocked, true);
    assert.equal(result.finalState, 'draft');
    assert.deepEqual(result.history, []);
    const lastStep = result.steps.at(-1);
    assert.ok(lastStep && lastStep.allowed === false);
    assert.equal(lastStep.blockCode, 'timestamp-invalid');
  });

  test(`blocks verification at ${occurredAt} without changing state or history`, () => {
    const first = prepare('2000-01-01T12:00:00Z');
    const before = runWorksheetVerificationWorkflow(CONTEXT, [first]);
    assert.equal(before.blocked, false);
    const snapshot = [...before.history];
    const event = verify(occurredAt);
    assert.deepEqual(applyWorksheetVerificationEvent('prepared', event, before.history, CONTEXT), {
      allowed: false, nextState: 'prepared', blockCode: 'timestamp-invalid',
    });
    assert.deepEqual(before.history, snapshot);
    const result = runWorksheetVerificationWorkflow(CONTEXT, [first, event]);
    assert.equal(result.blocked, true);
    assert.equal(result.finalState, 'prepared');
    assert.deepEqual(result.history, snapshot);
    const lastStep = result.steps.at(-1);
    assert.ok(lastStep && lastStep.allowed === false);
    assert.equal(lastStep.blockCode, 'timestamp-invalid');
  });
}

for (const occurredAt of [
  '2024-02-29T12:00:00Z',
  '2000-02-29T12:00:00Z',
  '2026-01-02T12:00:00.1Z',
  '2026-01-02T12:00:00.123Z',
  '2026-01-02T12:00:00.123456Z',
]) {
  test(`accepts prepare and verification at ${occurredAt}`, () => {
    const prepared = runWorksheetVerificationWorkflow(CONTEXT, [prepare(occurredAt)]);
    assert.equal(prepared.blocked, false);
    assert.equal(prepared.finalState, 'prepared');
    assert.equal(prepared.history[0].occurredAt, occurredAt);
    const verified = runWorksheetVerificationWorkflow(CONTEXT, [
      prepare('2000-01-01T12:00:00Z'), verify(occurredAt),
    ]);
    assert.equal(verified.blocked, false);
    assert.equal(verified.finalState, 'verified');
    assert.equal(verified.history.length, 2);
    assert.equal(verified.history[1].occurredAt, occurredAt);
  });
}
