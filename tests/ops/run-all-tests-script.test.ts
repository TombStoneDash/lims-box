import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(__dirname, '../..');
const source = readFileSync(path.join(root, 'scripts/run-all-tests.mjs'), 'utf8');
const packageText = readFileSync(path.join(root, 'package.json'), 'utf8');
const { scripts } = JSON.parse(packageText);

test('test:all points at the full-suite script', () => {
  assert.equal(scripts['test:all'], 'node scripts/run-all-tests.mjs');
});

test('every explicitly excluded test file exists', () => {
  const excluded = source.match(/const EXCLUDED = \[([\s\S]*?)\];/);
  assert.ok(excluded, 'script must declare an explicit EXCLUDED array');
  for (const match of excluded[1].matchAll(/\bfile:\s*['"]([^'"]+)['"]/g)) {
    assert.ok(existsSync(path.join(root, match[1])), `missing excluded file: ${match[1]}`);
  }
});

test('the deploy build does not invoke test:all', () => {
  assert.equal(scripts['vercel-build'].includes('test:all'), false);
});
