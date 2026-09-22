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

const link = (href: string, label: string, title?: string) => `<a href="${href}"${title === undefined ? '' : ` title="${title}"`} class="text-lab-teal hover:text-lab-blue underline transition-colors">${label}</a>`;

test('keeps plain destinations and separates double- and single-quoted titles', (t) => {
  const html = render(t, `[Plain](/plain) [Guide](https://example.com/guide "Lab guide") [Next](/next 'Next guide') [Empty](/empty "")`);
  assert.equal(html, [link('/plain', 'Plain'), link('https://example.com/guide', 'Guide', 'Lab guide'), link('/next', 'Next', 'Next guide'), link('/empty', 'Empty', '')].join(' '));
});

test('escapes destination and title attributes, including ampersands and escaped quotes', (t) => {
  const html = render(t, String.raw`[Guide](/guide?q=\"lab\"&tag=<sample> "Lab \"guide\" & <sample>") [Next](/next?team=lab&n=2 'Lab\'s "guide" & <next>')`);
  assert.equal(html, link('/guide?q=&quot;lab&quot;&amp;tag=&lt;sample&gt;', 'Guide', 'Lab &quot;guide&quot; &amp; &lt;sample&gt;') + ' ' + link('/next?team=lab&amp;n=2', 'Next', 'Lab\'s &quot;guide&quot; &amp; &lt;next&gt;'));
});

test('protects Markdown in attributes while formatting link labels and adjacent images', (t) => {
  const html = render(t, 'Before [**Bold** *italic* ***both*** `[code]`](/**path**?q=*term*&n=2 "**literal** *title* `code` (lab)") ![Image](/image.png).');
  const label = '<strong>Bold</strong> <em>italic</em> <strong><em>both</em></strong> <code class="bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded text-sm">[code]</code>';
  assert.equal(html, `<p class="my-4 leading-relaxed">Before ${link('/**path**?q=*term*&amp;n=2', label, '**literal** *title* `code` (lab)')} <img src="/image.png" alt="Image" class="max-w-full h-auto" />.</p>`);
});

test('keeps titled links literal inside inline and fenced code', (t) => {
  const code = String.raw`[Guide](/guide?a=1&b=2 "Lab \"guide\"") [Next](/next 'Next guide')`;
  const html = render(t, '`' + code + '`\n\n```markdown\n' + code + '\n```\n\n[Real](/real "Real guide")');
  const escaped = code.replaceAll('&', '&amp;');
  assert.ok(html.includes(`<code class="bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded text-sm">${escaped}</code>`));
  assert.ok(html.includes(`<code>${escaped}\n</code></pre>`));
  assert.equal((html.match(/<a\b/g) || []).length, 1);
  assert.ok(html.endsWith(link('/real', 'Real', 'Real guide')));
});

test('preserves placeholder-like text and links within headings and lists', (t) => {
  const html = render(t, 'BLOG_LINK0 BLOG_LINK_0\n\n# [Heading](/heading "Heading guide")\n\n1. [Step](/step \'Step guide\')');
  assert.ok(html.includes('BLOG_LINK0 BLOG_LINK_0'));
  assert.ok(html.includes(`<h1>${link('/heading', 'Heading', 'Heading guide')}</h1>`));
  assert.ok(html.includes(`<li>${link('/step', 'Step', 'Step guide')}</li>`));
});
