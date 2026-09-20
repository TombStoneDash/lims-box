import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.join(__dirname, '..', '..');
const source = readFileSync(path.join(ROOT, 'scripts/run-all-tests.mjs'), 'utf8');
const packageText = readFileSync(path.join(ROOT, 'package.json'), 'utf8');
const { scripts } = JSON.parse(packageText);

test('test:all runs the recursive test runner', () => {
  assert.equal(scripts['test:all'], 'node scripts/run-all-tests.mjs');
});

test('every explicitly excluded test file exists', () => {
  const excluded = source.match(/const EXCLUDED = \[([\s\S]*?)\];/);
  assert.ok(excluded, 'runner must declare an EXCLUDED array');
  for (const match of excluded[1].matchAll(/\bfile:\s*['"]([^'"]+)['"]/g)) {
    assert.ok(existsSync(path.join(ROOT, match[1])), `missing excluded file: ${match[1]}`);
  }
});

test('vercel-build does not invoke the full test suite', () => {
  assert.equal(typeof scripts['vercel-build'], 'string');
  assert.ok(!scripts['vercel-build'].includes('test:all'));
});
