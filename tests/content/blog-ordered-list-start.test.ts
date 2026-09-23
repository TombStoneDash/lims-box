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

test('preserves a start of 10 with styling and inline formatting', (t) => {
  const html = render(t, '10. **Tenth** step\n11. *Eleventh* step');
  assert.equal(html.trim(), '<ol class="list-decimal pl-6 space-y-2 my-4" start="10"><li><strong>Tenth</strong> step</li>\n<li><em>Eleventh</em> step</li></ol>');
});

test('preserves a start of zero', (t) => {
  const html = render(t, '0. Preparation\n1. First step');
  assert.equal(html.trim(), '<ol class="list-decimal pl-6 space-y-2 my-4" start="0"><li>Preparation</li>\n<li>First step</li></ol>');
});

test('omits the start attribute for an ordinary list starting at one', (t) => {
  const html = render(t, '1. First step\n2. Second step');
  assert.equal(html.trim(), '<ol class="list-decimal pl-6 space-y-2 my-4"><li>First step</li>\n<li>Second step</li></ol>');
});

test('captures each new run independently when a procedure continues after prose', (t) => {
  const html = render(t, '1. First step\n2. Second step\n\nExplanation.\n\n3. Third step\n4. Fourth step\n\nAnother procedure.\n\n1. Restart');
  const lists = [...html.matchAll(/<ol\b[^>]*>/g)].map(([tag]) => tag);
  assert.deepEqual(lists, [
    '<ol class="list-decimal pl-6 space-y-2 my-4">',
    '<ol class="list-decimal pl-6 space-y-2 my-4" start="3">',
    '<ol class="list-decimal pl-6 space-y-2 my-4">',
  ]);
  assert.match(html, /<\/ol>\s*<p[^>]*>Explanation\.<\/p>\s*<ol[^>]* start="3"><li>Third step<\/li>/);
});

for (const fence of ['```', '~~~']) {
  test(`keeps numbered lines literal inside ${fence} fences`, (t) => {
    const literal = '10. **Tenth** step\n11. Eleventh step\n\n0. Preparation';
    const html = render(t, `${fence}text\n${literal}\n${fence}\n\n10. Real step`);
    const code = html.match(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/);
    assert.ok(code);
    assert.equal(code[1], literal + '\n');
    assert.equal((html.match(/<ol\b/g) || []).length, 1);
    assert.match(html, /<ol[^>]* start="10"><li>Real step<\/li><\/ol>/);
  });
}
