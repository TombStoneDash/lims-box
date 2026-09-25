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

const paragraph = (content: string) => `<p class="my-4 leading-relaxed">${content}</p>`;

test('wraps the published Lesson from V1 excerpt with normal paragraph spacing', (t) => {
  const html = render(t, `**Lesson from V1:** the bottleneck isn't data entry. It's *traceability*. You need to answer "who changed this and when" without calling a meeting.`);
  assert.equal(html, paragraph(`<strong>Lesson from V1:</strong> the bottleneck isn't data entry. It's <em>traceability</em>. You need to answer "who changed this and when" without calling a meeting.`));
});

for (const [markdown, expected] of [
  ['Plain prose', 'Plain prose'],
  ['**Bold** prose', '<strong>Bold</strong> prose'],
  ['*Italic* prose', '<em>Italic</em> prose'],
  ['***Both*** prose', '<strong><em>Both</em></strong> prose'],
  ['[Guide](/guide?a=1&b=2) prose', '<a href="/guide?a=1&amp;b=2" class="text-lab-teal hover:text-lab-blue underline transition-colors">Guide</a> prose'],
]) {
  test(`wraps ${markdown} and preserves multiline paragraph handling`, (t) => {
    const html = render(t, `${markdown}\nSecond line.\n\nNext paragraph.`);
    assert.equal(html, `${paragraph(`${expected}<br />Second line.`)}\n${paragraph('Next paragraph.')}`);
  });
}

test('keeps headings, lists, blockquotes, and horizontal rules outside paragraphs', (t) => {
  const html = render(t, '# **One**\n\n## Two\n\n### Three\n\n- **First**\n- Second\n\n1. *First*\n2. Second\n\n> **Quoted**\n\n---');
  assert.doesNotMatch(html, /<p\b|<br \/>/);
  assert.match(html, /<h1><strong>One<\/strong><\/h1>/);
  assert.match(html, /<h2>Two<\/h2>/);
  assert.match(html, /<h3>Three<\/h3>/);
  assert.match(html, /<ul[^>]*><li><strong>First<\/strong><\/li>\n<li>Second<\/li><\/ul>/);
  assert.match(html, /<ol[^>]*><li><em>First<\/em><\/li>\n<li>Second<\/li><\/ol>/);
  assert.match(html, /<blockquote[^>]*><strong>Quoted<\/strong><\/blockquote>/);
  assert.match(html, /<hr class="my-8 border-t border-black\/10 dark:border-white\/10" \/>/);
});

test('preserves fenced code, images, and inline placeholder restoration', (t) => {
  const html = render(t, '**Before** `code` BLOG_FENCED_CODE0\n\n```text\n**literal** <sample>&\n\nnext line\n```\n\n![Image](/image.png)\n*Caption*');
  assert.ok(html.startsWith(paragraph('<strong>Before</strong> <code class="bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded text-sm">code</code> BLOG_FENCED_CODE0')));
  assert.match(html, /<pre[^>]*><code>\*\*literal\*\* &lt;sample&gt;&amp;\n\nnext line\n<\/code><\/pre>/);
  assert.doesNotMatch(html, /<p[^>]*><pre/);
  assert.ok(html.endsWith(paragraph('<img src="/image.png" alt="Image" class="max-w-full h-auto" /><br /><em>Caption</em>')));
  assert.doesNotMatch(html, /<BLOG_FENCED_CODE|BLOG_INLINE_CODE|BLOG_IMAGE/);
});
