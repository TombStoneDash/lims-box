import assert from 'node:assert/strict';
import test from 'node:test';

import { computeReadSchedule, isReadOverdue } from '../../lib/ohworks-micro-culture-incubation';

/**
 * All fabricated: synthetic specimen types and made-up plating timestamps.
 * None of this represents a real patient, specimen, or result.
 */
const PLATED_AT = '2026-01-01T08:00:00.000Z';

test('blood culture without extended incubation: reads at 24h/48h, final negative at 48h', () => {
  const result = computeReadSchedule({
    specimenType: 'blood',
    platedAt: PLATED_AT,
    requiresExtendedIncubation: false,
  });
  assert.deepEqual(result.reads, [
    { label: 'Day 1', dueAt: '2026-01-02T08:00:00.000Z' },
    { label: 'Day 2', dueAt: '2026-01-03T08:00:00.000Z' },
  ]);
  assert.equal(result.finalNegativeAt, '2026-01-03T08:00:00.000Z');
});

test('blood culture with extended incubation: adds Day 5 read, final negative at 5 days', () => {
  const result = computeReadSchedule({
    specimenType: 'blood',
    platedAt: PLATED_AT,
    requiresExtendedIncubation: true,
  });
  assert.deepEqual(result.reads, [
    { label: 'Day 1', dueAt: '2026-01-02T08:00:00.000Z' },
    { label: 'Day 2', dueAt: '2026-01-03T08:00:00.000Z' },
    { label: 'Day 5 extended', dueAt: '2026-01-06T08:00:00.000Z' },
  ]);
  assert.equal(result.finalNegativeAt, '2026-01-06T08:00:00.000Z');
});

test('urine culture: single 18h read, final negative equals that read, regardless of extended flag', () => {
  const withoutExtended = computeReadSchedule({
    specimenType: 'urine',
    platedAt: PLATED_AT,
    requiresExtendedIncubation: false,
  });
  const withExtended = computeReadSchedule({
    specimenType: 'urine',
    platedAt: PLATED_AT,
    requiresExtendedIncubation: true,
  });
  const expectedReads = [{ label: '18h read', dueAt: '2026-01-02T02:00:00.000Z' }];
  assert.deepEqual(withoutExtended.reads, expectedReads);
  assert.equal(withoutExtended.finalNegativeAt, '2026-01-02T02:00:00.000Z');
  assert.deepEqual(withExtended.reads, expectedReads);
  assert.equal(withExtended.finalNegativeAt, '2026-01-02T02:00:00.000Z');
});

test('wound culture without extended incubation: reads at 24h/48h, final negative at 48h', () => {
  const result = computeReadSchedule({
    specimenType: 'wound',
    platedAt: PLATED_AT,
    requiresExtendedIncubation: false,
  });
  assert.deepEqual(result.reads, [
    { label: 'Day 1', dueAt: '2026-01-02T08:00:00.000Z' },
    { label: 'Day 2', dueAt: '2026-01-03T08:00:00.000Z' },
  ]);
  assert.equal(result.finalNegativeAt, '2026-01-03T08:00:00.000Z');
});

test('wound culture with extended incubation: reads unchanged, final negative pushed to 72h', () => {
  const result = computeReadSchedule({
    specimenType: 'wound',
    platedAt: PLATED_AT,
    requiresExtendedIncubation: true,
  });
  assert.deepEqual(result.reads, [
    { label: 'Day 1', dueAt: '2026-01-02T08:00:00.000Z' },
    { label: 'Day 2', dueAt: '2026-01-03T08:00:00.000Z' },
  ]);
  assert.equal(result.finalNegativeAt, '2026-01-04T08:00:00.000Z');
});

test('respiratory culture without extended incubation: reads at 24h/48h, final negative at 48h', () => {
  const result = computeReadSchedule({
    specimenType: 'respiratory',
    platedAt: PLATED_AT,
    requiresExtendedIncubation: false,
  });
  assert.deepEqual(result.reads, [
    { label: 'Day 1', dueAt: '2026-01-02T08:00:00.000Z' },
    { label: 'Day 2', dueAt: '2026-01-03T08:00:00.000Z' },
  ]);
  assert.equal(result.finalNegativeAt, '2026-01-03T08:00:00.000Z');
});

test('respiratory culture with extended incubation: reads unchanged, final negative pushed to 72h', () => {
  const result = computeReadSchedule({
    specimenType: 'respiratory',
    platedAt: PLATED_AT,
    requiresExtendedIncubation: true,
  });
  assert.deepEqual(result.reads, [
    { label: 'Day 1', dueAt: '2026-01-02T08:00:00.000Z' },
    { label: 'Day 2', dueAt: '2026-01-03T08:00:00.000Z' },
  ]);
  assert.equal(result.finalNegativeAt, '2026-01-04T08:00:00.000Z');
});

test('stool culture: reads at 24h/48h/72h and final negative always at 72h, ignoring extended flag', () => {
  const withoutExtended = computeReadSchedule({
    specimenType: 'stool',
    platedAt: PLATED_AT,
    requiresExtendedIncubation: false,
  });
  const withExtended = computeReadSchedule({
    specimenType: 'stool',
    platedAt: PLATED_AT,
    requiresExtendedIncubation: true,
  });
  const expectedReads = [
    { label: 'Day 1', dueAt: '2026-01-02T08:00:00.000Z' },
    { label: 'Day 2', dueAt: '2026-01-03T08:00:00.000Z' },
    { label: 'Day 3', dueAt: '2026-01-04T08:00:00.000Z' },
  ];
  assert.deepEqual(withoutExtended.reads, expectedReads);
  assert.equal(withoutExtended.finalNegativeAt, '2026-01-04T08:00:00.000Z');
  assert.deepEqual(withExtended.reads, expectedReads);
  assert.equal(withExtended.finalNegativeAt, '2026-01-04T08:00:00.000Z');
});

test('isReadOverdue: exactly at the grace-period boundary is not overdue', () => {
  assert.equal(
    isReadOverdue({
      dueAt: '2026-01-02T08:00:00.000Z',
      now: '2026-01-02T14:00:00.000Z',
      gracePeriodHours: 6,
    }),
    false,
  );
});

test('isReadOverdue: just under the grace-period boundary is not overdue', () => {
  assert.equal(
    isReadOverdue({
      dueAt: '2026-01-02T08:00:00.000Z',
      now: '2026-01-02T13:59:59.999Z',
      gracePeriodHours: 6,
    }),
    false,
  );
});

test('isReadOverdue: just over the grace-period boundary is overdue', () => {
  assert.equal(
    isReadOverdue({
      dueAt: '2026-01-02T08:00:00.000Z',
      now: '2026-01-02T14:00:00.001Z',
      gracePeriodHours: 6,
    }),
    true,
  );
});
