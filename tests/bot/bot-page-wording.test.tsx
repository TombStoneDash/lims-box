import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BotPage, { metadata } from '../../app/bot/page';

test('/bot renders the initial beta release wording without Prototype', () => {
  const markup = renderToStaticMarkup(React.createElement(BotPage));
  assert.doesNotMatch(markup, /\bprototype\b/i);
  assert.match(markup, /<h1\b[^>]*>LIMS BOT <span\b[^>]*>initial beta release<\/span><\/h1>/);
  assert.match(markup, /LIMS BOT is an initial beta release\./);
});

test('/bot metadata uses initial beta release wording without Prototype', () => {
  assert.doesNotMatch(JSON.stringify(metadata), /\bprototype\b/i);
  assert.equal(metadata.title, 'LIMS BOT (initial beta release) — LIMS BOX');
});
