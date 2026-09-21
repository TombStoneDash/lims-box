import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BlogPage from '../../app/blog/page';
import BlogPostPage from '../../app/blog/[slug]/page';
import { RelatedPosts } from '../../components/blog/RelatedPosts';
import { getPostBySlug, type BlogPostMeta } from '../../lib/blog';

// The repository preserves JSX; tsx's classic transform needs React in scope
// for production components that rely on Next's automatic JSX runtime.
Object.assign(globalThis, { React });

async function renderDates() {
  const post = getPostBySlug('what-is-lims');
  assert.ok(post);
  assert.equal(post.publishedAt, '2026-04-13');
  const yearBoundary: BlogPostMeta = {
    ...post,
    slug: 'calendar-year-boundary',
    title: 'Calendar year boundary',
    publishedAt: '2026-01-01',
  };
  const listing = renderToStaticMarkup(<BlogPage />);
  const listingCard = listing.match(/<article\b[^>]*>(?:(?!<\/article>)[\s\S])*href="\/blog\/what-is-lims"(?:(?!<\/article>)[\s\S])*<\/article>/)?.[0];
  assert.ok(listingCard, 'the real article appears in the listing');
  const article = renderToStaticMarkup(await BlogPostPage({
    params: Promise.resolve({ slug: post.slug }),
  }));
  const related = renderToStaticMarkup(
    <RelatedPosts
      currentSlug="another-article"
      currentTags={post.tags}
      currentCategory={post.category}
      allPosts={[post, yearBoundary]}
    />,
  );
  // Match visible date spans, rather than metadata or article body text.
  const dates = (html: string) => [...html.matchAll(/<span>([A-Z][a-z]+ \d{1,2}, \d{4})<\/span>/g)]
    .map((match) => match[1]);
  process.stdout.write(JSON.stringify({
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    listing: dates(listingCard),
    article: article.match(/<time dateTime="2026-04-13">([^<]+)<\/time>/)?.[1],
    related: dates(related),
  }));
}

if (process.env.BLOG_CALENDAR_DATES_CHILD === '1') {
  renderDates().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  for (const timezone of ['UTC', 'America/Los_Angeles']) {
    test(`blog calendar dates retain their day and display styles in ${timezone}`, () => {
      const child = spawnSync(process.execPath, [
        '--import', 'tsx', fileURLToPath(import.meta.url),
      ], {
        env: { ...process.env, TZ: timezone, BLOG_CALENDAR_DATES_CHILD: '1' },
        encoding: 'utf8',
        timeout: 30_000,
      });
      assert.ifError(child.error);
      assert.equal(child.status, 0, child.stderr);
      assert.deepEqual(JSON.parse(child.stdout), {
        timezone,
        listing: ['April 13, 2026'],
        article: 'April 13, 2026',
        related: ['Apr 13, 2026', 'Jan 1, 2026'],
      });
    });
  }
}
