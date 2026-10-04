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
import { askBot, classifyQuestionIntent, type QuestionIntent, EVIDENCE_MISSING_ANSWER } from '../lib/bot/engine';
import { corpus, COMPLIANCE_POSITIONING } from '../lib/bot/corpus';
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

test('manifest-backed redacted candidates produce only reviewed passages and public excerpt citations', (t) => {
  const privateSurroundings = 'Name: Synthetic Private Person\nAn unrelated private career story.';
  const bundle = fixture(t, FOUNDER_EXCERPTS.map((excerpt) =>
    `${privateSurroundings}\n${excerpt.text.replace(/ /g, '\n')}\nPrivate closing note.`));
  const entries = loadFounderCorpus(bundle.root);
  assert.equal(entries.length, FOUNDER_EXCERPTS.length);
  for (const [index, entry] of entries.entries()) {
    assert.equal(entry.text, `Founder archive (historical experience): ${FOUNDER_EXCERPTS[index].text}`);
    assert.equal(entry.source, `${FOUNDER_CITATION_PREFIX}founder-${FOUNDER_EXCERPTS[index].id}#${FOUNDER_EXCERPTS[index].id}`);
    assert.doesNotMatch(JSON.stringify(entry), /Synthetic Private Person|private career|Private closing|source_relpaths/);
    assert.doesNotMatch(JSON.stringify(entry), /[a-f0-9]{64}|15_HT_FOUNDER_INTAKE|sha256|FLI-\d{3}/);
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
  assert.equal(result.sources[0].path, `${FOUNDER_CITATION_PREFIX}founder-configuration#configuration`);
  assert.equal(filterCommercialClaims(result.answer).blocked, false);
  const page = await FounderSourcePage({ params: Promise.resolve({ path: ['founder-configuration'] }) });
  const html = renderToStaticMarkup(page);
  assert.ok(html.includes(result.answer));
  assert.match(html, /id="configuration"/);
  assert.doesNotMatch(html + JSON.stringify(result), /[a-f0-9]{64}|15_HT_FOUNDER_INTAKE|sha256|lims-knowledge/);
  // The local citation also survives the existing chat history policy.
  const history = parseHistory(serializeHistory([{ role: 'bot', text: result.answer, sources: result.sources }]));
  assert.deepEqual(history[0].sources, result.sources);
});

test('missing bundle and off-topic founder questions fail closed; product and contact answers still work', (t) => {
  useBundle(t, undefined);
  assert.deepEqual(loadFounderCorpus(), []);
  assert.deepEqual(loadFounderCorpus('/not/a/knowledge/bundle'), []);
  // General background is the published /about bio; archive topics fail closed.
  assert.equal(askBot('What experience does the founder have?').answer, corpus.find((item) => item.id === 'founder-bio')!.text);
  assert.equal(askBot('What configuration experience does the founder have?').answer, EVIDENCE_MISSING_ANSWER);
  const bundle = fixture(t);
  process.env.LIMS_FOUNDER_KNOWLEDGE_DIR = bundle.root;
  assert.equal(askBot('What is the founder SSN?').grounded, false);
  assert.equal(askBot('Tell me about the founder SSN').grounded, false);
  assert.equal(askBot('Who has the founder genetic report?').grounded, false);
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
    "Are instrument imports supported by LIMS BOX given Hudson's experience?",
    "Is instrument import supported by LIMS Box given Hudson's experience?",
    "Can instrument data be imported given Hudson's experience?",
    "Given Hudson's experience, instrument import availability in LIMS BOX?",
  ]) {
    const result = askBot(question);
    assert.match(result.answer, /Not yet/);
    assert.ok(result.sources.every((source) => !source.path.startsWith(FOUNDER_CITATION_PREFIX)));
  }
  assert.match(askBot('Can the founder confirm instrument imports are available?').answer, /Not yet/);
  for (const question of [
    'What instrument import experience does the founder have?',
    'What instrument import experience has Hudson had?',
    "What is Hudson's background in instrument imports?",
    'What did Hudson implement for instrument imports?',
    'What training experience does Hudson have?',
    'What data recovery experience does Hudson have?',
    'What LIMS configuration experience does the LIMS BOX founder have?',
    'What instrument import experience does the LIMS BOX founder have?',
    'What configuration experience does the LIMS BOX\'s founder have?',
  ]) {
    const result = askBot(question);
    assert.match(result.answer, /historical experience/);
    assert.ok(result.sources.some((source) => source.path.startsWith(FOUNDER_CITATION_PREFIX)));
  }
});

