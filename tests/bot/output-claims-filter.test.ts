import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { filterCommercialClaims, OUTPUT_CLAIMS_FILTER_SAFE_RESPONSE } from '../../lib/bot/output-claims-filter';
import { COMMERCIAL_CLAIM_RULES } from '../../lib/bot/commercial-claims';

test('every canonical literal is blocked', () => {
  for (const rule of COMMERCIAL_CLAIM_RULES) {
    for (const literal of rule.literals) {
      const draft = `Our product is ${literal}, according to the vendor.`;
      const result = filterCommercialClaims(draft);
      assert.equal(result.blocked, true, `expected literal "${literal}" (${rule.category}) to be blocked`);
      assert.equal(result.answer, OUTPUT_CLAIMS_FILTER_SAFE_RESPONSE);
      assert.equal(result.matchedCategory, rule.category);
    }
  }
});

test('spec-named example literals are blocked', () => {
  assert.equal(filterCommercialClaims('This lab has CLIA certification on file.').blocked, true);
  assert.equal(filterCommercialClaims('Our platform is compliant with HIPAA.').blocked, true);
  assert.equal(filterCommercialClaims('Yes, all manuals are supported by our system.').blocked, true);
});

test('close-form pattern variants are blocked even when not an exact literal', () => {
  const closeFormFixtures = [
    'The system is CLIA-Certified for your workflow.',
    'We are fully HIPAA-Compliant across every module.',
    'The platform is 21 CFR Part 11 Compliant out of the box.',
    'This device was FDA Cleared last year.',
    'The bot supports every manual in your fleet.',
    'The order has been released to the physician.',
  ];
  for (const fixture of closeFormFixtures) {
    const result = filterCommercialClaims(fixture);
    assert.equal(result.blocked, true, `expected close-form fixture to be blocked: "${fixture}"`);
  }
});

test('negative discussion-only fixtures pass through unmodified', () => {
  const negativeFixtures = [
    'CLIA requires documented personnel training records for testing personnel.',
    'HIPAA requires access logs for anything touching protected health information.',
    'Our roadmap includes work toward Part 11 readiness, but nothing is compliant yet.',
    'The FDA publishes guidance documents on laboratory developed tests.',
    'We plan to support more manuals over time, starting with the most requested ones.',
    'Ask your laboratory director before releasing any result.',
  ];
  for (const fixture of negativeFixtures) {
    const result = filterCommercialClaims(fixture);
    assert.equal(result.blocked, false, `expected discussion-only fixture to pass: "${fixture}"`);
    assert.equal(result.answer, fixture);
  }
});

test('a hard-refusal router decision is never reopened by this filter', () => {
  // The filter only ever downgrades a clean-looking draft to the safe
  // response; it has no path that could turn a blocked/refused answer
  // back into an unblocked one.
  const alreadyRefused = filterCommercialClaims(OUTPUT_CLAIMS_FILTER_SAFE_RESPONSE);
  assert.equal(alreadyRefused.blocked, false);
  assert.equal(alreadyRefused.answer, OUTPUT_CLAIMS_FILTER_SAFE_RESPONSE);
});

test('the filter and canonical claims modules have no network or model import', () => {
  const filterSource = readFileSync(path.join(__dirname, '..', '..', 'lib', 'bot', 'output-claims-filter.ts'), 'utf8');
  const claimsSource = readFileSync(path.join(__dirname, '..', '..', 'lib', 'bot', 'commercial-claims.ts'), 'utf8');
  const forbidden = [/\bfetch\(/, /require\(['"]https?/, /@anthropic-ai/, /\bnode:https?\b/];
  for (const source of [filterSource, claimsSource]) {
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(source), `unexpected network/model import matching ${pattern}`);
    }
  }
});
