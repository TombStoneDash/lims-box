// LIMS BOT query normalizer.
// Conservative, deterministic typo and synonym correction applied only to the
// user's query tokens before keyword scoring (lib/bot/engine.ts). Corpus
// entries, citations, and compliance wording are never touched: a corrected
// token can only route to text that already exists in the approved corpus.
// Correction is skipped whenever it would be ambiguous, so unmatched or
// off-topic input is left unchanged and still falls through to the
// evidence-missing answer -- this module only ever helps a query reach an
// answer it was already close to, never invents a new one.

import { corpus } from './corpus';

// Tokens shorter than this are never typo-corrected (too easy to collide
// with an unrelated short word by chance).
const MIN_CORRECTABLE_LENGTH = 4;

function maxEditDistance(length: number): number {
  return length >= 8 ? 2 : 1;
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist: number[][] = [];
  for (let i = 0; i < rows; i++) {
    dist.push(new Array<number>(cols).fill(0));
    dist[i][0] = i;
  }
  for (let j = 0; j < cols; j++) dist[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(
        dist[i - 1][j] + 1,
        dist[i][j - 1] + 1,
        dist[i - 1][j - 1] + cost,
      );
    }
  }
  return dist[rows - 1][cols - 1];
}

// Minimal local word-splitter used only to build the correction vocabulary
// from the corpus. It deliberately does not share engine.ts's tokenize()
// (stopwords, contractions, apostrophe handling): the vocabulary only needs
// to be a superset of real corpus words, not a mirror of query tokenization.
function splitWords(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 0);
}

// Duplicated (not imported) from engine.ts's STOPWORDS to avoid a circular
// import between engine.ts and this module. A handful of corpus keyword
// arrays include generic words such as "what" or "about" as weak signal
// words for an overview entry; engine.ts's tokenize() always strips those
// from a query before scoring, so they must never be reachable as a typo
// *correction target* either, or a misspelled stopword (e.g. "whats") could
// be corrected into one and falsely boost an unrelated entry.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'am', 'be', 'do', 'does', 'did', 'can',
  'could', 'will', 'would', 'should', 'we', 'you', 'your', 'yours', 'it',
  'its', 'of', 'to', 'for', 'in', 'on', 'at', 'and', 'or', 'but', 'not',
  'what', 'when', 'where', 'which', 'who', 'how', 'why', 'with', 'my',
  'our', 'i', 'me', 'us', 'if', 'about', 'tell', 'know', 'need', 'want',
  'lims', 'box', 'limsbox',
]);

const VOCABULARY: ReadonlySet<string> = (() => {
  const words = new Set<string>();
  for (const entry of corpus) {
    for (const keyword of entry.keywords) words.add(keyword.toLowerCase());
    for (const word of splitWords(entry.title)) words.add(word);
    for (const word of splitWords(entry.text)) words.add(word);
  }
  for (const stopword of STOPWORDS) words.delete(stopword);
  return words;
})();

// Fixed, hand-curated synonym pairs. Every canonical value is already a
// corpus keyword/word, so a synonym hit can only route to an answer that
// already exists in the corpus -- it never introduces a new claim. Keys are
// deliberately words that are NOT already in the corpus vocabulary, so a
// substitution can never shadow a real keyword match elsewhere in the corpus.
export const SYNONYMS: Readonly<Record<string, string>> = Object.freeze({
  disconnected: 'offline',
  unplugged: 'offline',
  charge: 'cost',
  charges: 'cost',
  expense: 'cost',
  expenses: 'cost',
  machines: 'instruments',
  technician: 'technologist',
  technicians: 'technologist',
  swap: 'switch',
});

// Returns the single closest vocabulary word within edit distance of
// `token`, or undefined when there is no match within threshold, or more
// than one distinct word is tied for closest (a tied/ambiguous correction is
// treated as no correction at all, rather than guessing).
function findUniqueCorrection(token: string): string | undefined {
  const threshold = maxEditDistance(token.length);
  let bestDistance = Infinity;
  let bestCandidates = new Set<string>();
  for (const candidate of VOCABULARY) {
    if (Math.abs(candidate.length - token.length) > threshold) continue;
    const distance = levenshtein(token, candidate);
    if (distance > threshold) continue;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCandidates = new Set([candidate]);
    } else if (distance === bestDistance) {
      bestCandidates.add(candidate);
    }
  }
  return bestCandidates.size === 1 ? [...bestCandidates][0] : undefined;
}

/** Normalize a single already-tokenized query token (lowercased, stopwords
 * already removed by the caller). Exact vocabulary matches and tokens with
 * digits are returned unchanged; synonyms are expanded; otherwise an
 * unambiguous close typo is corrected. All other tokens pass through as-is.
 */
export function normalizeToken(token: string): string {
  if (VOCABULARY.has(token)) return token;
  const synonym = SYNONYMS[token];
  if (synonym) return synonym;
  if (token.length < MIN_CORRECTABLE_LENGTH || /\d/.test(token)) return token;
  return findUniqueCorrection(token) ?? token;
}

/** Normalize a full array of already-tokenized query tokens, in order. */
export function normalizeTokens(tokens: string[]): string[] {
  return tokens.map(normalizeToken);
}
