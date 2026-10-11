import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('string-like frontmatter values are not coerced away from strings', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'lims-blog-string-test-'));
  const blogDir = path.join(root, 'content', 'blog');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(blogDir, { recursive: true });

  const full = `---
slug: "2026"
title: "2026"
description: "true"
author: "007"
category: "1e3"
publishedAt: "2026-09-10"
readingTime: 7
featured: true
---
Body.`;
  writeFileSync(path.join(blogDir, 'numeric.md'), full);

  const originalCwd = process.cwd();
  let blog: typeof import('../lib/blog');
  try {
    process.chdir(root);
    blog = await import('../lib/blog');
  } finally {
    process.chdir(originalCwd);
  }

  await t.test('values that look numeric or boolean stay as strings unless the key is readingTime/featured', () => {
    const meta = blog.getAllPosts()[0];
    assert.ok(meta);
    assert.equal(meta.slug, '2026');
    assert.equal(typeof meta.slug, 'string');
    assert.equal(meta.title, '2026');
    assert.equal(meta.description, 'true');
    assert.equal(meta.author, '007');
    assert.equal(meta.category, '1e3');
    assert.equal(meta.readingTime, 7);
    assert.equal(meta.featured, true);
  });

  await t.test('getPostBySlug finds posts with numeric-looking slugs', () => {
    const post = blog.getPostBySlug('2026');
    assert.ok(post);
    assert.equal(post.slug, '2026');
    assert.equal(post.title, '2026');
    assert.equal(post.description, 'true');
    assert.equal(post.author, '007');
    assert.equal(post.category, '1e3');
    assert.equal(post.readingTime, 7);
    assert.equal(post.featured, true);
  });

  await t.test('getAllSlugs emits strings', () => {
    assert.deepEqual(blog.getAllSlugs(), ['2026']);
  });
});
