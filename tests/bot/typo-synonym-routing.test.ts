import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askBot, EVIDENCE_MISSING_ANSWER } from '../../lib/bot/engine';
import { COMPLIANCE_POSITIONING } from '../../lib/bot/corpus';

test('misspelled pricing question still routes to the published pricing answer with citation', () => {
  const res = askBot('Whats the pricng for LIMS BOX?');
  const reference = askBot('What does LIMS BOX cost?');
  assert.equal(res.grounded, true);
  assert.match(res.answer, /\$500\/month/);
  assert.deepEqual(res.sources, reference.sources);
  assert.ok(res.followUp, 'pricing intent should still route to early access');
});

test('misspelled "offlne" question still routes to the published offline answer', () => {
  const res = askBot('Does it work offlne without internet?');
  assert.equal(res.grounded, true);
  assert.match(res.answer, /No internet required/);
  assert.ok(res.sources.some((s) => s.path === '/faq'));
});

test('synonym "disconnected" routes to the same offline answer as "offline"', () => {
  const res = askBot('Can we use it when disconnected from the internet?');
  const reference = askBot('Can we use it when offline from the internet?');
  assert.equal(res.grounded, true);
  assert.deepEqual(res.sources, reference.sources);
  assert.equal(res.answer, reference.answer);
});

test('synonym "charge" routes to the same pricing answer as "cost"', () => {
  const res = askBot('What does LIMS BOX charge per month?');
  const reference = askBot('What does LIMS BOX cost per month?');
  assert.equal(res.grounded, true);
  assert.deepEqual(res.sources, reference.sources);
  assert.equal(res.answer, reference.answer);
});

test('synonym "machines" routes to the same instruments answer as "instruments"', () => {
  const res = askBot('Can LIMS BOX integrate with our machines?');
  const reference = askBot('Can LIMS BOX integrate with our instruments?');
  assert.equal(res.grounded, true);
  assert.deepEqual(res.sources, reference.sources);
  assert.equal(res.answer, reference.answer);
});

test('synonym "technicians" routes to the same CLIA tracker answer as "technologists"', () => {
  const res = askBot('Does LIMS BOX track certifications for technicians?');
  const reference = askBot('Does LIMS BOX track certifications for technologists?');
  assert.equal(res.grounded, true);
  assert.deepEqual(res.sources, reference.sources);
  assert.equal(res.answer, reference.answer);
});

test('synonym "swap" routes to the same plan-change answer as "switch"', () => {
  const res = askBot('Can I swap to a different billing tier?');
  const reference = askBot('Can I switch to a different billing tier?');
  assert.equal(res.grounded, true);
  assert.deepEqual(res.sources, reference.sources);
  assert.equal(res.answer, reference.answer);
});

test('typo/synonym correction never rescues an unrelated off-topic question', () => {
  const res = askBot('Can LIMS BOX order pizza for the night shift?');
  assert.equal(res.grounded, false);
  assert.equal(res.answer, EVIDENCE_MISSING_ANSWER);
  assert.equal(res.sources.length, 0);
});

test('nonsense gibberish still returns evidence-missing, not a guessed match', () => {
  const res = askBot('xqzflrm bnwptk zzzyy?');
  assert.equal(res.grounded, false);
  assert.equal(res.answer, EVIDENCE_MISSING_ANSWER);
});

test('compliance wording stays exact and safe even when the query has a typo', () => {
  const res = askBot('Is LIMS BOX HIPAA compliant and CLIA compliant?');
  assert.equal(res.grounded, true);
  assert.ok(res.answer.startsWith(COMPLIANCE_POSITIONING));
  assert.ok(res.sources.some((s) => s.path === '/compliance'));
});

test('typo/synonym correction never alters the locked compliance positioning text', () => {
  const res = askBot('What does LIMS BOX charge and is it CLIA compliant?');
  // Mixed pricing+compliance query: compliance detection wins and the locked
  // positioning sentence must still appear verbatim, untouched by the
  // synonym substitution applied to "charge".
  assert.ok(res.answer.includes(COMPLIANCE_POSITIONING));
});
