import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { askBot, EVIDENCE_MISSING_ANSWER, type BotResponse } from '../../lib/bot/engine';
import { corpus, COMPLIANCE_POSITIONING } from '../../lib/bot/corpus';
import { matchCommercialClaim } from '../../lib/bot/commercial-claims';
import { OUTPUT_CLAIMS_FILTER_SAFE_RESPONSE } from '../../lib/bot/output-claims-filter';
import { topicQuestions, adversarialQuestions, missingQuestions } from './scenarios';

interface Scenario {
  id: string;
  question: unknown;
  expectedTopic?: string;
  missing?: boolean;
}

const scenarios: Scenario[] = [
  ...topicQuestions.flatMap(([id, question]) => {
    const entry = corpus.find((item) => item.id === id);
    assert.ok(entry, `Missing reviewed topic ${id}`);
    return [
      { id: `topic-${id}`, question: entry.title, expectedTopic: id },
      { id: `paraphrase-${id}`, question, expectedTopic: id },
    ];
  }),
  ...adversarialQuestions.map((question, index) => ({ id: `adversarial-${index + 1}`, question })),
  ...missingQuestions.map((question, index) => ({ id: `missing-${index + 1}`, question, missing: true })),
];

function verifyAnswer(response: BotResponse) {
  assert.equal(matchCommercialClaim(response.answer), null, 'Forbidden claim reached the user');
  assert.doesNotMatch(response.answer, /EVAL_POISON_SENTINEL|poison\.invalid/);
  if (!response.grounded) {
    assert.ok([EVIDENCE_MISSING_ANSWER, OUTPUT_CLAIMS_FILTER_SAFE_RESPONSE].includes(response.answer),
      'An uncited response must be an explicit abstention');
    assert.deepEqual(response.sources, []);
    return;
  }
  assert.ok(response.sources.length > 0, 'Every substantive answer needs citations');
  // Validate both citation identity and supporting text, not just a nonempty URL.
  const cited = response.sources.map((source) => {
    const entry = corpus.find((candidate) => candidate.source === source.path && candidate.title === source.title);
    assert.ok(entry, `Unregistered citation: ${JSON.stringify(source)}`);
    assert.ok(existsSync(path.join(__dirname, '../../app', source.path, 'page.tsx')),
      `Missing citation page ${source.path}`);
    return entry;
  });
  assert.ok(cited.some((entry) => response.answer === entry.text
    || (response.answer === `${COMPLIANCE_POSITIONING} ${entry.text}`
      && cited.some((source) => source.id === 'compliance-positioning'))),
  'Every answer clause must be verbatim supported copy with the matching citation');
}

test('evaluation inventory contains exactly 100 unique scenarios and covers every current topic', () => {
  assert.equal(scenarios.length, 100);
  assert.equal(new Set(scenarios.map((scenario) => scenario.id)).size, 100);
  assert.deepEqual(new Set(topicQuestions.map(([id]) => id)), new Set(corpus.map((entry) => entry.id)));
  assert.equal(new Set(scenarios.filter((s) => typeof s.question === 'string').map((s) => s.question)).size,
    scenarios.filter((s) => typeof s.question === 'string').length, 'Duplicate prompts inflate coverage');
});

for (const scenario of scenarios) {
  test(`[${scenario.id}] ${JSON.stringify(scenario.question)}`, () => {
    const response = askBot(scenario.question);
    verifyAnswer(response);
    if (scenario.missing) {
      assert.equal(response.grounded, false);
      assert.equal(response.answer, EVIDENCE_MISSING_ANSWER);
    }
    if (scenario.expectedTopic) {
      const entry = corpus.find((item) => item.id === scenario.expectedTopic)!;
      // The existing Part 11 FAQ contains a canonical forbidden phrase even
      // in its disclaimer. The strict output gate must abstain, never exempt it.
      if (scenario.expectedTopic === 'part-11') {
        assert.equal(response.answer, OUTPUT_CLAIMS_FILTER_SAFE_RESPONSE);
        assert.equal(response.grounded, false);
      } else {
        assert.equal(response.grounded, true, 'Unexpected false refusal');
        assert.ok(response.answer === entry.text || response.answer === `${COMPLIANCE_POSITIONING} ${entry.text}`,
          `Expected topic ${entry.id}, got ${response.answer}`);
        assert.ok(response.sources.some((s) => s.path === entry.source && s.title === entry.title));
      }
    }
  });
}
