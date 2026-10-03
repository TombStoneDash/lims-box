import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateStorageConditionLog,
  explainStorageConditionLogError,
  StorageConditionLogError,
  type SensorReading,
  type StorageConditionLogErrorCode,
} from '../../lib/ohworks-storage-conditions';

/**
 * All fabricated: synthetic storage bands and made-up sensor readings. None
 * of this represents a real specimen, patient, or cold-chain device.
 */
const BASE_TIME = Date.parse('2026-02-01T00:00:00.000Z');

function readingAt(offsetMs: number, overrides: Partial<SensorReading> = {}): SensorReading {
  return {
    timestamp: new Date(BASE_TIME + offsetMs).toISOString(),
    temperatureC: 4,
    lightLux: 0,
    humidityPercent: 40,
    ...overrides,
  };
}

test('reports usable with no excursions when every reading is within tolerance', () => {
  const result = evaluateStorageConditionLog('refrigerated', [
    readingAt(0),
    readingAt(60_000, { temperatureC: 6 }),
    readingAt(120_000, { temperatureC: 3 }),
  ]);
  assert.equal(result.usable, true);
  assert.equal(result.decisionRuleCode, 'no-critical-excursions');
  assert.deepEqual(result.excursions, []);
  assert.ok(result.readingClassifications.every((c) => c.severity === 'within_tolerance'));
});

test('classifies a reading just past the primary limit as minor', () => {
  const result = evaluateStorageConditionLog('refrigerated', [readingAt(0, { temperatureC: 9 })]);
  assert.equal(result.readingClassifications[0].severity, 'minor');
  assert.equal(result.excursions.length, 1);
  assert.equal(result.excursions[0].severity, 'minor');
  assert.equal(result.usable, true);
});

test('classifies a reading past the minor tolerance buffer as critical and marks the specimen unusable', () => {
  const result = evaluateStorageConditionLog('refrigerated', [readingAt(0, { temperatureC: 15 })]);
  assert.equal(result.readingClassifications[0].severity, 'critical');
  assert.equal(result.excursions.length, 1);
  assert.equal(result.excursions[0].severity, 'critical');
  assert.equal(result.usable, false);
  assert.equal(result.decisionRuleCode, 'critical-excursion-detected');
});

test('classifies excess light against the declared ceiling independently of temperature', () => {
  const result = evaluateStorageConditionLog('refrigerated', [readingAt(0, { lightLux: 1000 })]);
  assert.equal(result.readingClassifications[0].severity, 'critical');
  assert.equal(result.usable, false);
});

test('classifies excess humidity against the declared ceiling independently of temperature', () => {
  const result = evaluateStorageConditionLog('refrigerated', [readingAt(0, { humidityPercent: 90 })]);
  assert.equal(result.readingClassifications[0].severity, 'critical');
  assert.equal(result.usable, false);
});

test('groups a contiguous run of non-tolerant readings into one excursion with start, end, duration, and worst reading', () => {
  const result = evaluateStorageConditionLog('refrigerated', [
    readingAt(0),
    readingAt(60_000, { temperatureC: 9 }), // minor
    readingAt(120_000, { temperatureC: 15 }), // critical (worst)
    readingAt(180_000, { temperatureC: 9 }), // minor
    readingAt(240_000),
  ]);
  assert.equal(result.excursions.length, 1);
  const [excursion] = result.excursions;
  assert.equal(excursion.severity, 'critical');
  assert.equal(excursion.startTimestamp, readingAt(60_000).timestamp);
  assert.equal(excursion.endTimestamp, readingAt(180_000).timestamp);
  assert.equal(excursion.durationMs, 120_000);
  assert.equal(excursion.worstReadingIndex, 2);
  assert.equal(excursion.worstReading.temperatureC, 15);
});

test('reports two separate excursions when a within-tolerance reading separates them', () => {
  const result = evaluateStorageConditionLog('refrigerated', [
    readingAt(0, { temperatureC: 9 }),
    readingAt(60_000),
    readingAt(120_000, { temperatureC: 15 }),
  ]);
  assert.equal(result.excursions.length, 2);
  assert.equal(result.excursions[0].severity, 'minor');
  assert.equal(result.excursions[1].severity, 'critical');
});

test('reports a single-reading excursion with zero duration', () => {
  const result = evaluateStorageConditionLog('refrigerated', [readingAt(0), readingAt(60_000, { temperatureC: 15 })]);
  const excursion = result.excursions.find((e) => e.severity === 'critical');
  assert.ok(excursion);
  assert.equal(excursion?.startTimestamp, excursion?.endTimestamp);
  assert.equal(excursion?.durationMs, 0);
});

test('an excursion open at the end of the reading list still closes and is reported', () => {
  const result = evaluateStorageConditionLog('refrigerated', [readingAt(0), readingAt(60_000, { temperatureC: 15 })]);
  assert.equal(result.excursions.length, 1);
  assert.equal(result.excursions[0].endTimestamp, readingAt(60_000).timestamp);
});

test('evaluates each known storage band with its own declared limits', () => {
  const frozenOk = evaluateStorageConditionLog('frozen', [readingAt(0, { temperatureC: -20 })]);
  assert.equal(frozenOk.readingClassifications[0].severity, 'within_tolerance');

  const frozenCritical = evaluateStorageConditionLog('frozen', [readingAt(0, { temperatureC: 4 })]);
  assert.equal(frozenCritical.readingClassifications[0].severity, 'critical');

  const roomOk = evaluateStorageConditionLog('controlled_room_temperature', [readingAt(0, { temperatureC: 22 })]);
  assert.equal(roomOk.readingClassifications[0].severity, 'within_tolerance');
});

