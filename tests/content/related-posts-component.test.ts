import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BlogPostMeta } from '../../lib/blog';
import { getRelatedPosts } from '../../lib/blog-related-posts';
import { RelatedPosts } from '../../components/blog/RelatedPosts';

// tsx compiles this repository's preserved JSX in classic mode.
Object.assign(globalThis, { React });

function post(slug: string, overrides: Partial<BlogPostMeta> = {}): BlogPostMeta {
  return {
    slug,
    title: `Title for ${slug}`,
    description: `Description for ${slug}`,
    author: 'LIMS BOX Team',
    publishedAt: '2026-01-01',
    category: 'Quality',
    tags: ['lab', 'quality'],
    readingTime: 5,
    ...overrides,
  };
}

const current = post('current', { tags: ['lab', 'quality'], category: 'Quality' });

function extractHrefs(markup: string): string[] {
  return [...markup.matchAll(/href="\/blog\/([^"]+)"/g)].map((m) => m[1]);
}

const dateFixture = [
  post('month-boundary', { publishedAt: '2026-06-01', tags: ['lab'] }),
  post('daylight-saving', { publishedAt: '2026-03-08', tags: ['quality'] }),
];

for (const timeZone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
  test(`related post dates render as calendar dates in ${timeZone}`, () => {
    const originalTZ = process.env.TZ;
    process.env.TZ = timeZone;
    try {
      const markup = renderToStaticMarkup(RelatedPosts({
        currentSlug: current.slug,
        currentTags: current.tags,
        currentCategory: current.category,
        allPosts: [current, ...dateFixture],
      }));

      assert.ok(markup.includes('Jun 1, 2026'), `expected Jun 1, 2026 to render in ${timeZone}`);
      assert.ok(!markup.includes('May 31'), `must never render May 31 in ${timeZone}`);
      assert.ok(markup.includes('Mar 8, 2026'), `expected Mar 8, 2026 to render in ${timeZone}`);
    } finally {
      if (originalTZ === undefined) delete process.env.TZ;
      else process.env.TZ = originalTZ;
    }
  });
}

test('card order matches getRelatedPosts, and repeated tags do not outrank distinct shared tags', () => {
  const duplicateTags = post('duplicate-tags', { tags: ['lab', 'lab', 'lab'], category: 'News' });
  const distinctTags = post('distinct-tags', { tags: ['lab', 'quality'], category: 'News' });
  const categoryOnly = post('category-only', { tags: [], category: 'Quality', publishedAt: '2025-01-01' });
  const unrelated = post('unrelated', { tags: [], category: 'News', publishedAt: '2026-09-01' });

  const fixture = [current, duplicateTags, distinctTags, categoryOnly, unrelated];
  const expectedOrder = getRelatedPosts(current, fixture, 3).map((p) => p.slug);

  const markup = renderToStaticMarkup(RelatedPosts({
    currentSlug: current.slug,
    currentTags: current.tags,
    currentCategory: current.category,
    allPosts: fixture,
    maxPosts: 3,
  }));

  assert.deepEqual(extractHrefs(markup), expectedOrder);
  assert.ok(
    expectedOrder.indexOf('distinct-tags') < expectedOrder.indexOf('duplicate-tags'),
    'a post with two distinct shared tags must outrank a post that repeats one shared tag three times',
  );
});

test('rendering is independent of the wall clock', () => {
  const fixture = [current, post('a', { publishedAt: '2026-01-15' }), post('b', { publishedAt: '2020-01-01' })];
  const props = {
    currentSlug: current.slug,
    currentTags: current.tags,
    currentCategory: current.category,
    allPosts: fixture,
  };

  const first = renderToStaticMarkup(RelatedPosts(props));

  const originalNow = Date.now;
  Date.now = () => Date.parse('2030-01-01');
  try {
    const second = renderToStaticMarkup(RelatedPosts(props));
    assert.equal(second, first);
  } finally {
    Date.now = originalNow;
  }
});

test('the component source no longer reads the clock and imports the shared ranker', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'components', 'blog', 'RelatedPosts.tsx'),
    'utf8',
  );
  assert.doesNotMatch(source, /Date\.now/);
  assert.match(source, /from '@\/lib\/blog-related-posts'/);
});

test('excludes the current post, respects maxPosts, and renders nothing when only the current post is given', () => {
  const others = [post('one'), post('two'), post('three')];
  const fixtureWithCurrent = [current, ...others];

  const markup = renderToStaticMarkup(RelatedPosts({
    currentSlug: current.slug,
    currentTags: current.tags,
    currentCategory: current.category,
    allPosts: fixtureWithCurrent,
    maxPosts: 2,
  }));
  const hrefs = extractHrefs(markup);
  assert.equal(hrefs.length, 2);
  assert.ok(!hrefs.includes(current.slug));

  const empty = RelatedPosts({
    currentSlug: current.slug,
    currentTags: current.tags,
    currentCategory: current.category,
    allPosts: [current],
  });
  assert.equal(renderToStaticMarkup(empty as unknown as React.ReactElement), '');
});

test('renders machine-readable time elements and an accessible section name', () => {
  const markup = renderToStaticMarkup(RelatedPosts({
    currentSlug: current.slug,
    currentTags: current.tags,
    currentCategory: current.category,
    allPosts: [current, ...dateFixture],
  }));

  assert.match(markup, /<time dateTime="2026-06-01">/);
  assert.match(markup, /aria-labelledby="related-posts-heading"/);
  assert.match(markup, /id="related-posts-heading"/);
});
