import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyVolumeLedgerEvents,
  balanceAtTimestamp,
  explainVolumeLedgerReason,
  VolumeLedgerInputError,
  type ConsumptionEventInput,
  type ReversalEventInput,
  type SpecimenVolumeState,
  type ValidVolumeLedgerSummary,
  type VolumeLedgerEventInput,
  type VolumeLedgerFailure,
  type VolumeLedgerInput,
  type VolumeLedgerReasonCode,
  type VolumeLedgerSummary,
} from '../../lib/ohworks-volume-ledger';

function assertFailure(summary: VolumeLedgerSummary, expected: VolumeLedgerFailure): void {
  assert.equal(summary.status, 'INVALID');
  if (summary.status !== 'INVALID') return;
  assert.deepEqual(summary.failure, expected);
}

function assertValid(summary: VolumeLedgerSummary): asserts summary is ValidVolumeLedgerSummary {
  assert.equal(summary.status, 'VALID');
}

/**
 * All fabricated: synthetic accession ids, volumes, event ids, and
 * timestamps. None of this represents a real specimen, patient, or lab
 * record.
 */
function baselineSpecimen(overrides: Partial<SpecimenVolumeState> = {}): SpecimenVolumeState {
  return {
    accessionId: 'ACC-SYNTH-0001',
    initialVolume: 10,
    deadVolume: 1,
    ...overrides,
  };
}

function consumption(overrides: Partial<ConsumptionEventInput> = {}): ConsumptionEventInput {
  return {
    entryType: 'CONSUMPTION',
    eventId: 'EVT-1',
    kind: 'TEST_RUN',
    amount: 3,
    timestamp: 1000,
    ...overrides,
  };
}

function reversal(overrides: Partial<ReversalEventInput> = {}): ReversalEventInput {
  return {
    entryType: 'REVERSAL',
    eventId: 'EVT-REV-1',
    targetEventId: 'EVT-1',
    reason: 'logged in error',
    timestamp: 1001,
    ...overrides,
  };
}

function baselineInput(overrides: Partial<VolumeLedgerInput> = {}): VolumeLedgerInput {
  return {
    specimen: baselineSpecimen(),
    events: [consumption()],
    ...overrides,
  };
}

test('applies a single consumption event and reports the running balance', () => {
  const summary = applyVolumeLedgerEvents(baselineInput());
  assertValid(summary);
  assert.equal(summary.accessionId, 'ACC-SYNTH-0001');
  assert.equal(summary.remainingVolume, 7);
  assert.deepEqual(summary.events, [
    {
      entryType: 'CONSUMPTION',
      eventId: 'EVT-1',
      kind: 'TEST_RUN',
      amount: 3,
      timestamp: 1000,
      remainingVolumeAfter: 7,
      reversed: false,
    },
  ]);
});

test('applies a sequence of consumption events across all known kinds', () => {
  const events: VolumeLedgerEventInput[] = [
    consumption({ eventId: 'EVT-1', kind: 'TEST_RUN', amount: 2, timestamp: 100 }),
    consumption({ eventId: 'EVT-2', kind: 'ALIQUOT', amount: 2, timestamp: 200 }),
    consumption({ eventId: 'EVT-3', kind: 'WASTE', amount: 1, timestamp: 300 }),
    consumption({ eventId: 'EVT-4', kind: 'EVAPORATION_ADJUSTMENT', amount: 1, timestamp: 400 }),
  ];
  const summary = applyVolumeLedgerEvents(baselineInput({ events }));
  assertValid(summary);
  assert.equal(summary.remainingVolume, 4);
});

test('allows consumption to dip into the declared dead volume', () => {
  const summary = applyVolumeLedgerEvents(
    baselineInput({
      specimen: baselineSpecimen({ initialVolume: 5, deadVolume: 2 }),
      events: [consumption({ amount: 7 })],
    }),
  );
  assertValid(summary);
  assert.equal(summary.remainingVolume, -2);
});

test('rejects consumption beyond the remaining volume plus dead volume', () => {
  const summary = applyVolumeLedgerEvents(
    baselineInput({
      specimen: baselineSpecimen({ initialVolume: 5, deadVolume: 2 }),
      events: [consumption({ amount: 7.01 })],
    }),
  );
  assertFailure(summary, { eventIndex: 0, code: 'over-consumption' });
});

