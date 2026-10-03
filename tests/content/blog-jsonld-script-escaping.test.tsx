import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BlogPostPage from '../../app/blog/[slug]/page';

const fixtures = [
  {
    slug: 'script-escaping',
    title: 'Lab </script><div>metadata-breakout</div> & "quality" < checks',
    description: 'Results </ScRiPt><div>description-breakout</div> & "accuracy" < limits',
  },
  {
    slug: 'ordinary-metadata',
    title: 'Laboratory quality checks',
    description: 'Reliable results for small laboratories.',
  },
];

for (const fixture of fixtures) {
  test(`blog JSON-LD safely round-trips ${fixture.slug}`, async (t) => {
    const originalReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
    // The repository's preserved JSX is compiled in classic mode by tsx.
    Object.defineProperty(globalThis, 'React', { value: React, configurable: true });
    try {
      const metadata = {
        ...fixture,
        author: 'Avery & "Team"',
        authorRole: 'Lab manager',
        publishedAt: '2026-04-13',
        updatedAt: '2026-04-14',
        category: 'Quality',
        tags: ['LIMS', 'Quality & "checks"'],
      };
      const directory = path.join(process.cwd(), 'content', 'blog');
      t.mock.method(fs, 'existsSync', (input) => input === directory);
      t.mock.method(fs, 'readdirSync', (input) => {
        assert.equal(input, directory);
        return [`${fixture.slug}.md`];
      });
      t.mock.method(fs, 'readFileSync', (input, encoding) => {
        assert.equal(input, path.join(directory, `${fixture.slug}.md`));
        assert.equal(encoding, 'utf-8');
        const frontmatter = Object.entries(metadata).map(([key, value]) =>
          `${key}: ${Array.isArray(value) ? JSON.stringify(value) : value}`
        ).join('\n');
        return `---\n${frontmatter}\n---\nOffline article fixture.`;
      });

      const html = renderToStaticMarkup(await BlogPostPage({
        params: Promise.resolve({ slug: fixture.slug }),
      }));
      const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
      assert.equal(blocks.length, 2, 'Exactly two intended JSON-LD blocks');
      assert.equal((html.match(/<script\b/gi) || []).length, 2);
      assert.equal((html.match(/<\/script\s*>/gi) || []).length, 2);
      assert.doesNotMatch(html, /<div>(?:metadata|description)-breakout<\/div>/i);
      for (const [, payload] of blocks) {
        assert.doesNotMatch(payload, /</, 'Every less-than character must be escaped');
      }
      if (fixture.title.includes('<')) {
        for (const [, payload] of blocks) assert.ok(payload.includes('\\u003c'));
        assert.ok(html.includes('&lt;/script&gt;&lt;div&gt;metadata-breakout&lt;/div&gt;'),
          'Ordinary React text rendering still escapes the title');
      }

      const [article, breadcrumb] = blocks.map(([, payload]) => JSON.parse(payload));
      assert.equal(article['@type'], 'BlogPosting');
      assert.equal(article.headline, metadata.title);
      assert.equal(article.description, metadata.description);
      assert.deepEqual(article.author, {
        '@type': 'Person', name: metadata.author, jobTitle: metadata.authorRole,
      });
      assert.equal(article.datePublished, metadata.publishedAt);
      assert.equal(article.dateModified, metadata.updatedAt);
      assert.equal(article.keywords, metadata.tags.join(', '));
      assert.equal(article.articleSection, metadata.category);
      assert.equal(article.mainEntityOfPage['@id'], `https://lims.bot/blog/${fixture.slug}`);
      assert.equal(breadcrumb['@type'], 'BreadcrumbList');
      assert.deepEqual(breadcrumb.itemListElement, [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://lims.bot' },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://lims.bot/blog' },
        { '@type': 'ListItem', position: 3, name: metadata.title, item: `https://lims.bot/blog/${fixture.slug}` },
      ]);
    } finally {
      if (originalReact) Object.defineProperty(globalThis, 'React', originalReact);
      else Reflect.deleteProperty(globalThis, 'React');
    }
  });
}