test('fails closed on an unknown storage band', () => {
  assert.throws(
    () => evaluateStorageConditionLog('arctic_vault', [readingAt(0)]),
    (error: unknown) => error instanceof StorageConditionLogError && error.code === 'storage-band-unknown',
  );
});

test('fails closed on an empty reading list', () => {
  assert.throws(
    () => evaluateStorageConditionLog('refrigerated', []),
    (error: unknown) => error instanceof StorageConditionLogError && error.code === 'readings-empty',
  );
});

test('fails closed on a missing reading timestamp', () => {
  assert.throws(
    () => evaluateStorageConditionLog('refrigerated', [readingAt(0, { timestamp: '' })]),
    (error: unknown) => error instanceof StorageConditionLogError && error.code === 'reading-timestamp-missing',
  );
});

test('fails closed on an unparsable reading timestamp', () => {
  assert.throws(
    () => evaluateStorageConditionLog('refrigerated', [readingAt(0, { timestamp: 'not-a-timestamp' })]),
    (error: unknown) => error instanceof StorageConditionLogError && error.code === 'reading-timestamp-invalid',
  );
});

test('fails closed on a non-UTC (no trailing Z) reading timestamp', () => {
  assert.throws(
    () => evaluateStorageConditionLog('refrigerated', [readingAt(0, { timestamp: '2026-02-01T00:00:00.000' })]),
    (error: unknown) => error instanceof StorageConditionLogError && error.code === 'reading-timestamp-invalid',
  );
});

test('fails closed on unordered (non-increasing) timestamps', () => {
  assert.throws(
    () => evaluateStorageConditionLog('refrigerated', [readingAt(60_000), readingAt(0)]),
    (error: unknown) =>
      error instanceof StorageConditionLogError &&
      error.code === 'readings-timestamps-unordered' &&
      error.readingIndex === 1,
  );
});

test('fails closed on two readings sharing the same timestamp', () => {
  assert.throws(
    () => evaluateStorageConditionLog('refrigerated', [readingAt(0), readingAt(0)]),
    (error: unknown) => error instanceof StorageConditionLogError && error.code === 'readings-timestamps-unordered',
  );
});

test('fails closed on a non-finite temperature reading', () => {
  assert.throws(
    () => evaluateStorageConditionLog('refrigerated', [readingAt(0, { temperatureC: Number.NaN })]),
    (error: unknown) => error instanceof StorageConditionLogError && error.code === 'reading-value-non-finite',
  );
});

test('fails closed on an infinite light reading', () => {
  assert.throws(
    () => evaluateStorageConditionLog('refrigerated', [readingAt(0, { lightLux: Number.POSITIVE_INFINITY })]),
    (error: unknown) => error instanceof StorageConditionLogError && error.code === 'reading-value-non-finite',
  );
});

test('fails closed on a negative light reading', () => {
  assert.throws(
    () => evaluateStorageConditionLog('refrigerated', [readingAt(0, { lightLux: -1 })]),
    (error: unknown) => error instanceof StorageConditionLogError && error.code === 'reading-value-out-of-range',
  );
});

test('fails closed on a humidity reading outside 0-100 percent', () => {
  assert.throws(
    () => evaluateStorageConditionLog('refrigerated', [readingAt(0, { humidityPercent: 101 })]),
    (error: unknown) => error instanceof StorageConditionLogError && error.code === 'reading-value-out-of-range',
  );
  assert.throws(
    () => evaluateStorageConditionLog('refrigerated', [readingAt(0, { humidityPercent: -1 })]),
    (error: unknown) => error instanceof StorageConditionLogError && error.code === 'reading-value-out-of-range',
  );
});

test('checks the storage band before validating readings', () => {
  assert.throws(
    () => evaluateStorageConditionLog('arctic_vault', [readingAt(0, { timestamp: 'not-a-timestamp' })]),
    (error: unknown) => error instanceof StorageConditionLogError && error.code === 'storage-band-unknown',
  );
});

test('checks reading validity before checking timestamp order', () => {
  assert.throws(
    () =>
      evaluateStorageConditionLog('refrigerated', [
        readingAt(60_000),
        readingAt(0, { temperatureC: Number.NaN }),
      ]),
    (error: unknown) => error instanceof StorageConditionLogError && error.code === 'reading-value-non-finite',
  );
});

test('explainStorageConditionLogError returns deterministic, non-empty text for every error code', () => {
  const codes: StorageConditionLogErrorCode[] = [
    'storage-band-unknown',
    'readings-empty',
    'reading-timestamp-missing',
    'reading-timestamp-invalid',
    'readings-timestamps-unordered',
    'reading-value-non-finite',
    'reading-value-out-of-range',
  ];
  for (const code of codes) {
    const message = explainStorageConditionLogError(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

test('never reads the system clock: identical inputs always produce identical output', () => {
  const readings = [readingAt(0), readingAt(60_000, { temperatureC: 15 }), readingAt(120_000)];
  const first = evaluateStorageConditionLog('refrigerated', readings);
  const second = evaluateStorageConditionLog('refrigerated', readings);
  assert.deepEqual(first, second);
});
