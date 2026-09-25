import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { corpus, COMPLIANCE_POSITIONING } from '../../lib/bot/corpus';
import { askBot, EVIDENCE_MISSING_ANSWER } from '../../lib/bot/engine';
import { filterCommercialClaims } from '../../lib/bot/output-claims-filter';
import { matchCommercialClaim } from '../../lib/bot/commercial-claims';

const ROOT = path.resolve(__dirname, '../..');
const CLAIMS_FILTER_EXEMPT_EXISTING: Record<string, string> = {
  'part-11': 'Existing published FAQ explicitly denies certification; the lexical filter still matches "Part 11 compliance".',
};
const KNOWN_UNVERIFIED: Record<string, string> = {
  'compliance-positioning': 'Locked brand copy is absent from published pages and their direct local imports; preserve verbatim pending publication.',
};

function normalize(text: string): string {
  const entities: Record<string, string> = {
    apos: "'", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"',
    mdash: '-', ndash: '-', amp: '&', nbsp: ' ', '#39': "'",
  };
  return text
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\{\s*(['"])\s+\1\s*\}/g, ' ')
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .replace(/&(?:apos|rsquo|lsquo|ldquo|rdquo|mdash|ndash|amp|nbsp|#39);/g,
      (entity) => entities[entity.slice(1, -1)])
    .replace(/\\(['"])/g, '$1')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ').trim();
}

function sentences(text: string): string[] {
  // Split only at punctuation followed by whitespace: keep decimals, section
  // numbers, email addresses, and prices intact. Include any final fragment.
  return normalize(text).split(/(?<=[.!?])\s+/).filter(Boolean);
}

function pageFile(source: string): string {
  assert.match(source, /^\/(?:[a-z0-9-]+\/)*[a-z0-9-]*$/);
  return path.join(ROOT, 'app', source.slice(1), 'page.tsx');
}

function publishedFiles(page: string): string[] {
  const source = readFileSync(page, 'utf8');
  const parsed = ts.createSourceFile(page, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const files = [page];
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    if (!/^(?:\.\/|@\/(?:components|content|data)\/)/.test(specifier)) continue;
    const base = specifier.startsWith('./')
      ? path.resolve(path.dirname(page), specifier)
      : path.join(ROOT, specifier.slice(2));
    const imported = ['', '.tsx', '.ts', '.jsx', '.js', '.json', '.md', '.mdx',
      '/index.tsx', '/index.ts', '/index.jsx', '/index.js']
      .map((suffix) => base + suffix)
      .find((file) => existsSync(file) && statSync(file).isFile());
    assert.ok(imported, `Cannot resolve local copy import ${specifier} from ${page}`);
    files.push(imported);
  }
  return [...new Set(files)];
}

function pageTexts(page: string): string[] {
  return publishedFiles(page).map((file) => normalize(readFileSync(file, 'utf8')));
}

function allPages(dir = path.join(ROOT, 'app')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? allPages(file) : entry.name === 'page.tsx' ? [file] : [];
  });
}

test('copy normalization handles JSX, entities, punctuation, and escaped data strings', () => {
  assert.equal(normalize('<p>It&apos;s <b>published</b>{\' \'}&ldquo;copy&rdquo;&nbsp;&mdash; yes.</p>'),
    'It\'s published "copy" - yes.');
  assert.equal(normalize('&rsquo;&lsquo;&rdquo;&ndash;&amp;&#39;'), '\'\'"-&\'');
  assert.equal(normalize("lab\\'s — ‘copy’ “here”"), 'lab\'s - \'copy\' "here"');
  assert.deepEqual(sentences('Method 200.8 costs $1,200.00. Email info@lims.bot. Done!'),
    ['Method 200.8 costs $1,200.00.', 'Email info@lims.bot.', 'Done!']);
});

test('corpus ids are unique and exceptions refer to existing entries', () => {
  assert.equal(new Set(corpus.map((entry) => entry.id)).size, corpus.length);
  for (const id of [...Object.keys(CLAIMS_FILTER_EXEMPT_EXISTING), ...Object.keys(KNOWN_UNVERIFIED)]) {
    assert.ok(corpus.some((entry) => entry.id === id), `Stale exception: ${id}`);
  }
});

for (const entry of corpus) {
  test(`${entry.id}: every sentence is published at ${entry.source}`, (t) => {
    const page = pageFile(entry.source);
    assert.ok(existsSync(page), `${entry.id}: missing source file ${page}`);
    assert.ok(entry.keywords.length >= 3, `${entry.id}: requires at least three keywords`);
    assert.ok(entry.text.trim(), `${entry.id}: empty text`);
    if (KNOWN_UNVERIFIED[entry.id]) {
      assert.equal(entry.id, 'compliance-positioning');
      assert.equal(entry.text, COMPLIANCE_POSITIONING);
      t.diagnostic(KNOWN_UNVERIFIED[entry.id]);
      return;
    }
    const texts = pageTexts(page);
    const missing = sentences(entry.text).filter((sentence) => !texts.some((text) => text.includes(sentence)));
    assert.deepEqual(missing, [], `${entry.id}: missing sentence(s) in ${page}:\n${missing.join('\n')}`);
  });

  test(`${entry.id}: passes both commercial claims filters or a documented existing exception`, () => {
    const filtered = filterCommercialClaims(entry.text);
    const matched = matchCommercialClaim(entry.text);
    if (CLAIMS_FILTER_EXEMPT_EXISTING[entry.id]) {
      assert.ok(filtered.blocked && matched, `${entry.id}: remove obsolete claims exception`);
      return;
    }
    assert.equal(filtered.blocked, false, `${entry.id}: ${filtered.matchedCategory}`);
    assert.equal(matched, null, `${entry.id}: forbidden commercial claim`);
  });
}

test('locked compliance positioning is published verbatim or explicitly known-unverified', (t) => {
  const found = allPages().some((page) => publishedFiles(page)
    .some((file) => readFileSync(file, 'utf8').includes(COMPLIANCE_POSITIONING)));
  if (KNOWN_UNVERIFIED['compliance-positioning']) {
    assert.equal(found, false, 'Positioning is now published: remove KNOWN_UNVERIFIED exception');
    t.diagnostic(KNOWN_UNVERIFIED['compliance-positioning']);
  } else {
    assert.ok(found, 'Locked COMPLIANCE_POSITIONING is not verbatim in any published page or direct local import');
  }
});

test('unrelated questions still return the evidence-missing answer', () => {
  const result = askBot('Who won the lunar chess championship?');
  assert.equal(result.grounded, false);
  assert.equal(result.answer, EVIDENCE_MISSING_ANSWER);
  assert.deepEqual(result.sources, []);
});

const NEW_ENTRY_QUESTIONS = [
  ['personnel-pack', 'what is the personnel pack'],
  ['clia-tracker', 'do you have a clia tracker'],
  ['survey-ready-export', 'what is survey-ready export'],
  ['roi-calculator', 'what is the roi calculator'],
] as const;

for (const [id, question] of NEW_ENTRY_QUESTIONS) {
  test(`${id}: published product description is returned without lead routing`, () => {
    const entry = corpus.find((candidate) => candidate.id === id);
    assert.ok(entry);
    assert.ok(entry.keywords.length >= 6 && entry.keywords.length <= 12);
    assert.ok(entry.keywords.every((keyword) => keyword === keyword.toLowerCase()));
    assert.doesNotMatch(entry.text, /[$£€]|\b(?:price|cost|dollars?|usd)\b/i);
    assert.ok(sentences(entry.text).length >= 1 && sentences(entry.text).length <= 3);
    assert.equal(CLAIMS_FILTER_EXEMPT_EXISTING[id], undefined);
    assert.equal(KNOWN_UNVERIFIED[id], undefined);
    const result = askBot(question);
    assert.equal(result.grounded, true);
    assert.equal(result.followUp, undefined);
    if (id === 'clia-tracker') {
      // The existing compliance guard prepends locked positioning and its
      // citation. Preserve that contract without changing the engine.
      assert.equal(result.answer, `${COMPLIANCE_POSITIONING} ${entry.text}`);
      assert.equal(result.sources[0].path, '/compliance');
      assert.equal(result.sources[1].path, entry.source);
      const neutral = askBot('what is the tracker');
      assert.equal(neutral.grounded, true);
      assert.equal(neutral.answer, entry.text);
      assert.equal(neutral.sources[0].path, entry.source);
    } else {
      assert.equal(result.answer, entry.text);
      assert.equal(result.sources[0].path, entry.source);
    }
  });
}
