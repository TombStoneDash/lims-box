import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askBot, EVIDENCE_MISSING_ANSWER } from '../../lib/bot/engine';

test('trailing period does not break grounding on pricing question', () => {
  const withPeriod = askBot('What does it cost.');
  const withQuestionMark = askBot('What does it cost?');
  assert.equal(withPeriod.grounded, true);
  assert.equal(withQuestionMark.grounded, true);
  assert.ok(withPeriod.sources.length > 0);
  assert.equal(withPeriod.sources[0].path, withQuestionMark.sources[0].path);
  assert.equal(withPeriod.sources[0].title, withQuestionMark.sources[0].title);
});

test('trailing period does not break grounding on pricing shorthand', () => {
  const withPeriod = askBot('Pricing.');
  const reference = askBot('What does it cost?');
  assert.equal(withPeriod.grounded, true);
  assert.equal(reference.grounded, true);
  assert.ok(withPeriod.sources.length > 0);
  assert.equal(withPeriod.sources[0].path, reference.sources[0].path);
  assert.equal(withPeriod.sources[0].title, reference.sources[0].title);
});

test('trailing period does not break grounding on offline question', () => {
  const withPeriod = askBot('Does it work offline.');
  const withQuestionMark = askBot('Does it work offline?');
  assert.equal(withPeriod.grounded, true);
  assert.equal(withQuestionMark.grounded, true);
  assert.ok(withPeriod.sources.length > 0);
  assert.equal(withPeriod.sources[0].path, withQuestionMark.sources[0].path);
  assert.equal(withPeriod.sources[0].title, withQuestionMark.sources[0].title);
});

test('contraction "don\'t" does not produce a false grounded match', () => {
  const res = askBot("I don't know.");
  assert.equal(res.grounded, false);
  assert.equal(res.answer, EVIDENCE_MISSING_ANSWER);
});

test('contraction "let\'s" does not produce a false grounded match', () => {
  const res = askBot("Let's go");
  assert.equal(res.grounded, false);
  assert.equal(res.answer, EVIDENCE_MISSING_ANSWER);
});

test('contraction "who\'s" does not produce a false grounded match', () => {
  const res = askBot("Who's there?");
  assert.equal(res.grounded, false);
  assert.equal(res.answer, EVIDENCE_MISSING_ANSWER);
});

test('hyphenated technical terms stay grounded after edge-trim', () => {
  const res = askBot('What is ICP-MS?');
  assert.equal(res.grounded, true);
});

test('hyphenated "30-day" stays grounded after edge-trim', () => {
  const res = askBot('30-day pilot?');
  assert.equal(res.grounded, true);
});

test('hyphenated "open-source" stays grounded after edge-trim', () => {
  const res = askBot('Is it open-source?');
  assert.equal(res.grounded, true);
});

test('hyphenated "audit-ready" stays grounded after edge-trim', () => {
  const res = askBot('audit-ready?');
  assert.equal(res.grounded, true);
});
