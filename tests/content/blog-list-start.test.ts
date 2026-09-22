import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { getPostBySlug } from '../../lib/blog';

function render(t: TestContext, markdown: string): string {
  const directory = path.join(process.cwd(), 'content', 'blog');
  const filename = 'fixture.md';
  t.mock.method(fs, 'existsSync', (input) => input === directory);
  t.mock.method(fs, 'readdirSync', (input) => {
    assert.equal(input, directory);
    return [filename];
  });
  t.mock.method(fs, 'readFileSync', (input, encoding) => {
    assert.equal(input, path.join(directory, filename));
    assert.equal(encoding, 'utf-8');
    return `---\ntitle: Synthetic fixture\nslug: fixture\n---\n${markdown}`;
  });
  const post = getPostBySlug('fixture');
  assert.ok(post);
  return post.content;
}

for (const start of [0, 1, 10]) {
  test(`preserves an ordered list starting at ${start}`, (t) => {
    const html = render(t, `${start}. First step\n${start + 1}. Next step`);
    const attribute = start === 1 ? '' : ` start="${start}"`;
    assert.equal(html, `\n<ol class="list-decimal pl-6 space-y-2 my-4"${attribute}><li>First step</li>\n<li>Next step</li></ol>\n`);
  });
}

test('resumed runs separated by prose each use their own first marker', (t) => {
  const html = render(t, '10. Tenth step\n11. Eleventh step\nPause here.\n12. **Resume**\n13. Finish\n\nRestart.\n\n1. First again\n2. Second again\nReset.\n0. Preparation');
  assert.deepEqual(html.match(/<ol\b[^>]*>/g), [
    '<ol class="list-decimal pl-6 space-y-2 my-4" start="10">',
    '<ol class="list-decimal pl-6 space-y-2 my-4" start="12">',
    '<ol class="list-decimal pl-6 space-y-2 my-4">',
    '<ol class="list-decimal pl-6 space-y-2 my-4" start="0">',
  ]);
  assert.match(html, /<\/ol>\s*<p[^>]*>Pause here\.<\/p>\s*<ol/);
  assert.match(html, /<li><strong>Resume<\/strong><\/li>/);
});

for (const fence of ['```', '~~~']) {
  test(`preserves numbered text inside ${fence} fenced code`, (t) => {
    const code = '0. **Literal**\n1. <sample>&value\n10. Tenth step';
    const html = render(t, `10. Before\n${fence}text\n${code}\n${fence}\n1. After`);
    assert.deepEqual(html.match(/<ol\b[^>]*>/g), [
      '<ol class="list-decimal pl-6 space-y-2 my-4" start="10">',
      '<ol class="list-decimal pl-6 space-y-2 my-4">',
    ]);
    const block = html.match(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/);
    assert.ok(block);
    assert.equal(block[1], '0. **Literal**\n1. &lt;sample&gt;&amp;value\n10. Tenth step\n');
  });
}
