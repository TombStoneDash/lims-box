import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BlogPostPage from '../../app/blog/[slug]/page';
import { getPostBySlug } from '../../lib/blog';

test('article publication date matches frontmatter in every server timezone', async (t) => {
  const previousTZ = process.env.TZ;
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
  // Plain tsx uses the classic JSX runtime for the page and its components.
  Object.defineProperty(globalThis, 'React', { value: React, configurable: true });

  try {
    const slug = 'what-is-lims';
    assert.equal(getPostBySlug(slug)?.publishedAt, '2026-04-13');

    for (const timeZone of ['UTC', 'America/Los_Angeles']) {
      await t.test(timeZone, async () => {
        process.env.TZ = timeZone;
        const page = await BlogPostPage({ params: Promise.resolve({ slug }) });
        const markup = renderToStaticMarkup(page);
        const times = markup.match(/<time\b[^>]*>[^<]*<\/time>/g) ?? [];
        assert.deepEqual(times, [
          '<time dateTime="2026-04-13">April 13, 2026</time>',
        ]);
      });
    }
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
    if (previousReact) Object.defineProperty(globalThis, 'React', previousReact);
    else Reflect.deleteProperty(globalThis, 'React');
  }
});
