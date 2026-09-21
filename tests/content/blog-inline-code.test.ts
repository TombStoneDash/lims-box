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

test('keeps emphasis and link-looking syntax literal inside inline code', (t) => {
  const html = render(t, '`**bold** *italic* ***both***` and `[Guide](/guide)`');
  const spans = [...html.matchAll(/<code[^>]*>([\s\S]*?)<\/code>/g)].map(([, code]) => code);
  assert.deepEqual(spans, ['**bold** *italic* ***both***', '[Guide](/guide)']);
  assert.doesNotMatch(html, /<(?:strong|em|a)\b/);
});

test('escapes angle brackets and ampersands without interpreting entities', (t) => {
  const html = render(t, 'Use `<sample>&value</sample> &amp;` here.');
  assert.match(html, /<code[^>]*>&lt;sample&gt;&amp;value&lt;\/sample&gt; &amp;amp;<\/code>/);
  assert.doesNotMatch(html, /<sample>/);
});

test('preserves prose formatting and ordered items around inline code', (t) => {
  const html = render(t, 'Before **bold** and *italic*, `[literal](/literal)` then [Guide](/guide).\n\n1. Use `**literal**` with **care**\n2. Read `<sample>` afterward.');
  assert.match(html, /^<p[^>]*>Before <strong>bold<\/strong> and <em>italic<\/em>, <code[^>]*>\[literal\]\(\/literal\)<\/code> then <a href="\/guide"[^>]*>Guide<\/a>\.<\/p>/);
  assert.match(html, /<ol[^>]*><li>Use <code[^>]*>\*\*literal\*\*<\/code> with <strong>care<\/strong><\/li>\n<li>Read <code[^>]*>&lt;sample&gt;<\/code> afterward\.<\/li><\/ol>/);
});

test('protects block-looking lines and blank lines within inline spans', (t) => {
  const code = 'first\n# heading\n1. item\n- item\n> quote\n---\n\nlast';
  const html = render(t, `Before \`${code}\` after.`);
  assert.match(html, /^<p[^>]*>Before <code[^>]*>/);
  assert.equal(html.match(/<code[^>]*>([\s\S]*?)<\/code>/)?.[1], code.replaceAll('>', '&gt;'));
  assert.match(html, /<\/code> after\.<\/p>$/);
  assert.doesNotMatch(html, /<(?:h1|ol|ul|blockquote|hr|br)\b/);
});

test('keeps fenced code opaque when inline code is also present', (t) => {
  const code = '`**bold**` [Guide](/guide) <sample>&value\n\n1. literal';
  const html = render(t, `Before \`<inline>\`.\n\n\`\`\`text\n${code}\n\`\`\`\n\nAfter \`*literal*\`.`);
  assert.equal(html.match(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/)?.[1], code.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') + '\n');
  assert.match(html, /Before <code[^>]*>&lt;inline&gt;<\/code>/);
  assert.match(html, /After <code[^>]*>\*literal\*<\/code>/);
  assert.equal((html.match(/<code\b/g) || []).length, 3);
});
