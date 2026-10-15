import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyVolumeLedgerEvents,
  balanceAtTimestamp,
  type ConsumptionEventInput,
  type VolumeLedgerEventInput,
  type ValidVolumeLedgerSummary,
} from '../../lib/ohworks-volume-ledger';

function consumption(eventId: string, amount: number, timestamp: number): ConsumptionEventInput {
  return { entryType: 'CONSUMPTION', eventId, kind: 'TEST_RUN', amount, timestamp };
}

function ledger(initialVolume: number, deadVolume: number, events: VolumeLedgerEventInput[]) {
  return applyVolumeLedgerEvents({
    specimen: { accessionId: 'ACC-SYNTH-DECIMAL', initialVolume, deadVolume },
    events,
  });
}

function assertValid(summary: ReturnType<typeof ledger>): asserts summary is ValidVolumeLedgerSummary {
  assert.equal(summary.status, 'VALID');
}

test('decimal consumptions exhaust the balance without a false over-consumption', () => {
  const summary = ledger(0.3, 0, [consumption('EVT-1', 0.1, 100), consumption('EVT-2', 0.2, 200)]);
  assertValid(summary);
  assert.equal(summary.events[0].remainingVolumeAfter, 0.19999999999999998);
  assert.equal(summary.events[1].remainingVolumeAfter, 0);
  assert.equal(summary.remainingVolume, 0);
  assert.equal(balanceAtTimestamp(summary, 99), 0.3);
  assert.equal(balanceAtTimestamp(summary, 100), 0.19999999999999998);
  assert.equal(balanceAtTimestamp(summary, 200), 0);
});

test('genuine excess remains invalid at the second consumption', () => {
  const summary = ledger(0.3, 0, [consumption('EVT-1', 0.1, 100), consumption('EVT-2', 0.201, 200)]);
  assert.equal(summary.status, 'INVALID');
  if (summary.status === 'INVALID') {
    assert.deepEqual(summary.failure, { code: 'over-consumption', eventIndex: 1 });
  }
});

test('tolerance scales down for tiny volumes', () => {
  const exact = ledger(3e-9, 0, [consumption('EVT-1', 1e-9, 100), consumption('EVT-2', 2e-9, 200)]);
  assertValid(exact);
  assert.equal(exact.remainingVolume, 0);

  const excess = ledger(3e-9, 0, [consumption('EVT-1', 1e-9, 100), consumption('EVT-2', 2.001e-9, 200)]);
  assert.equal(excess.status, 'INVALID');
  if (excess.status === 'INVALID') {
    assert.deepEqual(excess.failure, { code: 'over-consumption', eventIndex: 1 });
  }
});

test('reversing the rounded-to-zero decimal draw restores the balance at its timestamp', () => {
  const summary = ledger(0.3, 0, [
    consumption('EVT-1', 0.1, 100),
    consumption('EVT-2', 0.2, 200),
    { entryType: 'REVERSAL', eventId: 'EVT-REV-2', targetEventId: 'EVT-2', reason: 'synthetic correction', timestamp: 300 },
  ]);
  assertValid(summary);
  assert.equal(summary.events[1].remainingVolumeAfter, 0);
  assert.equal(summary.events[2].remainingVolumeAfter, 0.2);
  assert.equal(summary.remainingVolume, 0.2);
  assert.equal(balanceAtTimestamp(summary, 200), 0);
  assert.equal(balanceAtTimestamp(summary, 299), 0);
  assert.equal(balanceAtTimestamp(summary, 300), 0.2);
});

test('declared dead volume remains available and reversals restore timestamp balances', () => {
  const summary = ledger(0.3, 0.1, [
    consumption('EVT-1', 0.1, 100),
    consumption('EVT-2', 0.3, 200),
    { entryType: 'REVERSAL', eventId: 'EVT-REV-2', targetEventId: 'EVT-2', reason: 'synthetic correction', timestamp: 300 },
  ]);
  assertValid(summary);
  assert.equal(summary.events[1].remainingVolumeAfter, -0.1);
  assert.equal(summary.remainingVolume, 0.19999999999999998);
  assert.equal(balanceAtTimestamp(summary, 199), 0.19999999999999998);
  assert.equal(balanceAtTimestamp(summary, 200), -0.1);
  assert.equal(balanceAtTimestamp(summary, 300), summary.remainingVolume);
});
