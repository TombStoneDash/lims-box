import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateEnvironmentalMonitoring,
  type RoomEnvironmentalLimits,
  type EnvironmentalReading,
  type MetricLimits,
} from '../lib/ohworks-environmental-monitoring';

/**
 * All fabricated: synthetic room identifiers, limits, and sensor readings.
 * No real facility, patient, or customer data, and no network call.
 *
 * Acceptable temperature window is 15-25, with asymmetric critical
 * breakpoints (criticalBelow=14, criticalAbove=100) so a reading just below
 * the floor is far more severe than a reading well above the ceiling, even
 * though the latter deviates further from the acceptable band.
 */
const TEMPERATURE_LIMITS: MetricLimits = {
  minAcceptable: 15,
  maxAcceptable: 25,
  criticalBelow: 14,
  criticalAbove: 100,
};

const UNUSED_METRIC_LIMITS: MetricLimits = {
  minAcceptable: 0,
  maxAcceptable: 100,
  criticalBelow: -10,
  criticalAbove: 110,
};

function makeProfile(roomId: string): RoomEnvironmentalLimits {
  return {
    roomId,
    limits: {
      temperature: TEMPERATURE_LIMITS,
      humidity: UNUSED_METRIC_LIMITS,
      pressureDifferential: UNUSED_METRIC_LIMITS,
    },
  };
}

function reading(
  roomId: string,
  value: number,
  minutesFromStart: number,
): EnvironmentalReading {
  const timestamp = new Date(Date.UTC(2026, 0, 1, 0, minutesFromStart, 0)).toISOString();
  return { roomId, metric: 'temperature', value, timestamp };
}

test('critical-low reading followed by minor-high reading keeps the excursion critical', () => {
  const profiles = [makeProfile('ROOM-CRIT-THEN-MINOR')];
  const readings = [
    reading('ROOM-CRIT-THEN-MINOR', 14, 0), // critical: at criticalBelow, deviation 1
    reading('ROOM-CRIT-THEN-MINOR', 30, 1), // minor: deviation 5, the greater deviation
    reading('ROOM-CRIT-THEN-MINOR', 20, 2), // back in range: closes the excursion
  ];

  const result = evaluateEnvironmentalMonitoring(profiles, readings);

  assert.equal(result.excursions.length, 1);
  const excursion = result.excursions[0];
  assert.equal(excursion.severity, 'critical');
  assert.equal(excursion.worstValue, 30); // unchanged greatest-deviation semantics
  assert.equal(excursion.durationMs, 60_000);

  const summary = result.roomSummaries.find((s) => s.roomId === 'ROOM-CRIT-THEN-MINOR');
  assert.ok(summary);
  assert.equal(summary?.criticalExcursionCount, 1);
  assert.equal(summary?.minorExcursionCount, 0);
  assert.equal(summary?.worstExcursion?.severity, 'critical');
});

test('minor-high reading followed by critical-low reading still promotes the excursion to critical', () => {
  const profiles = [makeProfile('ROOM-MINOR-THEN-CRIT')];
  const readings = [
    reading('ROOM-MINOR-THEN-CRIT', 30, 0), // minor: deviation 5, the greater deviation
    reading('ROOM-MINOR-THEN-CRIT', 14, 1), // critical: at criticalBelow, deviation 1
  ];

  const result = evaluateEnvironmentalMonitoring(profiles, readings);

  assert.equal(result.excursions.length, 1);
  const excursion = result.excursions[0];
  assert.equal(excursion.severity, 'critical');
  assert.equal(excursion.worstValue, 30); // unchanged greatest-deviation semantics
  assert.equal(excursion.durationMs, 60_000);

  const summary = result.roomSummaries.find((s) => s.roomId === 'ROOM-MINOR-THEN-CRIT');
  assert.ok(summary);
  assert.equal(summary?.criticalExcursionCount, 1);
  assert.equal(summary?.minorExcursionCount, 0);
  assert.equal(summary?.worstExcursion?.severity, 'critical');
});

test('equal-deviation opposite-side readings keep the earlier worst value and the critical severity', () => {
  const profiles = [makeProfile('ROOM-TIE')];
  const readings = [
    reading('ROOM-TIE', 10, 0), // critical-low: deviation 5 (15 - 10)
    reading('ROOM-TIE', 30, 1), // minor-high: deviation 5 (30 - 25), a tie
  ];

  const result = evaluateEnvironmentalMonitoring(profiles, readings);

  assert.equal(result.excursions.length, 1);
  const excursion = result.excursions[0];
  assert.equal(excursion.severity, 'critical');
  assert.equal(excursion.worstValue, 10); // tie keeps the earlier reading, per existing rule
  assert.equal(excursion.durationMs, 60_000);

  const summary = result.roomSummaries.find((s) => s.roomId === 'ROOM-TIE');
  assert.ok(summary);
  assert.equal(summary?.criticalExcursionCount, 1);
  assert.equal(summary?.minorExcursionCount, 0);
  assert.equal(summary?.worstExcursion?.severity, 'critical');
});

test('minor-only control leaves critical counts at zero', () => {
  const profiles = [makeProfile('ROOM-MINOR-ONLY')];
  const readings = [
    reading('ROOM-MINOR-ONLY', 26, 0), // minor: deviation 1
    reading('ROOM-MINOR-ONLY', 27, 1), // minor: deviation 2
    reading('ROOM-MINOR-ONLY', 28, 2), // minor: deviation 3, the greatest
  ];

  const result = evaluateEnvironmentalMonitoring(profiles, readings);

  assert.equal(result.excursions.length, 1);
  const excursion = result.excursions[0];
  assert.equal(excursion.severity, 'minor');
  assert.equal(excursion.worstValue, 28); // unchanged greatest-deviation semantics
  assert.equal(excursion.durationMs, 120_000);

  const summary = result.roomSummaries.find((s) => s.roomId === 'ROOM-MINOR-ONLY');
  assert.ok(summary);
  assert.equal(summary?.criticalExcursionCount, 0);
  assert.equal(summary?.minorExcursionCount, 1);
  assert.equal(summary?.worstExcursion?.severity, 'minor');
});