// Intent and observable answers are both asserted: a correct label alone must
// not conceal a fallback to pricing or a historical answer to a capability ask.
const intentCases: { question: string; intent: QuestionIntent; entry?: string; excerpt?: string }[] = [
  { question: 'Tell me about the founder of LIMS BOX', intent: 'founder', entry: 'founder-bio' },
  { question: 'Who is the founder?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Who is Hudson?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Who founded LIMS Box?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Who built LIMS BOT?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Who built it?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Who was it founded by?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Who created LIMS BOX?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Who was LIMS Box founded by?', intent: 'founder', entry: 'founder-bio' },
  { question: 'By whom was LIMS BOT built?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Who is the founder of LIMS Box?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Tell me about the LIMS BOT founder', intent: 'founder', entry: 'founder-bio' },
  // Every published form of the founder's name, and bio wording (HUD review at 24d29712).
  { question: 'Who is Hudson Taylor?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Who is John Hudson Taylor?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Who is Hud Taylor?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Tell me about Hudson Taylor', intent: 'founder', entry: 'founder-bio' },
  { question: 'founder bio', intent: 'founder', entry: 'founder-bio' },
  { question: 'Hudson Taylor bio', intent: 'founder', entry: 'founder-bio' },
  { question: "What is the founder's name?", intent: 'founder', entry: 'founder-bio' },
  { question: "Who's behind LIMS BOX?", intent: 'founder', entry: 'founder-bio' },
  { question: 'Who made LIMS BOX?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Who is Hudson Taylor and what is his background?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Who is Mr. Taylor?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Who started this company?', intent: 'founder', entry: 'founder-bio' },
  { question: 'What company did the founder work for?', intent: 'founder', entry: 'founder-bio' },
  // Requests to the bot wrap the real question (HUD review at 07bbab81).
  { question: 'Could you tell me who John Hudson Taylor is?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Do you know who built LIMS BOX?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Please introduce John Hudson Taylor.', intent: 'founder', entry: 'founder-bio' },
  { question: 'Do you have any info on the founder?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Is it true that the founder built LIMS BOX?', intent: 'founder', entry: 'founder-bio' },
  // HUD review at d51b5805.
  { question: 'Who exactly is John Hudson Taylor?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Who, exactly, founded LIMS BOX?', intent: 'founder', entry: 'founder-bio' },
  { question: "Could you summarize Hudson's career?", intent: 'founder', entry: 'founder-bio' },
  { question: "Give me an overview of Hud Taylor's career.", intent: 'founder', entry: 'founder-bio' },
  { question: 'What can you tell me about John Hudson Taylor?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Would you please introduce me to the founder of LIMS BOX?', intent: 'founder', entry: 'founder-bio' },
  // A person's certifications and lab history are background, not product compliance.
  { question: 'What prior laboratory experience has Hud Taylor had?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Was Hudson certified as a water specialist?', intent: 'founder', entry: 'founder-bio' },
  { question: 'What certifications has John Hudson Taylor earned?', intent: 'founder', entry: 'founder-bio' },
  { question: 'What experience does the founder have, if any?', intent: 'founder', entry: 'founder-bio' },
  // General background, and history topics the bio states.
  { question: 'What is the background of the founder of LIMS Box?', intent: 'founder', entry: 'founder-bio' },
  { question: "What is the founder's background?", intent: 'founder', entry: 'founder-bio' },
  { question: 'What experience does the founder have?', intent: 'founder', entry: 'founder-bio' },
  { question: "Tell me about Hudson's experience", intent: 'founder', entry: 'founder-bio' },
  { question: 'What experience does Hudson have with water testing?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Has Hudson worked in public health?', intent: 'founder', entry: 'founder-bio' },
  { question: 'Does the founder have a degree?', intent: 'founder', entry: 'founder-bio' },
  { question: 'What experience does the founder of LIMS BOX have with configuration?', intent: 'founder', excerpt: 'configuration' },
  { question: 'What is the configuration background of the LIMS BOX founder?', intent: 'founder', excerpt: 'configuration' },
  { question: 'What training experience does the founder of LIMS BOT have?', intent: 'founder', excerpt: 'training' },
  { question: "What is Hudson's background in instrument imports?", intent: 'founder', excerpt: 'instrument-imports' },
  { question: 'What did Hudson implement for instrument imports?', intent: 'founder', excerpt: 'instrument-imports' },
  { question: 'What was configured by the LIMS Box founder in the past?', intent: 'founder', excerpt: 'configuration' },
  { question: 'Which technicians were trained by the founder of LIMS BOX?', intent: 'founder', excerpt: 'training' },
  { question: 'What previous work did John Hudson Taylor do configuring LIMS?', intent: 'founder', excerpt: 'configuration' },
  { question: 'Did Hudson train anyone?', intent: 'founder', excerpt: 'training' },
  { question: 'Can you tell me if Hudson has CSV experience?', intent: 'founder', excerpt: 'instrument-imports' },
  { question: 'Is it true Hudson configured instrument imports?', intent: 'founder', excerpt: 'instrument-imports' },
  { question: 'Which LIMS systems did Hudson configure earlier?', intent: 'founder', excerpt: 'configuration' },
  { question: 'What data recovery experience does Hudson have?', intent: 'founder', excerpt: 'data-recovery' },
  { question: 'What does LIMS BOX do?', intent: 'product', entry: 'what-is-lims-box' },
  { question: 'Tell me about LIMS Box', intent: 'product', entry: 'what-is-lims-box' },
  { question: 'What is LIMS BOT?', intent: 'product', entry: 'what-is-lims-bot' },
  { question: 'Can LIMS Box import instrument data?', intent: 'product', entry: 'instruments' },
  { question: 'Does LIMS BOT support instrument imports?', intent: 'product', entry: 'instruments' },
  { question: 'Are instrument imports supported by LIMS BOX?', intent: 'product', entry: 'instruments' },
  { question: 'Can instrument data be imported?', intent: 'product', entry: 'instruments' },
  { question: 'Is configuration included?', intent: 'product', entry: 'implementation-fee' },
  { question: 'Can LIMS BOX migrate spreadsheets?', intent: 'product', entry: 'data-migration' },
  { question: 'Are EPA methods provided by LIMS Box?', intent: 'product', entry: 'methods' },
  { question: 'What does LIMS Box cost?', intent: 'product', entry: 'pricing' },
  { question: 'How much does LIMS BOX cost?', intent: 'product', entry: 'pricing' },
  { question: 'What is the subscription price for LIMS Box?', intent: 'product', entry: 'pricing' },
  { question: 'Is phone support provided?', intent: 'product', entry: 'support' },
  { question: "Given Hudson's background, what does LIMS Box cost?", intent: 'mixed', entry: 'pricing' },
  { question: 'Who founded LIMS Box and can it import instrument data?', intent: 'mixed', entry: 'instruments' },
  { question: 'Tell me about the founder of LIMS BOX and whether LIMS BOX supports instrument imports.', intent: 'mixed', entry: 'instruments' },
  { question: "Are instrument imports supported by LIMS BOT given Hudson's experience?", intent: 'mixed', entry: 'instruments' },
  { question: 'Can the founder confirm instrument imports are available?', intent: 'mixed', entry: 'instruments' },
  { question: "Given Hudson's experience, instrument import availability in LIMS BOX?", intent: 'mixed', entry: 'instruments' },
  { question: 'What configuration experience does the founder have, and is configuration included today?', intent: 'mixed', entry: 'implementation-fee' },
  { question: 'What configuration experience does the founder have and what does LIMS BOX cost?', intent: 'mixed', entry: 'pricing' },
  { question: 'Tell me about the founder and LIMS BOX pricing', intent: 'mixed', entry: 'pricing' },
  { question: 'Tell me about LIMS BOX given the founder background', intent: 'mixed', entry: 'what-is-lims-box' },
  { question: 'What is LIMS BOT given the founder background?', intent: 'mixed', entry: 'what-is-lims-bot' },
  // A present-tense yes/no question about anything but the founder is a product
  // question whatever its verb, not just the verbs in an allowlist.
  { question: "Given Hudson's training background, is phone support offered?", intent: 'mixed', entry: 'support' },
  { question: "Is phone support offered given the founder's experience?", intent: 'mixed', entry: 'support' },
  { question: "Can you tell me if phone support is offered given Hudson's background?", intent: 'mixed', entry: 'support' },
  { question: "With the founder's experience in mind, can samples be tracked?", intent: 'mixed', entry: 'sample-tracking-overview' },
  { question: "How are samples tracked, given the founder's background?", intent: 'mixed', entry: 'sample-tracking-overview' },
  { question: "Given Hud Taylor's background, is chain of custody handled?", intent: 'mixed', entry: 'chain-of-custody' },
  { question: "Given Hudson's training background, has LIMS BOX offered phone support on its current plans?", intent: 'mixed', entry: 'support' },
  // "Hudson's team" or "his company" is the product side, not the founder.
  { question: "Can the founder's team migrate our spreadsheets?", intent: 'product', entry: 'data-migration' },
  { question: 'Can I talk to the founder?', intent: 'contact', entry: 'talk-to-person' },
  // Reaching the founder is a contact request, never a bio lookup.
  { question: 'Can I meet Hudson?', intent: 'contact', entry: 'talk-to-person' },
  { question: 'How can I reach the founder?', intent: 'contact', entry: 'talk-to-person' },
  { question: 'Can I speak with Hud Taylor?', intent: 'contact', entry: 'talk-to-person' },
  { question: 'May I email the LIMS BOX founder?', intent: 'contact', entry: 'talk-to-person' },
  { question: 'Could I book a meeting with John Hudson Taylor?', intent: 'contact', entry: 'talk-to-person' },
  { question: 'How do I get in touch with Hudson?', intent: 'contact', entry: 'talk-to-person' },
  { question: "Can I talk to Hudson's team?", intent: 'contact', entry: 'talk-to-person' },
  { question: "Given Hudson's background, how can I get in touch with him?", intent: 'contact', entry: 'talk-to-person' },
];

