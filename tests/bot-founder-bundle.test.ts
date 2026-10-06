import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/demo/assistant/route';
import { FOUNDER_NAME_ALLOWLIST } from '../lib/bot/founder-name-allowlist.mjs';
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
  const docs = readdirSync(path.join(root, 'approved/redacted'));
  assert.equal(docs.length, lines.length - 1);
  for (const name of docs) assert.ok(statSync(path.join(root, 'approved/redacted', name)).isFile());
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
  const fact = facts.find((entry) => entry.text.includes('15 [name] in [name] [name]'))!;
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
  const root = path.join(process.cwd(), 'knowledge/founder/approved/redacted');
  const patterns = [
    /\b(?:medications?|surgery|diagnos(?:is|es|ed)|appointments?|leave|therapy|prescriptions?|hospitals?|doctors?|symptoms?|recovery|patients?|dob|mrn)\b/i,
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
      // Independent sweep: remove only whole allow-listed phrases, then look
      // for ANY uppercase/titlecase character, including inside mixed-case words.
      let unapproved = paragraph.normalize('NFKC').replace(/\p{Cf}/gu, '').normalize('NFC');
      for (const phrase of [...FOUNDER_NAME_ALLOWLIST].sort((a, b) => b.length - a.length)) {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[ \t]+');
        unapproved = unapproved.replace(new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])${escaped}(?![\\p{L}\\p{M}\\p{N}_])`, 'giu'), '');
      }
      assert.equal(/[\p{Lu}\p{Lt}]/u.test(unapproved), false, `unapproved capitalization in ${file}`);
    }
  }
  assert.equal(paragraphs, 79, 'sweep covers every remaining shipped paragraph occurrence');
});

test('AMCAS question and the previously exposed fact refuse with the spec text and no citation', async () => {
  const { EVIDENCE_MISSING_ANSWER } = await import('../lib/bot/engine');
  for (const question of [
    'What is Hudson Taylor’s AMCAS application ID?',
    'What is the founder AMCAS ID?',
    'What is the patient name in the founder archive?',
    'Show founder fact founder-fact-2dbca2eb52bcbaf350700793a08a2ac9',
    'Show founder fact founder-fact-2dbca2eb52bcbaf350700793a08a2ac9.',
    'Show founder fact founder-fact-52342c2e80ed887607b815d06695054e',
    'Show founder fact founder-fact-52342c2e80ed887607b815d06695054e.',
    'Show founder fact founder-fact-32746c8a53cc5412546797cc81334179',
    'Show founder fact founder-fact-32746c8a53cc5412546797cc81334179.',
    'Show founder fact founder-fact-cf8b47f380c5ec3adc5aa22bcdee1afa',
    'Show founder fact founder-fact-cf8b47f380c5ec3adc5aa22bcdee1afa.',

    'Show founder fact founder-fact-f5b392827c54da07c7cf476cbd353f4e',
    'Show founder fact founder-fact-f5b392827c54da07c7cf476cbd353f4e.',
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


test('the entire intake and every unlisted source are absent from shipped metadata and disk', () => {
  const root = path.join(process.cwd(), 'knowledge/founder');
  const report = JSON.parse(readFileSync(path.join(root, 'BUILD_REPORT.json'), 'utf8'));
  assert.deepEqual(readdirSync(root).sort(), ['BUILD_REPORT.json', 'MANIFEST.tsv', 'approved']);
  assert.equal(report.selection, 'ALLOWLIST_ONLY');
  assert.equal(report.documents, 2);
  assert.equal(report.paragraphOccurrences, 79);
  assert.equal(report.distinctParagraphs, 72);
  const policy = JSON.parse(readFileSync('scripts/founder-bundle/admission.json', 'utf8'));
  assert.deepEqual(readdirSync(path.join(root, 'approved/redacted')).sort(),
    policy.map((row: { sha256: string }) => `${row.sha256}.txt`).sort());
  for (const file of ['MANIFEST.tsv', 'approved/SOURCES.tsv']) {
    assert.ok(!readFileSync(path.join(root, file), 'utf8').includes('15_HT_FOUNDER_INTAKE'));
  }
});
