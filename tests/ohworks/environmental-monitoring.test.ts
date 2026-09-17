import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EnvironmentalMonitoringError,
  evaluateEnvironmentalMonitoring,
  explainEnvironmentalMonitoringError,
  type EnvironmentalMonitoringErrorCode,
  type EnvironmentalReading,
  type MetricLimits,
  type RoomEnvironmentalLimits,
} from '../../lib/ohworks-environmental-monitoring';

/**
 * All fabricated: synthetic room identifiers, made-up limit numbers, and
 * synthetic sensor readings. None of this represents a real facility,
 * patient, or customer record.
 */
function metricLimits(
  minAcceptable: number,
  maxAcceptable: number,
  criticalBelow: number,
  criticalAbove: number,
): MetricLimits {
  return { minAcceptable, maxAcceptable, criticalBelow, criticalAbove };
}

function roomProfile(roomId: string, overrides: Partial<RoomEnvironmentalLimits['limits']> = {}): RoomEnvironmentalLimits {
  return {
    roomId,
    limits: {
      temperature: metricLimits(15, 25, 10, 30),
      humidity: metricLimits(30, 60, 20, 70),
      pressureDifferential: metricLimits(-5, 5, -10, 10),
      ...overrides,
    },
  };
}

function reading(
  roomId: string,
  metric: EnvironmentalReading['metric'],
  value: number,
  timestamp: string,
): EnvironmentalReading {
  return { roomId, metric, value, timestamp };
}