test('founder questions about topics nothing published covers fail closed, even with the archive loaded', (t) => {
  const bundle = fixture(t, FOUNDER_EXCERPTS.map((item) => item.text));
  useBundle(t, bundle.root);
  for (const question of [
    "What is the founder's favorite color?",
    'Did Hudson train for a marathon?',
    'What music did Hudson listen to while configuring LIMS?',
    'Can Hudson help my lab migrate?',
    'What does Hudson think about competitors?',
    'Has the founder worked with call centers?',
    'Has Hudson ever been to Paris?',
  ]) {
    const result = askBot(question);
    assert.equal(result.grounded, false, question);
    assert.equal(result.answer, EVIDENCE_MISSING_ANSWER, question);
    assert.deepEqual(result.sources, [], question);
  }
});

for (const { question, intent, entry, excerpt } of intentCases) {
  test(`intent ${intent}: ${question}`, (t) => {
    const bundle = fixture(t, FOUNDER_EXCERPTS.map((item) => item.text));
    useBundle(t, bundle.root);
    assert.equal(classifyQuestionIntent(question), intent);
    const result = askBot(question);
    assert.equal(result.grounded, true);
    if (entry === 'founder-bio') {
      const bio = corpus.find((item) => item.id === entry)!;
      assert.equal(result.answer, bio.text);
      assert.deepEqual(result.sources, [{ title: bio.title, path: '/about' }]);
      assert.match(result.answer, /Hud Taylor/);
      delete process.env.LIMS_FOUNDER_KNOWLEDGE_DIR;
      assert.deepEqual(askBot(question), result);
    } else if (intent === 'founder') {
      assert.match(result.answer, /^Founder archive \(historical experience\):/);
      assert.ok(result.sources.every((source) => source.path.startsWith(FOUNDER_CITATION_PREFIX)));
      if (excerpt) assert.ok(result.sources.some((source) => source.path.endsWith(`#${excerpt}`)));
      // Revoking the bundle must not let a founder question fall back to pricing.
      delete process.env.LIMS_FOUNDER_KNOWLEDGE_DIR;
      assert.equal(askBot(question).answer, EVIDENCE_MISSING_ANSWER);
    } else {
      assert.equal(result.answer, corpus.find((item) => item.id === entry)!.text);
      assert.ok(result.sources.every((source) => !source.path.startsWith(FOUNDER_CITATION_PREFIX)));
      if (entry === 'instruments') assert.match(result.answer, /Not yet/);
    }
  });
}

