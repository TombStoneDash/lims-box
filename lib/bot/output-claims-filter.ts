// Deterministic output claims filter (spec section 7.7).
// A required, always-on stage between the citation verifier and the
// user-visible answer. No model or semantic classifier is used here.

import { matchCommercialClaim, type CommercialClaimCategory } from './commercial-claims';

export const OUTPUT_CLAIMS_FILTER_SAFE_RESPONSE =
  "I can't confirm that claim from approved documentation. Please check with the laboratory director or quality manager, or consult the relevant standard directly.";

export interface ClaimsFilterResult {
  answer: string;
  blocked: boolean;
  matchedCategory?: CommercialClaimCategory;
}

/**
 * Scans a draft answer for forbidden commercial claims using the canonical
 * lib/bot/commercial-claims.ts module. On a hit, discards the draft and
 * returns the deterministic safe response plus the matched category only
 * (never the surrounding user content). This filter never "un-refuses" a
 * request; it only ever downgrades a draft answer to the safe response.
 */
export function filterCommercialClaims(draftAnswer: string): ClaimsFilterResult {
  const match = matchCommercialClaim(draftAnswer);
  if (match) {
    return { answer: OUTPUT_CLAIMS_FILTER_SAFE_RESPONSE, blocked: true, matchedCategory: match.category };
  }
  return { answer: draftAnswer, blocked: false };
}
