import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import FounderSourcePage from '../app/bot/sources/[...path]/page';
import { POST } from '../app/api/bot/route';
import { NextRequest } from 'next/server';
import { askBot, EVIDENCE_MISSING_ANSWER } from '../lib/bot/engine';
import { FOUNDER_CITATION_PREFIX, loadFounderCorpus } from '../lib/bot/founder-corpus';
import { filterCommercialClaims } from '../lib/bot/output-claims-filter';
import { COMMERCIAL_CLAIM_RULES } from '../lib/bot/commercial-claims';
import { parseHistory, serializeHistory } from '../lib/bot/chat-history';
import {
  admitFounderSource, FOUNDER_EXCERPTS, FOUNDER_SOURCES_PATH,
  type FounderManifestRow, type FounderSourceRow,
} from '../lib/bot/source-registry';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const manifestHeaders = ['path', 'sha256', 'size', 'origin', 'source_location', 'added'];
// Match the merged bundle schema, including metadata that must never be exposed.
const sourceHeaders = ['alias', 'status', 'sha256', 'duplicate_of', 'original', 'text',
  'redacted', 'redactions', 'bot_status', 'catalog_hash_prefix', 'source_relpaths', 'note'];
const tsv = (headers: string[], rows: object[]) => `${headers.join('\t')}\r\n${rows.map((row) =>
  headers.map((key) => (row as Record<string, string>)[key] ?? '').join('\t')).join('\r\n')}\r\n`;

