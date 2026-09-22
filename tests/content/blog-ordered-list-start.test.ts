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
  return post.content.trim();
}

test('preserves a run beginning at three with the existing list styling', (t) => {
  const html = render(t, '3. Third step\n4. Fourth step');
  assert.equal(html, '<ol class="list-decimal pl-6 space-y-2 my-4" start="3"><li>Third step</li>\n<li>Fourth step</li></ol>');
});

test('uses each run’s first marker when prose separates numbered instructions', (t) => {
  const html = render(t, '1. First step\n2. Second step\n\nExplanation.\n\n3. Third step\n4. Fourth step\nMore explanation.\n8. Eighth step\n9. Ninth step');
  assert.deepEqual([...html.matchAll(/<ol\b([^>]*)>([\s\S]*?)<\/ol>/g)].map(([, attributes, items]) => ({ attributes, items })), [
    { attributes: ' class="list-decimal pl-6 space-y-2 my-4"', items: '<li>First step</li>\n<li>Second step</li>' },
    { attributes: ' class="list-decimal pl-6 space-y-2 my-4" start="3"', items: '<li>Third step</li>\n<li>Fourth step</li>' },
    { attributes: ' class="list-decimal pl-6 space-y-2 my-4" start="8"', items: '<li>Eighth step</li>\n<li>Ninth step</li>' },
  ]);
  assert.match(html, /<\/ol>\s*<p[^>]*>Explanation\.<\/p>\s*<ol/);
  assert.match(html, /<\/ol>\s*<p[^>]*>More explanation\.<\/p>\s*<ol/);
});

test('keeps ordinary one-based list output unchanged', (t) => {
  assert.equal(render(t, '1. First step\n2. Second step'), '<ol class="list-decimal pl-6 space-y-2 my-4"><li>First step</li>\n<li>Second step</li></ol>');
});

test('normalizes leading zeros and preserves a zero start', (t) => {
  const html = render(t, '003. Third step\n\n000. Zero step\n\n001. First step');
  assert.deepEqual([...html.matchAll(/<ol\b[^>]*>/g)].map(([tag]) => tag), [
    '<ol class="list-decimal pl-6 space-y-2 my-4" start="3">',
    '<ol class="list-decimal pl-6 space-y-2 my-4" start="0">',
    '<ol class="list-decimal pl-6 space-y-2 my-4">',
  ]);
});

test('keeps numbered text inside fenced code literal', (t) => {
  const html = render(t, '```text\n3. Third step\n4. Fourth step\n```\n\n~~~text\n8. Eighth step\n9. Ninth step\n~~~\n\n5. Real step');
  assert.deepEqual([...html.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map(([, code]) => code), [
    '3. Third step\n4. Fourth step\n',
    '8. Eighth step\n9. Ninth step\n',
  ]);
  assert.deepEqual([...html.matchAll(/<ol\b[^>]*>[\s\S]*?<\/ol>/g)].map(([list]) => list), [
    '<ol class="list-decimal pl-6 space-y-2 my-4" start="5"><li>Real step</li></ol>',
  ]);
});

test('keeps numbered inline code isolated from list parsing', (t) => {
  const html = render(t, '`3. Literal step`\n\n4. Real step with `8. Literal marker`');
  assert.match(html, /^<p[^>]*><code[^>]*>3\. Literal step<\/code><\/p>/);
  assert.match(html, /<ol[^>]* start="4"><li>Real step with <code[^>]*>8\. Literal marker<\/code><\/li><\/ol>$/);
  assert.equal((html.match(/<ol\b/g) || []).length, 1);
});
