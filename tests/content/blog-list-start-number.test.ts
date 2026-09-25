import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { getPostBySlug } from '../../lib/blog';

function render(t: TestContext, markdown: string): string {
  const directory = path.join(process.cwd(), 'content', 'blog');
  t.mock.method(fs, 'existsSync', (input) => input === directory);
  t.mock.method(fs, 'readdirSync', (input) => {
    assert.equal(input, directory);
    return ['fixture.md'];
  });
  t.mock.method(fs, 'readFileSync', (input, encoding) => {
    assert.equal(input, path.join(directory, 'fixture.md'));
    assert.equal(encoding, 'utf-8');
    return `---\ntitle: Synthetic fixture\nslug: fixture\n---\n${markdown}`;
  });
  const post = getPostBySlug('fixture');
  assert.ok(post);
  return post.content;
}

function orderedLists(html: string) {
  return [...html.matchAll(/<ol\b([^>]*)>([\s\S]*?)<\/ol>/g)].map(([, attributes, list]) => ({
    start: attributes.match(/\bstart="([^"]*)"/)?.[1],
    items: [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(([, item]) => item),
  }));
}

test('preserves a list starting at four', (t) => {
  const html = render(t, '4. Fourth step\n5. Fifth step');
  assert.deepEqual(orderedLists(html), [
    { start: '4', items: ['Fourth step', 'Fifth step'] },
  ]);
});

test('preserves independent starting ordinals after intervening paragraphs', (t) => {
  const html = render(t, '1. First step\n2. Second step\n\nPause here.\n\n3. Third step\n4. Fourth step\n\nNew procedure.\n\n1. Restart');
  assert.deepEqual(orderedLists(html), [
    { start: undefined, items: ['First step', 'Second step'] },
    { start: '3', items: ['Third step', 'Fourth step'] },
    { start: undefined, items: ['Restart'] },
  ]);
  assert.match(html, /<\/ol>\s*<p[^>]*>Pause here\.<\/p>\s*<ol\b/);
  assert.match(html, /<\/ol>\s*<p[^>]*>New procedure\.<\/p>\s*<ol\b/);
});

test('preserves a zero starting ordinal', (t) => {
  const html = render(t, '0. Preparation\n1. First step');
  assert.deepEqual(orderedLists(html), [
    { start: '0', items: ['Preparation', 'First step'] },
  ]);
});

test('keeps ordinary one-start list markup unchanged', (t) => {
  const html = render(t, '1. First step\n2. Second step');
  assert.deepEqual(orderedLists(html), [
    { start: undefined, items: ['First step', 'Second step'] },
  ]);
  assert.equal(html, '\n<ol class="list-decimal pl-6 space-y-2 my-4"><li>First step</li>\n<li>Second step</li></ol>\n');
});