test('accepts consumption exactly equal to remaining volume plus dead volume', () => {
  const summary = applyVolumeLedgerEvents(
    baselineInput({
      specimen: baselineSpecimen({ initialVolume: 5, deadVolume: 2 }),
      events: [consumption({ amount: 7 })],
    }),
  );
  assertValid(summary);
  assert.equal(summary.remainingVolume, -2);
});

test('rejects a zero consumption amount', () => {
  const summary = applyVolumeLedgerEvents(baselineInput({ events: [consumption({ amount: 0 })] }));
  assertFailure(summary, { eventIndex: 0, code: 'amount-invalid' });
});

test('rejects a negative consumption amount', () => {
  const summary = applyVolumeLedgerEvents(baselineInput({ events: [consumption({ amount: -1 })] }));
  assertFailure(summary, { eventIndex: 0, code: 'amount-invalid' });
});

test('rejects an unknown consumption kind', () => {
  const summary = applyVolumeLedgerEvents(
    baselineInput({ events: [consumption({ kind: 'MYSTERY_KIND' as ConsumptionEventInput['kind'] })] }),
  );
  assertFailure(summary, { eventIndex: 0, code: 'kind-unknown' });
});

test('checks amount-invalid before kind-unknown', () => {
  const summary = applyVolumeLedgerEvents(
    baselineInput({
      events: [consumption({ amount: -1, kind: 'MYSTERY_KIND' as ConsumptionEventInput['kind'] })],
    }),
  );
  assertFailure(summary, { eventIndex: 0, code: 'amount-invalid' });
});

test('rejects a zero specimen initial volume', () => {
  const summary = applyVolumeLedgerEvents(baselineInput({ specimen: baselineSpecimen({ initialVolume: 0 }) }));
  assertFailure(summary, { code: 'initial-volume-invalid' });
});

test('rejects a negative specimen initial volume', () => {
  const summary = applyVolumeLedgerEvents(baselineInput({ specimen: baselineSpecimen({ initialVolume: -5 }) }));
  assertFailure(summary, { code: 'initial-volume-invalid' });
});

test('rejects a negative dead volume', () => {
  const summary = applyVolumeLedgerEvents(baselineInput({ specimen: baselineSpecimen({ deadVolume: -1 }) }));
  assertFailure(summary, { code: 'dead-volume-invalid' });
});

test('accepts a zero dead volume', () => {
  const summary = applyVolumeLedgerEvents(baselineInput({ specimen: baselineSpecimen({ deadVolume: 0 }) }));
  assertValid(summary);
});

test('checks initial-volume-invalid before dead-volume-invalid', () => {
  const summary = applyVolumeLedgerEvents(
    baselineInput({ specimen: baselineSpecimen({ initialVolume: -5, deadVolume: -1 }) }),
  );
  assertFailure(summary, { code: 'initial-volume-invalid' });
});

test('rejects a duplicate event id', () => {
  const summary = applyVolumeLedgerEvents(
    baselineInput({
      events: [
        consumption({ eventId: 'EVT-1', timestamp: 100 }),
        consumption({ eventId: 'EVT-1', timestamp: 200 }),
      ],
    }),
  );
  assertFailure(summary, { eventIndex: 1, code: 'duplicate-event-id' });
});

test('rejects an out-of-order timestamp', () => {
  const summary = applyVolumeLedgerEvents(
    baselineInput({
      events: [
        consumption({ eventId: 'EVT-1', timestamp: 200 }),
        consumption({ eventId: 'EVT-2', timestamp: 100 }),
      ],
    }),
  );
  assertFailure(summary, { eventIndex: 1, code: 'timestamp-unordered' });
});

test('accepts equal consecutive timestamps', () => {
  const summary = applyVolumeLedgerEvents(
    baselineInput({
      events: [
        consumption({ eventId: 'EVT-1', timestamp: 100, amount: 1 }),
        consumption({ eventId: 'EVT-2', timestamp: 100, amount: 1 }),
      ],
    }),
  );
  assertValid(summary);
});

