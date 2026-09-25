import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import {
  ASSISTANT_UNAVAILABLE_TEXT,
  parseAssistantReply,
  type OHWorksAssistantReply,
} from '../../lib/ohworks-assistant-reply';

const root = resolve(import.meta.dirname, '../..');

const FULL_REPLY: OHWorksAssistantReply = {
  answer: 'Synthetic answer text.',
  grounded: true,
  mode: 'expert',
  citations: [{ sourceId: 'S1', recordId: 'OW-SYN-S2-10065', corpusVersion: 'v1' }],
  label: 'Synthetic demonstration data only',
  disposition: 'grounded',
  refusalReason: 'not_applicable',
  matchedClaimCategory: 'workflow',
};

const SAFE_ERROR = {
  answer: 'The request could not be evaluated. Synthetic demonstration data only.',
  grounded: false,
  mode: 'expert',
  citations: [],
  label: 'Synthetic demonstration data only',
  disposition: 'evidence_missing',
};

test('ASSISTANT_UNAVAILABLE_TEXT matches the existing unavailable sentence', () => {
  assert.equal(
    ASSISTANT_UNAVAILABLE_TEXT,
    'The local synthetic assistant is unavailable. No result or integration action was attempted.',
  );
});

test('a full valid reply round-trips as a fresh object', () => {
  const parsed = parseAssistantReply(FULL_REPLY);
  assert.notEqual(parsed, null);
  assert.deepEqual(parsed, FULL_REPLY);
  assert.notEqual(parsed, FULL_REPLY);
});

test('optional fields are kept only when they are strings', () => {
  const { refusalReason, matchedClaimCategory, ...rest } = FULL_REPLY;
  const parsed = parseAssistantReply(rest);
  assert.notEqual(parsed, null);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'refusalReason'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'matchedClaimCategory'), false);

  const withNonStringOptional = { ...rest, refusalReason: 123, matchedClaimCategory: false };
  const parsedWithBad = parseAssistantReply(withNonStringOptional);
  assert.notEqual(parsedWithBad, null);
  assert.equal(Object.prototype.hasOwnProperty.call(parsedWithBad, 'refusalReason'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(parsedWithBad, 'matchedClaimCategory'), false);
});

test('the route SAFE_ERROR shape parses as valid', () => {
  const parsed = parseAssistantReply(SAFE_ERROR);
  assert.deepEqual(parsed, SAFE_ERROR);
});

test('unknown extra keys on the payload are not copied to the result', () => {
  const withExtra = { ...FULL_REPLY, extraKey: 'should not appear', another: 42 };
  const parsed = parseAssistantReply(withExtra);
  assert.notEqual(parsed, null);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'extraKey'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'another'), false);
  assert.deepEqual(parsed, FULL_REPLY);
});

const invalidPayloads: Array<[string, unknown]> = [
  ['null', null],
  ['undefined', undefined],
  ['a string', 'not an object'],
  ['an array', ['not', 'an', 'object']],
  ['an empty object', {}],
  ['an unrelated shape', { error: 'x' }],
  ['empty answer', { ...FULL_REPLY, answer: '' }],
  ['missing citations', (() => {
    const { citations, ...rest } = FULL_REPLY;
    return rest;
  })()],
  ['citations with non-string sourceId', { ...FULL_REPLY, citations: [{ sourceId: 1, recordId: 'r', corpusVersion: 'v' }] }],
  ['unknown disposition', { ...FULL_REPLY, disposition: 'other' }],
  ['unknown mode', { ...FULL_REPLY, mode: 'chat' }],
  ['non-boolean grounded', { ...FULL_REPLY, grounded: 'yes' }],
];

for (const [label, payload] of invalidPayloads) {
  test(`parseAssistantReply returns null for ${label}`, () => {
    assert.equal(parseAssistantReply(payload), null);
  });
}

test('lib/ohworks-assistant-reply.ts does not reference ohworks-pilot', () => {
  const source = readFileSync(resolve(root, 'lib/ohworks-assistant-reply.ts'), 'utf8');
  assert.doesNotMatch(source, /ohworks-pilot/);
});

test('assistant-console.tsx imports and uses the new helper and keeps required source markers', () => {
  const source = readFileSync(resolve(root, 'app/pilot/ohworks/bot/assistant-console.tsx'), 'utf8');
  assert.match(source, /@\/lib\/ohworks-assistant-reply/);
  assert.match(source, /parseAssistantReply\(/);
  assert.match(source, /fetch\('\/pilot\/ohworks\/bot\/api'/);
  assert.match(source, /htmlFor="ohworks-assistant-question"/);
  assert.match(source, /id="ohworks-assistant-question"/);
  const ariaPressedCount = (source.match(/aria-pressed/g) ?? []).length;
  assert.equal(ariaPressedCount, 2);
  assert.match(source, /aria-busy/);
  assert.doesNotMatch(source, /as OHWorksAssistantResponse/);
  assert.doesNotMatch(source, /@\/lib\/ohworks-pilot/);
});
