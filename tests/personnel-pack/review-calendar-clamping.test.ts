import assert from 'node:assert/strict';
import test from 'node:test';
import { calcNextReviewDue, type ReviewType } from '../../lib/personnel-pack-utils';

function localFields(date: Date) {
  return [
    date.getFullYear(), date.getMonth(), date.getDate(),
    date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds(),
  ];
}

const cases: { label: string; type: ReviewType; start: [number, number, number]; end: [number, number, number] }[] = [
  { label: 'August 31 plus six months in a non-leap year', type: 'six_month', start: [2026, 7, 31], end: [2027, 1, 28] },
  { label: 'August 31 plus six months in a leap year', type: 'six_month', start: [2023, 7, 31], end: [2024, 1, 29] },
  { label: 'initial review also clamps after six months', type: 'initial', start: [2026, 7, 31], end: [2027, 1, 28] },
  { label: 'January 31 plus three months', type: 'corrective_action', start: [2026, 0, 31], end: [2026, 3, 30] },
  { label: 'February 29 plus one year', type: 'annual', start: [2024, 1, 29], end: [2025, 1, 28] },
  { label: 'ordinary initial review', type: 'initial', start: [2026, 3, 15], end: [2026, 9, 15] },
  { label: 'ordinary six-month review', type: 'six_month', start: [2026, 3, 15], end: [2026, 9, 15] },
  { label: 'ordinary annual review', type: 'annual', start: [2026, 3, 15], end: [2027, 3, 15] },
  { label: 'ordinary corrective review', type: 'corrective_action', start: [2026, 3, 15], end: [2026, 6, 15] },
];

for (const { label, type, start, end } of cases) {
  test(`${label} preserves local time and leaves the input unchanged`, () => {
    const reviewedAt = new Date(...start, 14, 23, 45, 678);
    const originalTimestamp = reviewedAt.getTime();
    const due = calcNextReviewDue(type, reviewedAt);

    assert.ok(due instanceof Date);
    assert.notStrictEqual(due, reviewedAt);
    assert.deepEqual(localFields(due), [...end, 14, 23, 45, 678]);
    assert.equal(reviewedAt.getTime(), originalTimestamp);
  });
}

test('ad_hoc returns null and leaves the input unchanged', () => {
  const reviewedAt = new Date(2026, 7, 31, 14, 23, 45, 678);
  const originalTimestamp = reviewedAt.getTime();
  assert.equal(calcNextReviewDue('ad_hoc', reviewedAt), null);
  assert.equal(reviewedAt.getTime(), originalTimestamp);
});
