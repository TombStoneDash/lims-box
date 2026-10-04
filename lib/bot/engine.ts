// LIMS BOT deterministic answer engine.
// Design constraints (approved MVP scope):
//  - Grounded answers only: every answer is verbatim corpus text (no generation,
//    no interpolation of user input into answers -> no fabrication, no injection).
//  - Citations: every grounded answer carries its source page path(s).
//  - Clear evidence-missing behavior when nothing in the corpus matches.
//  - Lead routing: evidence-missing and buying-intent answers point to the
//    existing early-access / contact flow. The bot itself never writes data.
//  - No customer-private data, no autonomous outreach, no secrets.

import { corpus, type CorpusEntry, COMPLIANCE_POSITIONING } from './corpus';
import { loadFounderCorpus } from './founder-corpus';
import { filterCommercialClaims } from './output-claims-filter';

export interface BotSource {
  title: string;
  path: string;
}

export interface BotResponse {
  answer: string;
  grounded: boolean;
  sources: BotSource[];
  followUp?: { label: string; path: string };
  suggestions?: string[];
}

export const MAX_QUESTION_LENGTH = 500;
const MIN_SCORE = 3;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'am', 'be', 'do', 'does', 'did', 'can',
  'could', 'will', 'would', 'should', 'we', 'you', 'your', 'yours', 'it',
  'its', 'of', 'to', 'for', 'in', 'on', 'at', 'and', 'or', 'but', 'not',
  'what', 'when', 'where', 'which', 'who', 'how', 'why', 'with', 'my',
  'our', 'i', 'me', 'us', 'if', 'about', 'tell', 'know', 'need', 'want',
  'lims', 'box', 'limsbox',
]);

export const EVIDENCE_MISSING_ANSWER =
  "I can only answer from LIMS BOX's published documentation, and I don't have approved material that answers that question. For anything specific to your lab, apply for early access or contact the team — the founder personally reviews every inquiry (info@lims.bot).";

const EARLY_ACCESS_FOLLOW_UP = { label: 'Apply for Early Access', path: '/early-adopter' };
const CONTACT_FOLLOW_UP = { label: 'Contact the team', path: '/contact' };

const LEAD_INTENT_IDS = new Set([
  'pricing', 'pilot-program', 'early-access', 'talk-to-person', 'what-is-lims-box',
]);

const COMPLIANCE_PATTERN = /clia|hipaa|complian|certif|fda|15189|part\s*11|regulat/i;
const LIMS_BOX_OVERVIEW_PATTERN =
  /\b(?:what\s+is|tell\s+me\s+about)\s+(?:the\s+)?lims\s*box\b|\bwhat\s+does\s+(?:lims\s*box|it|this|your\s+product)\s+do\b|\bwho\s+is\s+(?:lims\s*box|it|this)\s+for\b/i;
const LIMS_BOT_OVERVIEW_PATTERN =
  /\b(?:what\s+is|tell\s+me\s+about)\s+(?:the\s+)?lims\s*bot\b/i;
const SAMPLE_TRACKING_PATTERN =
  /\b(?:can|does)\s+(?:lims\s*box|it|this)\s+(?:track|manage)\s+samples?\b|\bsample\s+(?:tracking|traceability)\b/i;

