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

test('renders all three existing CLIA screenshots inline with responsive sizing', (t) => {
  const article = fs.readFileSync(path.join(process.cwd(), 'content/blog/clia-tracker-three-times-with-ai.md'), 'utf-8');
  const screenshots = [...article.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
  assert.equal(screenshots.length, 3);
  for (const [, , url] of screenshots) {
    assert.ok(fs.existsSync(path.join(process.cwd(), 'public', url)));
  }
  const html = render(t, article.replace(/^---[\s\S]*?---\s*/, ''));
  const images = html.match(/<img\b[^>]*>/g) || [];
  assert.equal(images.length, 3);
  screenshots.forEach(([, alt, url], index) => {
    assert.ok(images[index].includes(`src="${url}"`));
    assert.ok(images[index].includes(`alt="${alt}"`));
    assert.match(images[index], /class="[^"]*\bmax-w-full\b[^"]*\bh-auto\b/);
  });
  assert.doesNotMatch(html, /!<a\b/);
});

test('escapes image attributes and preserves literal Markdown in alt text', (t) => {
  const html = render(t, '![A "quoted" & <sample> **literal** `code`](/blog-images/example.png?label="x"&size=2)');
  assert.match(html, /alt="A &quot;quoted&quot; &amp; &lt;sample&gt; \*\*literal\*\* `code`"/);
  assert.match(html, /src="\/blog-images\/example.png\?label=&quot;x&quot;&amp;size=2"/);
  assert.doesNotMatch(html, /<strong>|<sample>/);
});

test('keeps adjacent links, paragraphs, captions, and ordered lists working', (t) => {
  const html = render(t, 'Before [Guide](/guide) ![Screenshot](/blog-images/example.png) [Next](/next).\n\n![Second](/blog-images/second.png)\n*Caption*\n\n1. ![Step](/blog-images/step.png)\n2. **Done**\n\nAfter.');
  assert.match(html, /^<p[^>]*>Before <a href="\/guide"[^>]*>Guide<\/a> <img[^>]*> <a href="\/next"[^>]*>Next<\/a>\.<\/p>/);
  assert.match(html, /<p[^>]*><img[^>]*><br \/><em>Caption<\/em><\/p>/);
  assert.match(html, /<ol[^>]*><li><img[^>]*><\/li>\s*<li><strong>Done<\/strong><\/li><\/ol>/);
  assert.match(html, /<p[^>]*>After\.<\/p>$/);
});

test('keeps image syntax literal inside fenced and inline code', (t) => {
  const code = '![A "quote" & <sample>](/blog-images/example.png)\n\n[Guide](/guide)';
  const html = render(t, '```markdown\n' + code + '\n```\n\n~~~markdown\n' + code + '\n~~~\n\n`![Inline](/inline.png)`\n\n![Real](/real.png)');
  const blocks = [...html.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)];
  const escaped = code.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') + '\n';
  assert.deepEqual(blocks.map(([, content]) => content), [escaped, escaped]);
  assert.match(html, /<code[^>]*>!\[Inline\]\(\/inline.png\)<\/code>/);
  assert.equal((html.match(/<img\b/g) || []).length, 1);
});

test('preserves placeholder-like source text and empty alt text', (t) => {
  const html = render(t, 'BLOG_IMAGE0END BLOG_IMAGE_0END ![](/empty.png)');
  assert.match(html, /BLOG_IMAGE0END BLOG_IMAGE_0END <img[^>]*alt=""/);
});
