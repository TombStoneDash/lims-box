import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BotChat } from '../../app/bot/bot-chat';

test('the question input has a real associated label', () => {
  const markup = renderToStaticMarkup(React.createElement(BotChat));
  const input = markup.match(/<input\b[^>]*>/)?.[0];
  assert.ok(input);
  const id = input.match(/\bid="([^"]+)"/)?.[1];
  assert.ok(id);
  const labels = [...markup.matchAll(/<label\b([^>]*)>([^<]*)<\/label>/g)];
  const label = labels.find((match) => match[1].includes(`for="${id}"`));
  assert.ok(label, 'label must reference the question input');
  assert.equal(label[2].trim(), 'Ask LIMS BOT a question');
  assert.match(label[1], /\bsr-only\b/);
  assert.match(input, /focus-visible:ring-2/);
  assert.match(input, /maxLength="500"/i);
});

test('the initial conversation is a polite live log', () => {
  const markup = renderToStaticMarkup(React.createElement(BotChat));
  const log = markup.match(/<[^>]+\brole="log"[^>]*>/)?.[0];
  assert.ok(log);
  assert.match(log, /aria-live="polite"/);
  assert.match(log, /aria-relevant="additions"/);
  assert.match(log, /aria-label="Conversation with LIMS BOT"/);
  assert.match(log, /aria-busy="false"/);
});

test('buttons have explicit types, starter focus rings, and an initially disabled Ask', () => {
  const markup = renderToStaticMarkup(React.createElement(BotChat));
  const buttons = [...markup.matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)];
  assert.equal(buttons.length, 4);
  for (const button of buttons) assert.match(button[1], /\btype="(?:button|submit)"/);
  const starters = buttons.filter((button) => button[1].includes('type="button"'));
  assert.deepEqual(starters.map((button) => button[2]), [
    'What does LIMS BOX cost?',
    'Does LIMS BOX work offline?',
    'How long does setup take?',
  ]);
  for (const starter of starters) {
    assert.match(starter[1], /focus-visible:ring-2/);
    assert.match(starter[1], /focus-visible:ring-blue-500/);
    assert.match(starter[1], /focus-visible:ring-offset-2/);
  }
  const ask = buttons.find((button) => button[2].trim() === 'Ask');
  assert.ok(ask);
  assert.match(ask[1], /\btype="submit"/);
  assert.match(ask[1], /\bdisabled=""/);
  assert.match(ask[1], /focus-visible:ring-2/);
});

test('the published disclaimer remains verbatim', () => {
  const markup = renderToStaticMarkup(React.createElement(BotChat));
  assert.ok(markup.includes('LIMS BOT is a prototype. It only answers from published LIMS BOX documentation and never stores your questions.'));
});

test('dynamic accessibility semantics preserve the single bot request', () => {
  const source = readFileSync(new URL('../../app/bot/bot-chat.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('role="status"'));
  assert.ok(source.includes('You asked:'));
  assert.ok(source.includes('LIMS BOT answered:'));
  assert.ok(source.includes('.focus()'));
  assert.ok(source.includes('aria-busy={busy}'));
  assert.ok(source.includes('<nav aria-label="Sources for this answer"'));
  for (const question of ['s', 'suggestion']) {
    assert.ok(source.includes(`ask(${question});\n`));
    assert.match(source, new RegExp(`ask\\(${question}\\);\\s*inputRef\\.current\\?\\.focus\\(\\);`));
  }
  assert.equal(source.split('disabled={busy}').length - 1, 2);
  assert.equal(source.split("fetch('/api/bot'").length - 1, 1);
  assert.equal(source.split('fetch(').length - 1, 1);
});
