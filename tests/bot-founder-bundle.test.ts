import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/demo/assistant/route';
import { FOUNDER_NAME_ALLOWLIST } from '../lib/bot/founder-name-allowlist.mjs';
import { loadFounderFactIndex } from '../lib/bot/founder-corpus';

test('an override cannot self-authorize unlisted content or restore the forbidden intake folder', async (t) => {
  const { build, redact } = await import('../scripts/founder-bundle/build.mjs');
  const root = mkdtempSync(path.join(process.cwd(), '.founder-override-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const text = 'Hudson Taylor configured LIMS imports.';
  const sha = (value: string) => createHash('sha256').update(value).digest('hex');
  writeFileSync(path.join(root, 'career.txt'), text);
  const ownPolicy = path.join(root, 'ALLOWLIST.txt');
  writeFileSync(ownPolicy, ['career.txt', sha(text), sha(redact(text)), 'PUBLIC'].join('\t'));
  const output = path.join(root, 'bundle');
  build(root, output, ownPolicy);
  assert.deepEqual(loadFounderFactIndex(output), [], 'self-authored manifest and allow-list grant no runtime authority');
  mkdirSync(path.join(output, '15_HT_FOUNDER_INTAKE/redacted'), { recursive: true });
  writeFileSync(path.join(output, '15_HT_FOUNDER_INTAKE/redacted', sha(text) + '.txt'), text);
  assert.deepEqual(loadFounderFactIndex(output), []);
});

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
  assert.ok(lines.length >= 1);
  const docs = existsSync(path.join(root, '16_FOUNDER_PUBLIC/redacted')) ? readdirSync(path.join(root, '16_FOUNDER_PUBLIC/redacted')) : [];
  assert.equal(docs.length, lines.length - 1);
  for (const name of docs) assert.ok(statSync(path.join(root, '16_FOUNDER_PUBLIC/redacted', name)).isFile());
});

test('every shipped paragraph passes an independent private-identifier regex sweep', () => {
  // Enumerate files directly: a loader exclusion must never hide a shipped leak.
  const root = path.join(process.cwd(), 'knowledge/founder/16_FOUNDER_PUBLIC/redacted');
  const patterns = [
    /\b(?:medications?|surgery|diagnosis|appointments?|leave|therapy|prescriptions?|hospitals?|doctors?|symptoms?|recovery|patients?|DOB|MRN)\b/i,
    /\d{6,}/u,
    /\b(?:AMCAS|AAMC|SSN|DOB|passport|MRN|NPI|EIN)\b/i,
    /(?:\b(?:application|account|member|policy|licen[cs]e|case|reference|ID|No\.)(?:\s+(?:number|no\.?|ID))?\s*[:#=–—-]?\s*|#\s*)[A-Z]*-?\d[\w./-]*/i,
    /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i,
    /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/,
    /\bP\.?\s*O\.?\s*Box\s+\w+/i,
    /\b\d{1,6}\s+(?:[\w.'’-]+\s+){0,7}(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|circle|cir|boulevard|blvd|way|place|pl|terrace|ter|parkway|pkwy|highway|hwy)\b/i,
  ];
  let paragraphs = 0;
  for (const file of existsSync(root) ? readdirSync(root) : []) {
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
  const report = JSON.parse(readFileSync('knowledge/founder/BUILD_REPORT.json', 'utf8'));
  assert.equal(paragraphs, report.paragraphs, 'sweep covers every shipped paragraph occurrence');
});

test('AMCAS question and the previously exposed fact refuse with the spec text and no citation', async () => {
  const { EVIDENCE_MISSING_ANSWER } = await import('../lib/bot/engine');
  for (const question of [
    'What is Hudson Taylor’s AMCAS application ID?',
    'What is the founder AMCAS ID?',
    'What is the patient name in the founder archive?',
    'Show founder fact founder-fact-32746c8a53cc5412546797cc81334179',
    'Show founder fact founder-fact-2dbca2eb52bcbaf350700793a08a2ac9.',
    'Show founder fact founder-fact-52342c2e80ed887607b815d06695054e.',
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


test('intake and every unlisted document are absent, and report matches the actual inventory', async () => {
  const { parseFounderAllowlist } = await import('../lib/bot/founder-document-policy.mjs');
  const approved = parseFounderAllowlist(readFileSync('scripts/founder-bundle/ALLOWLIST.txt', 'utf8'));
  const root = path.join(process.cwd(), 'knowledge/founder');
  assert.equal(existsSync(path.join(root, '15_HT_FOUNDER_INTAKE')), false);
  const report = JSON.parse(readFileSync(path.join(root, 'BUILD_REPORT.json'), 'utf8'));
  const docs = existsSync(path.join(root, '16_FOUNDER_PUBLIC/redacted')) ? readdirSync(path.join(root, '16_FOUNDER_PUBLIC/redacted')) : [];
  assert.deepEqual(docs.sort(), approved.map(entry => entry.sha256 + '.txt').sort());
  assert.equal(report.documents, docs.length);
  assert.equal(loadFounderFactIndex().length, report.distinctParagraphs);
});

test('every remaining shipped paragraph is retrievable with its exact passage and citation', async (t) => {
  const root = 'knowledge/founder/16_FOUNDER_PUBLIC/redacted';
  const paragraphs = new Set((existsSync(root) ? readdirSync(root) : []).flatMap(file =>
    readFileSync(path.join(root, file), 'utf8').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)));
  const facts = loadFounderFactIndex();
  assert.deepEqual(new Set(facts.map(f => f.text)), paragraphs);
  for (const fact of facts) {
    for (const question of [`Show founder fact ${fact.id}.`, `What does the founder archive say about "${fact.title}"?`]) {
      const response = await POST(new NextRequest('https://lims.bot/api/demo/assistant', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }),
      }));
      const result = await response.json();
      assert.equal(result.grounded, true);
      assert.equal(result.answer, `Founder archive (historical experience): ${fact.text}`);
      assert.deepEqual(result.sources, [{ title: fact.title, path: fact.source }]);
    }
  }
  if (!facts.length) t.diagnostic('Empty shipped bundle: source selection and nonempty retrieval acceptance remain BLOCKED.');
});
