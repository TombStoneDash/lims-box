import assert from "node:assert/strict";
import test from "node:test";
import { matchCommercialClaim } from "../../lib/bot/commercial-claims";
import { filterCommercialClaims } from "../../lib/bot/output-claims-filter";
import { COMPLIANCE_POSITIONING } from "../../lib/bot/corpus";

// Regression coverage: normalizeClaimText previously kept Unicode format
// characters (zero-width space, soft hyphen, word joiner, etc.) intact, so a
// forbidden claim that reads as plain text on screen could evade
// matchCommercialClaim and the output claims filter simply by having an
// invisible character spliced into the middle of the phrase. All examples
// below are synthetic fixtures only.

test("zero-width space inside a HIPAA claim still matches hipaa_compliant", () => {
  const match = matchCommercialClaim("LIMS BOX is HIPAA ​compliant.");
  assert.equal(match?.category, "hipaa_compliant");
});

test("soft hyphen inside a HIPAA claim still matches hipaa_compliant", () => {
  const match = matchCommercialClaim("LIMS BOX is HIPAA­compliant.");
  assert.equal(match?.category, "hipaa_compliant");
});

test("word joiner inside an FDA claim still matches fda_cleared", () => {
  const match = matchCommercialClaim("FDA⁠ cleared");
  assert.equal(match?.category, "fda_cleared");
});

test("zero-width space inside a CLIA claim still matches clia_certified", () => {
  const match = matchCommercialClaim("CLIA cert​ified");
  assert.equal(match?.category, "clia_certified");
});

test("plain-text claim without format characters still matches, for comparison", () => {
  const match = matchCommercialClaim("LIMS BOX is HIPAA compliant.");
  assert.equal(match?.category, "hipaa_compliant");
});

test("output claims filter blocks the zero-width-space HIPAA example", () => {
  const result = filterCommercialClaims("LIMS BOX is HIPAA ​compliant.");
  assert.equal(result.blocked, true);
  assert.equal(result.matchedCategory, "hipaa_compliant");
});

test("ordinary approved compliance positioning copy is not flagged", () => {
  assert.equal(matchCommercialClaim(COMPLIANCE_POSITIONING), null);
});

for (const [category, text] of [
  ['clia_certified', 'CLIA cert\u00adified'],
  ['hipaa_compliant', 'HIPAA compl\u00adiant'],
  ['fda_cleared', 'FDA cle\u00adared'],
] as const) {
  test(`soft hyphen within a word cannot evade ${category}`, () => {
    assert.equal(matchCommercialClaim(text)?.category, category);
    const filtered = filterCommercialClaims(text);
    assert.equal(filtered.blocked, true);
    assert.equal(filtered.matchedCategory, category);
  });
}

for (const mark of ['\u200b', '\u200c', '\u200d', '\u2060', '\ufeff']) {
  test(`in-word format character ${mark.codePointAt(0)?.toString(16)} is stripped`, () => {
    assert.equal(matchCommercialClaim(`HIPAA compl${mark}iant`)?.category, 'hipaa_compliant');
  });
}

test('visible hyphen handling is preserved alongside invisible character detection', () => {
  assert.equal(matchCommercialClaim('HIPAA-compliant')?.category, 'hipaa_compliant');
  assert.equal(matchCommercialClaim('CLIA-certified')?.category, 'clia_certified');
  assert.equal(matchCommercialClaim('FDA-cleared')?.category, 'fda_cleared');
  assert.equal(matchCommercialClaim('Research workflow software with synthetic demo data.'), null);
});

for (const mark of ['\u00ad', '\u200b', '\u200c', '\u200d', '\u2060', '\ufeff']) {
  test(`sole invisible separator ${mark.codePointAt(0)?.toString(16)} cannot evade a claim`, () => {
    for (const [text, category] of [
      [`HIPAA${mark}compliant`, 'hipaa_compliant'],
      [`CLIA${mark}certified`, 'clia_certified'],
      [`FDA${mark}cleared`, 'fda_cleared'],
    ] as const) {
      assert.equal(matchCommercialClaim(text)?.category, category);
      assert.equal(filterCommercialClaims(text).blocked, true);
    }
  });
}
