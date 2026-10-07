import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { GET, HEAD } from '../app/api/health/route';
import { getFounderBundleDiagnostics, loadFounderFactIndex } from '../lib/bot/founder-corpus';

const shipped = path.resolve('knowledge/founder');

test('symlinked root and symlinked ancestors work from a different cwd; internal links still fail closed', async (t) => {
  const temp = mkdtempSync(path.join(tmpdir(), 'founder-layout-'));
  const cwd = process.cwd();
  const previous = process.env.LIMS_FOUNDER_KNOWLEDGE_DIR;
  t.after(() => {
    process.chdir(cwd);
    if (previous === undefined) delete process.env.LIMS_FOUNDER_KNOWLEDGE_DIR;
    else process.env.LIMS_FOUNDER_KNOWLEDGE_DIR = previous;
    rmSync(temp, { recursive: true, force: true });
  });
  const expected = loadFounderFactIndex(shipped);
  assert.ok(expected.length > 0);
  const target = path.join(temp, 'asset-store');
  cpSync(shipped, target, { recursive: true });
  const task = path.join(temp, 'var/task');
  mkdirSync(path.join(task, 'knowledge'), { recursive: true });
  symlinkSync(target, path.join(task, 'knowledge/founder'), 'dir');
  symlinkSync(task, path.join(temp, 'task-alias'), 'dir');
  process.chdir(task);
  delete process.env.LIMS_FOUNDER_KNOWLEDGE_DIR;
  assert.notEqual(process.cwd(), cwd);
  assert.deepEqual(loadFounderFactIndex(), expected);
  assert.deepEqual(loadFounderFactIndex(path.join(temp, 'task-alias/knowledge/founder')), expected);
  process.env.LIMS_FOUNDER_KNOWLEDGE_DIR = './knowledge/founder';
  assert.deepEqual(loadFounderFactIndex(), expected);

  const response = await GET();
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(response.headers.get('cache-control'), 'no-store, no-cache, must-revalidate');
  assert.deepEqual(body.founderBundle, {
    root: path.join(realpathSync(task), 'knowledge/founder'), exists: true,
    manifestRows: 3, sourcesRows: 2, documents: 2, error: null,
  });
  for (const fact of expected) assert.ok(!JSON.stringify(body).includes(fact.text));
  assert.equal(await (await HEAD()).text(), '');

  rmSync(path.join(target, 'MANIFEST.tsv'));
  symlinkSync(path.join(shipped, 'MANIFEST.tsv'), path.join(target, 'MANIFEST.tsv'));
  assert.deepEqual(loadFounderFactIndex(), []);
  assert.match(getFounderBundleDiagnostics().error!, /MANIFEST.tsv: Error \(symlink\)/);
});

test('health reports missing/corrupt metadata without content and failure logs once across repeated reads', async (t) => {
  const temp = mkdtempSync(path.join(tmpdir(), 'founder-health-'));
  const previous = process.env.LIMS_FOUNDER_KNOWLEDGE_DIR;
  // Reset only in this isolated test process to observe the first failure.
  const flag = Symbol.for('lims.founderBundle.failureLogged');
  Reflect.deleteProperty(globalThis, flag);
  const logs: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => logs.push(args));
  t.after(() => {
    if (previous === undefined) delete process.env.LIMS_FOUNDER_KNOWLEDGE_DIR;
    else process.env.LIMS_FOUNDER_KNOWLEDGE_DIR = previous;
    rmSync(temp, { recursive: true, force: true });
  });
  process.env.LIMS_FOUNDER_KNOWLEDGE_DIR = path.join(temp, 'missing');
  const missing = (await (await GET()).json()).founderBundle;
  assert.deepEqual(missing, {
    root: process.env.LIMS_FOUNDER_KNOWLEDGE_DIR, exists: false,
    manifestRows: 0, sourcesRows: 0, documents: 0, error: '.: Error (ENOENT)',
  });
  process.env.LIMS_FOUNDER_KNOWLEDGE_DIR = temp;
  const absent = (await (await GET()).json()).founderBundle;
  assert.equal(absent.exists, true);
  assert.equal(absent.error, 'MANIFEST.tsv: Error (ENOENT)');
  writeFileSync(path.join(temp, 'MANIFEST.tsv'), 'SECRET_PARSER_INPUT');
  const corrupt = (await (await GET()).json()).founderBundle;
  assert.equal(corrupt.error, 'MANIFEST.tsv: Error (invalid_headers)');
  assert.ok(!JSON.stringify(corrupt).includes('SECRET_PARSER_INPUT'));
  cpSync(shipped, temp, { recursive: true });
  writeFileSync(path.join(temp, 'approved/SOURCES.tsv'), 'SECRET_DOCUMENT_CONTENT');
  const integrity = (await (await GET()).json()).founderBundle;
  assert.equal(integrity.manifestRows, 3);
  assert.equal(integrity.sourcesRows, 0);
  assert.equal(integrity.error, 'approved/SOURCES.tsv: Error (sources_integrity)');
  assert.ok(!JSON.stringify(integrity).includes('SECRET_DOCUMENT_CONTENT'));
  loadFounderFactIndex();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].length, 1);
  const line = String(logs[0][0]);
  assert.equal(line.split('\n').length, 1);
  assert.deepEqual(JSON.parse(line.replace('[founder-bundle] ', '')), {
    root: path.join(temp, 'missing'), file: '.', name: 'Error', reason: 'ENOENT',
  });
  // A failed read is never cached: restored evidence is visible immediately.
  cpSync(shipped, temp, { recursive: true });
  assert.equal(getFounderBundleDiagnostics().documents, 2);
  assert.equal(getFounderBundleDiagnostics().error, null);
  assert.ok(readFileSync(path.join(temp, 'MANIFEST.tsv')).length > 0);
});
