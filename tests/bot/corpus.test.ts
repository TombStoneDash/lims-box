import { test } from 'node:test';
import assert from 'node:assert/strict';
import { corpus, COMPLIANCE_POSITIONING } from '../../lib/bot/corpus';

// The corpus header forbids claiming that the software itself holds regulatory
// compliance, compatibility, certification, or clearance. Match representative
// claim fragments, not standalone words used in legitimate lab workflow copy.
const FORBIDDEN = [
  /\bclia[\s-]+(?:compliant|certified)\b/i,
  /\bhipaa[\s-]+compliant\b/i,
  /\biso\s+(?:15189|17025)[\s-]+(?:compliant|certified)\b/i,
  /\bpart\s*11[\s-]+(?:compliant|compatible|compatibility)\b/i,
  /\bfda[\s-]+(?:cleared|clearance)\b/i,
];

function assertNoForbidden(text: string, context: string) {
  for (const pattern of FORBIDDEN) {
    assert.doesNotMatch(text, pattern, `${context}: forbidden phrasing ${pattern}`);
  }
}

test('every corpus entry has a unique id', () => {
  const ids = new Set<string>();
  for (const entry of corpus) {
    assert.ok(!ids.has(entry.id), `duplicate corpus id: ${entry.id}`);
    ids.add(entry.id);
  }
});

test('every corpus entry has non-empty content and keywords', () => {
  for (const entry of corpus) {
    for (const field of ['title', 'source', 'text'] as const) {
      assert.ok(
        typeof entry[field] === 'string' && entry[field].trim().length > 0,
        `corpus entry ${entry.id}: ${field} must be a non-empty string`,
      );
    }
    assert.ok(
      Array.isArray(entry.keywords) && entry.keywords.length > 0,
      `corpus entry ${entry.id}: keywords must be a non-empty array`,
    );
  }
});

test('every corpus entry text respects the locked brand rule', () => {
  for (const entry of corpus) {
    assertNoForbidden(entry.text, `corpus entry ${entry.id}`);
  }
});

test('COMPLIANCE_POSITIONING respects the locked brand rule', () => {
  assertNoForbidden(COMPLIANCE_POSITIONING, 'COMPLIANCE_POSITIONING');
});

test('the deny-list rejects representative software regulatory claims', () => {
  for (const claim of [
    'LIMS BOX is CLIA compliant.',
    'LIMS BOX is CLIA-certified.',
    'LIMS BOX is HIPAA COMPLIANT.',
    'LIMS BOX is ISO 15189 certified.',
    'LIMS BOX is ISO 17025 compliant.',
    'LIMS BOX is 21 CFR Part 11 compliant.',
    'LIMS BOX is Part 11-compatible.',
    'LIMS BOX holds Part 11 compatibility.',
    'LIMS BOX is FDA-cleared.',
    'LIMS BOX holds FDA clearance.',
  ]) {
    assert.throws(() => assertNoForbidden(claim, 'fixture'), assert.AssertionError, claim);
  }
});
