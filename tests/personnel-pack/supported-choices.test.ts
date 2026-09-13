import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmailGateForm } from '../../app/personnel-pack/EmailGateForm';
import { PERSONNEL_PACK_PUBLIC_ASSETS } from '../../lib/personnelPackFulfillment';

const REMOVED_ACCRED_VALUES = ['cola', 'cap', 'clia', 'other'];

// Detects user-visible promises of immediate/automatic pack fulfillment — a fulfillment
// verb (download/get/access/receive/ship/send) combined with an immediacy signal
// (instantly/automatically/immediately/now/right away) anywhere in the same sentence as a
// pack/framework reference. Sentence-scoped rather than a fixed character window so it
// catches long-range promises, not just ones sitting a few characters from "CLIA/COLA/CAP".
function containsUnsupportedFulfillmentPromise(text: string): boolean {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const fulfillmentVerb = /\b(download|downloads|downloading|get|gets|access|receive|receives|ship|ships|send|sends)\b/i;
  const immediacy = /\b(instantly|instant|immediately|automatically|automatic|now|right away|in seconds)\b/i;
  const packRef = /\b(pack|packs|CLIA|COLA|CAP|framework|frameworks)\b/i;

  return sentences.some(
    (sentence) => fulfillmentVerb.test(sentence) && immediacy.test(sentence) && packRef.test(sentence),
  );
}

function extractSelectOptionValues(markup: string): string[] {
  const selectMatch = markup.match(/<select[^>]*>([\s\S]*?)<\/select>/);
  assert.ok(selectMatch, 'expected the pack picker <select> to be present in rendered markup');
  const optionValues: string[] = [];
  const optionRe = /<option value="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = optionRe.exec(selectMatch![1])) !== null) {
    optionValues.push(match[1]);
  }
  return optionValues;
}

test('the rendered pack picker offers exactly the reviewed ISO 15189 server key', () => {
  const markup = renderToStaticMarkup(React.createElement(EmailGateForm));
  const optionValues = extractSelectOptionValues(markup);

  assert.deepEqual(optionValues, ['', PERSONNEL_PACK_PUBLIC_ASSETS.iso15189.key]);
});

test('COLA, CAP, CLIA, and Other option values cannot be selected because they are not rendered', () => {
  const markup = renderToStaticMarkup(React.createElement(EmailGateForm));
  const optionValues = extractSelectOptionValues(markup);

  for (const removedValue of REMOVED_ACCRED_VALUES) {
    assert.ok(
      !optionValues.includes(removedValue),
      `expected "${removedValue}" to be absent from the rendered <option> values, found: ${optionValues.join(', ')}`,
    );
  }

  // Belt-and-suspenders: no removed value appears anywhere as an option value attribute,
  // even outside the <select> match window used above.
  for (const removedValue of REMOVED_ACCRED_VALUES) {
    assert.doesNotMatch(
      markup,
      new RegExp(`<option value="${removedValue}"`),
      `expected no <option value="${removedValue}"> anywhere in rendered markup`,
    );
  }
});

test('the only offered option key matches the single asset the fulfillment map supports', () => {
  const supportedKeys = Object.keys(PERSONNEL_PACK_PUBLIC_ASSETS);
  assert.deepEqual(supportedKeys, ['iso15189']);

  const markup = renderToStaticMarkup(React.createElement(EmailGateForm));
  const optionValues = extractSelectOptionValues(markup).filter((value) => value !== '');
  assert.deepEqual(optionValues, supportedKeys);
});

test('unsupported-needs copy stays visible without claiming automatic fulfillment for removed packs', async () => {
  const source = await readFile('app/personnel-pack/EmailGateForm.tsx', 'utf8');

  assert.match(source, /Automatic fulfillment is currently available only for the reviewed ISO 15189 pack\./);
  assert.match(source, /Need COLA, CAP, CLIA, or another framework\?/);
  assert.match(source, /aren&apos;t reviewed for automatic\s+delivery yet\./);

  // The copy may name unsupported frameworks in prose, but must not offer them as selectable options.
  for (const removedValue of REMOVED_ACCRED_VALUES) {
    assert.doesNotMatch(source, new RegExp(`<option value="${removedValue}"`));
  }
});

test('containsUnsupportedFulfillmentPromise flags generic and long-range fulfillment claims', () => {
  const shouldFlag = [
    'Download every Personnel Pack instantly',
    'Every CLIA, COLA, and CAP framework pack downloads automatically the moment you sign up.',
    'Get instant access to all our compliance packs — no email required, delivered right away.',
    'Receive your framework pack immediately after checkout, automatically emailed to your inbox.',
  ];
  const shouldPass = [
    'Generate a complete personnel competency packet — assessments, training history, certifications, and authorizations — formatted for CLIA and ISO 15189 survey review.',
    'One ZIP with an index and a detail PDF for each person.',
    'Personnel Pack documents personnel competency for both CLIA §493.1407 and ISO 15189 clause 6.2.2.',
    'Survey-Ready Export dashboard with a one-click ZIP bundle download.',
  ];

  for (const text of shouldFlag) {
    assert.ok(containsUnsupportedFulfillmentPromise(text), `expected to flag: "${text}"`);
  }
  for (const text of shouldPass) {
    assert.ok(!containsUnsupportedFulfillmentPromise(text), `expected to accept: "${text}"`);
  }
});

test('the personnel-pack landing page never embeds its own pack picker or download promise', async () => {
  const source = await readFile('app/personnel-pack/page.tsx', 'utf8');

  // The page delegates pack selection entirely to <EmailGateForm>. It must never grow a
  // second, independent <select>/<option> picker that could drift out of sync with the
  // single source of truth in PERSONNEL_PACK_PUBLIC_ASSETS.
  assert.doesNotMatch(source, /<select[^>]*>/);
  assert.doesNotMatch(source, /<option value=/);

  for (const removedValue of REMOVED_ACCRED_VALUES) {
    assert.doesNotMatch(
      source,
      new RegExp(`<option value="${removedValue}"`),
      `expected no <option value="${removedValue}"> on the landing page`,
    );
  }

  // Every CLIA/ISO 15189 reference on this page must describe the LIMS BOX product module
  // (personnel records, competency tracking, the admin Survey-Ready Export) rather than an
  // immediate/automatic fulfillment promise, since automatic download is scoped to the
  // single reviewed ISO 15189 asset and is offered exclusively through <EmailGateForm>.
  assert.ok(
    !containsUnsupportedFulfillmentPromise(source),
    'expected no generic or long-range unsupported immediate/automatic fulfillment promise on the landing page',
  );
});
