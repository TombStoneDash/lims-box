// Release coverage gate. Run with the merged bundle staged inside this repository:
// LIMS_FOUNDER_KNOWLEDGE_DIR=<bundle> node --import tsx --test tests/bot/founder-inventory.integration.ts
// Missing inventory is a failure, never an empty-domain success or a skipped test.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '../../app/api/demo/assistant/route';
import { loadFounderIndex } from '../../lib/bot/founder-corpus';
import { admitFounderSource, type FounderManifestRow, type FounderSourceRow } from '../../lib/bot/source-registry';

function rows<T>(text: string): T[] {
  const [header, ...lines] = text.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  const columns = header.split('\t');
  return lines.map((line) => Object.fromEntries(line.split('\t').map((value, i) => [columns[i], value])) as T);
}

test('every approved merged-file paragraph is covered by the live assistant API', async () => {
  const root = process.env.LIMS_FOUNDER_KNOWLEDGE_DIR;
  assert.ok(root, 'Merged founder bundle is required for archive coverage verification.');
  const manifest = rows<FounderManifestRow>(readFileSync(path.join(root, 'MANIFEST.tsv'), 'utf8'));
  const sourcePath = '15_HT_FOUNDER_INTAKE/SOURCES.tsv';
  const sourceBytes = readFileSync(path.join(root, sourcePath));
  const sourceRecord = manifest.find((row) => row.path === sourcePath)!;
  assert.ok(sourceRecord, 'Source map must be in the merged manifest.');
  assert.equal(sourceBytes.length, Number(sourceRecord.size));
  assert.ok(createHash('sha256').update(sourceBytes).digest('hex') === sourceRecord.sha256, 'Source map digest mismatch.');
  const sources = rows<FounderSourceRow>(sourceBytes.toString('utf8'));
  const expected = new Map<string, string>();
  for (const record of manifest) {
    const matches = sources.filter((source) => source.redacted === record.path);
    if (matches.length !== 1 || !admitFounderSource(record, matches[0])) continue;
    const bytes = readFileSync(path.join(root, record.path));
    assert.equal(bytes.length, Number(record.size));
    assert.ok(createHash('sha256').update(bytes).digest('hex') === record.sha256, 'Document digest mismatch.');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    for (const paragraph of text.split(/\r?\n[ \t]*\r?\n/).filter((p) => p.trim())) {
      const key = paragraph.replace(/\s+/g, ' ').trim();
      if (!expected.has(key)) expected.set(key, `Founder archive (historical experience): ${paragraph}`);
    }
  }
  assert.ok(expected.size > 0, 'Approved fact inventory must not be empty.');
  const index = loadFounderIndex(root);
  // A source veto must be resolved before claiming exhaustive coverage; never
  // silently reduce this independently read inventory to whatever the loader emits.
  assert.equal(index.length, expected.size);
  assert.ok([...expected.values()].every((text) => index.some((entry) => entry.text === text)),
    'Approved paragraph inventory differs from the index. No source text is logged.');
  for (const passage of expected.values()) {
    const fact = index.find((entry) => entry.text === passage)!;
    for (const form of ['What is the founder fact', 'Tell me about the founder fact', 'Quote the founder fact']) {
      const response = await POST(new NextRequest('http://localhost/api/demo/assistant', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: `${form} "${fact.id}"?` }),
      }));
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.grounded, true);
      assert.ok(result.answer === passage, 'API passage differs from the source.');
      assert.deepEqual(result.sources, [{ title: fact.title, path: fact.source }]);
    }
  }
});
