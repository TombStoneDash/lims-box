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

const paragraph = (content: string) => `<p class="my-4 leading-relaxed">${content}</p>`;

for (const [name, destination] of [
  ['parenthesized URL', 'https://example.invalid/Guide_(water)'],
  ['nested balanced parentheses', 'https://example.invalid/Guide_(water_(quality))'],
  ['ordinary link', 'https://example.invalid/guide'],
]) {
  test(`preserves the exact href for a ${name}`, (t) => {
    assert.equal(render(t, `Before [**Reference**](${destination}). After.`),
      paragraph(`Before ${anchor(destination, '<strong>Reference</strong>')}. After.`));
  });
}

test('unescapes parentheses without consuming adjacent prose or a following link', (t) => {
  const html = render(t, String.raw`[Open](https://example.invalid/open\()prose[Close](https://example.invalid/close\)).`);
  assert.equal(html, paragraph(`${anchor('https://example.invalid/open(', 'Open')}prose${anchor('https://example.invalid/close)', 'Close')}.`));
});

test('preserves escaped pairs and balanced parentheses in the same destination', (t) => {
  assert.equal(render(t, String.raw`[Reference](/Guide_(water\(quality\))?x=1&y=2)!`),
    paragraph(`${anchor('/Guide_(water(quality))?x=1&amp;y=2', 'Reference')}!`));
});

test('handles two adjacent links independently', (t) => {
  assert.equal(render(t, '[First](/Guide_(water))[Second](/Guide_(soil_(quality))) tail'),
    paragraph(`${anchor('/Guide_(water)', 'First')}${anchor('/Guide_(soil_(quality))', 'Second')} tail`));
});

test('keeps balanced and escaped destinations literal in inline and fenced code', (t) => {
  const literal = String.raw`[Reference](/Guide_(water_(quality)))[Escaped](/Guide_\(water\))`;
  const html = render(t, '`' + literal + '`\n\n```markdown\n' + literal + '\n```');
  assert.equal(html, paragraph(`<code class="bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded text-sm">${literal}</code>`) +
    `\n\n<pre class="bg-black/5 dark:bg-white/5 p-4 rounded-lg overflow-x-auto my-4"><code>${literal}\n</code></pre>\n`);
});
