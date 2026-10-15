import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateEquipmentQualificationGate,
  type InstrumentQualificationInput,
} from '../../lib/ohworks-equipment-qualification';

const positions = ['run', 'installation', 'operational', 'performance', 'change-event'] as const;
type Position = typeof positions[number];

// Entirely fabricated records. Surround each tested slot with ordered valid stages.
function evaluateAt(position: Position, timestamp: string, year = '2026') {
  const entry: InstrumentQualificationInput = {
    instrumentId: 'SYNTHETIC-CALENDAR-001',
    installation: { completedAt: `${year}-01-01T00:00:00Z`, approverRole: 'quality-manager' },
    operational: { completedAt: `${year}-01-02T00:00:00Z`, approverRole: 'lab-director' },
    performance: { completedAt: `${year}-01-03T00:00:00Z`, approverRole: 'metrology-engineer' },
    requalificationIntervalDays: 365,
  };
  let runAt = `${year}-06-01T00:00:00Z`;
  if (position === 'run') {
    runAt = timestamp;
  } else if (position === 'change-event') {
    // A valid February event is after this run and must not invalidate it.
    runAt = `${year}-02-01T00:00:00Z`;
    entry.changeEvents = [{ kind: 'relocation', occurredAt: timestamp }];
  } else {
    entry[position] = { ...entry[position]!, completedAt: timestamp };
    if (position === 'installation') {
      entry.operational!.completedAt = `${year}-05-01T00:00:00Z`;
    }
    if (position !== 'performance') {
      entry.performance!.completedAt = `${year}-05-02T00:00:00Z`;
    }
  }
  return evaluateEquipmentQualificationGate({ [entry.instrumentId]: entry }, entry.instrumentId, runAt);
}

const invalidTimestamps = [
  '2026-02-30T00:00:00Z',
  '2026-04-31T00:00:00Z',
  '2026-02-29T00:00:00Z',
  '1900-02-29T00:00:00Z',
  '2100-02-29T00:00:00Z',
  '2026-00-01T00:00:00Z',
  '2026-13-01T00:00:00Z',
  '2026-02-00T00:00:00Z',
  '2026-02-32T00:00:00Z',
  '2026-02-28T24:00:00Z',
  '2026-02-28T00:60:00Z',
  '2026-02-28T00:00:60Z',
  '2026-02-28T00:00:00.Z',
  '2026-02-28T00:00:00+00:00',
  '2026-02-28',
];

for (const position of positions) {
  for (const timestamp of invalidTimestamps) {
    test(`${position} rejects ${timestamp} with its specific reason`, () => {
      const result = evaluateAt(position, timestamp, timestamp.slice(0, 4));
      assert.equal(result.decision, 'not_qualified');
      assert.equal(result.reasonCode, `${position}-timestamp-invalid`);
    });
  }

  for (const date of ['2026-02-28', '2026-04-30', '2024-02-29', '2000-02-29']) {
    for (const fraction of ['', '.1', '.123', '.123456']) {
      test(`${position} accepts ${date} with fraction ${fraction || '(none)'}`, () => {
        const result = evaluateAt(position, `${date}T23:59:59${fraction}Z`, date.slice(0, 4));
        assert.equal(result.decision, 'qualified');
        assert.equal(result.reasonCode, 'fully-qualified');
      });
    }
  }
}

test('February 30 performance cannot qualify for the reported March 3 run', () => {
  const entry: InstrumentQualificationInput = {
    instrumentId: 'SYNTHETIC-ROLLOVER-001',
    installation: { completedAt: '2026-01-01T00:00:00Z', approverRole: 'quality-manager' },
    operational: { completedAt: '2026-01-02T00:00:00Z', approverRole: 'lab-director' },
    performance: { completedAt: '2026-02-30T00:00:00Z', approverRole: 'metrology-engineer' },
    requalificationIntervalDays: 365,
  };
  const evaluate = () => evaluateEquipmentQualificationGate(
    { [entry.instrumentId]: entry }, entry.instrumentId, '2026-03-03T00:00:00Z',
  );
  assert.equal(evaluate().decision, 'not_qualified');
  assert.equal(evaluate().reasonCode, 'performance-timestamp-invalid');
  entry.performance!.completedAt = '2026-02-28T00:00:00Z';
  assert.equal(evaluate().decision, 'qualified');
  assert.equal(evaluate().reasonCode, 'fully-qualified');
});
