import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TransportConditionsError,
  evaluateTransportConditions,
  explainTransportConditionsError,
  type SpecimenTypeTransportLimits,
  type TemperatureReading,
  type TransportConditionsErrorCode,
  type TransportLog,
} from '../../lib/ohworks-transport-conditions';

/**
 * All fabricated: synthetic specimen type identifiers, made-up threshold
 * numbers, and synthetic courier logger readings. None of this represents a
 * real courier, patient, or customer record.
 */
function limits(
  specimenType: string,
  overrides: Partial<SpecimenTypeTransportLimits> = {},
): SpecimenTypeTransportLimits {
  return {
    specimenType,
    band: { minC: 2, maxC: 8 },
    maxAcceptableTotalExcursionMs: 30 * 60 * 1000,
    maxCommentableTotalExcursionMs: 2 * 60 * 60 * 1000,
    maxAcceptableSingleExcursionMs: 15 * 60 * 1000,
    maxCommentableSingleExcursionMs: 60 * 60 * 1000,
    maxGapMs: 60 * 60 * 1000,
    ...overrides,
  };
}

function reading(value: number, timestamp: string): TemperatureReading {
  return { value, timestamp };
}

function log(specimenId: string, specimenType: string, readings: TemperatureReading[]): TransportLog {
  return { specimenId, specimenType, readings };
}

