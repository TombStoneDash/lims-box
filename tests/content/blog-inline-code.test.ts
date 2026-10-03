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

const styledCode = (text: string) => `<code class="bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded text-sm">${text}</code>`;

test('preserves literal emphasis, links, angle brackets, and ampersands in inline code', (t) => {
  const html = render(t, 'Example: `**literal** *italic* ***both*** [Guide](/guide) <sample>&value &amp;`');
  assert.equal(html, `<p class="my-4 leading-relaxed">Example: ${styledCode('**literal** *italic* ***both*** [Guide](/guide) &lt;sample&gt;&amp;value &amp;amp;')}</p>`);
});

test('restores multiple snippets while preserving adjacent prose formatting and paragraphs', (t) => {
  const html = render(t, '`<first>` **bold** *italic* ***both*** [Guide](/guide) `&second`\n\nAfter `**third**`.');
  assert.equal(html, `<p class="my-4 leading-relaxed">${styledCode('&lt;first&gt;')} <strong>bold</strong> <em>italic</em> <strong><em>both</em></strong> <a href="/guide" class="text-lab-teal hover:text-lab-blue underline transition-colors">Guide</a> ${styledCode('&amp;second')}</p>\n<p class="my-4 leading-relaxed">After ${styledCode('**third**')}.</p>`);
});

test('preserves inline code within emphasis, link labels, headings, and lists', (t) => {
  const html = render(t, '# `**heading**`\n\n1. **`*literal*`**\n2. [`<label>`](/guide)\n- `&item` and *prose*');
  assert.ok(html.includes(`<h1>${styledCode('**heading**')}</h1>`));
  assert.ok(html.includes(`<li><strong>${styledCode('*literal*')}</strong></li>`));
  assert.ok(html.includes(`<li><a href="/guide" class="text-lab-teal hover:text-lab-blue underline transition-colors">${styledCode('&lt;label&gt;')}</a></li>`));
  assert.ok(html.includes(`<li>${styledCode('&amp;item')} and <em>prose</em></li>`));
  assert.equal((html.match(/<ol\b/g) || []).length, 1);
  assert.equal((html.match(/<ul\b/g) || []).length, 1);
});

test('does not replace placeholder-like source text or snippet contents', (t) => {
  const html = render(t, 'BLOG_INLINE_CODE0END BLOG_INLINE_CODE_0END `BLOG_INLINE_CODE__0END` `<BLOG_FENCED_CODE0>`');
  assert.equal(html, `<p class="my-4 leading-relaxed">BLOG_INLINE_CODE0END BLOG_INLINE_CODE_0END ${styledCode('BLOG_INLINE_CODE__0END')} ${styledCode('&lt;BLOG_FENCED_CODE0&gt;')}</p>`);
});

test('isolates fenced code from inline placeholders and prose transformations', (t) => {
  const code = '`**literal** [Guide](/guide) <sample>&value`\n\n1. not a list\nBLOG_INLINE_CODE0END';
  const html = render(t, 'Before `**outside**`.\n\n```text\n' + code + '\n```\n\n~~~text\n' + code + '\n~~~\n\nAfter `<outside>&`.');
  const blocks = [...html.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)];
  const expected = code.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') + '\n';
  assert.deepEqual(blocks.map(([, content]) => content), [expected, expected]);
  assert.ok(html.startsWith(`<p class="my-4 leading-relaxed">Before ${styledCode('**outside**')}.</p>`));
  assert.ok(html.endsWith(`<p class="my-4 leading-relaxed">After ${styledCode('&lt;outside&gt;&amp;')}.</p>`));
  assert.equal((html.match(/<code class=/g) || []).length, 2);
});