// Each topic exercises both voices, explicit/implicit product references, and
// founder context in either position with an admitted historical corpus.
const productTopics = [
  { id: 'instruments', active: 'Can LIMS BOX import instrument data', passive: 'Can instrument data be imported', availability: 'Is instrument import supported' },
  { id: 'data-migration', active: 'Can LIMS BOX migrate spreadsheets', passive: 'Can spreadsheets be migrated', availability: 'Is spreadsheet migration available' },
  { id: 'methods', active: 'Does LIMS BOX provide EPA methods', passive: 'Are EPA methods provided', availability: 'Are EPA methods available' },
  { id: 'implementation-fee', active: 'Does LIMS BOX include configuration', passive: 'Is configuration included', availability: 'Is configuration available' },
  { id: 'support', active: 'Does LIMS BOX provide phone support', passive: 'Is phone support provided', availability: 'Is phone support available' },
  { id: 'chain-of-custody', active: 'Does LIMS BOX record custody transfers', passive: 'Are custody transfers recorded', availability: 'Is chain of custody available' },
  { id: 'offline', active: 'Can LIMS BOX work offline', passive: 'Can it be used offline', availability: 'Is offline operation available' },
  { id: 'cancel-data', active: 'Can LIMS BOX export on cancellation', passive: 'Can records be exported on cancellation', availability: 'Is export on cancellation available' },
];

