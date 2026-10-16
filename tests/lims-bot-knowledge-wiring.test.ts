// Snapshot of the traced truth in docs/reviews/LIMS_BOT_FOUNDER_KNOWLEDGE_USAGE_20261016.md:
// both /api/bot and /api/demo/assistant DO load knowledge/founder/* at request
// time, but only as a narrow allowlisted-question lookup ahead of the normal
// FAQ engine, over exactly 1 admitted document (not the full 117-file
// lims-knowledge bundle). If any of these assertions start failing, the
// wiring described in that review has changed and the review needs an update.
import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST as botPost } from '../app/api/bot/route';
import { POST as demoAssistantPost } from '../app/api/demo/assistant/route';
import { askBot, EVIDENCE_MISSING_ANSWER } from '../lib/bot/engine';
import {
  askFounderArchive,
  askFounderCareer,
  FOUNDER_CITATION_PREFIX,
  founderFactQuestions,
  getFounderBundleDiagnostics,
  loadFounderCorpus,
  loadFounderFactIndex,
} from '../lib/bot/founder-corpus';

test('loader module exports the shipped admission gate', () => {
  assert.equal(typeof askFounderCareer, 'function');
  assert.equal(typeof askFounderArchive, 'function');
  assert.equal(typeof loadFounderCorpus, 'function');
  assert.equal(typeof loadFounderFactIndex, 'function');
  assert.equal(typeof getFounderBundleDiagnostics, 'function');
});

test('the shipped knowledge/founder bundle currently admits exactly one document, not the full 117-file bundle', () => {
  const diagnostics = getFounderBundleDiagnostics();
  assert.deepEqual(diagnostics, {
    root: diagnostics.root, exists: true, manifestRows: 2, sourcesRows: 1, documents: 1, error: null,
  });
  const facts = loadFounderFactIndex();
  assert.equal(facts.length, 26, 'BUILD_REPORT.json records 26 distinct paragraphs from the 1 admitted document');
  for (const fact of facts) assert.ok(fact.source.startsWith(FOUNDER_CITATION_PREFIX));
});

test('askFounderCareer only answers 3 fixed whole-question strings; it is not a retrieval engine', () => {
  const known = askFounderCareer("What is Hudson Taylor's experience with laboratory information systems?");
  assert.equal(known?.grounded, true);
  assert.ok(known?.sources.every((source) => source.path.startsWith(FOUNDER_CITATION_PREFIX)));

  // An unscripted founder-history question gets no archive answer at all from
  // this entry point (askFounderCareer returns null, not evidence-missing) --
  // app/api/bot/route.ts then falls through to the normal FAQ engine.
  assert.equal(askFounderCareer('What music did Hudson listen to while configuring LIMS?'), null);
});

test('/api/bot answers a scripted career question by citing the founder archive, ahead of the FAQ engine', async () => {
  const response = await botPost(new NextRequest('https://lims.bot/api/bot', {
    method: 'POST',
    body: JSON.stringify({ question: "What is Hudson Taylor's experience with laboratory information systems?" }),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': 'knowledge-wiring-test' },
  }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.grounded, true);
  assert.ok(body.sources.some((source: { path: string }) => source.path.startsWith(FOUNDER_CITATION_PREFIX)));
});

test('/api/demo/assistant answers a fact-id citation question by citing the founder archive', async () => {
  const [fact] = loadFounderFactIndex();
  assert.ok(fact, 'the shipped bundle must have at least one admitted fact for this to be meaningful');
  const [, factIdQuestion] = founderFactQuestions(fact);

  const response = await demoAssistantPost(new NextRequest('https://lims.bot/api/demo/assistant', {
    method: 'POST',
    body: JSON.stringify({ question: factIdQuestion }),
    headers: { 'content-type': 'application/json' },
  }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.grounded, true);
  assert.ok(body.sources.some((source: { path: string }) => source.path.startsWith(FOUNDER_CITATION_PREFIX)));
});

test("the bot's own FAQ engine (askBot) never cites the founder archive, even for founder-history topics", () => {
  // This is the other half of the PARTIAL verdict: engine.ts's ranked answers
  // come only from the static lib/bot/corpus.ts founder-bio entry. If this
  // ever starts returning a FOUNDER_CITATION_PREFIX source, engine.ts has been
  // wired directly into the archive and the review's verdict should change.
  const result = askBot('What configuration experience does the founder have?');
  assert.equal(result.answer, EVIDENCE_MISSING_ANSWER);
  assert.equal(result.grounded, false);
  assert.ok(result.sources.every((source) => !source.path.startsWith(FOUNDER_CITATION_PREFIX)));
});
