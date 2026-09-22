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
    return markdown;
  });
  const post = getPostBySlug(slug);
  assert.ok(post);
  return post.content;
}

test('renders all three actual CLIA screenshots with their sources, alt text, and captions', (t) => {
  const slug = 'clia-tracker-three-times-with-ai';
  const article = fs.readFileSync(path.join(process.cwd(), 'content', 'blog', `${slug}.md`), 'utf-8');
  const screenshots = [...article.matchAll(/!\[([^\]]+)\]\(([^)]+)\)\n\*([^\n]+)\*/g)];
  assert.equal(screenshots.length, 3);
  for (const [, , source] of screenshots) {
    assert.ok(fs.existsSync(path.join(process.cwd(), 'public', source)));
  }
  const html = render(t, article, slug);
  const images = html.match(/<img\b[^>]*>/g) || [];
  assert.equal(images.length, 3);
  screenshots.forEach(([, alt, source, caption], index) => {
    assert.ok(images[index].includes(`src="${source}" alt="${alt}"`));
    assert.match(images[index], /class="max-w-full h-auto"/);
    assert.ok(html.includes(`<em>${caption}</em>`));
  });
  assert.doesNotMatch(html, /!<a\b/);
  assert.match(html, /<p[^>]*>That quiet is the reason/);
  assert.match(html, /<a href="https:\/\/lims\.bot"[^>]*>lims\.bot<\/a>/);
});

test('escapes attribute values and preserves literal Markdown in image attributes', (t) => {
  const html = render(t, '![A "quoted" & <tag> \'label\' **bold** `code` [guide](/guide.png)');
  assert.match(html, /alt="A &quot;quoted&quot; &amp; &lt;tag&gt; &#39;label&#39; \*\*bold\*\* `code` \[guide"/);
  assert.doesNotMatch(html, /<(?:strong|code|a)\b/);
  assert.equal((html.match(/<img\b/g) || []).length, 1);
});

test('allows root paths and HTTP(S) sources while escaping source attributes', (t) => {
  const html = render(t, [
    '![Local](/images/a**b**`c`.png?x="quoted"&y=\'value\')',
    '![Remote](https://example.test/image.png?x=1&y=2)',
    '![HTTP](http://example.test/image.png)',
  ].join('\n\n'));
  assert.equal((html.match(/<img\b/g) || []).length, 3);
  assert.ok(html.includes('src="/images/a**b**`c`.png?x=&quot;quoted&quot;&amp;y=&#39;value&#39;"'));
  assert.ok(html.includes('src="https://example.test/image.png?x=1&amp;y=2"'));
  assert.ok(html.includes('src="http://example.test/image.png"'));
  assert.doesNotMatch(html, /<(?:strong|code|a)\b/);
});

test('unsafe and malformed sources become escaped alt text without image or link elements', (t) => {
  const sources = [
    'javascript:alert', 'JaVaScRiPt:alert', 'data:image/svg+xml,payload',
    'vbscript:alert', 'file:///tmp/image.png', '//example.test/image.png',
    '/\\example.test/image.png', 'https://', 'https://[invalid/image.png',
    'java\tscript:alert', '/image\u0000.png', '/image.png" onerror="alert', '',
  ];
  const html = render(t, sources.map(source => `![Blocked <tag> & "alt"](${source})`).join('\n\n'));
  assert.doesNotMatch(html, /<(?:img|a|tag)\b/);
  assert.equal((html.match(/Blocked &lt;tag&gt; &amp; &quot;alt&quot;/g) || []).length, sources.length);
});

test('preserves surrounding paragraphs, ordinary links, captions, and inline images', (t) => {
  const html = render(t, 'Before [guide](/guide).\n\n![Screenshot](/shot.png)\n*Caption.*\n\nAfter ![Inline](/inline.png) and [docs](https://example.test/docs).');
  assert.match(html, /^<p[^>]*>Before <a href="\/guide"[^>]*>guide<\/a>\.<\/p>/);
  assert.match(html, /<p[^>]*><img[^>]*><br \/><em>Caption\.<\/em><\/p>/);
  assert.match(html, /<p[^>]*>After <img[^>]*> and <a href="https:\/\/example\.test\/docs"[^>]*>docs<\/a>\.<\/p>$/);
});

test('keeps image Markdown literal inside backtick and tilde fenced code', (t) => {
  const code = '![A "quoted" <tag> & label](/image.png)\n\n![Unsafe](javascript:alert)';
  const html = render(t, `\`\`\`md\n${code}\n\`\`\`\n\n~~~md\n${code}\n~~~\n\n![Real](/real.png)`);
  const blocks = [...html.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)];
  assert.equal(blocks.length, 2);
  for (const [, block] of blocks) {
    assert.equal(block, code.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') + '\n');
  }
  assert.equal((html.match(/<img\b/g) || []).length, 1);
  assert.doesNotMatch(html, /BLOG_IMAGE|BLOG_FENCED_CODE/);
});