const T = (hour: number, minute = 0): string =>
  `2026-03-01T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;

function assertThrowsCode(fn: () => unknown, code: EnvironmentalMonitoringErrorCode): void {
  assert.throws(
    fn,
    (error: unknown) => error instanceof EnvironmentalMonitoringError && error.code === code,
  );
}

test('reports no excursions and zeroed summary when every reading is within range', () => {
  const result = evaluateEnvironmentalMonitoring(
    [roomProfile('ROOM-A')],
    [
      reading('ROOM-A', 'temperature', 20, T(1)),
      reading('ROOM-A', 'humidity', 45, T(2)),
      reading('ROOM-A', 'pressureDifferential', 0, T(3)),
    ],
  );
  assert.deepEqual(result.excursions, []);
  assert.deepEqual(result.roomSummaries, [
    {
      roomId: 'ROOM-A',
      readingCount: 3,
      excursionCount: 0,
      minorExcursionCount: 0,
      criticalExcursionCount: 0,
      totalExcursionDurationMs: 0,
      worstExcursion: null,
    },
  ]);
});

test('a value exactly at the acceptable boundary is not an excursion', () => {
  const result = evaluateEnvironmentalMonitoring(
    [roomProfile('ROOM-A')],
    [reading('ROOM-A', 'temperature', 25, T(1)), reading('ROOM-A', 'temperature', 15, T(2))],
  );
  assert.deepEqual(result.excursions, []);
});

test('opens and closes a minor excursion, tracking the worst mid-run value', () => {
  const result = evaluateEnvironmentalMonitoring(
    [roomProfile('ROOM-A')],
    [
      reading('ROOM-A', 'temperature', 20, T(1)),
      reading('ROOM-A', 'temperature', 27, T(2)),
      reading('ROOM-A', 'temperature', 29, T(3)),
      reading('ROOM-A', 'temperature', 26, T(4)),
      reading('ROOM-A', 'temperature', 20, T(5)),
    ],
  );
  assert.equal(result.excursions.length, 1);
  assert.deepEqual(result.excursions[0], {
    roomId: 'ROOM-A',
    metric: 'temperature',
    severity: 'minor',
    startTimestamp: T(2),
    endTimestamp: T(4),
    durationMs: 2 * 60 * 60 * 1000,
    worstValue: 29,
  });
});

test('classifies an excursion critical once the worst value reaches criticalAbove', () => {
  const result = evaluateEnvironmentalMonitoring(
    [roomProfile('ROOM-A')],
    [reading('ROOM-A', 'temperature', 27, T(1)), reading('ROOM-A', 'temperature', 30, T(2))],
  );
  assert.equal(result.excursions.length, 1);
  assert.equal(result.excursions[0].severity, 'critical');
  assert.equal(result.excursions[0].worstValue, 30);
});

test('classifies an excursion critical once the worst value reaches criticalBelow', () => {
  const result = evaluateEnvironmentalMonitoring([roomProfile('ROOM-A')], [reading('ROOM-A', 'temperature', 10, T(1))]);
  assert.equal(result.excursions[0].severity, 'critical');
});

test('a value at or above criticalAbove is critical; just below it is only minor', () => {
  const justBelow = evaluateEnvironmentalMonitoring([roomProfile('ROOM-A')], [reading('ROOM-A', 'temperature', 29.999, T(1))]);
  assert.equal(justBelow.excursions[0].severity, 'minor');

  const atThreshold = evaluateEnvironmentalMonitoring([roomProfile('ROOM-A')], [reading('ROOM-A', 'temperature', 30, T(1))]);
  assert.equal(atThreshold.excursions[0].severity, 'critical');
});

test('an excursion still open at the final reading closes using that reading as both end and worst', () => {
  const result = evaluateEnvironmentalMonitoring(
    [roomProfile('ROOM-A')],
    [reading('ROOM-A', 'temperature', 20, T(1)), reading('ROOM-A', 'temperature', 27, T(2))],
  );
  assert.equal(result.excursions.length, 1);
  assert.deepEqual(result.excursions[0], {
    roomId: 'ROOM-A',
    metric: 'temperature',
    severity: 'minor',
    startTimestamp: T(2),
    endTimestamp: T(2),
    durationMs: 0,
    worstValue: 27,
  });
});

test('tracks excursions independently per metric within the same room', () => {
  const result = evaluateEnvironmentalMonitoring(
    [roomProfile('ROOM-A')],
    [
      reading('ROOM-A', 'temperature', 27, T(1)),
      reading('ROOM-A', 'humidity', 65, T(1, 30)),
      reading('ROOM-A', 'temperature', 20, T(2)),
      reading('ROOM-A', 'humidity', 45, T(2, 30)),
    ],
  );
  assert.equal(result.excursions.length, 2);
  const metrics = result.excursions.map((excursion) => excursion.metric).sort();
  assert.deepEqual(metrics, ['humidity', 'temperature']);
});

test('tracks excursions independently per room', () => {
  const result = evaluateEnvironmentalMonitoring(
    [roomProfile('ROOM-A'), roomProfile('ROOM-B')],
    [
      reading('ROOM-A', 'temperature', 27, T(1)),
      reading('ROOM-B', 'temperature', 20, T(1)),
      reading('ROOM-A', 'temperature', 20, T(2)),
      reading('ROOM-B', 'temperature', 30, T(2)),
    ],
  );
  const byRoom = new Map(result.excursions.map((excursion) => [excursion.roomId, excursion]));
  assert.equal(byRoom.get('ROOM-A')?.severity, 'minor');
  assert.equal(byRoom.get('ROOM-B')?.severity, 'critical');
});

test('a room declared in profiles but with no readings still appears in the summary, zeroed', () => {
  const result = evaluateEnvironmentalMonitoring(
    [roomProfile('ROOM-A'), roomProfile('ROOM-B')],
    [reading('ROOM-A', 'temperature', 20, T(1))],
  );
  const roomB = result.roomSummaries.find((summary) => summary.roomId === 'ROOM-B');
  assert.deepEqual(roomB, {
    roomId: 'ROOM-B',
    readingCount: 0,
    excursionCount: 0,
    minorExcursionCount: 0,
    criticalExcursionCount: 0,
    totalExcursionDurationMs: 0,
    worstExcursion: null,
  });
});

test('daily summary totals excursion counts, severities, and durations across metrics', () => {
  const result = evaluateEnvironmentalMonitoring(
    [roomProfile('ROOM-A')],
    [
      reading('ROOM-A', 'temperature', 27, T(1)),
      reading('ROOM-A', 'temperature', 28, T(2)),
      reading('ROOM-A', 'temperature', 20, T(3)),
      reading('ROOM-A', 'humidity', 65, T(5)),
      reading('ROOM-A', 'humidity', 66, T(6)),
      reading('ROOM-A', 'humidity', 45, T(7)),
    ],
  );
  const summary = result.roomSummaries[0];
  assert.equal(summary.readingCount, 6);
  assert.equal(summary.excursionCount, 2);
  assert.equal(summary.minorExcursionCount, 2);
  assert.equal(summary.criticalExcursionCount, 0);
  assert.equal(summary.totalExcursionDurationMs, 1 * 60 * 60 * 1000 + 1 * 60 * 60 * 1000);
});

test('worst excursion in a room summary prefers critical severity over a longer minor excursion', () => {
  const result = evaluateEnvironmentalMonitoring(
    [roomProfile('ROOM-A')],
    [
      reading('ROOM-A', 'temperature', 27, T(1)),
      reading('ROOM-A', 'temperature', 27, T(10)),
      reading('ROOM-A', 'temperature', 20, T(11)),
      reading('ROOM-A', 'humidity', 75, T(12)),
      reading('ROOM-A', 'humidity', 45, T(13)),
    ],
  );
  const summary = result.roomSummaries[0];
  assert.equal(summary.worstExcursion?.severity, 'critical');
  assert.equal(summary.worstExcursion?.metric, 'humidity');
});

test('worst excursion ties on severity break by longer duration', () => {
  const result = evaluateEnvironmentalMonitoring(
    [roomProfile('ROOM-A')],
    [
      reading('ROOM-A', 'temperature', 27, T(1)),
      reading('ROOM-A', 'temperature', 27, T(6)),
      reading('ROOM-A', 'temperature', 20, T(7)),
      reading('ROOM-A', 'humidity', 65, T(8)),
      reading('ROOM-A', 'humidity', 65, T(9)),
      reading('ROOM-A', 'humidity', 45, T(10)),
    ],
  );
  const summary = result.roomSummaries[0];
  assert.equal(summary.worstExcursion?.metric, 'temperature');
  assert.equal(summary.worstExcursion?.durationMs, 5 * 60 * 60 * 1000);
});

test('computation is pure and deterministic across repeated calls with equivalent input', () => {
  const profiles = [roomProfile('ROOM-A')];
  const readings = [reading('ROOM-A', 'temperature', 27, T(1)), reading('ROOM-A', 'temperature', 20, T(2))];
  const first = evaluateEnvironmentalMonitoring(profiles, readings);
  const second = evaluateEnvironmentalMonitoring(
    [roomProfile('ROOM-A')],
    [reading('ROOM-A', 'temperature', 27, T(1)), reading('ROOM-A', 'temperature', 20, T(2))],
  );
  assert.deepEqual(first, second);
});

test('rejects a reading naming a room absent from the declared profiles', () => {
  assertThrowsCode(
    () => evaluateEnvironmentalMonitoring([roomProfile('ROOM-A')], [reading('ROOM-UNKNOWN', 'temperature', 20, T(1))]),
    'room-unknown',
  );
});

test('rejects a reading naming an unrecognized metric', () => {
  assertThrowsCode(
    () =>
      evaluateEnvironmentalMonitoring(
        [roomProfile('ROOM-A')],
        [reading('ROOM-A', 'radiation' as EnvironmentalReading['metric'], 20, T(1))],
      ),
    'metric-unknown',
  );
});

test('rejects a non-finite reading value', () => {
  assertThrowsCode(
    () => evaluateEnvironmentalMonitoring([roomProfile('ROOM-A')], [reading('ROOM-A', 'temperature', Number.NaN, T(1))]),
    'value-not-finite',
  );
  assertThrowsCode(
    () =>
      evaluateEnvironmentalMonitoring([roomProfile('ROOM-A')], [reading('ROOM-A', 'temperature', Number.POSITIVE_INFINITY, T(1))]),
    'value-not-finite',
  );
});

test('rejects an unparsable reading timestamp', () => {
  assertThrowsCode(
    () => evaluateEnvironmentalMonitoring([roomProfile('ROOM-A')], [reading('ROOM-A', 'temperature', 20, 'not-a-timestamp')]),
    'timestamp-invalid',
  );
});

test('rejects an impossible calendar date instead of rolling it over', () => {
  assertThrowsCode(
    () =>
      evaluateEnvironmentalMonitoring(
        [roomProfile('ROOM-A')],
        [reading('ROOM-A', 'temperature', 20, '2026-02-30T12:00:00.000Z')],
      ),
    'timestamp-invalid',
  );
});

test('rejects a timestamp with no explicit UTC "Z" designator', () => {
  assertThrowsCode(
    () =>
      evaluateEnvironmentalMonitoring(
        [roomProfile('ROOM-A')],
        [reading('ROOM-A', 'temperature', 20, '2026-03-01T01:00:00.000')],
      ),
    'timestamp-invalid',
  );
});

test('rejects readings supplied out of timestamp order', () => {
  assertThrowsCode(
    () =>
      evaluateEnvironmentalMonitoring(
        [roomProfile('ROOM-A')],
        [reading('ROOM-A', 'temperature', 20, T(2)), reading('ROOM-A', 'temperature', 20, T(1))],
      ),
    'readings-out-of-order',
  );
});

test('accepts two readings sharing the exact same timestamp', () => {
  const result = evaluateEnvironmentalMonitoring(
    [roomProfile('ROOM-A')],
    [reading('ROOM-A', 'temperature', 20, T(1)), reading('ROOM-A', 'humidity', 45, T(1))],
  );
  assert.equal(result.roomSummaries[0].readingCount, 2);
});

test('rejects a room profile list that is not an array', () => {
  assertThrowsCode(() => evaluateEnvironmentalMonitoring('not-an-array', []), 'profiles-not-array');
});

test('rejects a room profile missing a required limits metric', () => {
  const malformed = { roomId: 'ROOM-A', limits: { temperature: metricLimits(15, 25, 10, 30) } };
  assertThrowsCode(() => evaluateEnvironmentalMonitoring([malformed], []), 'profile-invalid');
});

test('rejects a room profile whose limits are not ordered criticalBelow < min < max < criticalAbove', () => {
  const malformed = roomProfile('ROOM-A', { temperature: metricLimits(25, 15, 10, 30) });
  assertThrowsCode(() => evaluateEnvironmentalMonitoring([malformed], []), 'profile-invalid');
});

test('rejects a room profile with a non-finite limit', () => {
  const malformed = roomProfile('ROOM-A', { temperature: metricLimits(15, 25, 10, Number.POSITIVE_INFINITY) });
  assertThrowsCode(() => evaluateEnvironmentalMonitoring([malformed], []), 'profile-invalid');
});

test('rejects a duplicate room identifier across declared profiles', () => {
  assertThrowsCode(
    () => evaluateEnvironmentalMonitoring([roomProfile('ROOM-A'), roomProfile('ROOM-A')], []),
    'room-duplicate',
  );
});

test('rejects a reading list that is not an array', () => {
  assertThrowsCode(() => evaluateEnvironmentalMonitoring([roomProfile('ROOM-A')], 'not-an-array'), 'readings-not-array');
});

test('rejects a reading missing a required field', () => {
  const malformed = { roomId: 'ROOM-A', metric: 'temperature', timestamp: T(1) };
  assertThrowsCode(() => evaluateEnvironmentalMonitoring([roomProfile('ROOM-A')], [malformed]), 'reading-invalid');
});

test('rejects a non-object reading', () => {
  assertThrowsCode(() => evaluateEnvironmentalMonitoring([roomProfile('ROOM-A')], [null]), 'reading-invalid');
});

test('explainEnvironmentalMonitoringError covers every declared error code', () => {
  const codes: EnvironmentalMonitoringErrorCode[] = [
    'profiles-not-array',
    'profile-invalid',
    'room-duplicate',
    'readings-not-array',
    'reading-invalid',
    'room-unknown',
    'metric-unknown',
    'timestamp-invalid',
    'readings-out-of-order',
    'value-not-finite',
  ];
  for (const code of codes) {
    const message = explainEnvironmentalMonitoringError(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});
