import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { formatBlogDisplayDate } from '../../lib/blog-display-date';

test('publication calendar dates are stable across rendering time zones', () => {
  const originalTZ = process.env.TZ;
  const cases = [
    ['2026-04-13', 'April 13, 2026'],
    ['2026-01-01', 'January 1, 2026'],
    ['2024-02-29', 'February 29, 2024'],
  ];

  try {
    for (const timeZone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
      process.env.TZ = timeZone;
      for (const [input, expected] of cases) {
        assert.equal(formatBlogDisplayDate(input), expected, `${input} under ${timeZone}`);
      }
    }
  } finally {
    if (originalTZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTZ;
    }
  }
});

for (const page of ['app/blog/page.tsx', 'app/blog/[slug]/page.tsx']) {
  test(`${page} displays publication dates with the shared formatter`, () => {
    const source = readFileSync(page, 'utf8');
    assert.match(source, /import\s*\{\s*formatBlogDisplayDate\s*\}\s*from\s*'@\/lib\/blog-display-date'/);
    assert.match(source, /\{formatBlogDisplayDate\(post\.publishedAt\)\}/);
    assert.doesNotMatch(source, /toLocaleDateString|function formatDate\b/);
    if (page === 'app/blog/[slug]/page.tsx') {
      assert.match(source, /<time dateTime=\{post\.publishedAt\}>\{formatBlogDisplayDate\(post\.publishedAt\)\}<\/time>/);
    }
  });
}