const T = (hour: number, minute = 0): string =>
  `2026-03-01T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;

function assertThrowsCode(fn: () => unknown, code: TransportConditionsErrorCode): void {
  assert.throws(fn, (error: unknown) => error instanceof TransportConditionsError && error.code === code);
}

test('accepts a specimen whose entire log stays inside the declared band', () => {
  const result = evaluateTransportConditions(
    [limits('SERUM')],
    log('SPEC-1', 'SERUM', [reading(4, T(1)), reading(6, T(2)), reading(5, T(3))]),
  );
  assert.equal(result.decision, 'acceptable');
  assert.deepEqual(result.excursions, []);
  assert.equal(result.totalExcursionMs, 0);
  assert.equal(result.longestExcursionMs, 0);
  assert.equal(result.readingCount, 3);
  assert.equal(result.specimenId, 'SPEC-1');
  assert.equal(result.specimenType, 'SERUM');
});

test('a value exactly at the band boundary is not an excursion', () => {
  const result = evaluateTransportConditions(
    [limits('SERUM')],
    log('SPEC-1', 'SERUM', [reading(2, T(1)), reading(8, T(2))]),
  );
  assert.deepEqual(result.excursions, []);
  assert.equal(result.decision, 'acceptable');
});

test('opens and closes an excursion, tracking the worst mid-run value', () => {
  const result = evaluateTransportConditions(
    [limits('SERUM')],
    log('SPEC-1', 'SERUM', [
      reading(5, T(1)),
      reading(10, T(1, 5)),
      reading(12, T(1, 10)),
      reading(9, T(1, 15)),
      reading(5, T(1, 20)),
    ]),
  );
  assert.equal(result.excursions.length, 1);
  assert.deepEqual(result.excursions[0], {
    startTimestamp: T(1, 5),
    endTimestamp: T(1, 15),
    durationMs: 10 * 60 * 1000,
    worstValue: 12,
  });
  assert.equal(result.totalExcursionMs, 10 * 60 * 1000);
  assert.equal(result.longestExcursionMs, 10 * 60 * 1000);
});

test('an excursion still open at the final reading closes using that reading as both end and worst', () => {
  const result = evaluateTransportConditions(
    [limits('SERUM')],
    log('SPEC-1', 'SERUM', [reading(5, T(1)), reading(10, T(1, 5))]),
  );
  assert.equal(result.excursions.length, 1);
  assert.deepEqual(result.excursions[0], {
    startTimestamp: T(1, 5),
    endTimestamp: T(1, 5),
    durationMs: 0,
    worstValue: 10,
  });
});

test('decides acceptable when total and single excursion time are within the acceptable thresholds', () => {
  const result = evaluateTransportConditions(
    [limits('SERUM')],
    log('SPEC-1', 'SERUM', [
      reading(5, T(1)),
      reading(10, T(1, 10)),
      reading(10, T(1, 20)),
      reading(5, T(1, 30)),
    ]),
  );
  assert.equal(result.longestExcursionMs, 10 * 60 * 1000);
  assert.equal(result.totalExcursionMs, 10 * 60 * 1000);
  assert.equal(result.decision, 'acceptable');
});

test('decides acceptable_with_comment when excursion time exceeds acceptable but stays within commentable thresholds', () => {
  const result = evaluateTransportConditions(
    [limits('SERUM')],
    log('SPEC-1', 'SERUM', [
      reading(5, T(1)),
      reading(10, T(1, 10)),
      reading(10, T(1, 30)),
      reading(5, T(1, 40)),
    ]),
  );
  assert.equal(result.longestExcursionMs, 20 * 60 * 1000);
  assert.equal(result.decision, 'acceptable_with_comment');
});

test('decides reject when the longest excursion exceeds the commentable single-excursion threshold', () => {
  const result = evaluateTransportConditions(
    [limits('SERUM')],
    log('SPEC-1', 'SERUM', [
      reading(5, T(1, 0)),
      reading(10, T(1, 10)),
      reading(10, T(1, 40)),
      reading(10, T(2, 10)),
      reading(10, T(2, 40)),
      reading(5, T(2, 50)),
    ]),
  );
  assert.ok(result.longestExcursionMs > limits('SERUM').maxCommentableSingleExcursionMs);
  assert.equal(result.excursions.length, 1);
  assert.equal(result.decision, 'reject');
});

test('decides reject when cumulative excursion time exceeds the commentable total threshold even though each single excursion stays within it', () => {
  const result = evaluateTransportConditions(
    [limits('SERUM')],
    log('SPEC-1', 'SERUM', [
      reading(5, T(0, 0)),
      reading(10, T(0, 10)),
      reading(10, T(0, 50)),
      reading(5, T(1, 0)),
      reading(10, T(1, 10)),
      reading(10, T(1, 50)),
      reading(5, T(2, 0)),
      reading(10, T(2, 10)),
      reading(10, T(2, 50)),
      reading(5, T(3, 0)),
      reading(10, T(3, 10)),
      reading(10, T(3, 50)),
      reading(5, T(4, 0)),
    ]),
  );
  assert.equal(result.excursions.length, 4);
  assert.ok(result.excursions.every((excursion) => excursion.durationMs <= limits('SERUM').maxCommentableSingleExcursionMs));
  assert.ok(result.totalExcursionMs > limits('SERUM').maxCommentableTotalExcursionMs);
  assert.equal(result.decision, 'reject');
});

test('sums excursion duration across multiple separate excursions for the total, tracking the longest independently', () => {
  const result = evaluateTransportConditions(
    [limits('SERUM')],
    log('SPEC-1', 'SERUM', [
      reading(5, T(1, 0)),
      reading(10, T(1, 10)),
      reading(10, T(1, 20)),
      reading(5, T(1, 30)),
      reading(10, T(2, 0)),
      reading(10, T(2, 5)),
      reading(5, T(2, 10)),
    ]),
  );
  assert.equal(result.excursions.length, 2);
  assert.equal(result.totalExcursionMs, 10 * 60 * 1000 + 5 * 60 * 1000);
  assert.equal(result.longestExcursionMs, 10 * 60 * 1000);
});

test('computation is pure and deterministic across repeated calls with equivalent input', () => {
  const readings = [reading(5, T(1)), reading(10, T(1, 10)), reading(5, T(1, 20))];
  const first = evaluateTransportConditions([limits('SERUM')], log('SPEC-1', 'SERUM', readings));
  const second = evaluateTransportConditions(
    [limits('SERUM')],
    log('SPEC-1', 'SERUM', [reading(5, T(1)), reading(10, T(1, 10)), reading(5, T(1, 20))]),
  );
  assert.deepEqual(first, second);
});

test('tracks excursions independently per evaluation call across different specimen types', () => {
  const declaredLimits = [limits('SERUM'), limits('WHOLE_BLOOD', { band: { minC: 20, maxC: 24 } })];
  const serumResult = evaluateTransportConditions(declaredLimits, log('SPEC-1', 'SERUM', [reading(5, T(1))]));
  const bloodResult = evaluateTransportConditions(
    declaredLimits,
    log('SPEC-2', 'WHOLE_BLOOD', [reading(22, T(1))]),
  );
  assert.equal(serumResult.decision, 'acceptable');
  assert.equal(bloodResult.decision, 'acceptable');
});

test('accepts two readings sharing the exact same timestamp', () => {
  const result = evaluateTransportConditions(
    [limits('SERUM')],
    log('SPEC-1', 'SERUM', [reading(5, T(1)), reading(6, T(1))]),
  );
  assert.equal(result.readingCount, 2);
});

test('an empty reading list is acceptable with zero excursion time', () => {
  const result = evaluateTransportConditions([limits('SERUM')], log('SPEC-1', 'SERUM', []));
  assert.deepEqual(result.excursions, []);
  assert.equal(result.decision, 'acceptable');
  assert.equal(result.readingCount, 0);
});

test('rejects a log naming a specimen type absent from the declared limits', () => {
  assertThrowsCode(
    () => evaluateTransportConditions([limits('SERUM')], log('SPEC-1', 'UNKNOWN_TYPE', [reading(5, T(1))])),
    'specimen-type-unknown',
  );
});

test('rejects a non-finite reading value', () => {
  assertThrowsCode(
    () => evaluateTransportConditions([limits('SERUM')], log('SPEC-1', 'SERUM', [reading(Number.NaN, T(1))])),
    'value-not-finite',
  );
  assertThrowsCode(
    () =>
      evaluateTransportConditions(
        [limits('SERUM')],
        log('SPEC-1', 'SERUM', [reading(Number.POSITIVE_INFINITY, T(1))]),
      ),
    'value-not-finite',
  );
});

test('rejects an unparsable reading timestamp', () => {
  assertThrowsCode(
    () => evaluateTransportConditions([limits('SERUM')], log('SPEC-1', 'SERUM', [reading(5, 'not-a-timestamp')])),
    'timestamp-invalid',
  );
});

test('rejects an impossible calendar date instead of rolling it over', () => {
  assertThrowsCode(
    () =>
      evaluateTransportConditions(
        [limits('SERUM')],
        log('SPEC-1', 'SERUM', [reading(5, '2026-02-30T12:00:00.000Z')]),
      ),
    'timestamp-invalid',
  );
});

test('rejects a timestamp with no explicit UTC "Z" designator', () => {
  assertThrowsCode(
    () =>
      evaluateTransportConditions(
        [limits('SERUM')],
        log('SPEC-1', 'SERUM', [reading(5, '2026-03-01T01:00:00.000')]),
      ),
    'timestamp-invalid',
  );
});

test('rejects readings supplied out of timestamp order', () => {
  assertThrowsCode(
    () =>
      evaluateTransportConditions(
        [limits('SERUM')],
        log('SPEC-1', 'SERUM', [reading(5, T(2)), reading(5, T(1))]),
      ),
    'readings-out-of-order',
  );
});

test('rejects a gap between consecutive readings that exceeds the declared maximum', () => {
  assertThrowsCode(
    () =>
      evaluateTransportConditions(
        [limits('SERUM', { maxGapMs: 30 * 60 * 1000 })],
        log('SPEC-1', 'SERUM', [reading(5, T(1)), reading(5, T(2))]),
      ),
    'gap-too-large',
  );
});

test('accepts a gap exactly at the declared maximum', () => {
  const result = evaluateTransportConditions(
    [limits('SERUM', { maxGapMs: 60 * 60 * 1000 })],
    log('SPEC-1', 'SERUM', [reading(5, T(1)), reading(5, T(2))]),
  );
  assert.equal(result.readingCount, 2);
});

test('rejects a limits list that is not an array', () => {
  assertThrowsCode(
    () => evaluateTransportConditions('not-an-array', log('SPEC-1', 'SERUM', [])),
    'limits-not-array',
  );
});

test('rejects a limits entry missing a required field', () => {
  const malformed = { specimenType: 'SERUM', band: { minC: 2, maxC: 8 } };
  assertThrowsCode(() => evaluateTransportConditions([malformed], log('SPEC-1', 'SERUM', [])), 'limits-invalid');
});

test('rejects a limits entry whose band is not ordered minC < maxC', () => {
  const malformed = limits('SERUM', { band: { minC: 8, maxC: 2 } });
  assertThrowsCode(() => evaluateTransportConditions([malformed], log('SPEC-1', 'SERUM', [])), 'limits-invalid');
});

test('rejects a limits entry with a non-finite threshold', () => {
  const malformed = limits('SERUM', { maxGapMs: Number.POSITIVE_INFINITY });
  assertThrowsCode(() => evaluateTransportConditions([malformed], log('SPEC-1', 'SERUM', [])), 'limits-invalid');
});

test('rejects a limits entry whose acceptable threshold exceeds its commentable threshold', () => {
  const malformed = limits('SERUM', {
    maxAcceptableTotalExcursionMs: 3 * 60 * 60 * 1000,
    maxCommentableTotalExcursionMs: 60 * 60 * 1000,
  });
  assertThrowsCode(() => evaluateTransportConditions([malformed], log('SPEC-1', 'SERUM', [])), 'limits-invalid');
});

test('rejects a non-positive maxGapMs', () => {
  const malformed = limits('SERUM', { maxGapMs: 0 });
  assertThrowsCode(() => evaluateTransportConditions([malformed], log('SPEC-1', 'SERUM', [])), 'limits-invalid');
});

test('rejects a duplicate specimen type across declared limits', () => {
  assertThrowsCode(
    () => evaluateTransportConditions([limits('SERUM'), limits('SERUM')], log('SPEC-1', 'SERUM', [])),
    'specimen-type-duplicate',
  );
});

test('rejects a transport log that is not a well-shaped object', () => {
  assertThrowsCode(() => evaluateTransportConditions([limits('SERUM')], 'not-an-object'), 'log-invalid');
  assertThrowsCode(() => evaluateTransportConditions([limits('SERUM')], null), 'log-invalid');
  assertThrowsCode(
    () => evaluateTransportConditions([limits('SERUM')], { specimenId: 'SPEC-1' }),
    'log-invalid',
  );
});

test('rejects a reading list that is not an array', () => {
  assertThrowsCode(
    () => evaluateTransportConditions([limits('SERUM')], { specimenId: 'SPEC-1', specimenType: 'SERUM', readings: 'nope' }),
    'readings-not-array',
  );
});

test('rejects a reading missing a required field', () => {
  const malformed = { timestamp: T(1) };
  assertThrowsCode(
    () => evaluateTransportConditions([limits('SERUM')], log('SPEC-1', 'SERUM', [malformed as unknown as TemperatureReading])),
    'reading-invalid',
  );
});

test('rejects a non-object reading', () => {
  assertThrowsCode(
    () => evaluateTransportConditions([limits('SERUM')], log('SPEC-1', 'SERUM', [null as unknown as TemperatureReading])),
    'reading-invalid',
  );
});

test('explainTransportConditionsError covers every declared error code', () => {
  const codes: TransportConditionsErrorCode[] = [
    'limits-not-array',
    'limits-invalid',
    'specimen-type-duplicate',
    'log-invalid',
    'readings-not-array',
    'reading-invalid',
    'specimen-type-unknown',
    'timestamp-invalid',
    'readings-out-of-order',
    'value-not-finite',
    'gap-too-large',
  ];
  for (const code of codes) {
    const message = explainTransportConditionsError(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});
