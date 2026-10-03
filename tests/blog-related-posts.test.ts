import assert from 'node:assert/strict';
import test from 'node:test';
import type { BlogPostMeta } from '../lib/blog';
import { getRelatedPosts } from '../lib/blog-related-posts';

function post(slug: string, overrides: Partial<BlogPostMeta> = {}): BlogPostMeta {
  return {
    slug,
    title: slug,
    description: 'A laboratory article',
    author: 'LIMS BOX Team',
    publishedAt: '2026-01-01',
    category: 'Quality',
    tags: ['lab', 'quality'],
    readingTime: 5,
    ...overrides,
  };
}

test('excludes the current post by slug, including a separate object', () => {
  const current = post('current');
  const other = post('other');
  assert.deepEqual(getRelatedPosts(current, [{ ...current }, other], 5), [other]);
});

test('ranks shared tags and category ahead of newer unrelated posts', () => {
  const current = post('current');
  const unrelated = post('unrelated', { category: 'News', tags: [], publishedAt: '2026-09-01' });
  const categoryOnly = post('category-only', { tags: [] });
  const sharedTags = post('shared-tags', { category: 'News' });
  const strongest = post('strongest', { publishedAt: '2025-01-01' });
  assert.deepEqual(
    getRelatedPosts(current, [unrelated, categoryOnly, sharedTags, strongest], 10),
    [strongest, sharedTags, categoryOnly, unrelated],
  );
});

test('breaks equal similarity scores by newest publication date', () => {
  const older = post('older');
  const newer = post('newer', { publishedAt: '2026-06-01' });
  assert.deepEqual(getRelatedPosts(post('current'), [older, newer], 2), [newer, older]);
});

test('counts repeated tags only once', () => {
  const duplicateTags = post('duplicates', { tags: ['lab', 'lab', 'lab'] });
  const distinctTags = post('distinct');
  assert.deepEqual(
    getRelatedPosts(post('current'), [duplicateTags, distinctTags], 2),
    [distinctTags, duplicateTags],
  );
});

test('respects the limit, including zero and negative limits', () => {
  const current = post('current');
  const others = [post('one'), post('two'), post('three')];
  assert.deepEqual(getRelatedPosts(current, others, 2), others.slice(0, 2));
  assert.deepEqual(getRelatedPosts(current, others, 0), []);
  assert.deepEqual(getRelatedPosts(current, others, -1), []);
});

test('returns no related posts for empty input or only the current post', () => {
  const current = post('current');
  assert.deepEqual(getRelatedPosts(current, [], 3), []);
  assert.deepEqual(getRelatedPosts(current, [current], 3), []);
});

test('does not mutate the input array or post metadata', () => {
  const current = post('current');
  const posts = [post('older'), post('newer', { publishedAt: '2026-06-01' }), current];
  const before = structuredClone(posts);
  getRelatedPosts(current, posts, 2);
  assert.deepEqual(posts, before);
});