test('reverses the most recent event and restores its amount', () => {
  const summary = applyVolumeLedgerEvents(
    baselineInput({
      events: [consumption({ eventId: 'EVT-1', amount: 3, timestamp: 100 }), reversal({ timestamp: 200 })],
    }),
  );
  assertValid(summary);
  assert.equal(summary.remainingVolume, 10);
  assert.deepEqual(summary.events[0], {
    entryType: 'CONSUMPTION',
    eventId: 'EVT-1',
    kind: 'TEST_RUN',
    amount: 3,
    timestamp: 100,
    remainingVolumeAfter: 7,
    reversed: true,
  });
  assert.deepEqual(summary.events[1], {
    entryType: 'REVERSAL',
    eventId: 'EVT-REV-1',
    targetEventId: 'EVT-1',
    reason: 'logged in error',
    timestamp: 200,
    remainingVolumeAfter: 10,
  });
});

test('rejects a reversal with an empty reason', () => {
  const summary = applyVolumeLedgerEvents(
    baselineInput({
      events: [consumption({ eventId: 'EVT-1', timestamp: 100 }), reversal({ timestamp: 200, reason: '' })],
    }),
  );
  assertFailure(summary, { eventIndex: 1, code: 'reason-empty' });
});

test('rejects a reversal targeting an unknown event id', () => {
  const summary = applyVolumeLedgerEvents(
    baselineInput({
      events: [
        consumption({ eventId: 'EVT-1', timestamp: 100 }),
        reversal({ timestamp: 200, targetEventId: 'EVT-GHOST' }),
      ],
    }),
  );
  assertFailure(summary, { eventIndex: 1, code: 'target-not-found' });
});

test('rejects reversing an already-reversed event', () => {
  const summary = applyVolumeLedgerEvents(
    baselineInput({
      events: [
        consumption({ eventId: 'EVT-1', timestamp: 100 }),
        reversal({ eventId: 'EVT-REV-1', targetEventId: 'EVT-1', timestamp: 200 }),
        consumption({ eventId: 'EVT-2', timestamp: 300 }),
        reversal({ eventId: 'EVT-REV-2', targetEventId: 'EVT-1', timestamp: 400 }),
      ],
    }),
  );
  // target-already-reversed is checked before target-not-latest, so the
  // more specific reason wins even though EVT-1 is also no longer latest.
  assertFailure(summary, { eventIndex: 3, code: 'target-already-reversed' });
});

test('rejects reversal of a non-latest event when a later consumption followed it', () => {
  const summary = applyVolumeLedgerEvents(
    baselineInput({
      events: [
        consumption({ eventId: 'EVT-1', timestamp: 100 }),
        consumption({ eventId: 'EVT-2', timestamp: 200 }),
        reversal({ targetEventId: 'EVT-1', timestamp: 300 }),
      ],
    }),
  );
  assertFailure(summary, { eventIndex: 2, code: 'target-not-latest' });
});

test('allows reversing the second of two consumptions', () => {
  const summary = applyVolumeLedgerEvents(
    baselineInput({
      events: [
        consumption({ eventId: 'EVT-1', amount: 2, timestamp: 100 }),
        consumption({ eventId: 'EVT-2', amount: 3, timestamp: 200 }),
        reversal({ targetEventId: 'EVT-2', timestamp: 300 }),
      ],
    }),
  );
  assertValid(summary);
  assert.equal(summary.remainingVolume, 8);
});

test('reports the balance at a timestamp between events', () => {
  const summary = applyVolumeLedgerEvents(
    baselineInput({
      events: [
        consumption({ eventId: 'EVT-1', amount: 3, timestamp: 100 }),
        consumption({ eventId: 'EVT-2', amount: 2, timestamp: 300 }),
      ],
    }),
  );
  assertValid(summary);
  assert.equal(balanceAtTimestamp(summary, 50), 10);
  assert.equal(balanceAtTimestamp(summary, 100), 7);
  assert.equal(balanceAtTimestamp(summary, 200), 7);
  assert.equal(balanceAtTimestamp(summary, 300), 5);
  assert.equal(balanceAtTimestamp(summary, 1000), 5);
});

