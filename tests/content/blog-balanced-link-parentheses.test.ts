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

const paragraph = (body: string) => `<p class="my-4 leading-relaxed">${body}</p>`;

test('preserves one balanced pair in a link destination without trailing punctuation', (t) => {
  assert.equal(render(t, '[Reference](https://example.org/Method_(water))'),
    paragraph(anchor('https://example.org/Method_(water)', 'Reference')));
});

test('preserves multiple nested and sibling pairs', (t) => {
  const destination = 'https://example.org/Method_(water_(fresh_(cold)))(sample)';
  assert.equal(render(t, `[Reference](${destination})`), paragraph(anchor(destination, 'Reference')));
});

test('parses two adjacent links independently', (t) => {
  assert.equal(render(t, '[One](/one_(a))[Two](/two_(b_(c)))'),
    paragraph(anchor('/one_(a)', 'One') + anchor('/two_(b_(c))', 'Two')));
});

test('preserves ordinary links and surrounding punctuation', (t) => {
  assert.equal(render(t, 'See [Reference](https://example.org/method).'),
    paragraph(`See ${anchor('https://example.org/method', 'Reference')}.`));
});

test('keeps empty, malformed, and unclosed link destinations literal', (t) => {
  const markdown = '[Empty]() [Missing]( [Reference](https://example.org/Method_(water)';
  assert.equal(render(t, markdown), paragraph(markdown));
});

test('keeps multiple unclosed nested pairs literal', (t) => {
  const markdown = '[Reference](https://example.org/Method_(water_(fresh))';
  assert.equal(render(t, markdown), paragraph(markdown));
});

test('does not consume a later valid link after an unclosed destination', (t) => {
  assert.equal(render(t, '[Broken](/method_(water) [Good](/good_(sample))'),
    paragraph(`[Broken](/method_(water) ${anchor('/good_(sample)', 'Good')}`));
});

test('preserves escaping and formatted labels with balanced destinations', (t) => {
  assert.equal(render(t, '[**Bold** *label*](/method_(a*b*c)?x="q"&tag=<value>)'),
    paragraph(anchor('/method_(a*b*c)?x=&quot;q&quot;&amp;tag=&lt;value&gt;', '<strong>Bold</strong> <em>label</em>')));
});

test('keeps balanced and unbalanced link-like text literal in inline and fenced code', (t) => {
  const literal = '[Reference](/method_(water)) [Broken](/method_(water)';
  const html = render(t, '`' + literal + '`\n\n```markdown\n' + literal + '\n```');
  assert.equal(html, paragraph(`<code class="bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded text-sm">${literal}</code>`) +
    `\n\n<pre class="bg-black/5 dark:bg-white/5 p-4 rounded-lg overflow-x-auto my-4"><code>${literal}\n</code></pre>\n`);
});
