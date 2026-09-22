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

test('preserves a continued list starting at ten', (t) => {
  const html = render(t, '10. Top level\n11. Next');
  assert.equal(html, '\n<ol class="list-decimal pl-6 space-y-2 my-4" start="10"><li>Top level</li>\n<li>Next</li></ol>\n');
});

test('preserves a zero-based list', (t) => {
  const html = render(t, '0. Prepare\n1. Measure');
  assert.equal(html, '\n<ol class="list-decimal pl-6 space-y-2 my-4" start="0"><li>Prepare</li>\n<li>Measure</li></ol>\n');
});

test('keeps ordinary one-based output unchanged and uses only the first marker', (t) => {
  const html = render(t, '1. First\n10. Next');
  assert.equal(html, '\n<ol class="list-decimal pl-6 space-y-2 my-4"><li>First</li>\n<li>Next</li></ol>\n');
});

test('derives an independent start for runs separated by blank lines and paragraphs', (t) => {
  const html = render(t, 'Before.\n10. First\n11. Second\n\n0. Prepare\nBetween.\n1. Reset\nAfter.');
  assert.deepEqual([...html.matchAll(/<ol\b[^>]*>/g)].map(([tag]) => tag), [
    '<ol class="list-decimal pl-6 space-y-2 my-4" start="10">',
    '<ol class="list-decimal pl-6 space-y-2 my-4" start="0">',
    '<ol class="list-decimal pl-6 space-y-2 my-4">',
  ]);
  assert.match(html, /^<p[^>]*>Before\.<\/p>\s*<ol/);
  assert.match(html, /<\/ol>\s*<p[^>]*>Between\.<\/p>\s*<ol/);
  assert.match(html, /<\/ol>\s*<p[^>]*>After\.<\/p>$/);
});

test('preserves inline formatting in a continued list', (t) => {
  const html = render(t, '10. **Bold** and *italic*\n11. [Guide](/guide) and `sample`');
  assert.match(html, /^\s*<ol[^>]* start="10">/);
  assert.match(html, /<li><strong>Bold<\/strong> and <em>italic<\/em><\/li>/);
  assert.match(html, /<li><a href="\/guide"[^>]*>Guide<\/a> and <code[^>]*>sample<\/code><\/li>/);
});

for (const fence of ['```', '~~~']) {
  test(`keeps numbered text literal inside ${fence} fenced code and separates surrounding lists`, (t) => {
    const code = '10. **literal**\n11. <sample>&value\n\n0. `literal`';
    const html = render(t, `10. Before\n${fence}text\n${code}\n${fence}\n0. After`);
    const block = html.match(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/);
    assert.ok(block);
    assert.equal(block[1], code.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') + '\n');
    assert.equal((html.match(/<ol\b/g) || []).length, 2);
    assert.match(html, /<ol[^>]* start="10"><li>Before<\/li><\/ol>\s*<pre/);
    assert.match(html, /<\/pre>\s*<ol[^>]* start="0"><li>After<\/li><\/ol>/);
  });
}

test('normalizes leading zeroes without rounding or exponent notation', (t) => {
  const html = render(t, '00010. Ten\n\n0001. One\n\n1000000000000000000000. Large');
  assert.deepEqual([...html.matchAll(/<ol\b([^>]*)>/g)].map(([, attrs]) => attrs.match(/start="([^"]*)"/)?.[1]), ['10', undefined, '1000000000000000000000']);
});
