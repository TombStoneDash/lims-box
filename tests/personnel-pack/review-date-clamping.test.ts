import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { calcNextReviewDue, type ReviewType } from '../../lib/personnel-pack-utils';

const cases: readonly [ReviewType, string, string][] = [
  ['six_month', '2026-08-31T23:45:12.345Z', '2027-02-28T23:45:12.345Z'],
  ['initial', '2026-08-31T23:45:12.345Z', '2027-02-28T23:45:12.345Z'],
  ['six_month', '2027-08-31T23:45:12.345Z', '2028-02-29T23:45:12.345Z'],
  ['corrective_action', '2026-01-31T00:15:12.345Z', '2026-04-30T00:15:12.345Z'],
  ['annual', '2024-02-29T10:20:30.456Z', '2025-02-28T10:20:30.456Z'],
  ['initial', '2026-03-15T10:20:30.456Z', '2026-09-15T10:20:30.456Z'],
  ['six_month', '2026-10-15T10:20:30.456Z', '2027-04-15T10:20:30.456Z'],
  ['corrective_action', '2026-11-15T10:20:30.456Z', '2027-02-15T10:20:30.456Z'],
  ['annual', '2026-05-31T10:20:30.456Z', '2027-05-31T10:20:30.456Z'],
];

for (const [reviewType, input, expected] of cases) {
  test(`${reviewType} from ${input} produces ${expected}`, () => {
    const reviewedAt = new Date(input);
    const due = calcNextReviewDue(reviewType, reviewedAt);
    assert.equal(due?.toISOString(), expected);
    assert.notStrictEqual(due, reviewedAt);
    assert.equal(reviewedAt.toISOString(), input, 'input Date must remain unchanged');
  });
}

test('ad_hoc returns null and leaves the input unchanged', () => {
  const reviewedAt = new Date('2026-08-31T23:45:12.345Z');
  const original = reviewedAt.getTime();
  assert.equal(calcNextReviewDue('ad_hoc', reviewedAt), null);
  assert.equal(reviewedAt.getTime(), original);
});

test('review deadlines are independent of timezone and daylight saving time', () => {
  const modulePath = fileURLToPath(new URL('../../lib/personnel-pack-utils.ts', import.meta.url));
  const script = `
    const { calcNextReviewDue } = require(${JSON.stringify(modulePath)});
    const cases = ${JSON.stringify(cases)};
    process.stdout.write(JSON.stringify(cases.map(([type, input]) =>
      calcNextReviewDue(type, new Date(input)).toISOString()
    )));
  `;
  for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Kolkata']) {
    const output = execFileSync(process.execPath, ['--import', 'tsx', '--eval', script], {
      env: { ...process.env, TZ: tz },
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.deepEqual(JSON.parse(output), cases.map(([, , expected]) => expected), tz);
  }
});
