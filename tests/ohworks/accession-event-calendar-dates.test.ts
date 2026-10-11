import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runAccessionWorkflow,
  type AccessionContext,
  type AccessionEventInput,
} from '../../lib/ohworks-accession-workflow';

const context: AccessionContext = {
  tenantId: 'tenant-synthetic-calendar',
  sampleId: 'sample-synthetic-calendar',
};

function receive(occurredAt: string): AccessionEventInput {
  return {
    eventId: 'receive-1',
    tenantId: context.tenantId,
    sampleId: context.sampleId,
    kind: 'receive',
    actorClass: 'submitter',
    reasonCode: 'sample-intake-logged',
    occurredAt,
  };
}

function accession(occurredAt: string): AccessionEventInput {
  return {
    ...receive(occurredAt),
    eventId: 'accession-1',
    kind: 'accession',
    actorClass: 'accessioner',
    reasonCode: 'requisition-verified',
  };
}

for (const occurredAt of [
  '2026-02-30T12:00:00Z',
  '2027-02-29T12:00:00.000Z',
  '2026-04-31T12:00:00Z',
  '2026-00-01T12:00:00Z',
  '2026-13-01T12:00:00Z',
  '2026-01-00T12:00:00Z',
  '2026-01-01T24:00:00Z',
  '2026-01-01T12:60:00Z',
  '2026-01-01T12:00:60Z',
]) {
  test(`an impossible receive date ${occurredAt} blocks without history`, () => {
    const result = runAccessionWorkflow(context, [receive(occurredAt)]);
    assert.equal(result.blocked, true);
    assert.equal(result.finalState, 'RECEIVED');
    assert.deepEqual(result.history, []);
    assert.deepEqual(result.steps, [
      { index: 0, allowed: false, state: 'RECEIVED', blockCode: 'timestamp-invalid' },
    ]);
  });
}

test('a leap-day receive and ordinary ordered transition accept UTC timestamps with and without fractions', () => {
  const result = runAccessionWorkflow(context, [
    receive('2028-02-29T12:00:00Z'),
    accession('2028-02-29T12:05:00.123Z'),
  ]);
  assert.equal(result.blocked, false);
  assert.equal(result.finalState, 'ACCESSIONED');
  assert.deepEqual(result.history.map((event) => event.eventId), ['receive-1', 'accession-1']);
});

test('an impossible second event cannot advance state or append history', () => {
  const result = runAccessionWorkflow(context, [
    receive('2026-02-28T12:00:00Z'),
    accession('2026-02-30T12:05:00Z'),
  ]);
  assert.equal(result.blocked, true);
  assert.equal(result.finalState, 'RECEIVED');
  assert.deepEqual(result.history.map((event) => event.eventId), ['receive-1']);
  assert.deepEqual(result.steps[1], {
    index: 1,
    allowed: false,
    state: 'RECEIVED',
    blockCode: 'timestamp-invalid',
  });
});