for (const topic of productTopics) {
  test(`current ${topic.id} answers take priority over founder history in either voice`, (t) => {
    const bundle = fixture(t, FOUNDER_EXCERPTS.map((excerpt) => excerpt.text));
    useBundle(t, bundle.root);
    const expected = corpus.find((entry) => entry.id === topic.id)!;
    for (const phrasing of [topic.active, topic.passive, `${topic.passive} by LIMS BOX`,
      topic.availability, `${topic.availability} in LIMS BOX`]) {
      for (const question of [
        `${phrasing}?`,
        `${phrasing} given Hudson's experience?`,
        `Given the founder background, ${phrasing}?`,
      ]) {
        const result = askBot(question);
        assert.equal(result.grounded, true, question);
        assert.equal(result.answer, expected.text, question);
        assert.ok(result.sources.some((source) => source.path === expected.source), question);
        assert.ok(result.sources.every((source) => !source.path.startsWith(FOUNDER_CITATION_PREFIX)), question);
      }
    }
  });
}

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
  const page = await FounderSourcePage({ params: Promise.resolve({ path: ['founder-configuration'] }) });
  assert.doesNotMatch(renderToStaticMarkup(page), /Unknown personal name|FDA cleared/i);
  const unreviewed = fixture(t, ['New founder claim which has not been reviewed.']);
  assert.deepEqual(loadFounderCorpus(unreviewed.root), []);
});

test('duplicates collapse; holds and bundle removal revoke answers and citation pages without stale cache', async (t) => {
  const bundle = fixture(t, [FOUNDER_EXCERPTS[0].text, FOUNDER_EXCERPTS[0].text]);
  useBundle(t, bundle.root);
  assert.equal(loadFounderCorpus().length, 1);
  // A topic question depends on the archive (general background is the public bio).
  assert.equal(askBot('What configuration experience does the founder have?').grounded, true);
  for (const source of bundle.sources) source.bot_status = 'REDACTED_NEEDS_HUMAN_REVIEW';
  bundle.save();
  assert.equal(askBot('What configuration experience does the founder have?').grounded, false);
  await assert.rejects(FounderSourcePage({ params: Promise.resolve({ path: ['founder-configuration'] }) }), /NEXT_HTTP_ERROR_FALLBACK;404/);
  for (const route of ['15_HT_FOUNDER_INTAKE/originals/private.doc', '../MANIFEST.tsv', '15_HT_FOUNDER_INTAKE/SOURCES.tsv']) {
    await assert.rejects(FounderSourcePage({ params: Promise.resolve({ path: route.split('/') }) }), /NEXT_HTTP_ERROR_FALLBACK;404/);
  }
});

