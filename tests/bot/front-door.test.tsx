import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { BotChat } from '../../app/bot/bot-chat';
import { askBot, MAX_QUESTION_LENGTH } from '../../lib/bot/engine';
import {
  BOT_PROMPT_PARAM,
  CAPABILITY_CARDS,
  MAX_PROMPT_LENGTH,
  botHref,
  readBotPrompt,
} from '../../lib/bot/front-door';

test('every capability card gets a grounded, cited answer', () => {
  assert.equal(CAPABILITY_CARDS.length, 4);
  for (const card of CAPABILITY_CARDS) {
    const reply = askBot(card.question);
    assert.equal(reply.grounded, true, card.question);
    assert.ok(reply.sources.length > 0, card.question);
  }
});

test('the personnel pack deep link gets a grounded answer from the personnel pack page', () => {
  const reply = askBot('Explain the personnel pack');
  assert.equal(reply.grounded, true);
  assert.ok(reply.sources.some((source) => source.path === '/personnel-pack'));
});

test('deep links round-trip through the query string', () => {
  const href = botHref('What is the personnel pack?');
  assert.ok(href.startsWith(`/bot?${BOT_PROMPT_PARAM}=`));
  assert.equal(readBotPrompt(href.slice(href.indexOf('?'))), 'What is the personnel pack?');
});

test('readBotPrompt ignores missing or blank prompts', () => {
  assert.equal(readBotPrompt(''), null);
  assert.equal(readBotPrompt('?other=1'), null);
  assert.equal(readBotPrompt('?bot=%20%20'), null);
});

test('readBotPrompt strips control characters and caps length at the engine limit', () => {
  assert.equal(MAX_PROMPT_LENGTH, MAX_QUESTION_LENGTH);
  assert.equal(readBotPrompt('?bot=a%0A%0Db%00c'), 'a b c');
  assert.equal(readBotPrompt(`?bot=${'x'.repeat(900)}`)?.length, MAX_PROMPT_LENGTH);
});

test('cards render as typed buttons inside a labelled group', () => {
  const markup = renderToStaticMarkup(React.createElement(BotChat, { cards: CAPABILITY_CARDS }));
  assert.match(markup, /role="group" aria-label="Click to try"/);
  for (const card of CAPABILITY_CARDS) {
    assert.ok(markup.includes(card.category), card.category);
  }
  const buttons = [...markup.matchAll(/<button\b([^>]*)>/g)];
  assert.equal(buttons.length, 4 + 4);
  for (const button of buttons) assert.match(button[1], /\btype="(?:button|submit)"/);
});
