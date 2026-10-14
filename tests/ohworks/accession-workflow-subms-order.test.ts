import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runAccessionWorkflow,
  type AccessionBlockCode,
  type AccessionContext,
  type AccessionEventInput,
} from '../../lib/ohworks-accession-workflow';

/**
 * All fabricated: synthetic sample/tenant identifiers and made-up event
 * data. None of this represents a real sample, patient, or customer.
 */
function baselineContext(): AccessionContext {
  return { tenantId: 'tenant-synthetic-a', sampleId: 'sample-synthetic-001' };
}

function event(overrides: Partial<AccessionEventInput> = {}): AccessionEventInput {
  return {
    eventId: 'evt-receive-1',
    sampleId: 'sample-synthetic-001',
    tenantId: 'tenant-synthetic-a',
    kind: 'receive',
    actorClass: 'submitter',
    reasonCode: 'sample-intake-logged',
    occurredAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Sub-millisecond ordering (Date.parse truncates past milliseconds)
// ---------------------------------------------------------------------------

test('a later sub-millisecond event is accepted even though Date.parse collapses both to the same millisecond', () => {
  const events = [
    event({ eventId: 'e1', kind: 'receive', occurredAt: '2026-01-01T12:00:00.0001Z' }),
    event({
      eventId: 'e2',
      kind: 'accession',
      actorClass: 'accessioner',
      reasonCode: 'requisition-verified',
      occurredAt: '2026-01-01T12:00:00.0009Z',
    }),
  ];
  const result = runAccessionWorkflow(baselineContext(), events);
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'ACCESSIONED');
  assert.equal(result.history.length, 2);
});

test('an earlier sub-millisecond event after a later one still fails closed as backwards', () => {
  const events = [
    event({ eventId: 'e1', kind: 'receive', occurredAt: '2026-01-01T12:00:00.0009Z' }),
    event({
      eventId: 'e2',
      kind: 'accession',
      actorClass: 'accessioner',
      reasonCode: 'requisition-verified',
      occurredAt: '2026-01-01T12:00:00.0001Z',
    }),
  ];
  const result = runAccessionWorkflow(baselineContext(), events);
  assert.equal(result.blocked, true);
  assert.equal((result.steps.at(-1) as { blockCode: AccessionBlockCode }).blockCode, 'timestamp-backwards');
});

test('an exact repeat instant expressed with and without trailing zero fraction digits still fails closed as backwards', () => {
  const events = [
    event({ eventId: 'e1', kind: 'receive', occurredAt: '2026-01-01T12:00:00Z' }),
    event({
      eventId: 'e2',
      kind: 'accession',
      actorClass: 'accessioner',
      reasonCode: 'requisition-verified',
      occurredAt: '2026-01-01T12:00:00.000Z',
    }),
  ];
  const result = runAccessionWorkflow(baselineContext(), events);
  assert.equal(result.blocked, true);
  assert.equal((result.steps.at(-1) as { blockCode: AccessionBlockCode }).blockCode, 'timestamp-backwards');
});

test('equal sub-millisecond fractions of differing digit counts are treated as the same instant and fail closed as backwards', () => {
  const events = [
    event({ eventId: 'e1', kind: 'receive', occurredAt: '2026-01-01T12:00:00.0010Z' }),
    event({
      eventId: 'e2',
      kind: 'accession',
      actorClass: 'accessioner',
      reasonCode: 'requisition-verified',
      occurredAt: '2026-01-01T12:00:00.001Z',
    }),
  ];
  const result = runAccessionWorkflow(baselineContext(), events);
  assert.equal(result.blocked, true);
  assert.equal((result.steps.at(-1) as { blockCode: AccessionBlockCode }).blockCode, 'timestamp-backwards');
});

test('a later sub-millisecond event building on a whole-millisecond prior event is accepted', () => {
  const events = [
    event({ eventId: 'e1', kind: 'receive', occurredAt: '2026-01-01T12:00:00Z' }),
    event({
      eventId: 'e2',
      kind: 'accession',
      actorClass: 'accessioner',
      reasonCode: 'requisition-verified',
      occurredAt: '2026-01-01T12:00:00.0001Z',
    }),
  ];
  const result = runAccessionWorkflow(baselineContext(), events);
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'ACCESSIONED');
});
