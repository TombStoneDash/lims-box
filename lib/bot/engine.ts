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
    // Instrument imports are not spreadsheet migration, even when the query
    // also mentions data, CSV, or Excel. The current limitation is authoritative.
    if (/\binstruments?\b/i.test(question)
      && /\b(?:import\w*|integrat\w*|connect\w*|support\w*)\b/i.test(question)) {
      return responseForEntry('instruments');
    }
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
const FOUNDER_IDENTITY_PATTERN = /\bwho\s+(?:(?:originally\s+)?(?:built|founded|created|started)\s+(?:lims\s*(?:box|bot)|it|this)|(?:was|is)\s+(?:lims\s*(?:box|bot)|it|this)\s+(?:built|founded|created|started)\s+by)\b|\bby\s+whom\s+was\s+(?:lims\s*(?:box|bot)|it|this)\s+(?:built|founded|created|started)\b/i;
const FOUNDER_OVERVIEW_PATTERN = /^(?:tell\s+me\s+about|who\s+is)\s+(?:the\s+)?(?:founder(?:\s+of\s+(?:the\s+)?lims\s*(?:box|bot))?|lims\s*(?:box|bot)(?:['’]s)?\s+founder|hudson)[?.!]*$/i;

export type QuestionIntent = 'founder' | 'product' | 'mixed' | 'contact';

/** Decide what is being asked before choosing an evidence corpus.
 * A company name or an auxiliary verb alone says nothing about intent.
 * Explicit current-product requests win over accompanying founder history.
 */
export function classifyQuestionIntent(rawQuestion: unknown): QuestionIntent {
  if (typeof rawQuestion !== 'string') return 'product';
  const question = rawQuestion.trim().slice(0, MAX_QUESTION_LENGTH);
  // Normalize attribution noun phrases, not every mention of the product.
  const subject = question
    .replace(/\bfounder\s+of\s+(?:the\s+)?lims\s*(?:box|bot)\b/gi, 'founder')
    .replace(/\blims\s*(?:box|bot)(?:['’]s)?\s+founder\b/gi, 'founder');
  const founder = /\b(?:founder|hudson)\b/i.test(subject)
    || FOUNDER_IDENTITY_PATTERN.test(subject);

  // Active product questions and statements, passive capability questions,
  // availability requests, and price requests. Personal predicates such as
  // "does the founder have experience" are deliberately absent.
  const currentProduct = LIMS_BOX_OVERVIEW_PATTERN.test(subject)
    || LIMS_BOT_OVERVIEW_PATTERN.test(subject)
    || /\b(?:what\s+(?:does|can)|can|could|does|will|would|should|must)\s+(?:the\s+)?(?:lims\s*(?:box|bot)|it|this|your\s+product)\b/i.test(subject)
    || /\b(?:lims\s*(?:box|bot)|it|this|your\s+product)\s+(?:can|supports?|does|includes?|provides?|costs?)\b/i.test(subject)
    || /\b(?:is|are|can|could|will|would|should|must)\b[^?!.;,]*\b(?:supported|provided|included|available|recorded|imported|migrated|exported|used)\b/i.test(subject)
    || /\b(?:imports?|migration|methods|configuration|support|custody|operation|exports?)\s+availability\b/i.test(subject)
    || /\blims\s*(?:box|bot)(?:['’]s)?\s+(?:pricing|prices?|costs?|subscription)\b|\b(?:pricing|prices?|costs?|subscription)\s+(?:of|for)\s+lims\s*(?:box|bot)\b/i.test(subject)
    || /\b(?:how\s+much|what\s+(?:is|are)\s+(?:the\s+)?(?:price|pricing|cost|subscription)|pricing\s+(?:today|for))\b/i.test(subject);
  if (currentProduct) return founder ? 'mixed' : 'product';
  if (/\b(?:talk|contact|call|email|speak|consultation)\b/i.test(subject)) return 'contact';
  return founder ? 'founder' : 'product';
}

function answerFounderQuestion(question: string): BotResponse {
  const bounded = question.trim().slice(0, MAX_QUESTION_LENGTH);
  const overview = FOUNDER_OVERVIEW_PATTERN.test(bounded) || FOUNDER_IDENTITY_PATTERN.test(bounded);
  // Identity needs the published bio, not a keyword match on career history.
  if (overview) return responseForEntry('founder-bio');
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
  const intent = classifyQuestionIntent(rawQuestion);
  const isProduct = intent === 'product' || intent === 'mixed';
  const productQuestion = isProduct && typeof rawQuestion === 'string'
    ? rawQuestion.trim().slice(0, MAX_QUESTION_LENGTH).replace(/\b(?:founder|hudson|experience|background|career)\b/gi, '')
    : rawQuestion;
  const response = intent === 'founder' && typeof rawQuestion === 'string'
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