export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    // Contractions lose only their apostrophe ending ("don't" -> "don", "let's" -> "let"), so no
    // one-letter fragment like "t" or "s" is left to match unrelated corpus entries. Other one-character
    // terms (a lone digit such as the 7 in "pH 7") are kept.
    .replace(/['\u2019](?:t|s|m|d|re|ve|ll)\b/g, '')
    .replace(/[^a-z0-9$./\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[./-]+/, '').replace(/[./-]+$/, ''))
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

function scoreEntry(entry: CorpusEntry, tokens: string[]): number {
  const kw = new Set(entry.keywords);
  // Match title/text as whole normalized tokens (via the same tokenizer used on the
  // query), not raw substrings -> a token like "script" must not match inside an
  // unrelated word like "subscription".
  const titleTokens = new Set(tokenize(entry.title));
  const textTokens = new Set(tokenize(entry.text));
  let score = 0;
  for (const t of tokens) {
    if (kw.has(t)) score += 3;
    else if (titleTokens.has(t)) score += 2;
    else if (textTokens.has(t)) score += 1;
  }
  return score;
}

function evidenceMissing(): BotResponse {
  return {
    answer: EVIDENCE_MISSING_ANSWER,
    grounded: false,
    sources: [],
    followUp: EARLY_ACCESS_FOLLOW_UP,
  };
}

function responseForEntry(id: string): BotResponse {
  const entry = corpus.find((candidate) => candidate.id === id);
  if (!entry) return evidenceMissing();

  return {
    answer: entry.text,
    grounded: true,
    sources: [{ title: entry.title, path: entry.source }],
    followUp: LEAD_INTENT_IDS.has(entry.id) ? EARLY_ACCESS_FOLLOW_UP : undefined,
  };
}

function answerQuestion(rawQuestion: unknown): BotResponse {
  if (typeof rawQuestion !== 'string') return evidenceMissing();
  const question = rawQuestion.trim().slice(0, MAX_QUESTION_LENGTH);
  if (!question) return evidenceMissing();

  const isComplianceQuestion = COMPLIANCE_PATTERN.test(question);
  if (!isComplianceQuestion) {
    if (LIMS_BOT_OVERVIEW_PATTERN.test(question)) {
      return responseForEntry('what-is-lims-bot');
    }
    if (LIMS_BOX_OVERVIEW_PATTERN.test(question)) {
      return responseForEntry('what-is-lims-box');
    }
    if (SAMPLE_TRACKING_PATTERN.test(question)) {
      return responseForEntry('sample-tracking-overview');
    }
  }

  const tokens = tokenize(question);
  if (tokens.length === 0) return evidenceMissing();

  const ranked = corpus
    .map((entry) => ({ entry, score: scoreEntry(entry, tokens) }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  if (!top || top.score < MIN_SCORE) {
    // Compliance questions always get the locked positioning, never silence.
    if (isComplianceQuestion) {
      return {
        answer: COMPLIANCE_POSITIONING,
        grounded: true,
        sources: [{ title: 'LIMS BOX compliance positioning', path: '/compliance' }],
        followUp: CONTACT_FOLLOW_UP,
      };
    }
    return evidenceMissing();
  }

  const sources: BotSource[] = [{ title: top.entry.title, path: top.entry.source }];
  let answer = top.entry.text;

  // Compliance guard: any compliance-adjacent question leads with the locked
  // verbatim positioning sentence before any grounded FAQ text.
  if (isComplianceQuestion && top.entry.id !== 'compliance-positioning') {
    answer = `${COMPLIANCE_POSITIONING} ${answer}`;
    sources.unshift({ title: 'LIMS BOX compliance positioning', path: '/compliance' });
  }

  const runnerUp = ranked[1];
  if (
    runnerUp &&
    runnerUp.score >= MIN_SCORE &&
    runnerUp.score >= top.score - 1 &&
    runnerUp.entry.source !== top.entry.source
  ) {
    sources.push({ title: runnerUp.entry.title, path: runnerUp.entry.source });
  }

  return {
    answer,
    grounded: true,
    sources,
    followUp: LEAD_INTENT_IDS.has(top.entry.id) ? EARLY_ACCESS_FOLLOW_UP : undefined,
  };
}

// Check the actual answer path once, without recursively building suggestions.
const ROUND_TRIPPABLE_TITLES = new Set(
  corpus.filter((entry) => answerQuestion(entry.title).grounded).map((entry) => entry.title),
);
const DEFAULT_SUGGESTION_IDS = ['what-is-lims-box', 'pricing', 'pilot-program'];
const PRODUCT_CAPABILITY_PATTERN = /\b(?:can|could|does|will|is|has)\s+(?:the\s+)?lims\s*box\b(?!\s+founder|['’]s\s+founder)|\blims\s*box\s+(?:can|could|does|will|is|has|supports?|integrates?|imports?)\b/i;

function isFounderQuestion(question: unknown): question is string {
  if (typeof question !== 'string') return false;
  const bounded = question.trim().slice(0, MAX_QUESTION_LENGTH);
  // A founder mention cannot turn a question about today's product into a
  // claim based on their past employment ("Can the founder confirm LIMS BOX
  // can integrate instruments?"). Route explicit product capabilities first.
  if (PRODUCT_CAPABILITY_PATTERN.test(bounded)) return false;
  return /\b(?:founder|hudson)\b/i.test(bounded)
    && !/\b(?:talk|contact|call|email|speak|consultation)\b/i.test(bounded);
}

function answerFounderQuestion(question: string): BotResponse {
  const bounded = question.trim().slice(0, MAX_QUESTION_LENGTH);
  if (!/\b(?:experience|background|career|history|historical|previously|past|resume|worked|implemented|configured|trained)\b|\bwhat\s+did\b/i.test(bounded)) {
    return evidenceMissing();
  }
  const tokens = tokenize(bounded);
  const top = loadFounderCorpus()
    .map((entry) => ({ entry, score: scoreEntry(entry, tokens) }))
    .sort((a, b) => b.score - a.score)[0];
  if (!top || top.score < MIN_SCORE) return evidenceMissing();

  const sources = [{ title: top.entry.title, path: top.entry.source }];
  let answer = top.entry.text;
  if (COMPLIANCE_PATTERN.test(bounded)) {
    answer = `${COMPLIANCE_POSITIONING} ${answer}`;
    sources.unshift({ title: 'LIMS BOX compliance positioning', path: '/compliance' });
  }
  const filtered = filterCommercialClaims(answer);
  if (filtered.blocked) return { answer: filtered.answer, grounded: false, sources: [] };
  return { answer: filtered.answer, grounded: true, sources };
}

export function askBot(rawQuestion: unknown): BotResponse {
  // Historical first-person career excerpts must never answer a current
  // product-capability question (e.g. whether LIMS BOX imports instruments).
  // For explicit product questions, founder context must not boost the
  // contact FAQ over the actual capability FAQ during keyword ranking.
  const productQuestion = typeof rawQuestion === 'string'
    && PRODUCT_CAPABILITY_PATTERN.test(rawQuestion.trim().slice(0, MAX_QUESTION_LENGTH))
    ? rawQuestion.trim().slice(0, MAX_QUESTION_LENGTH).replace(/\b(?:founder|hudson|experience|background|career)\b/gi, '')
    : rawQuestion;
  const response = isFounderQuestion(rawQuestion)
    ? answerFounderQuestion(rawQuestion)
    : answerQuestion(productQuestion);
  if (response.grounded) return response;

  const tokens = typeof rawQuestion === 'string'
    ? tokenize(rawQuestion.trim().slice(0, MAX_QUESTION_LENGTH))
    : [];
  const partialMatches = corpus
    .map((entry, index) => ({ entry, index, score: scoreEntry(entry, tokens) }))
    .filter(({ score }) => score >= 1)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ entry }) => entry);
  const defaults = DEFAULT_SUGGESTION_IDS.flatMap((id) => {
    const entry = corpus.find((candidate) => candidate.id === id);
    return entry ? [entry] : [];
  });
  const suggestions = [...new Set(
    [...partialMatches, ...defaults]
      .filter((entry) => entry.id !== 'compliance-positioning' && ROUND_TRIPPABLE_TITLES.has(entry.title))
      .map((entry) => entry.title),
  )].slice(0, 3);

  return { ...response, suggestions };
}
