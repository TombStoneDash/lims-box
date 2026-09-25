import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { getPostBySlug } from '../../lib/blog';

function render(t: TestContext, markdown: string, slug = 'fixture'): string {
  const directory = path.join(process.cwd(), 'content', 'blog');
  const filename = `${slug}.md`;
  t.mock.method(fs, 'existsSync', (input) => input === directory);
  t.mock.method(fs, 'readdirSync', (input) => {
    assert.equal(input, directory);
    return [filename];
  });
  t.mock.method(fs, 'readFileSync', (input, encoding) => {
    assert.equal(input, path.join(directory, filename));
    assert.equal(encoding, 'utf-8');
    return `---\ntitle: Synthetic fixture\nslug: ${slug}\n---\n${markdown}`;
  });
  const post = getPostBySlug(slug);
  assert.ok(post);
  return post.content;
}

function orderedItems(html: string): string[][] {
  return [...html.matchAll(/<ol\b[^>]*>([\s\S]*?)<\/ol>/g)].map(([, list]) =>
    [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(([, item]) => item));
}

test('renders the what-is-lims sample-management excerpt with decimal markers', (t) => {
  const html = render(t, `At its core, a LIMS does three things:

1. **Tracks samples** — from receipt through chain of custody, analysis, and final reporting
2. **Manages data** — captures results, enforces data integrity, and maintains audit trails
3. **Automates workflows** — assigns work, triggers QC checks, generates reports, and flags exceptions`, 'what-is-lims');
  assert.deepEqual(orderedItems(html), [[
    '<strong>Tracks samples</strong> — from receipt through chain of custody, analysis, and final reporting',
    '<strong>Manages data</strong> — captures results, enforces data integrity, and maintains audit trails',
    '<strong>Automates workflows</strong> — assigns work, triggers QC checks, generates reports, and flags exceptions',
  ]]);
  assert.match(html, /<ol class="[^"]*\blist-decimal\b[^"]*\bpl-6\b/);
  assert.doesNotMatch(html, /1\. <strong>Tracks samples/);
});

test('renders all seven reporting steps directly after their introductory paragraph', (t) => {
  const steps = [
    'Copy results from the analysis workbook',
    'Paste into the report template',
    'Manually add sample metadata, QC results, and regulatory limits',
    'Cross-check everything because copy-paste errors happen constantly',
    'Format for the client',
    'Save as PDF',
    'Repeat for every batch',
  ];
  const html = render(t, `The typical spreadsheet-based report workflow:\n${steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}\n\nAfterward.`, '5-signs-your-lab-has-outgrown-spreadsheets');
  assert.deepEqual(orderedItems(html), [steps]);
  assert.match(html, /workflow:<\/p>\s*<ol/);
  assert.match(html, /<\/ol>\s*<p[^>]*>Afterward\.<\/p>/);
});

test('keeps adjacent paragraphs outside lists and preserves inline formatting', (t) => {
  const html = render(t, 'Before.\n1. **Bold** and *italic*\n2. [Guide](/guide) and `sample`\nAfter.');
  assert.match(html, /^<p[^>]*>Before\.<\/p>\s*<ol/);
  assert.match(html, /<\/ol>\s*<p[^>]*>After\.<\/p>$/);
  const [items] = orderedItems(html);
  assert.equal(items.length, 2);
  assert.equal(items[0], '<strong>Bold</strong> and <em>italic</em>');
  assert.match(items[1], /<a href="\/guide"[^>]*>Guide<\/a> and <code[^>]*>sample<\/code>/);
});

test('blank lines, paragraphs, and headings separate ordered lists', (t) => {
  const html = render(t, '1. First\n2. Second\n\n1. Separate\n\nBetween.\n\n1. Third\n## Heading\n1. Fourth');
  assert.deepEqual(orderedItems(html), [['First', 'Second'], ['Separate'], ['Third'], ['Fourth']]);
  assert.match(html, /<p[^>]*>Between\.<\/p>/);
  assert.match(html, /<\/ol>\s*<h2>Heading<\/h2>\s*<ol/);
});

test('adjacent unordered and ordered lists remain separate', (t) => {
  const html = render(t, '- Before\n- Also before\n1. First\n2. Second\n- After\n1. Last');
  assert.deepEqual(orderedItems(html), [['First', 'Second'], ['Last']]);
  assert.equal((html.match(/<ul\b/g) || []).length, 2);
  assert.match(html, /<ul class="[^"]*list-disc[^\"]*">\s*<li>Before<\/li>\s*<li>Also before<\/li>\s*<\/ul>\s*<ol/);
  assert.match(html, /<\/ol>\s*<ul[^>]*>\s*<li>After<\/li>\s*<\/ul>\s*<ol/);
});

test('preserves fenced code literally including blank lines and markdown syntax', (t) => {
  const code = '1. **literal**\n2. <sample>&value\n\n- not a list\n# not a heading\n`literal`';
  const html = render(t, `Before.\n\`\`\`text\n${code}\n\`\`\`\n1. Real step\nAfter.`);
  assert.deepEqual(orderedItems(html), [['Real step']]);
  assert.match(html, /<\/p>\s*<pre\b/);
  const block = html.match(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/);
  assert.ok(block);
  assert.equal(block[1], code.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') + '\n');
  assert.doesNotMatch(block[1], /<(?:ol|ul|li|p|br|strong|h1)\b/);
});

test('only top-level numbered lines become ordered items', (t) => {
  const html = render(t, 'Version 1. stays text\n  1. Indented text\n1.no space\n\n10. Top level\n11. Next');
  assert.deepEqual(orderedItems(html), [['Top level', 'Next']]);
  assert.match(html, /Version 1\. stays text/);
});
