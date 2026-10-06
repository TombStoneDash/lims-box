import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseAllowlist } from './build.mjs';

test('allow-list is a finite inventory of exact paths; intake, traversal and globs fail closed', () => {
  assert.deepEqual(parseAllowlist('# reviewed\ncareer/resume.md\n\ncompany/facts.txt\n'),
    ['career/resume.md', 'company/facts.txt']);
  for (const value of ['', '# empty', '/absolute.txt', '../outside.txt', 'a/../outside.txt',
    'a/./file.txt', 'a//file.txt', 'a\\file.txt', 'a/*.txt', 'a/?.txt', 'a/[x].txt',
    'a/{x,y}.txt', '15_HT_FOUNDER_INTAKE/redacted/file.txt',
    'nested/15_ht_founder_intake/file.txt', 'same.txt\nsame.txt']) {
    assert.throws(() => parseAllowlist(value));
  }
});

test('every selected document has exactly one reviewed source and output hash lock', () => {
  const paths = parseAllowlist(readFileSync(new URL('./ALLOWLIST.txt', import.meta.url), 'utf8'));
  const policy = JSON.parse(readFileSync(new URL('./admission.json', import.meta.url), 'utf8'));
  assert.equal(paths.length, 2);
  assert.deepEqual(policy.map((row) => row.path).sort(), paths.slice().sort());
  assert.equal(new Set(policy.map((row) => row.alias)).size, paths.length);
  for (const row of policy) {
    assert.match(row.sha256, /^[a-f0-9]{64}$/);
    assert.match(row.redactedSha256, /^[a-f0-9]{64}$/);
  }
});
