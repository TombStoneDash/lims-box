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

const anchor = (href: string, label: string) => `<a href="${href}" class="text-lab-teal hover:text-lab-blue underline transition-colors">${label}</a>`;

test('preserves paired asterisks and escapes ampersands in exact destinations', (t) => {
  const html = render(t, 'Search: [Search](/lookup?pattern=a*b*c) [More](/lookup?pattern=a**b**c&next=1&literal=&amp;)');
  assert.equal(html, `<p class="my-4 leading-relaxed">Search: ${anchor('/lookup?pattern=a*b*c', 'Search')} ${anchor('/lookup?pattern=a**b**c&amp;next=1&amp;literal=&amp;amp;', 'More')}</p>`);
});

test('escapes attribute quotes and angle brackets without changing the destination', (t) => {
  const html = render(t, 'See [Quoted](/lookup?value="a*b*c"&tag=<sample>&single=\'x\')');
  assert.equal(html, `<p class="my-4 leading-relaxed">See ${anchor('/lookup?value=&quot;a*b*c&quot;&amp;tag=&lt;sample&gt;&amp;single=\'x\'', 'Quoted')}</p>`);
});

test('preserves emphasis and inline code in labels across multiple links', (t) => {
  const html = render(t, 'See [**Bold** *italic* ***both*** `*literal* <code>&`](/lookup?pattern=a*b*c&x=1) and [*Next*](/next?pattern=x*y*z).');
  const label = '<strong>Bold</strong> <em>italic</em> <strong><em>both</em></strong> <code class="bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded text-sm">*literal* &lt;code&gt;&amp;</code>';
  assert.equal(html, `<p class="my-4 leading-relaxed">See ${anchor('/lookup?pattern=a*b*c&amp;x=1', label)} and ${anchor('/next?pattern=x*y*z', '<em>Next</em>')}.</p>`);
});

test('keeps links literal inside inline and fenced code', (t) => {
  const literal = '[Search](/lookup?pattern=a*b*c&x="quoted")';
  const html = render(t, '`' + literal + '`\n\n```markdown\n' + literal + '\n```\n\nReal: [Search](/lookup?pattern=a*b*c&x=1)');
  const escaped = '[Search](/lookup?pattern=a*b*c&amp;x="quoted")';
  assert.equal(html, `<p class="my-4 leading-relaxed"><code class="bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded text-sm">${escaped}</code></p>\n\n<pre class="bg-black/5 dark:bg-white/5 p-4 rounded-lg overflow-x-auto my-4"><code>${escaped}\n</code></pre>\n\n<p class="my-4 leading-relaxed">Real: ${anchor('/lookup?pattern=a*b*c&amp;x=1', 'Search')}</p>`);
});
