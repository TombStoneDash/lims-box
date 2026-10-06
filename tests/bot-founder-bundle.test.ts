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

test('every shipped paragraph passes an independent private-identifier regex sweep', () => {
  // Enumerate files directly: a loader exclusion must never hide a shipped leak.
  const root = path.join(process.cwd(), 'knowledge/founder/15_HT_FOUNDER_INTAKE/redacted');
  const names = new Set<string>(JSON.parse(readFileSync('scripts/founder-bundle/private-name-tokens.json', 'utf8')));
  const patterns = [
    /\d{6,}/u,
    /\b(?:AMCAS|AAMC|SSN|DOB|passport|MRN|NPI|EIN)\b/i,
    /(?:\b(?:application|account|member|policy|licen[cs]e|case|reference|ID|No\.)(?:\s+(?:number|no\.?|ID))?\s*[:#=–—-]?\s*|#\s*)[A-Z]*-?\d[\w./-]*/i,
    /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i,
    /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/,
    /\bP\.?\s*O\.?\s*Box\s+\w+/i,
    /\b\d{1,6}\s+(?:[\w.'’-]+\s+){0,7}(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|circle|cir|boulevard|blvd|way|place|pl|terrace|ter|parkway|pkwy|highway|hwy)\b/i,
  ];
  let paragraphs = 0;
  for (const file of readdirSync(root)) {
    const text = readFileSync(path.join(root, file), 'utf8');
    for (const paragraph of text.split(/\n\s*\n/).filter((p) => p.trim())) {
      paragraphs++;
      for (const pattern of patterns) {
        // Never echo a leaked value into CI logs on failure.
        assert.equal(pattern.test(paragraph), false, `private identifier class ${pattern.source} in ${file}`);
      }
      for (const [token] of paragraph.matchAll(/\p{L}+/gu)) {
        const hash = createHash('sha256').update(token.toLowerCase()).digest('hex');
        assert.equal(names.has(hash), false, `unredacted reviewed third-party name in ${file}`);
      }
    }
  }
  assert.ok(paragraphs > 500, 'privacy coverage must include the full bundle');
});

test('AMCAS question and the previously exposed fact refuse with the spec text and no citation', async () => {
  const { EVIDENCE_MISSING_ANSWER } = await import('../lib/bot/engine');
  for (const question of [
    'What is Hudson Taylor’s AMCAS application ID?',
    'What is the founder AMCAS ID?',
    'Show founder fact founder-fact-e26363e5401f95a4ff1f99f35a6f157f.',
  ]) {
    const response = await POST(new NextRequest('https://lims.bot/api/demo/assistant', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }),
    }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.answer, EVIDENCE_MISSING_ANSWER);
    assert.equal(result.grounded, false);
    assert.deepEqual(result.sources, []);
  }
});
