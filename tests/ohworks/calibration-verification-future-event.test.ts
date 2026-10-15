import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateCalibrationVerificationSchedule,
  type CalibrationVerificationScheduleInput,
  type TriggerEventInput,
} from '../../lib/ohworks-calibration-verification';

// Fabricated OHWorks identifiers and dates; no real instrument or sample data.
const AS_OF = '2026-01-10T00:00:00.000Z';
const LAST_VERIFIED_AT = '2026-01-01T00:00:00.000Z';

function schedule(triggerEvents: readonly TriggerEventInput[]): CalibrationVerificationScheduleInput {
  return {
    instrumentId: 'instrument-synthetic-future-event',
    analyteId: 'analyte-synthetic-future-event',
    lastVerifiedAt: LAST_VERIFIED_AT,
    maxIntervalDays: 30,
    triggerEvents,
  };
}

function event(occurredAt: string): TriggerEventInput {
  return { kind: 'reagent-lot-change', occurredAt };
}

test('an event after asOf fails closed without a future due date or governing kind', () => {
  const result = evaluateCalibrationVerificationSchedule(schedule([event('2026-02-01T00:00:00.000Z')]), AS_OF);
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'trigger-event-in-future');
  assert.equal(result.dueAt, null);
  assert.equal(result.governingTriggerKind, null);
});

test('an event exactly at asOf requires verification', () => {
  const result = evaluateCalibrationVerificationSchedule(schedule([event(AS_OF)]), AS_OF);
  assert.equal(result.decision, 'REQUIRED_BY_EVENT');
  assert.equal(result.reasonCode, 'trigger-event-required');
  assert.equal(result.dueAt, AS_OF);
  assert.equal(result.governingTriggerKind, 'reagent-lot-change');
});

test('an event before lastVerifiedAt keeps the existing failure reason', () => {
  const result = evaluateCalibrationVerificationSchedule(schedule([event('2025-12-31T00:00:00.000Z')]), AS_OF);
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'trigger-event-before-last-verification');
  assert.equal(result.dueAt, null);
  assert.equal(result.governingTriggerKind, null);
});

test('a valid event alone requires verification', () => {
  const occurredAt = '2026-01-05T00:00:00.000Z';
  const result = evaluateCalibrationVerificationSchedule(schedule([event(occurredAt)]), AS_OF);
  assert.equal(result.decision, 'REQUIRED_BY_EVENT');
  assert.equal(result.reasonCode, 'trigger-event-required');
  assert.equal(result.dueAt, occurredAt);
  assert.equal(result.governingTriggerKind, 'reagent-lot-change');
});

test('a future event fails closed even when another event is valid', () => {
  const result = evaluateCalibrationVerificationSchedule(
    schedule([event('2026-01-05T00:00:00.000Z'), event('2026-02-01T00:00:00.000Z')]),
    AS_OF,
  );
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'trigger-event-in-future');
  assert.equal(result.dueAt, null);
  assert.equal(result.governingTriggerKind, null);
});

test('no events leaves the verification current', () => {
  const result = evaluateCalibrationVerificationSchedule(schedule([]), AS_OF);
  assert.equal(result.decision, 'CURRENT');
  assert.equal(result.reasonCode, 'interval-current');
  assert.equal(result.dueAt, '2026-01-31T00:00:00.000Z');
  assert.equal(result.governingTriggerKind, null);
});

test('an invalid timestamp still fails as invalid when another event is future dated', () => {
  const result = evaluateCalibrationVerificationSchedule(
    schedule([event('2026-02-01T00:00:00.000Z'), event('not-a-timestamp')]),
    AS_OF,
  );
  assert.equal(result.decision, 'OVERDUE');
  assert.equal(result.reasonCode, 'trigger-event-timestamp-invalid');
  assert.equal(result.dueAt, null);
  assert.equal(result.governingTriggerKind, null);
});
