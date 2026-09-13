import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmailGateForm } from '../../app/personnel-pack/EmailGateForm';
import { PERSONNEL_PACK_PUBLIC_ASSETS } from '../../lib/personnelPackFulfillment';

const REMOVED_ACCRED_VALUES = ['cola', 'cap', 'clia', 'other'];

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
  // immediate/automatic PDF download, since automatic download is scoped to the single
  // reviewed ISO 15189 asset and is offered exclusively through <EmailGateForm>.
  assert.doesNotMatch(source, /download[\s\S]{0,40}(CLIA|COLA|CAP)\b/i);
  assert.doesNotMatch(source, /(CLIA|COLA|CAP)\b[\s\S]{0,40}download/i);
});

test('the landing page and the fulfillment map agree on exactly one automatically-downloadable pack', () => {
  const supportedKeys = Object.keys(PERSONNEL_PACK_PUBLIC_ASSETS);
  assert.deepEqual(
    supportedKeys,
    ['iso15189'],
    'the personnel-pack page relies on EmailGateForm honoring this exact set — update both together if it ever grows',
  );
});
