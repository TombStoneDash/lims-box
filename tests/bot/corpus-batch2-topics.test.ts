import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { corpus } from '../../lib/bot/corpus';
import { askBot, classifyQuestionIntent, EVIDENCE_MISSING_ANSWER } from '../../lib/bot/engine';
import { filterCommercialClaims } from '../../lib/bot/output-claims-filter';

const NEW_ENTRY_QUESTIONS = [
  ['field-scout', 'what is field scout'],
  ['open-source-license', 'is senaite open source under the gpl license'],
  ['case-study-illustrative', 'is the case study a real customer'],
  ['implementation-fee', 'is there an implementation fee'],
  ['plan-changes', 'can i upgrade or downgrade later'],
  ['clinical-labs', 'do you work with clinical labs'],
  ['environmental-labs', 'do you work with environmental labs'],
  ['synthetic-demo', 'is the demo using real patient data'],
] as const;

for (const [id, question] of NEW_ENTRY_QUESTIONS) {
  test(`${id}: answer is verbatim copy from its published source page`, () => {
    const entry = corpus.find((candidate) => candidate.id === id)!;
    const page = readFileSync(path.join(__dirname, '../../app', entry.source, 'page.tsx'), 'utf8');
    // Normalize JSX line wrapping and the entities used by the published pages.
    const published = page.replace(/&mdash;/g, '—').replace(/&apos;/g, "'").replace(/\s+/g, ' ');
    assert.ok(published.includes(entry.text), `${id}: answer drifted from ${entry.source}`);
    assert.deepEqual(filterCommercialClaims(entry.text), { answer: entry.text, blocked: false });
  });

  test(`${id}: founder context preserves the product answer and citation`, () => {
    const entry = corpus.find((candidate) => candidate.id === id)!;
    for (const prompt of [
      `Given Hudson's background, for LIMS BOX: ${entry.title}`,
      `For LIMS BOX: ${entry.title} The founder trained technicians before.`,
    ]) {
      assert.equal(classifyQuestionIntent(prompt), 'mixed', prompt);
      const result = askBot(prompt);
      assert.equal(result.grounded, true, prompt);
      assert.equal(result.answer, entry.text, prompt);
      assert.equal(result.sources[0]?.path, entry.source, prompt);
      assert.ok(result.sources.every((source) => source.path !== '/about' && !source.path.startsWith('/bot/sources/')), prompt);
    }
  });

  test(`${id}: natural question and title return verbatim copy without lead routing`, () => {
    const entry = corpus.find((candidate) => candidate.id === id);
    assert.ok(entry, `Missing corpus entry: ${id}`);
    for (const prompt of [question, entry.title]) {
      const result = askBot(prompt);
      assert.equal(result.grounded, true, prompt);
      assert.equal(result.answer, entry.text, prompt);
      assert.equal(result.sources[0]?.path, entry.source, prompt);
      assert.equal(result.sources[0]?.title, entry.title, prompt);
      assert.equal(result.followUp, undefined, prompt);
    }
  });

  test(`${id}: unique id, bounded lowercase keywords, and concise currency-free copy`, () => {
    const entries = corpus.filter((entry) => entry.id === id);
    assert.equal(entries.length, 1);
    const entry = entries[0];
    assert.ok(entry.keywords.length >= 6 && entry.keywords.length <= 12);
    for (const keyword of entry.keywords) {
      assert.match(keyword, /^[a-z]+(?:-[a-z]+)*$/);
    }
    const sentences = entry.text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
    assert.ok(sentences.length >= 1 && sentences.length <= 4);
    assert.doesNotMatch(entry.text, /\p{Sc}/u);
  });
}

const REGRESSION_QUESTIONS = [
  ['pricing', 'What does LIMS BOX cost per month?'],
  ['setup-time', 'How long does setup take?'],
  ['senaite', 'What is SENAITE and why does LIMS BOX use it?'],
  ['offline', 'Does LIMS BOX work offline?'],
  ['pricing', 'How many users does the Growth plan support?'],
] as const;

for (const [id, question] of REGRESSION_QUESTIONS) {
  test(`existing routing remains ${id}: ${question}`, () => {
    const entry = corpus.find((candidate) => candidate.id === id);
    assert.ok(entry);
    const result = askBot(question);
    assert.equal(result.grounded, true);
    assert.equal(result.answer, entry.text);
    assert.equal(result.sources[0]?.path, entry.source);
    assert.equal(result.sources[0]?.title, entry.title);
  });
}

for (const question of [
  'Can LIMS BOX order pizza for the night shift?',
  'pizza', 'astronomy', 'unicorn', 'penguin', 'volcano',
  'origami', 'chess', 'galaxy', 'zzqxvbl', 'ruggedized',
]) {
  test(`off-corpus question remains ungrounded: ${question}`, () => {
    const result = askBot(question);
    assert.equal(result.grounded, false);
    assert.equal(result.answer, EVIDENCE_MISSING_ANSWER);
    assert.deepEqual(result.sources, []);
  });
}