test('reports the balance reflecting a reversal at its timestamp', () => {
  const summary = applyVolumeLedgerEvents(
    baselineInput({
      events: [consumption({ eventId: 'EVT-1', amount: 3, timestamp: 100 }), reversal({ timestamp: 200 })],
    }),
  );
  assertValid(summary);
  assert.equal(balanceAtTimestamp(summary, 100), 7);
  assert.equal(balanceAtTimestamp(summary, 199), 7);
  assert.equal(balanceAtTimestamp(summary, 200), 10);
});

test('throws VolumeLedgerInputError for a non-finite queried timestamp', () => {
  const summary = applyVolumeLedgerEvents(baselineInput());
  assertValid(summary);
  assert.throws(
    () => balanceAtTimestamp(summary, Number.NaN),
    (error: unknown) => error instanceof VolumeLedgerInputError && error.code === 'timestamp-malformed',
  );
});

test('throws VolumeLedgerInputError for non-object input', () => {
  assert.throws(
    () => applyVolumeLedgerEvents('not-an-object'),
    (error: unknown) => error instanceof VolumeLedgerInputError && error.code === 'input-malformed',
  );
});

test('throws VolumeLedgerInputError for a malformed specimen', () => {
  assert.throws(
    () => applyVolumeLedgerEvents(baselineInput({ specimen: { ...baselineSpecimen(), accessionId: '' } })),
    (error: unknown) => error instanceof VolumeLedgerInputError && error.code === 'specimen-malformed',
  );
});

test('throws VolumeLedgerInputError when events is not an array', () => {
  assert.throws(
    () => applyVolumeLedgerEvents(baselineInput({ events: 'not-an-array' as unknown as VolumeLedgerEventInput[] })),
    (error: unknown) => error instanceof VolumeLedgerInputError && error.code === 'events-not-array',
  );
});

test('throws VolumeLedgerInputError for a malformed consumption event', () => {
  assert.throws(
    () =>
      applyVolumeLedgerEvents(
        baselineInput({ events: [{ entryType: 'CONSUMPTION', eventId: 'EVT-1' }] as unknown as VolumeLedgerEventInput[] }),
      ),
    (error: unknown) => error instanceof VolumeLedgerInputError && error.code === 'event-malformed',
  );
});

test('throws VolumeLedgerInputError for a malformed reversal event', () => {
  assert.throws(
    () =>
      applyVolumeLedgerEvents(
        baselineInput({
          events: [{ entryType: 'REVERSAL', eventId: 'EVT-REV-1', timestamp: 100 }] as unknown as VolumeLedgerEventInput[],
        }),
      ),
    (error: unknown) => error instanceof VolumeLedgerInputError && error.code === 'event-malformed',
  );
});

test('throws VolumeLedgerInputError for an unrecognized entry type', () => {
  assert.throws(
    () =>
      applyVolumeLedgerEvents(
        baselineInput({
          events: [{ entryType: 'MYSTERY', eventId: 'EVT-1', timestamp: 100 }] as unknown as VolumeLedgerEventInput[],
        }),
      ),
    (error: unknown) => error instanceof VolumeLedgerInputError && error.code === 'event-malformed',
  );
});

test('throws VolumeLedgerInputError for a non-object event', () => {
  assert.throws(
    () => applyVolumeLedgerEvents(baselineInput({ events: [null] as unknown as VolumeLedgerEventInput[] })),
    (error: unknown) => error instanceof VolumeLedgerInputError && error.code === 'event-malformed',
  );
});

test('explainVolumeLedgerReason covers every reason code', () => {
  const codes: VolumeLedgerReasonCode[] = [
    'initial-volume-invalid',
    'dead-volume-invalid',
    'duplicate-event-id',
    'timestamp-unordered',
    'amount-invalid',
    'kind-unknown',
    'over-consumption',
    'reason-empty',
    'target-not-found',
    'target-already-reversed',
    'target-not-latest',
  ];
  for (const code of codes) {
    const reason = explainVolumeLedgerReason(code);
    assert.equal(typeof reason, 'string');
    assert.ok(reason.length > 0);
  }
});
