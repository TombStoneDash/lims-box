import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BlogPage from '../../app/blog/page';
import BlogPostPage from '../../app/blog/[slug]/page';

const fixtures = [
  { slug: 'reported-date', publishedAt: '2026-04-13', displayed: 'April 13, 2026' },
  { slug: 'month-boundary', publishedAt: '2026-06-01', displayed: 'June 1, 2026' },
  { slug: 'daylight-saving', publishedAt: '2026-03-08', displayed: 'March 8, 2026' },
];

// Tests run sequentially; restore both globals even when a rendering/assertion fails.
for (const timeZone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
  test(`blog pages preserve article calendar dates in ${timeZone}`, async (t) => {
    const originalTZ = process.env.TZ;
    const originalReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
    process.env.TZ = timeZone;
    // The repository's preserved JSX is compiled in classic mode by tsx.
    Object.defineProperty(globalThis, 'React', { value: React, configurable: true });
    try {
      const directory = path.join(process.cwd(), 'content', 'blog');
      t.mock.method(fs, 'existsSync', (input) => input === directory);
      t.mock.method(fs, 'readdirSync', (input) => {
        assert.equal(input, directory);
        return fixtures.map(({ slug }) => `${slug}.md`);
      });
      t.mock.method(fs, 'readFileSync', (input, encoding) => {
        assert.equal(encoding, 'utf-8');
        const fixture = fixtures.find(({ slug }) => input === path.join(directory, `${slug}.md`));
        assert.ok(fixture, `Unexpected article read: ${input}`);
        return `---\ntitle: ${fixture.slug}\nslug: ${fixture.slug}\npublishedAt: ${fixture.publishedAt}\n---\nOffline article fixture.`;
      });

      const index = renderToStaticMarkup(<BlogPage />);
      const cards = [...index.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)];
      assert.equal(cards.length, fixtures.length);
      for (const fixture of fixtures) {
        const card = cards.find(([, html]) => html.includes(`href="/blog/${fixture.slug}"`));
        assert.ok(card, `Missing index card for ${fixture.slug}`);
        assert.ok(card[1].includes(`<span>${fixture.displayed}</span>`),
          `Index must display ${fixture.publishedAt} as ${fixture.displayed} in ${timeZone}`);

        const article = renderToStaticMarkup(await BlogPostPage({
          params: Promise.resolve({ slug: fixture.slug }),
        }));
        const time = article.match(/<time dateTime="([^"]+)">([^<]+)<\/time>/);
        assert.ok(time, `Missing publication time for ${fixture.slug}`);
        assert.equal(time[1], fixture.publishedAt, 'Machine-readable article metadata is unchanged');
        assert.equal(time[2], fixture.displayed,
          `Article must display the calendar day from ${fixture.publishedAt} in ${timeZone}`);
      }
    } finally {
      if (originalTZ === undefined) delete process.env.TZ;
      else process.env.TZ = originalTZ;
      if (originalReact) Object.defineProperty(globalThis, 'React', originalReact);
      else Reflect.deleteProperty(globalThis, 'React');
    }
  });
}
