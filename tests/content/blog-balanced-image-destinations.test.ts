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

const image = (src: string, alt: string) => `<img src="${src}" alt="${alt}" class="max-w-full h-auto" />`;
const paragraph = (content: string) => `<p class="my-4 leading-relaxed">${content}</p>`;

for (const destination of ['/chart(v2).png', '/chart(v2(detail)).png']) {
  test(`preserves the complete image destination ${destination}`, (t) => {
    assert.equal(render(t, `Before ![Chart](${destination}). After.`),
      paragraph(`Before ${image(destination, 'Chart')}. After.`));
  });
}

for (const [source, destination] of [
  [String.raw`/open\(.png`, '/open(.png'],
  [String.raw`/close\).png`, '/close).png'],
  [String.raw`/chart(v2\(detail\)).png`, '/chart(v2(detail)).png'],
  [String.raw`/chart\\(v2).png`, String.raw`/chart\(v2).png`],
  [String.raw`/chart\\`, '/chart\\'],
  [String.raw`/chart\q.png`, String.raw`/chart\q.png`],
]) {
  test(`handles destination escapes in ${source}`, (t) => {
    assert.equal(render(t, `![Chart](${source}) tail`),
      paragraph(`${image(destination, 'Chart')} tail`));
  });
}

test('preserves adjacent images, empty alt text, and surrounding prose', (t) => {
  assert.equal(render(t, 'Before ![](/first(v2).png)![Second](/second(v3(detail)).png) after.'),
    paragraph(`Before ${image('/first(v2).png', '')}${image('/second(v3(detail)).png', 'Second')} after.`));
});

test('escapes attributes while protecting literal alt text and destination formatting', (t) => {
  assert.equal(render(t, '![A "quote" & <sample> **literal** `code`](/chart(v2).png?label="x"&size=<wide>&style=**raw**)'),
    paragraph(image('/chart(v2).png?label=&quot;x&quot;&amp;size=&lt;wide&gt;&amp;style=**raw**',
      'A &quot;quote&quot; &amp; &lt;sample&gt; **literal** `code`')));
});

for (const source of [
  '![Chart](/chart(v2).png',
  '![Chart](/chart(v2.png)',
  String.raw`![Chart](/chart.png\)`,
  '![Chart](/chart.png',
  '![Chart](/chart.png\\',
  '![Chart]()',
  '![Chart] /chart.png)',
  '![Chart(/chart.png)',
  '![Chart](/chart(v2)\n.png)',
  '![Chart](/chart(v2)\r.png)',
]) {
  test(`leaves malformed image syntax as text: ${JSON.stringify(source)}`, (t) => {
    assert.equal(render(t, `Before ${source} after.`),
      paragraph(`Before ${source.replaceAll('\n', '<br />')} after.`));
  });
}

test('continues rendering valid images after unclosed syntax on a prior line', (t) => {
  assert.equal(render(t, '![Broken](/unclosed\n![Valid](/chart(v2).png)'),
    paragraph(`![Broken](/unclosed<br />${image('/chart(v2).png', 'Valid')}`));
});

test('keeps nested and escaped image syntax literal in inline and both fenced code styles', (t) => {
  const literal = String.raw`![Chart](/chart(v2(detail)).png)![Escaped](/chart\(v2\).png)![Broken](/unclosed`;
  const html = render(t, '`' + literal + '`\n\n```markdown\n' + literal + '\n```\n\n~~~markdown\n' + literal + '\n~~~\n\n![Real](/real(v2).png)');
  const blocks = [...html.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)];
  assert.deepEqual(blocks.map(([, content]) => content), [literal + '\n', literal + '\n']);
  assert.ok(html.includes(`>${literal}</code>`));
  assert.equal((html.match(/<img\b/g) || []).length, 1);
  assert.ok(html.endsWith(paragraph(image('/real(v2).png', 'Real'))));
});
