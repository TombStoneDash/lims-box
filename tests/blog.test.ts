import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { BlogPost } from '../lib/blog';

test('blog readers use isolated Markdown fixtures', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'lims-blog-test-'));
  const blogDir = path.join(root, 'content', 'blog');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(blogDir, { recursive: true });

  const body = '# Lab news\n\nA **small** update.';
  const full = `---
slug: "lab-news"
title: "Lab news: September"
description: "A fixture description"
author: "Alex Example"
authorRole: "Lab manager"
publishedAt: "2026-09-10"
updatedAt: "2026-09-12"
category: "Lab operations"
tags: ["quality", "water"]
image: "/images/lab.png"
readingTime: 2
featured: true
---
${body}`;
  writeFileSync(path.join(blogDir, 'a-full.md'), full);
  writeFileSync(path.join(blogDir, 'z-minimal.md'), `---
title: "Minimal post"
publishedAt: "2026-09-15"
---
Short body.`);
  writeFileSync(path.join(blogDir, 'ignored.txt'), full);

  // BLOG_DIR is captured at import time and the parsers are private. Load the
  // real module once against a temporary cwd, restoring cwd even if import fails.
  // Subtests run sequentially; node --test isolates this file in its own process.
  const originalCwd = process.cwd();
  let blog: typeof import('../lib/blog');
  try {
    process.chdir(root);
    blog = await import('../lib/blog');
  } finally {
    process.chdir(originalCwd);
  }

  await t.test('parses all frontmatter fields and renders the requested post', () => {
    const expected: BlogPost = {
      slug: 'lab-news', title: 'Lab news: September',
      description: 'A fixture description', author: 'Alex Example',
      authorRole: 'Lab manager', publishedAt: '2026-09-10',
      updatedAt: '2026-09-12', category: 'Lab operations',
      tags: ['quality', 'water'], image: '/images/lab.png',
      readingTime: 2, featured: true,
      content: '<h1>Lab news</h1>\n<p class="my-4 leading-relaxed">A <strong>small</strong> update.</p>',
    };
    assert.deepEqual(blog.getPostBySlug('lab-news'), expected);
    const { content, ...meta } = expected;
    assert.deepEqual(blog.getAllPosts().find(post => post.slug === 'lab-news'), meta);
    assert.equal(blog.getPostBySlug('a-full'), null);
  });

  await t.test('sorts newest first, lists slugs, and ignores non-Markdown files', () => {
    assert.deepEqual(blog.getAllSlugs(), ['z-minimal', 'lab-news']);
    assert.deepEqual(blog.getAllPosts().map(post => post.publishedAt), ['2026-09-15', '2026-09-10']);
    assert.equal(blog.getPostBySlug('missing'), null);
  });

  await t.test('missing optional fields are undefined and other fields get defaults', () => {
    const post = blog.getPostBySlug('z-minimal');
    assert.ok(post);
    assert.equal(post.authorRole, undefined);
    assert.equal(post.updatedAt, undefined);
    assert.equal(post.image, undefined);
    assert.equal(post.author, 'LIMS BOX Team');
    assert.equal(post.description, '');
    assert.equal(post.category, 'General');
    assert.deepEqual(post.tags, []);
    assert.equal(post.featured, false);
    assert.equal(post.readingTime, 5);
  });

  await t.test('readingTime uses metadata or 5, regardless of content length', () => {
    // There is no word-count calculation in the current implementation.
    const file = path.join(blogDir, 'a-full.md');
    try {
      for (const words of [10, 2000]) {
        writeFileSync(file, full.replace(body, 'word '.repeat(words)));
        assert.equal(blog.getPostBySlug('lab-news')?.readingTime, 2);
        assert.equal(blog.getAllPosts().find(post => post.slug === 'lab-news')?.readingTime, 2);
        writeFileSync(file, full.replace('readingTime: 2\n', '').replace(body, 'word '.repeat(words)));
        assert.equal(blog.getPostBySlug('lab-news')?.readingTime, 5);
        assert.equal(blog.getAllPosts().find(post => post.slug === 'lab-news')?.readingTime, 5);
      }
    } finally {
      writeFileSync(file, full);
    }
  });

  await t.test('unterminated frontmatter falls back without breaking the listing', () => {
    const file = path.join(blogDir, 'broken.md');
    writeFileSync(file, '---\ntitle: "Unterminated"\nNo closing delimiter.');
    try {
      const possibleDates = [new Date().toISOString().split('T')[0]];
      const posts = blog.getAllPosts();
      possibleDates.push(new Date().toISOString().split('T')[0]);
      assert.equal(posts.length, 3);
      const broken = posts.find(post => post.slug === 'broken');
      assert.ok(broken);
      assert.equal(broken.title, 'Untitled');
      assert.ok(possibleDates.includes(broken.publishedAt));
      assert.deepEqual(broken.tags, []);
      assert.equal(blog.getPostBySlug('lab-news')?.title, 'Lab news: September');
      assert.match(blog.getPostBySlug('broken')!.content, /No closing delimiter/);
    } finally {
      rmSync(file);
    }
  });

  await t.test('malformed array values are retained as strings without throwing', () => {
    const file = path.join(blogDir, 'broken.md');
    writeFileSync(file, '---\npublishedAt: "2026-09-01"\ntags: [invalid JSON]\nline without a colon\n---\nBody.');
    try {
      assert.equal(blog.getAllPosts().find(post => post.slug === 'broken')?.tags, '[invalid JSON]');
      assert.equal(blog.getPostBySlug('broken')?.tags, '[invalid JSON]');
      assert.equal(blog.getAllPosts().length, 3);
    } finally {
      rmSync(file);
    }
  });

  await t.test('a missing blog directory returns empty lists and null', () => {
    rmSync(blogDir, { recursive: true });
    assert.deepEqual(blog.getAllPosts(), []);
    assert.deepEqual(blog.getAllSlugs(), []);
    assert.equal(blog.getPostBySlug('lab-news'), null);
  });
});
