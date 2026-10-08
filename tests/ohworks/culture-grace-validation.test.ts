import assert from 'node:assert/strict';
import test from 'node:test';

import { isReadOverdue } from '../../lib/ohworks-micro-culture-incubation';

// Fabricated timestamps only; no real specimens or ambient clock.
const DUE_AT = '2026-01-01T00:00:00.000Z';
const LATER = '2026-01-10T00:00:00.000Z';

for (const gracePeriodHours of [NaN, Infinity, -Infinity, -1, -0.5]) {
  test(`rejects invalid gracePeriodHours: ${gracePeriodHours}`, () => {
    assert.throws(
      () => isReadOverdue({ dueAt: DUE_AT, now: LATER, gracePeriodHours }),
      { name: 'RangeError', message: 'gracePeriodHours must be a finite non-negative number' },
    );
  });
}

test('rejects finite grace hours whose conversion to milliseconds overflows', () => {
  assert.throws(
    () => isReadOverdue({ dueAt: DUE_AT, now: LATER, gracePeriodHours: Number.MAX_VALUE }),
    { name: 'RangeError', message: 'gracePeriodHours must convert to a finite number of milliseconds' },
  );
});

for (const { gracePeriodHours, before, boundary, after } of [
  {
    gracePeriodHours: 0,
    before: '2025-12-31T23:59:59.999Z',
    boundary: DUE_AT,
    after: '2026-01-01T00:00:00.001Z',
  },
  {
    gracePeriodHours: 0.5,
    before: '2026-01-01T00:29:59.999Z',
    boundary: '2026-01-01T00:30:00.000Z',
    after: '2026-01-01T00:30:00.001Z',
  },
  {
    gracePeriodHours: 6,
    before: '2026-01-01T05:59:59.999Z',
    boundary: '2026-01-01T06:00:00.000Z',
    after: '2026-01-01T06:00:00.001Z',
  },
]) {
  test(`preserves strict overdue boundary with ${gracePeriodHours} hours of grace`, () => {
    for (const [now, expected] of [[before, false], [boundary, false], [after, true]] as const) {
      assert.equal(isReadOverdue({ dueAt: DUE_AT, now, gracePeriodHours }), expected, now);
    }
  });
}
