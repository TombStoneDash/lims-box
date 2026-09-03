// Canonical forbidden commercial-claims module.
// Single exported source of truth for LIMS BOT's deterministic output
// claims filter (lib/bot/output-claims-filter.ts) and the site's
// commercial-claims regression test (tests/content/commercial-claims.test.ts).
// Spec: LIMS_BOT_EXPERT_V2_SPEC_20260902.md section 7.7, Slice S1 deliverable 4.
//
// No semantic or model-based classifier is permitted here: every category
// owns an explicit, versioned list of literal phrases and bounded
// regular-expression patterns for close forms only.

export const COMMERCIAL_CLAIMS_VERSION = 1;

export type CommercialClaimCategory =
  | 'clia_certified'
  | 'hipaa_compliant'
  | 'part_11_compliant'
  | 'fda_cleared'
  | 'supports_all_manuals'
  | 'supports_all_instruments'
  | 'unverified_partnership'
  | 'action_completed';

export interface CommercialClaimRule {
  category: CommercialClaimCategory;
  /** Normalized (see normalizeClaimText) exact literal phrases. */
  literals: readonly string[];
  /** Bounded regular expressions tested against normalized text. */
  patterns: readonly RegExp[];
}

export const COMMERCIAL_CLAIM_RULES: readonly CommercialClaimRule[] = [
  {
    category: 'clia_certified',
    literals: [
      'clia certified',
      'clia certification',
      'clia accredited',
      'clia accreditation',
      'clia compliant',
    ],
    patterns: [
      /\bclia certif(?:ied|ication)\b/,
      /\bclia accredit(?:ed|ation)\b/,
      /\bclia complian(?:t|ce)\b/,
    ],
  },
  {
    category: 'hipaa_compliant',
    literals: ['hipaa compliant', 'compliant with hipaa', 'hipaa certified', 'hipaa compliance'],
    patterns: [/\bhipaa complian(?:t|ce)\b/, /\bcompliant with hipaa\b/, /\bhipaa certified\b/],
  },
  {
    category: 'part_11_compliant',
    literals: [
      'part 11 compliant',
      '21 cfr part 11 compliant',
      'part 11 compatible',
      'part 11 compliance',
    ],
    patterns: [/\b(?:21 cfr )?part 11 complian(?:t|ce)\b/, /\bpart 11 compatib(?:le|ility)\b/],
  },
  {
    category: 'fda_cleared',
    literals: ['fda cleared', 'fda approved', 'cleared by the fda', 'approved by the fda'],
    patterns: [/\bfda (?:cleared|approved)\b/, /\b(?:cleared|approved) by the fda\b/],
  },
  {
    category: 'supports_all_manuals',
    literals: ['supports all manuals', 'all manuals are supported', 'supports every manual'],
    patterns: [/\bsupports (?:all|every) manuals?\b/, /\ball manuals? (?:is|are) supported\b/],
  },
  {
    category: 'supports_all_instruments',
    literals: [
      'supports all instruments',
      'all instruments are supported',
      'supports every instrument',
    ],
    patterns: [/\bsupports (?:all|every) instruments?\b/, /\ball instruments? (?:is|are) supported\b/],
  },
  {
    category: 'unverified_partnership',
    literals: ['official partner of', 'certified partner of', 'in partnership with'],
    patterns: [/\b(?:official|certified) partner of\b/, /\bin partnership with\b/],
  },
  {
    category: 'action_completed',
    literals: [
      'order has been released',
      'result has been released',
      'correction has been completed',
      'action has been completed',
      'configuration change has been completed',
    ],
    patterns: [
      /\b(?:order|result) has been released\b/,
      /\b(?:correction|action|configuration change) has been completed\b/,
    ],
  },
];

/**
 * Deterministic normalization contract shared by every matcher in this
 * module: Unicode NFKC, lowercase, punctuation/hyphens replaced with
 * spaces, whitespace collapsed.
 */
export function normalizeClaimText(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface CommercialClaimMatch {
  category: CommercialClaimCategory;
  matchedPhrase: string;
}

/**
 * Scans normalized text against every rule's literals and bounded
 * patterns. Returns the first match, or null when no forbidden claim is
 * present. Unmatched language is not represented as proven-safe.
 */
export function matchCommercialClaim(text: string): CommercialClaimMatch | null {
  const normalized = normalizeClaimText(text);
  for (const rule of COMMERCIAL_CLAIM_RULES) {
    for (const literal of rule.literals) {
      if (normalized.includes(literal)) {
        return { category: rule.category, matchedPhrase: literal };
      }
    }
    for (const pattern of rule.patterns) {
      const match = pattern.exec(normalized);
      if (match) {
        return { category: rule.category, matchedPhrase: match[0] };
      }
    }
  }
  return null;
}
