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

const listClass = 'list-decimal pl-6 space-y-2 my-4';

test('starts at three and leaves subsequent numbering to HTML', (t) => {
  const html = render(t, '3. **Collect** sample\n9. Analyze `sample`');
  assert.match(html, new RegExp(`<ol class="${listClass}" start="3">`));
  assert.match(html, /<li><strong>Collect<\/strong> sample<\/li>/);
  assert.match(html, /<li>Analyze <code[^>]*>sample<\/code><\/li>/);
  assert.equal((html.match(/<li>/g) || []).length, 2);
  assert.doesNotMatch(html, /\bvalue=|start="9"|9\. Analyze/);
});

test('preserves a zero starting value', (t) => {
  const html = render(t, '0. Prepare\n1. Collect');
  assert.equal(html.trim(), `<ol class="${listClass}" start="0"><li>Prepare</li>\n<li>Collect</li></ol>`);
});

test('reads the first marker again for a continued list after prose', (t) => {
  const html = render(t, '1. Prepare\n2. Label\nBetween procedures.\n3. Collect sample\n4. Analyze sample');
  assert.equal(html.trim(), `<ol class="${listClass}"><li>Prepare</li>\n<li>Label</li></ol>\n<p class="my-4 leading-relaxed">Between procedures.</p>\n<ol class="${listClass}" start="3"><li>Collect sample</li>\n<li>Analyze sample</li></ol>`);
});

test('omits the start attribute for an ordinary list starting at one', (t) => {
  const html = render(t, '1. Collect\n2. Analyze');
  assert.equal(html.trim(), `<ol class="${listClass}"><li>Collect</li>\n<li>Analyze</li></ol>`);
});

test('keeps numbered text literal inside backtick and tilde fenced code', (t) => {
  const code = '3. Collect sample\n4. Analyze sample\n0. Prepare';
  const html = render(t, '```text\n' + code + '\n```\n\n~~~text\n' + code + '\n~~~');
  const blocks = [...html.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)];
  assert.deepEqual(blocks.map(([, content]) => content), [code + '\n', code + '\n']);
  assert.doesNotMatch(html, /<(?:ol|li)\b|\bstart=/);
});
