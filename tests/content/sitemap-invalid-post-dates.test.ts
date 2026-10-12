import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('sitemap() tolerates posts with unparseable dates', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'lims-sitemap-dates-test-'));
  const blogDir = path.join(root, 'content', 'blog');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(blogDir, { recursive: true });

  writeFileSync(path.join(blogDir, 'post-1.md'), `---
title: "Post one"
publishedAt: "2026-01-02"
updatedAt: "not-a-date"
---
Body one.`);
  writeFileSync(path.join(blogDir, 'post-2.md'), `---
title: "Post two"
publishedAt: "garbage"
---
Body two.`);
  writeFileSync(path.join(blogDir, 'post-3.md'), `---
title: "Post three"
publishedAt: "2026-02-03"
updatedAt: ""
---
Body three.`);

  const originalCwd = process.cwd();
  let sitemap: typeof import('../../app/sitemap').default;
  try {
    process.chdir(root);
    sitemap = (await import('../../app/sitemap')).default;
  } finally {
    process.chdir(originalCwd);
  }

  const entries = sitemap();
  const blogEntries = entries.filter((entry) => entry.url.includes('/blog/'));
  assert.equal(blogEntries.length, 3);

  for (const entry of blogEntries) {
    assert.ok(entry.lastModified instanceof Date);
    assert.ok(!Number.isNaN((entry.lastModified as Date).getTime()), `expected a valid Date for ${entry.url}`);
  }

  const post1 = blogEntries.find((entry) => entry.url.endsWith('/post-1'));
  const post3 = blogEntries.find((entry) => entry.url.endsWith('/post-3'));
  assert.ok(post1);
  assert.ok(post3);
  assert.equal((post1!.lastModified as Date).toISOString(), '2026-01-02T00:00:00.000Z');
  assert.equal((post3!.lastModified as Date).toISOString(), '2026-02-03T00:00:00.000Z');
});
