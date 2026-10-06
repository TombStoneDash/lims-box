import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { build, redact } from './build.mjs';
import { parseFounderAllowlist } from '../../lib/bot/founder-document-policy.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
function fixture(t) {
  const root = mkdtempSync(path.join(process.cwd(), '.founder-build-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'sources'));
  const text = 'Hudson Taylor configured LIMS imports.\n\nLIMS BOX provides laboratory software.';
  writeFileSync(path.join(root, 'sources/career.txt'), text);
  const policy = path.join(root, 'ALLOWLIST.txt');
  writeFileSync(policy, ['sources/career.txt', sha(text), sha(redact(text)), 'FOUNDER_STORY_SAFE'].join('\t') + '\n');
  return { root, text, policy };
}

test('only exact listed documents are shipped, regardless of unlisted content or tags', t => {
  const { root, text, policy } = fixture(t);
  mkdirSync(path.join(root, '15_HT_FOUNDER_INTAKE'));
  writeFileSync(path.join(root, '15_HT_FOUNDER_INTAKE/career.txt'), text);
  writeFileSync(path.join(root, 'sources/unlisted.txt'), 'PUBLIC FOUNDER_STORY_SAFE harmless career text');
  const output = path.join(root, 'output');
  const report = build(root, output, policy);
  assert.equal(report.documents, 1);
  assert.equal(report.paragraphs, 2);
  assert.equal(readFileSync(path.join(output, '16_FOUNDER_PUBLIC/redacted', sha(text) + '.txt'), 'utf8'), redact(text));
  const second = path.join(root, 'second');
  assert.deepEqual(build(root, second, policy), report);
  for (const file of ['MANIFEST.tsv', 'BUILD_REPORT.json', '16_FOUNDER_PUBLIC/SOURCES.tsv']) {
    assert.deepEqual(readFileSync(path.join(output, file)), readFileSync(path.join(second, file)));
  }
});

test('empty or missing policy never admits an ingest candidate', t => {
  const { root, policy } = fixture(t);
  writeFileSync(policy, '# No approved documents\n');
  assert.equal(build(root, path.join(root, 'empty'), policy).documents, 0);
  rmSync(policy);
  assert.throws(() => build(root, path.join(root, 'missing'), policy), /ENOENT/);
});

test('excluded folder, traversal, ambiguous paths and unreviewed tags cannot be listed', () => {
  const row = source => [source, 'a'.repeat(64), 'b'.repeat(64), 'PUBLIC'].join('\t');
  for (const source of ['15_HT_FOUNDER_INTAKE/a.txt', 'nested/15_ht_founder_intake/a.txt', '../career.txt',
    '/career.txt', 'C:/career.txt', 'sources\\career.txt', 'sources//career.txt', 'sources/./career.txt', 'sources/a.txt:stream']) {
    assert.throws(() => parseFounderAllowlist(row(source)), /invalid_founder_allowlist/);
  }
  assert.throws(() => parseFounderAllowlist(row('sources/a.txt') + '\n' + row('sources/a.txt')), /invalid_founder_allowlist/);
  assert.throws(() => parseFounderAllowlist(row('sources/a.txt').replace('PUBLIC', 'REDACTED_CANDIDATE')), /invalid_founder_allowlist/);
});

test('changed source bytes or reviewed redaction and stale output abort the build', t => {
  const { root, text, policy } = fixture(t);
  const output = path.join(root, 'output');
  build(root, output, policy);
  assert.throws(() => build(root, output, policy), /output_must_be_empty/);
  writeFileSync(path.join(root, 'sources/career.txt'), text + '\nnew claim');
  assert.throws(() => build(root, path.join(root, 'changed'), policy), /changed_approved_source/);
  writeFileSync(path.join(root, 'sources/career.txt'), text);
  writeFileSync(policy, ['sources/career.txt', sha(text), 'c'.repeat(64), 'PUBLIC'].join('\t'));
  assert.throws(() => build(root, path.join(root, 'redaction'), policy), /changed_approved_redaction/);
});
