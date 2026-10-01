import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askBot, EVIDENCE_MISSING_ANSWER, tokenize } from '../../lib/bot/engine';

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
  const reference = askBot('What is ICP-MS');
  assert.equal(res.grounded, true);
  assert.equal(res.answer, reference.answer);
  assert.equal(res.sources[0].path, reference.sources[0].path);
  assert.equal(res.sources[0].path, '/faq');
  assert.equal(res.sources[0].title, 'What methods does LIMS BOX support out of the box?');
});

test('hyphenated "30-day" stays grounded after edge-trim', () => {
  const res = askBot('30-day pilot?');
  const reference = askBot('30-day pilot');
  assert.equal(res.grounded, true);
  assert.equal(res.answer, reference.answer);
  assert.equal(res.sources[0].path, reference.sources[0].path);
  assert.equal(res.sources[0].path, '/faq');
  assert.equal(res.sources[0].title, 'Is there a free trial or pilot program?');
});

test('hyphenated "open-source" stays grounded after edge-trim', () => {
  const res = askBot('Is it open-source?');
  const reference = askBot('Is it open-source');
  assert.equal(res.grounded, true);
  assert.equal(res.answer, reference.answer);
  assert.equal(res.sources[0].path, reference.sources[0].path);
  assert.equal(res.sources[0].path, '/faq');
  assert.equal(res.sources[0].title, 'What is SENAITE and why does LIMS BOX use it?');
});

test('hyphenated "audit-ready" stays grounded after edge-trim', () => {
  const res = askBot('audit-ready?');
  const reference = askBot('audit-ready');
  assert.equal(res.grounded, true);
  assert.equal(res.answer, reference.answer);
  assert.equal(res.sources[0].path, reference.sources[0].path);
  assert.equal(res.sources[0].path, '/compliance');
  assert.equal(res.sources[0].title, 'LIMS BOX compliance positioning');
});

test('contractions leave no one-letter fragments; other one-character terms are kept', () => {
  for (const q of ["I don't know.", "Let's go", "Who's there?", 'Who\u2019s there?', "They're here", "I'm done"]) {
    assert.ok(tokenize(q).every((token) => token.length > 1), `${q} -> ${JSON.stringify(tokenize(q))}`);
  }
  assert.deepEqual(tokenize('pH 7 calibration.'), ['ph', '7', 'calibration']);
  assert.ok(tokenize('Type 2 diabetes panel').includes('2'));
});
