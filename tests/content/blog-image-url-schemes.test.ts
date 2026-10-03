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

for (const src of ['/images/a.png', 'images/a.png', './a.png', '../a.png', 'https://example.com/a.png', 'HTTP://example.com/a.png']) {
  test(`renders an image for allowed destination: ${src}`, (t) => {
    const html = render(t, `![x](${src})`);
    assert.match(html, /<img\b/);
    assert.ok(html.includes(`src="${src}"`));
  });
}

for (const src of [
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  ' javascript:alert(1)',
  'java\tscript:alert(1)',
  'data:image/png;base64,AAAA',
  'vbscript:x',
  'file:///etc/passwd',
  '//evil.example/a.png',
]) {
  test(`renders no image for disallowed destination: ${JSON.stringify(src)}`, (t) => {
    const html = render(t, `![x](${src})`);
    assert.doesNotMatch(html, /<img\b/);
    assert.doesNotMatch(html.toLowerCase(), /src="javascript/);
    assert.doesNotMatch(html.toLowerCase(), /src="data/);
  });
}
