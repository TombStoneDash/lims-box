// Deterministic, dictionary-free query normalization for LIMS BOT.
// Applied to user questions only, never to corpus text: fixes common phone
// typos and synonyms so a visitor's wording still reaches the exact-token
// scorer in lib/bot/engine.ts. Pure module, no imports — the stopword and
// compliance-word lists are intentionally duplicated from engine.ts rather
// than imported, so this file stays free of any import cycle with it.

// Applied, in order, to the lower-cased question before tokenizing. Every
// replacement word is itself an existing corpus keyword (enforced by
// tests/bot/query-normalizer.test.ts), so this can only ever add a keyword
// match — never invent an unrelated one.
export const PHRASE_SYNONYMS: Array<[RegExp, string]> = [
  [/\bhow much\b/g, 'cost'],
  [/\bsign[\s-]?up\b/g, 'signup'],
  [/\bset[\s-]?up\b/g, 'setup'],
  [/\be-?signatures?\b/g, 'electronic signature'],
  [/\bexcel sheets\b/g, 'spreadsheets'],
  [/\bget started\b/g, 'start'],
];

// A user word mapped to exactly one existing corpus keyword. Every target is
// verified against lib/bot/corpus.ts by tests/bot/query-normalizer.test.ts.
export const TOKEN_SYNONYMS: Record<string, string> = {
  prices: 'price',
  priced: 'price',
  quote: 'price',
  charge: 'price',
  costs: 'cost',
  trials: 'trial',
  analyzers: 'analyzer',
  analysers: 'analyzer',
  analyser: 'analyzer',
  disconnected: 'offline',
  'air-gapped': 'offline',
  xlsx: 'spreadsheets',
  sheets: 'spreadsheets',
  migrating: 'migrate',
  cancelling: 'cancel',
  canceling: 'cancel',
};

// Never correct a token that is one of these (too common / meaning-bearing to
// risk a spurious "fix"), and never correct a token into one of these either.
// Duplicated from engine.ts's STOPWORDS by design — see the file header.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'am', 'be', 'do', 'does', 'did', 'can',
  'could', 'will', 'would', 'should', 'we', 'you', 'your', 'yours', 'it',
  'its', 'of', 'to', 'for', 'in', 'on', 'at', 'and', 'or', 'but', 'not',
  'what', 'when', 'where', 'which', 'who', 'how', 'why', 'with', 'my',
  'our', 'i', 'me', 'us', 'if', 'about', 'tell', 'know', 'need', 'want',
  'lims', 'box', 'limsbox',
]);

// A typo must never manufacture a compliance question. These are the
// COMPLIANCE_PATTERN trigger words in engine.ts, duplicated for the same
// no-import-cycle reason as STOPWORDS above.
const COMPLIANCE_WORDS = new Set([
  'clia', 'hipaa', 'compliance', 'compliant', 'certified', 'regulatory', 'regulated', 'fda',
]);

function damerauLevenshteinWithin(a: string, b: string, maxDistance: number): number {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
  const la = a.length;
  const lb = b.length;
  const d: number[][] = [];
  for (let i = 0; i <= la; i += 1) {
    d[i] = [i];
  }
  for (let j = 0; j <= lb; j += 1) {
    d[0][j] = j;
  }
  for (let i = 1; i <= la; i += 1) {
    for (let j = 1; j <= lb; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, d[i - 2][j - 2] + 1);
      }
      d[i][j] = value;
    }
  }
  return d[la][lb];
}

/**
 * Conservative, dictionary-free typo correction. Only ever considers tokens of
 * length >= 6 with no digit, only compares against vocabulary words starting
 * with the same letter, and only returns a correction when exactly one
 * vocabulary word is within edit distance 1 (or distance 2 for tokens of
 * length >= 9) — ambiguous cases, and words already spelled correctly, are
 * returned unchanged.
 */
export function correctToken(token: string, vocabulary: Set<string>): string {
  if (token.length < 6) return token;
  if (/\d/.test(token)) return token;
  if (STOPWORDS.has(token)) return token;
  if (vocabulary.has(token)) return token;

  const maxDistance = token.length >= 9 ? 2 : 1;
  const firstLetter = token[0];
  let bestDistance = Infinity;
  let matches: string[] = [];

  for (const word of vocabulary) {
    if (word[0] !== firstLetter) continue;
    if (STOPWORDS.has(word) || COMPLIANCE_WORDS.has(word)) continue;
    const distance = damerauLevenshteinWithin(token, word, maxDistance);
    if (distance > maxDistance) continue;
    if (distance < bestDistance) {
      bestDistance = distance;
      matches = [word];
    } else if (distance === bestDistance) {
      matches.push(word);
    }
  }

  return matches.length === 1 ? matches[0] : token;
}

/** Applies TOKEN_SYNONYMS, then typo correction, to each token in order. */
export function expandTokens(tokens: string[], vocabulary: Set<string>): string[] {
  return tokens.map((token) => correctToken(TOKEN_SYNONYMS[token] ?? token, vocabulary));
}
