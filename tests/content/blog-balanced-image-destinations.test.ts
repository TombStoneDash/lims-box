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

const image = (src: string, alt = '') => `<img src="${src}" alt="${alt}" class="max-w-full h-auto" />`;
const paragraph = (content: string) => `<p class="my-4 leading-relaxed">${content}</p>`;
const anchor = (href: string, label: string) => `<a href="${href}" class="text-lab-teal hover:text-lab-blue underline transition-colors">${label}</a>`;

test('renders balanced and nested destinations with empty alt text and adjacent prose', (t) => {
  assert.equal(render(t, 'Before ![Chart](/images/qc(final).png)![](/images/qc(final(v2)).png)after.'),
    paragraph(`Before ${image('/images/qc(final).png', 'Chart')}${image('/images/qc(final(v2)).png')}after.`));
});

test('unescapes delimiters and backslashes while preserving other escapes', (t) => {
  assert.equal(render(t, String.raw`![Open](/open\()prose![Close](/close\))![Mixed](/qc(final\(v2\)).png)![Slash](/a\\b\q.png)`),
    paragraph(image('/open(', 'Open') + 'prose' + image('/close)', 'Close') + image('/qc(final(v2)).png', 'Mixed') + image(String.raw`/a\b\q.png`, 'Slash')));
});

test('escapes attributes and preserves literal alt text with balanced destinations', (t) => {
  assert.equal(render(t, '!["&<> **literal** `code`](/qc(final).png?x="&<>)'),
    paragraph(image('/qc(final).png?x=&quot;&amp;&lt;&gt;', '&quot;&amp;&lt;&gt; **literal** `code`')));
});

test('keeps adjacent images and ordinary links independent', (t) => {
  assert.equal(render(t, '[Before](/guide(v1))![One](/one(v2))![Two](/two(v3))[After](/next(v4)).'),
    paragraph(anchor('/guide(v1)', 'Before') + image('/one(v2)', 'One') + image('/two(v3)', 'Two') + anchor('/next(v4)', 'After') + '.'));
});

for (const literal of ['![Empty]()', '![Open](/qc(final).png', String.raw`![Escaped](/qc\)`, '![Broken](/qc(final) prose)', '![Missing] /qc(final)', '![No close bracket(/qc(final)']) {
  test(`leaves malformed image syntax literal: ${literal}`, (t) => {
    assert.equal(render(t, literal), paragraph(literal));
  });
}

test('does not consume subsequent prose, images, links, or lines after an unclosed image', (t) => {
  assert.equal(render(t, '![Bad](/unclosed text)![Good](/good(v2))[Guide](/guide)\n![Broken](/open\nNext) ![Last](/last)'),
    paragraph('![Bad](/unclosed text)' + image('/good(v2)', 'Good') + anchor('/guide', 'Guide') + '<br />![Broken](/open<br />Next) ' + image('/last', 'Last')));
  assert.equal(render(t, '![Bad](/open![Good](/good)[Guide](/guide)'),
    paragraph('![Bad](/open' + image('/good', 'Good') + anchor('/guide', 'Guide')));
});

test('protects balanced and escaped image syntax inside inline and fenced code', (t) => {
  const literal = String.raw`![Chart](/qc(final(v2)).png)![](/qc\(final\).png)`;
  const html = render(t, '`' + literal + '`\n\n```markdown\n' + literal + '\n```\n\n~~~markdown\n' + literal + '\n~~~\n\n![Real](/real(v2))');
  assert.match(html, new RegExp('<code[^>]*>' + literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</code>'));
  const blocks = [...html.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)];
  assert.deepEqual(blocks.map(([, content]) => content), [literal + '\n', literal + '\n']);
  assert.equal((html.match(/<img\b/g) || []).length, 1);
  assert.ok(html.includes(image('/real(v2)', 'Real')));
});