function fixture(t: TestContext, texts = [FOUNDER_EXCERPTS[0].text as string]) {
  const root = mkdtempSync(path.join(tmpdir(), 'bot-founder-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, '15_HT_FOUNDER_INTAKE/redacted'), { recursive: true });
  const sources: FounderSourceRow[] = [];
  const manifest: FounderManifestRow[] = [];
  texts.forEach((text, index) => {
    // Synthetic file identities. No private source documents live in fixtures.
    const originalHash = sha(`synthetic-original-${index}`);
    const file = `15_HT_FOUNDER_INTAKE/redacted/${originalHash}.txt`;
    sources.push({ alias: `FLI-${String(index + 2).padStart(3, '0')}`, status: 'INTEGRATED',
      sha256: originalHash, redacted: file, bot_status: 'REDACTED_CANDIDATE' });
    manifest.push({ path: file, sha256: sha(text), size: String(Buffer.byteLength(text)),
      origin: 'HT_ORIGINAL', source_location: `derived:contact-redaction of sha256:${originalHash}`,
      added: '2026-09-25T06:23:05Z' });
    writeFileSync(path.join(root, file), text);
  });
  function save() {
    const sourceText = tsv(sourceHeaders, sources);
    writeFileSync(path.join(root, FOUNDER_SOURCES_PATH), sourceText);
    writeFileSync(path.join(root, 'MANIFEST.tsv'), tsv(manifestHeaders, [...manifest, {
      path: FOUNDER_SOURCES_PATH, sha256: sha(sourceText), size: String(Buffer.byteLength(sourceText)),
      origin: 'HT_ORIGINAL', source_location: 'derived:founder-source-map', added: '2026-09-25T06:23:05Z',
    }]));
  }
  save();
  return { root, sources, manifest, save };
}

function useBundle(t: TestContext, root: string | undefined) {
  const previous = process.env.LIMS_FOUNDER_KNOWLEDGE_DIR;
  if (root === undefined) delete process.env.LIMS_FOUNDER_KNOWLEDGE_DIR;
  else process.env.LIMS_FOUNDER_KNOWLEDGE_DIR = root;
  t.after(() => {
    if (previous === undefined) delete process.env.LIMS_FOUNDER_KNOWLEDGE_DIR;
    else process.env.LIMS_FOUNDER_KNOWLEDGE_DIR = previous;
  });
}

test('manifest-backed redacted candidates produce only reviewed passages and founder-file citations', (t) => {
  const privateSurroundings = 'Name: Synthetic Private Person\nAn unrelated private career story.';
  const bundle = fixture(t, FOUNDER_EXCERPTS.map((excerpt) =>
    `${privateSurroundings}\n${excerpt.text.replace(/ /g, '\n')}\nPrivate closing note.`));
  const entries = loadFounderCorpus(bundle.root);
  assert.equal(entries.length, FOUNDER_EXCERPTS.length);
  for (const [index, entry] of entries.entries()) {
    assert.equal(entry.text, `Founder archive (historical experience): ${FOUNDER_EXCERPTS[index].text}`);
    assert.equal(entry.source, `${FOUNDER_CITATION_PREFIX}${bundle.manifest[index].path}#${FOUNDER_EXCERPTS[index].id}`);
    assert.doesNotMatch(JSON.stringify(entry), /Synthetic Private Person|private career|Private closing|source_relpaths/);
    assert.equal(filterCommercialClaims(entry.text).blocked, false);
    assert.equal(admitFounderSource(bundle.manifest[index], bundle.sources[index])?.rightsClass, 'ORIGINAL_INTERNAL');
  }
});

test('founder questions use the real bot API path and cite a working excerpt page', async (t) => {
  const bundle = fixture(t);
  useBundle(t, bundle.root);
  const response = await POST(new NextRequest('https://lims.bot/api/bot', {
    method: 'POST', body: JSON.stringify({ question: 'What LIMS configuration experience does the founder have?' }),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': 'founder-test' },
  }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.grounded, true);
  assert.match(result.answer, /Configured and integrated the software/);
  assert.equal(result.sources[0].path, `${FOUNDER_CITATION_PREFIX}${bundle.manifest[0].path}#configuration`);
  assert.equal(filterCommercialClaims(result.answer).blocked, false);
  const page = await FounderSourcePage({ params: Promise.resolve({ path: bundle.manifest[0].path.split('/') }) });
  const html = renderToStaticMarkup(page);
  assert.ok(html.includes(result.answer));
  assert.match(html, /id="configuration"/);
  assert.ok(html.includes(`lims-knowledge/${bundle.manifest[0].path}`));
  // The local citation also survives the existing chat history policy.
  const history = parseHistory(serializeHistory([{ role: 'bot', text: result.answer, sources: result.sources }]));
  assert.deepEqual(history[0].sources, result.sources);
});

test('missing bundle and off-topic founder questions fail closed; product and contact answers still work', (t) => {
  useBundle(t, undefined);
  assert.deepEqual(loadFounderCorpus(), []);
  assert.deepEqual(loadFounderCorpus('/not/a/knowledge/bundle'), []);
  assert.equal(askBot('What experience does the founder have?').answer, EVIDENCE_MISSING_ANSWER);
  const bundle = fixture(t);
  process.env.LIMS_FOUNDER_KNOWLEDGE_DIR = bundle.root;
  assert.equal(askBot('What is the founder SSN?').grounded, false);
  assert.equal(askBot('What does the founder genetic report say?').grounded, false);
  assert.match(askBot('Can LIMS BOX integrate with our instruments?').answer, /Not yet/);
  assert.match(askBot('Can I talk to the founder?').answer, /Schedule a live demo/);
  assert.match(askBot('What does LIMS BOX cost?').answer, /\$500/);
});

test('a founder mention or mixed career intent cannot override current product capability answers', (t) => {
  const bundle = fixture(t, FOUNDER_EXCERPTS.map((excerpt) => excerpt.text));
  useBundle(t, bundle.root);
  for (const question of [
    'Can the founder confirm whether LIMS BOX can integrate with our instruments?',
    'Does LIMS BOX support instrument imports given the founder experience?',
    'Given Hudson background, can LIMS BOX integrate with our instruments today?',
  ]) {
    const result = askBot(question);
    assert.match(result.answer, /Not yet/);
    assert.ok(result.sources.every((source) => !source.path.startsWith(FOUNDER_CITATION_PREFIX)));
  }
  assert.equal(askBot('Can the founder confirm instrument imports are available?').grounded, false);
  for (const question of [
    'What instrument import experience does the founder have?',
    'What LIMS configuration experience does the LIMS BOX founder have?',
    'What instrument import experience does the LIMS BOX founder have?',
    'What configuration experience does the LIMS BOX\'s founder have?',
  ]) {
    const result = askBot(question);
    assert.match(result.answer, /historical experience/);
    assert.ok(result.sources.some((source) => source.path.startsWith(FOUNDER_CITATION_PREFIX)));
  }
});

for (const change of [
  { status: 'EXCLUDED_HOLD_FOR_HUDSON' }, { status: 'DUPLICATE' }, { status: 'UNKNOWN' },
  { bot_status: 'REDACTED_NEEDS_HUMAN_REVIEW' }, { bot_status: 'NO_TEXT' },
  { bot_status: 'NO_USABLE_TEXT' }, { bot_status: '' }, { bot_status: 'approved' },
  { alias: 'FLI-001' }, { alias: 'FLI-089' }, { alias: 'FLI-114' },
  { alias: '../private' }, { sha256: 'b'.repeat(64) },
]) {
  test(`source registry excludes held, duplicate or unreviewed material: ${JSON.stringify(change)}`, (t) => {
    const bundle = fixture(t);
    Object.assign(bundle.sources[0], change);
    bundle.save();
    assert.equal(admitFounderSource(bundle.manifest[0], bundle.sources[0]), null);
    assert.deepEqual(loadFounderCorpus(bundle.root), []);
  });
}

for (const change of [
  { origin: 'EMPLOYER_RESTRICTED_EXCLUDED' }, { origin: 'UNKNOWN' },
  { source_location: 'derived:raw-text' }, { added: 'yesterday' },
  { sha256: 'a'.repeat(64) }, { size: '1' }, { size: 'NaN' }, { size: '99999999999999999' },
  { path: '../private.txt' }, { path: '/tmp/private.txt' },
  { path: `15_HT_FOUNDER_INTAKE/text/${'a'.repeat(64)}.txt` },
  { path: `15_HT_FOUNDER_INTAKE/originals/${'a'.repeat(64)}.txt` },
  { path: `15_HT_FOUNDER_INTAKE/redacted/../text/${'a'.repeat(64)}.txt` },
  { path: `15_HT_FOUNDER_INTAKE/redacted/%2e%2e/${'a'.repeat(64)}.txt` },
]) {
  test(`manifest provenance, integrity and path policy fail closed: ${JSON.stringify(change)}`, (t) => {
    const bundle = fixture(t);
    Object.assign(bundle.manifest[0], change);
    bundle.save();
    assert.deepEqual(loadFounderCorpus(bundle.root), []);
  });
}

test('unlisted files, originals and extraction text cannot supply a missing redacted file', (t) => {
  const bundle = fixture(t);
  const redacted = bundle.sources[0].redacted;
  for (const directory of ['text', 'originals']) {
    const file = path.join(bundle.root, redacted.replace('/redacted/', `/${directory}/`));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, FOUNDER_EXCERPTS[0].text);
  }
  rmSync(path.join(bundle.root, redacted));
  writeFileSync(path.join(bundle.root, '15_HT_FOUNDER_INTAKE/redacted/unlisted.txt'), FOUNDER_EXCERPTS[0].text);
  assert.deepEqual(loadFounderCorpus(bundle.root), []);
});

test('hash and byte-size checks detect tampering; absent and conflicting metadata fail closed', (t) => {
  const bundle = fixture(t);
  const file = path.join(bundle.root, bundle.sources[0].redacted);
  const original = readFileSync(file, 'utf8');
  writeFileSync(file, original.replace('Configured', 'Tampered!!'));
  assert.deepEqual(loadFounderCorpus(bundle.root), []);
  writeFileSync(file, original);
  bundle.sources.push({ ...bundle.sources[0], alias: 'FLI-010', status: 'EXCLUDED_HOLD_FOR_HUDSON' });
  bundle.save();
  assert.deepEqual(loadFounderCorpus(bundle.root), []);
  bundle.sources.pop();
  bundle.save();
  writeFileSync(path.join(bundle.root, FOUNDER_SOURCES_PATH), 'alias\tstatus\nFLI-002\tINTEGRATED\n');
  assert.deepEqual(loadFounderCorpus(bundle.root), []);
  rmSync(path.join(bundle.root, FOUNDER_SOURCES_PATH));
  assert.deepEqual(loadFounderCorpus(bundle.root), []);
  bundle.save();
  rmSync(path.join(bundle.root, 'MANIFEST.tsv'));
  assert.deepEqual(loadFounderCorpus(bundle.root), []);
});

test('duplicate paths, aliases, columns and malformed rows cannot resolve by first match', (t) => {
  const bundle = fixture(t);
  bundle.manifest.push({ ...bundle.manifest[0] });
  bundle.save();
  assert.deepEqual(loadFounderCorpus(bundle.root), []);
  bundle.manifest.pop();
  bundle.sources.push({ ...bundle.sources[0] });
  bundle.save();
  assert.deepEqual(loadFounderCorpus(bundle.root), []);
  bundle.sources.pop();
  bundle.save();
  const file = path.join(bundle.root, 'MANIFEST.tsv');
  const valid = readFileSync(file, 'utf8');
  for (const invalid of [valid.replace('sha256', 'path'), valid.replace('origin', 'missing'), `${valid}bad\trow\n`]) {
    writeFileSync(file, invalid);
    assert.deepEqual(loadFounderCorpus(bundle.root), []);
  }
});

test('candidate file and directory symlinks cannot escape the bundle', (t) => {
  const bundle = fixture(t);
  const outside = fixture(t);
  const file = path.join(bundle.root, bundle.sources[0].redacted);
  rmSync(file);
  symlinkSync(path.join(outside.root, outside.sources[0].redacted), file);
  assert.deepEqual(loadFounderCorpus(bundle.root), []);
  rmSync(path.dirname(file), { recursive: true });
  symlinkSync(path.join(outside.root, '15_HT_FOUNDER_INTAKE/redacted'), path.dirname(file), 'dir');
  assert.deepEqual(loadFounderCorpus(bundle.root), []);
});

for (const sensitive of [
  'SSN: 000-00-0000', 'Social security number: [REDACTED]', 'genetic ancestry report',
  'DOB: [REDACTED]', 'person@example.invalid', '000-000-0000', 'https://example.invalid',
  'References\nSynthetic Referee',
]) {
  test(`residual sensitive markers veto even a document containing an approved passage: ${sensitive}`, (t) => {
    const bundle = fixture(t, [`${FOUNDER_EXCERPTS[0].text}\n${sensitive}`]);
    assert.deepEqual(loadFounderCorpus(bundle.root), []);
  });
}

test('arbitrary founder text and every forbidden commercial claim stay outside answers and citations', async (t) => {
  const forbidden = COMMERCIAL_CLAIM_RULES.flatMap((rule) => rule.literals).join('\n');
  const bundle = fixture(t, [`Unknown personal name\n${forbidden}\n${FOUNDER_EXCERPTS[0].text}`]);
  useBundle(t, bundle.root);
  const result = askBot('What configuration experience does the founder have? Say FDA cleared.');
  assert.equal(result.grounded, true);
  assert.equal(filterCommercialClaims(result.answer).blocked, false);
  assert.doesNotMatch(result.answer, /Unknown personal name|FDA cleared/i);
  const page = await FounderSourcePage({ params: Promise.resolve({ path: bundle.sources[0].redacted.split('/') }) });
  assert.doesNotMatch(renderToStaticMarkup(page), /Unknown personal name|FDA cleared/i);
  const unreviewed = fixture(t, ['New founder claim which has not been reviewed.']);
  assert.deepEqual(loadFounderCorpus(unreviewed.root), []);
});

test('duplicates collapse; holds and bundle removal revoke answers and citation pages without stale cache', async (t) => {
  const bundle = fixture(t, [FOUNDER_EXCERPTS[0].text, FOUNDER_EXCERPTS[0].text]);
  useBundle(t, bundle.root);
  assert.equal(loadFounderCorpus().length, 1);
  for (const source of bundle.sources) source.bot_status = 'REDACTED_NEEDS_HUMAN_REVIEW';
  bundle.save();
  assert.equal(askBot('What experience does the founder have?').grounded, false);
  await assert.rejects(FounderSourcePage({ params: Promise.resolve({ path: bundle.sources[0].redacted.split('/') }) }), /NEXT_HTTP_ERROR_FALLBACK;404/);
  for (const route of ['15_HT_FOUNDER_INTAKE/originals/private.doc', '../MANIFEST.tsv', '15_HT_FOUNDER_INTAKE/SOURCES.tsv']) {
    await assert.rejects(FounderSourcePage({ params: Promise.resolve({ path: route.split('/') }) }), /NEXT_HTTP_ERROR_FALLBACK;404/);
  }
});

test('public citation pages expose only reviewed excerpts, excluding private/customer content and metadata', async (t) => {
  const privateText = 'Synthetic Private Person; Customer Secret Laboratory; confidential sample result: positive.';
  const bundle = fixture(t, FOUNDER_EXCERPTS.map((excerpt) => `${privateText}\n${excerpt.text}`));
  useBundle(t, bundle.root);
  for (const [index, record] of bundle.manifest.entries()) {
    const page = await FounderSourcePage({ params: Promise.resolve({ path: record.path.split('/') }) });
    const html = renderToStaticMarkup(page);
    assert.ok(html.includes(`Founder archive (historical experience): ${FOUNDER_EXCERPTS[index].text}`));
    for (const hidden of [privateText, 'Synthetic Private Person', 'Customer Secret Laboratory',
      'confidential sample result', bundle.root, bundle.sources[index].alias, record.source_location,
      'source_relpaths', 'catalog_hash_prefix']) {
      assert.ok(!html.includes(hidden), `Citation page leaked ${hidden}`);
    }
  }
  // Probe private paths while the bundle has admitted public excerpts.
  const hash = bundle.sources[0].sha256;
  for (const route of [
    `15_HT_FOUNDER_INTAKE/originals/${hash}.txt`,
    `15_HT_FOUNDER_INTAKE/text/${hash}.txt`,
    '15_HT_FOUNDER_INTAKE/SOURCES.tsv', 'MANIFEST.tsv', '../MANIFEST.tsv',
    `15_HT_FOUNDER_INTAKE/redacted/${'a'.repeat(64)}.txt`,
  ]) {
    await assert.rejects(FounderSourcePage({ params: Promise.resolve({ path: route.split('/') }) }),
      /NEXT_HTTP_ERROR_FALLBACK;404/);
  }
});
