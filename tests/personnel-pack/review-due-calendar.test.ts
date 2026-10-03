import assert from 'node:assert/strict';
import test from 'node:test';
import { calcNextReviewDue, type ReviewType } from '../../lib/personnel-pack-utils';

const cases: [string, ReviewType, string, string][] = [
  ['August 31 plus six months', 'six_month', '2025-08-31T12:00:00.000Z', '2026-02-28T12:00:00.000Z'],
  ['initial review also uses six months', 'initial', '2025-08-31T12:00:00.000Z', '2026-02-28T12:00:00.000Z'],
  ['November 30 into leap February', 'corrective_action', '2023-11-30T12:34:56.789Z', '2024-02-29T12:34:56.789Z'],
  ['November 30 into non-leap February', 'corrective_action', '2024-11-30T12:34:56.789Z', '2025-02-28T12:34:56.789Z'],
  ['leap-day annual anniversary', 'annual', '2024-02-29T12:34:56.789Z', '2025-02-28T12:34:56.789Z'],
  ['normal initial review', 'initial', '2025-01-15T12:34:56.789Z', '2025-07-15T12:34:56.789Z'],
  ['normal six-month review', 'six_month', '2025-03-15T12:34:56.789Z', '2025-09-15T12:34:56.789Z'],
  ['normal annual review', 'annual', '2025-04-15T12:34:56.789Z', '2026-04-15T12:34:56.789Z'],
  ['normal corrective review', 'corrective_action', '2025-01-15T12:34:56.789Z', '2025-04-15T12:34:56.789Z'],
  ['December year rollover', 'corrective_action', '2025-12-31T23:59:59.999Z', '2026-03-31T23:59:59.999Z'],
  ['UTC date differs from Los Angeles date', 'six_month', '2025-08-31T00:15:30.123Z', '2026-02-28T00:15:30.123Z'],
];

for (const [name, reviewType, input, expected] of cases) {
  test(name, () => {
    const reviewedAt = new Date(input);
    const originalTime = reviewedAt.getTime();
    const due = calcNextReviewDue(reviewType, reviewedAt);

    assert.ok(due instanceof Date);
    assert.equal(due.toISOString(), expected);
    assert.notStrictEqual(due, reviewedAt);
    assert.equal(reviewedAt.getTime(), originalTime, 'reviewedAt must not be mutated');
  });
}

test('ad_hoc returns null without mutating reviewedAt', () => {
  const reviewedAt = new Date('2024-02-29T12:34:56.789Z');
  const originalTime = reviewedAt.getTime();

  assert.equal(calcNextReviewDue('ad_hoc', reviewedAt), null);
  assert.equal(reviewedAt.getTime(), originalTime);
});
