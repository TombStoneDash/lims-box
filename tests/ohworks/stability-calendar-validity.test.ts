import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSpecimenStability, type StabilityCheckInput } from '../../lib/ohworks-stability-window';

const HOUR = 60 * 60 * 1000;

// Fabricated specimens, analytes, timestamps and windows only.
function specimen(collectedAt: string, resultAt: string): StabilityCheckInput {
  return {
    specimenId: 'SYNTHETIC-CALENDAR-001',
    analyteCode: 'SYNTHETIC-CALENDAR',
    collectedAt,
    resultAt,
    history: [{ condition: 'room-temp', at: collectedAt }],
    windows: [{ condition: 'room-temp', maxDurationMs: 2 * HOUR }],
  };
}

test('February 30 collection reproduction fails closed before building segments', () => {
  assert.deepEqual(evaluateSpecimenStability(specimen(
    '2026-02-30T08:00:00.000Z', '2026-03-02T09:00:00.000Z',
  )), { status: 'expired', reasonCode: 'collected-timestamp-invalid', segments: [] });
});

for (const date of ['2026-02-30', '2026-02-29', '1900-02-29', '2100-02-29', '2024-02-30', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00']) {
  for (const zone of ['Z', '+05:30', '-0800']) {
    for (const field of ['collected', 'result', 'entry'] as const) {
      test(`${field} independently rejects impossible calendar date ${date} ${zone}`, () => {
        const input = specimen('2026-03-02T08:00:00.000Z', '2026-03-02T09:00:00.000Z');
        const invalid = `${date}T08:00:00.000${zone}`;
        if (field === 'collected') input.collectedAt = invalid;
        if (field === 'result') input.resultAt = invalid;
        if (field === 'entry') input.history = [{ condition: 'room-temp', at: invalid }];
        assert.deepEqual(evaluateSpecimenStability(input), {
          status: 'expired', reasonCode: `${field}-timestamp-invalid`, segments: [],
        });
      });
    }
  }
}

for (const year of ['2000', '2024']) {
  test(`valid leap day in ${year} preserves the inclusive window boundary`, () => {
    const result = evaluateSpecimenStability(specimen(
      `${year}-02-29T23:00:00.000Z`, `${year}-03-01T01:00:00.000Z`,
    ));
    assert.equal(result.status, 'within-window');
    assert.equal(result.reasonCode, 'within-all-windows');
    assert.equal(result.segments[0].elapsedMs, 2 * HOUR);
  });
}

for (const [collectedAt, historyAt, resultAt] of [
  ['2024-03-01T00:30:00.000+05:30', '2024-02-29T19:00:00.000Z', '2024-03-01T02:30:00.000+05:30'],
  ['2024-02-29T23:30:00.000-08:00', '2024-03-01T07:30:00.000Z', '2024-03-01T01:30:00.000-08:00'],
  ['2024-02-29T00:30:00.000+0530', '2024-02-28T19:00:00.000Z', '2024-02-29T02:30:00.000+0530'],
  ['2024-02-29T23:30:00.000-0800', '2024-03-01T07:30:00.000Z', '2024-03-01T01:30:00.000-0800'],
]) {
  test(`offset calendar date ${collectedAt} is validated before UTC conversion`, () => {
    const input = specimen(collectedAt, resultAt);
    input.history = [{ condition: 'room-temp', at: historyAt }];
    const result = evaluateSpecimenStability(input);
    assert.equal(result.status, 'within-window');
    assert.equal(result.reasonCode, 'within-all-windows');
    assert.equal(result.segments[0].elapsedMs, 2 * HOUR);
    // Also validate the same explicit offset when supplied in history.
    input.history = [{ condition: 'room-temp', at: collectedAt }];
    assert.equal(evaluateSpecimenStability(input).status, 'within-window');
  });
}
