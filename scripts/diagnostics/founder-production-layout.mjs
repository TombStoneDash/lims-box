// Run after dependency installation / prisma generate:
// node scripts/diagnostics/founder-production-layout.mjs [--baseline]
// Builds a clean source copy, then starts it in a distinct var/task directory.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../../', import.meta.url));
const baseline = process.argv.includes('--baseline');
const temp = mkdtempSync(path.join(tmpdir(), 'founder-production-'));
const repo = path.join(temp, 'repo');
const task = path.join(temp, 'var/task');
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
delete env.LIMS_FOUNDER_KNOWLEDGE_DIR;
let server;
let output = '';
try {
  cpSync(source, repo, {
    recursive: true,
    filter: (file) => !['node_modules', '.git', '.next', '.env', '.env.local', 'tsconfig.tsbuildinfo'].includes(path.basename(file)),
  });
  symlinkSync(path.join(source, 'node_modules'), path.join(repo, 'node_modules'), 'dir');
  if (baseline) {
    writeFileSync(path.join(repo, 'lib/bot/founder-corpus.ts'), execFileSync('git', ['show', 'HEAD:lib/bot/founder-corpus.ts'], { cwd: source }));
    writeFileSync(path.join(repo, 'app/api/health/route.ts'), execFileSync('git', ['show', 'HEAD:app/api/health/route.ts'], { cwd: source }));
  }
  const next = path.join(repo, 'node_modules/next/dist/bin/next');
  const build = spawn(process.execPath, [next, 'build'], { cwd: repo, env, stdio: 'inherit' });
  assert.equal((await once(build, 'exit'))[0], 0, 'next build');
  mkdirSync(path.join(task, 'knowledge'), { recursive: true });
  for (const file of ['.next', 'node_modules', 'public']) symlinkSync(path.join(repo, file), path.join(task, file), 'dir');
  for (const file of ['package.json', 'next.config.js']) cpSync(path.join(repo, file), path.join(task, file));
  symlinkSync(path.join(repo, 'knowledge/founder'), path.join(task, 'knowledge/founder'), 'dir');
  assert.notEqual(task, repo);
  // Exercise the compiled handlers even in sandboxes that forbid TCP listeners.
  execFileSync(process.execPath, ['--input-type=commonjs', '-e', `
    const assert = require('node:assert/strict');
    const { createHash } = require('node:crypto');
    const { readFileSync, readdirSync } = require('node:fs');
    const path = require('node:path');
    const { NextRequest } = require('next/server');
    (async () => {
      const health = require('./.next/server/app/api/health/route.js').routeModule.userland;
      const assistant = require('./.next/server/app/api/demo/assistant/route.js').routeModule.userland;
      const diagnostics = (await (await health.GET()).json()).founderBundle;
      if (!${baseline}) {
        assert.equal(diagnostics.documents, 2);
        assert.equal(diagnostics.error, null);
        assert.equal(diagnostics.root, path.join(process.cwd(), 'knowledge/founder'));
      }
      const docs = 'knowledge/founder/approved/redacted';
      const paragraph = readFileSync(path.join(docs, readdirSync(docs)[0]), 'utf8').split(/\\r?\\n[^\\S\\r\\n]*\\r?\\n/)[0].trim();
      const id = 'founder-fact-' + createHash('sha256').update(paragraph.replace(/\\s+/g, ' ')).digest('hex').slice(0, 32);
      const response = await assistant.POST(new NextRequest('http://localhost/api/demo/assistant', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: 'Show founder fact ' + id + '.' }),
      }));
      const fact = await response.json();
      assert.equal(fact.grounded, !${baseline});
      if (!${baseline}) assert.equal(fact.answer, 'Founder archive (historical experience): ' + paragraph);
      console.log(JSON.stringify({ compiledHandlers: 'PASS', baseline: ${baseline}, runtimeCwd: process.cwd(), founderBundle: diagnostics, founderFactGrounded: fact.grounded }));
    })().catch((error) => { console.error(error); process.exitCode = 1; });
  `], { cwd: task, env, stdio: 'inherit' });
  const port = Number(process.env.FOUNDER_REPRO_PORT ?? (49152 + Math.floor(Math.random() * 10000)));
  server = spawn(process.execPath, [next, 'start', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: task, env, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', (chunk) => { output += chunk; });
  const base = `http://127.0.0.1:${port}`;
  let health;
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) { health = await response.json(); break; }
    } catch { /* wait for next start */ }
    if (server.exitCode !== null) throw new Error(output);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(health, 'server ready');
  if (!baseline) {
    assert.deepEqual(health.founderBundle, {
      root: path.join(task, 'knowledge/founder'), exists: true,
      manifestRows: 3, sourcesRows: 2, documents: 2, error: null,
    });
  }
  const docs = path.join(repo, 'knowledge/founder/approved/redacted');
  const paragraph = readFileSync(path.join(docs, readdirSync(docs)[0]), 'utf8').split(/\r?\n[^\S\r\n]*\r?\n/)[0].trim();
  const id = `founder-fact-${createHash('sha256').update(paragraph.replace(/\s+/g, ' ')).digest('hex').slice(0, 32)}`;
  const ask = async (question) => {
    const response = await fetch(`${base}/api/demo/assistant`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const fact = await ask(`Show founder fact ${id}.`);
  assert.equal(fact.grounded, !baseline);
  if (!baseline) assert.equal(fact.answer, `Founder archive (historical experience): ${paragraph}`);
  const framework = await ask('What is the LIMS BOX 7-11-4 framework?');
  assert.equal(framework.grounded, false);
  assert.match(framework.answer, /This demo only answers questions about the displayed synthetic sample IDs/);
  console.log(JSON.stringify({ mode: baseline ? 'baseline' : 'fixed', runtimeCwd: task, buildRoot: repo,
    founderBundle: health.founderBundle, founderFactGrounded: fact.grounded,
    frameworkQuestion: 'synthetic fallback (routing gate, independent of bundle)', result: 'PASS' }));
  if (!baseline) {
    // Both route bundles must share the once-per-process failure log sentinel.
    rmSync(path.join(task, 'knowledge/founder'));
    for (let i = 0; i < 2; i++) {
      const failed = await (await fetch(`${base}/api/health`)).json();
      assert.equal(failed.founderBundle.exists, false);
      assert.match(failed.founderBundle.error, /ENOENT/);
      assert.equal((await ask(`Show founder fact ${id}.`)).grounded, false);
    }
    assert.equal(output.split('\n').filter((line) => line.includes('[founder-bundle]')).length, 1);
    console.log('Missing-bundle health + assistant probes: one failure log per process; PASS');
  }
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await once(server, 'exit');
  }
  rmSync(temp, { recursive: true, force: true });
}