test('public citation pages expose only reviewed excerpts, excluding private/customer content and metadata', async (t) => {
  const privateText = 'Synthetic Private Person; Customer Secret Laboratory; confidential sample result: positive.';
  const bundle = fixture(t, FOUNDER_EXCERPTS.map((excerpt) => `${privateText}\n${excerpt.text}`));
  useBundle(t, bundle.root);
  for (const [index, record] of bundle.manifest.entries()) {
    const page = await FounderSourcePage({ params: Promise.resolve({ path: [`founder-${FOUNDER_EXCERPTS[index].id}`] }) });
    const html = renderToStaticMarkup(page);
    assert.ok(html.includes(`Founder archive (historical experience): ${FOUNDER_EXCERPTS[index].text}`));
    for (const hidden of [privateText, 'Synthetic Private Person', 'Customer Secret Laboratory',
      'confidential sample result', bundle.root, bundle.sources[index].alias, record.source_location,
      'source_relpaths', 'catalog_hash_prefix', record.path, record.sha256, bundle.sources[index].sha256]) {
      assert.ok(!html.includes(hidden), `Citation page leaked ${hidden}`);
    }
  }
  // Probe private paths while the bundle has admitted public excerpts.
  const hash = bundle.sources[0].sha256;
  for (const route of [
    bundle.sources[0].redacted,
    `15_HT_FOUNDER_INTAKE/originals/${hash}.txt`,
    `15_HT_FOUNDER_INTAKE/text/${hash}.txt`,
    '15_HT_FOUNDER_INTAKE/SOURCES.tsv', 'MANIFEST.tsv', '../MANIFEST.tsv',
    `15_HT_FOUNDER_INTAKE/redacted/${'a'.repeat(64)}.txt`,
  ]) {
    await assert.rejects(FounderSourcePage({ params: Promise.resolve({ path: route.split('/') }) }),
      /NEXT_HTTP_ERROR_FALLBACK;404/);
  }
});

test('product compliance questions keep the locked positioning; founder-only regulatory history never cites the archive', (t) => {
  const bundle = fixture(t, FOUNDER_EXCERPTS.map((item) => item.text));
  useBundle(t, bundle.root);
  for (const question of [
    'Who is the founder and is LIMS BOX HIPAA compliant?',
    "Given Hudson's background, is LIMS BOX HIPAA compliant?",
    "Considering the founder's experience, does LIMS BOX support 21 CFR Part 11 workflows?",
  ]) {
    assert.equal(classifyQuestionIntent(question), 'mixed', question);
    const result = askBot(question);
    assert.equal(result.grounded, true, question);
    assert.ok(result.answer.startsWith(COMPLIANCE_POSITIONING), question);
    assert.equal(result.sources[0].path, '/compliance', question);
    assert.ok(result.sources.every((source) => !source.path.startsWith(FOUNDER_CITATION_PREFIX)), question);
  }
  // A person's regulatory history is not a product compliance question, and no
  // admitted excerpt covers it, so the bot says it has no approved material.
  for (const question of [
    "What is the founder's experience with CLIA?",
    'Did Hudson ever work for the FDA?',
    'What regulatory agencies did Hudson previously work for?',
    'Is the founder HIPAA certified?',
    'Has Hudson done validation for CLIA labs?',
  ]) {
    assert.equal(classifyQuestionIntent(question), 'founder', question);
    assert.equal(askBot(question).answer, EVIDENCE_MISSING_ANSWER, question);
  }
});

test("questions about the founder's company or team never reach the founder archive", (t) => {
  const bundle = fixture(t, FOUNDER_EXCERPTS.map((item) => item.text));
  useBundle(t, bundle.root);
  for (const question of [
    "Does Hudson's company offer the training he did before?",
    "Has Hudson's company trained users?",
    'Does his team provide phone support?',
  ]) {
    assert.notEqual(classifyQuestionIntent(question), 'founder', question);
    const result = askBot(question);
    assert.ok(result.sources.every((source) => !source.path.startsWith(FOUNDER_CITATION_PREFIX)), question);
    assert.doesNotMatch(result.answer, /historical experience/, question);
  }
});

// Property check, not a phrasing list: every published product FAQ question,
// wrapped in founder context in several positions and tenses, never cites the
// founder archive.
const productQuestions = corpus
  .filter((entry) => !['founder-bio', 'talk-to-person', 'compliance-positioning'].includes(entry.id))
  .map((entry) => entry.title.replace(/\?$/, ''));
test('no product FAQ question cites the founder archive, whatever founder context surrounds it', (t) => {
  const bundle = fixture(t, FOUNDER_EXCERPTS.map((item) => item.text));
  useBundle(t, bundle.root);
  for (const base of productQuestions) {
    for (const question of [
      `Given Hudson's training background, ${base.charAt(0).toLowerCase()}${base.slice(1)}?`,
      `${base} given the founder's configuration experience?`,
      `With Hud Taylor's instrument import history in mind, ${base.charAt(0).toLowerCase()}${base.slice(1)}?`,
      `${base}? The founder trained technicians before.`,
    ]) {
      const result = askBot(question);
      assert.ok(result.sources.every((source) => !source.path.startsWith(FOUNDER_CITATION_PREFIX)), question);
      assert.doesNotMatch(result.answer, /historical experience/, question);
    }
  }
});
