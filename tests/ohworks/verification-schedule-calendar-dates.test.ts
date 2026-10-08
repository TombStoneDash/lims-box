import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateCalibrationVerificationSchedule,
  type CalibrationVerificationScheduleInput,
} from '../../lib/ohworks-calibration-verification';

// Fabricated records only; no real instrument, analyte, or customer data.
function scheduleInput(overrides: Partial<CalibrationVerificationScheduleInput> = {}): CalibrationVerificationScheduleInput {
  return {
    instrumentId: 'synthetic-calendar-instrument',
    analyteId: 'synthetic-calendar-analyte',
    lastVerifiedAt: '2026-01-01T00:00:00Z',
    maxIntervalDays: 30,
    triggerEvents: [],
    ...overrides,
  };
}

const invalidTimestamps = [
  '2026-02-30T00:00:00Z',
  '2026-02-30T00:00:00.123Z',
  '2026-02-29T00:00:00Z',
  '2100-02-29T00:00:00Z',
  '2026-04-31T00:00:00Z',
  '2026-00-01T00:00:00Z',
  '2026-13-01T00:00:00Z',
  '2026-01-00T00:00:00Z',
  '2026-01-32T00:00:00Z',
  '2026-01-02T24:00:00Z',
  '2026-01-02T25:00:00Z',
  '2026-01-02T00:60:00Z',
  '2026-01-02T00:00:60Z',
  '2026-01-02Z',
  '2026-01-02 00:00:00Z',
  '2026-01-02T00:00:00.Z',
];

const invalidReasons = {
  lastVerifiedAt: [
    'last-verification-timestamp-invalid',
    'The last-verification timestamp could not be parsed as an explicit UTC timestamp.',
  ],
  asOf: [
    'as-of-timestamp-invalid',
    'The evaluation timestamp could not be parsed as an explicit UTC timestamp.',
  ],
  occurredAt: [
    'trigger-event-timestamp-invalid',
    'A recorded trigger event timestamp could not be parsed as an explicit UTC timestamp.',
  ],
} as const;

for (const position of ['lastVerifiedAt', 'asOf', 'occurredAt'] as const) {
  for (const timestamp of invalidTimestamps) {
    test(`${position} rejects ${timestamp} with its exact fail-closed result`, () => {
      const input = scheduleInput({
        ...(position === 'lastVerifiedAt' ? { lastVerifiedAt: timestamp } : {}),
        ...(position === 'occurredAt'
          ? { triggerEvents: [{ kind: 'qc-shift' as const, occurredAt: timestamp }] }
          : {}),
      });
      const asOf = position === 'asOf' ? timestamp : '2026-03-03T00:00:00Z';
      const [reasonCode, reason] = invalidReasons[position];
      assert.deepEqual(evaluateCalibrationVerificationSchedule(input, asOf), {
        instrumentId: input.instrumentId,
        analyteId: input.analyteId,
        asOf,
        decision: 'OVERDUE',
        reasonCode,
        reason,
        dueAt: null,
        governingTriggerKind: null,
      });
    });
  }
}

for (const year of ['2024', '2000']) {
  for (const [fraction, milliseconds] of [['', '.000'], ['.1', '.100'], ['.123', '.123'], ['.123456', '.123']]) {
    const leapDay = `${year}-02-29T23:59:59${fraction}Z`;

    test(`valid leap day ${leapDay} is accepted as lastVerifiedAt and asOf`, () => {
      const result = evaluateCalibrationVerificationSchedule(scheduleInput({ lastVerifiedAt: leapDay }), leapDay);
      assert.equal(result.decision, 'CURRENT');
      assert.equal(result.reasonCode, 'interval-current');
      assert.equal(result.dueAt, `${year}-03-30T23:59:59${milliseconds}Z`);
      assert.equal(result.governingTriggerKind, null);
    });

    test(`valid leap day ${leapDay} is accepted as a trigger event`, () => {
      const result = evaluateCalibrationVerificationSchedule(scheduleInput({
        lastVerifiedAt: `${year}-02-28T00:00:00Z`,
        triggerEvents: [{ kind: 'major-maintenance', occurredAt: leapDay }],
      }), `${year}-03-01T00:00:00Z`);
      assert.equal(result.decision, 'REQUIRED_BY_EVENT');
      assert.equal(result.reasonCode, 'trigger-event-required');
      assert.equal(result.dueAt, `${year}-02-29T23:59:59${milliseconds}Z`);
      assert.equal(result.governingTriggerKind, 'major-maintenance');
    });
  }
}
