import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/demo/assistant/route';
import { loadFounderFactIndex } from '../lib/bot/founder-corpus';

test('the shipped bundle is text only, bounded, and each manifest file is intact', () => {
  const root = path.join(process.cwd(), 'knowledge/founder');
  const [header, ...lines] = readFileSync(path.join(root, 'MANIFEST.tsv'), 'utf8').trim().split('\n');
  let total = 0;
  for (const line of lines) {
    const row = Object.fromEntries(header.split('\t').map((key, i) => [key, line.split('\t')[i]]));
    const bytes = readFileSync(path.join(root, row.path));
    assert.equal(bytes.length, Number(row.size));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256);
    assert.ok(bytes.length <= 256 * 1024);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assert.ok(!text.includes('\0'));
    total += bytes.length;
  }
  assert.ok(total < 20 * 1024 * 1024);
  assert.ok(lines.length > 1);
  const docs = readdirSync(path.join(root, '15_HT_FOUNDER_INTAKE/redacted'));
  assert.equal(docs.length, lines.length - 1);
  for (const name of docs) assert.ok(statSync(path.join(root, '15_HT_FOUNDER_INTAKE/redacted', name)).isFile());
});

test('unset environment loads shipped evidence and serves it with a source', async (t) => {
  const previous = process.env.LIMS_FOUNDER_KNOWLEDGE_DIR;
  delete process.env.LIMS_FOUNDER_KNOWLEDGE_DIR;
  t.after(() => {
    if (previous === undefined) delete process.env.LIMS_FOUNDER_KNOWLEDGE_DIR;
    else process.env.LIMS_FOUNDER_KNOWLEDGE_DIR = previous;
  });
  const facts = loadFounderFactIndex();
  assert.ok(facts.length > 0);
  const fact = facts.find((entry) => entry.text.includes('LIMS (Laboratory Information Management System) Administrator'))!;
  assert.ok(fact, 'real founder LIMS experience must be present');
  const response = await POST(new NextRequest('https://lims.bot/api/demo/assistant', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: `Show founder fact ${fact.id}.` }),
  }));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.grounded, true);
  assert.equal(result.answer, `Founder archive (historical experience): ${fact.text}`);
  assert.deepEqual(result.sources, [{ title: fact.title, path: fact.source }]);
  process.env.LIMS_FOUNDER_KNOWLEDGE_DIR = '/missing-explicit-founder-bundle';
  assert.deepEqual(loadFounderFactIndex(), [], 'an invalid explicit override never falls back');
});
