import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import UnsubscribePage from '../../app/unsubscribe/page';

// tsx compiles this repository's preserved JSX in classic mode.
Object.assign(globalThis, { React });

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else {
      files.push(full);
    }
  }
  return files;
}

const cases: Array<Record<string, string>> = [
  {},
  { email: 'person@example.com', list: 'all' },
];

for (const params of cases) {
  test(`unsubscribe page footer shows the P.O. Box address for params ${JSON.stringify(params)}`, async () => {
    const markup = renderToStaticMarkup(
      await UnsubscribePage({ searchParams: Promise.resolve(params) })
    );

    assert.ok(markup.includes('TombStone Dash LLC'));
    assert.ok(markup.includes('P.O. Box 60'));
    assert.ok(markup.includes('La Mesa, CA 91942'));
    assert.ok(!markup.includes('Ridge Manor'));
    assert.ok(!markup.includes('6821'));
    assert.ok(!markup.includes('92120'));

    const match = markup.match(/<div class="([^"]*)"><p>TombStone Dash LLC<\/p>/);
    assert.ok(match, 'expected to find the wrapper div for the TombStone Dash LLC paragraph');
    const classList = match![1];
    assert.ok(!classList.includes('text-gray-300'));
    assert.ok(!classList.includes('text-gray-400'));
  });
}

test('no file under app/, components/, lib/ or content/ mentions Ridge Manor', () => {
  const root = path.resolve(__dirname, '../..');
  const dirs = ['app', 'components', 'lib', 'content'];
  for (const dir of dirs) {
    const full = path.join(root, dir);
    if (!fs.existsSync(full)) continue;
    for (const file of walk(full)) {
      const contents = fs.readFileSync(file, 'utf8');
      assert.ok(!contents.includes('Ridge Manor'), `${file} must not mention Ridge Manor`);
    }
  }
});
