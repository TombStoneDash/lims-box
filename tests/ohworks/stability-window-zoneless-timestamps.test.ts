import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateSpecimenStability,
  type StabilityCheckInput,
} from '../../lib/ohworks-stability-window';

/**
 * All fabricated: synthetic specimen/analyte identifiers and made-up
 * timestamps and durations. None of this represents a real patient,
 * specimen, or result.
 */
const ZONES = ['UTC', 'America/Los_Angeles'] as const;

function baselineInput(overrides: Partial<StabilityCheckInput> = {}): StabilityCheckInput {
  return {
    specimenId: 'specimen-synthetic-zoneless',
    analyteCode: 'ANALYTE-SYNTH-ZONELESS',
    collectedAt: '2026-03-07T12:00:00Z',
    history: [{ condition: 'room-temp', at: '2026-03-07T12:00:00Z' }],
    resultAt: '2026-03-08T12:00:00Z',
    windows: [{ condition: 'room-temp', maxDurationMs: 24 * 60 * 60 * 1000 }],
    ...overrides,
  };
}

function withTz<T>(zone: string, fn: () => T): T {
  const original = process.env.TZ;
  process.env.TZ = zone;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

for (const zone of ZONES) {
  test(`a zoneless collectedAt fails closed as collected-timestamp-invalid in ${zone}`, (t) => {
    const originalTz = process.env.TZ;
    t.after(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });
    process.env.TZ = zone;

    const result = evaluateSpecimenStability(baselineInput({ collectedAt: '2026-03-07T12:00:00' }));
    assert.equal(result.status, 'expired');
    assert.equal(result.reasonCode, 'collected-timestamp-invalid');
  });

  test(`a zoneless resultAt fails closed as result-timestamp-invalid in ${zone}`, (t) => {
    const originalTz = process.env.TZ;
    t.after(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });
    process.env.TZ = zone;

    const result = evaluateSpecimenStability(baselineInput({ resultAt: '2026-03-08T12:00:00' }));
    assert.equal(result.status, 'expired');
    assert.equal(result.reasonCode, 'result-timestamp-invalid');
  });

  test(`a zoneless history entry timestamp fails closed as entry-timestamp-invalid in ${zone}`, (t) => {
    const originalTz = process.env.TZ;
    t.after(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });
    process.env.TZ = zone;

    const result = evaluateSpecimenStability(
      baselineInput({ history: [{ condition: 'room-temp', at: '2026-03-07T12:00:00' }] }),
    );
    assert.equal(result.status, 'expired');
    assert.equal(result.reasonCode, 'entry-timestamp-invalid');
  });
}

test('Z-suffixed timestamps still yield the same within-window elapsed time across process timezones', () => {
  const elapsedByZone = ZONES.map((zone) =>
    withTz(zone, () => {
      const result = evaluateSpecimenStability(baselineInput());
      assert.equal(result.status, 'within-window');
      assert.equal(result.reasonCode, 'within-all-windows');
      assert.equal(result.segments.length, 1);
      return result.segments[0].elapsedMs;
    }),
  );

  for (const elapsedMs of elapsedByZone) {
    assert.equal(elapsedMs, 86400000);
  }
});
