import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FAQItem } from '../../app/faq/faq-item';

const ROOT = path.join(__dirname, '..', '..');

test('FAQ questions expose collapsed state, heading structure, and a decorative chevron', () => {
  const markup = renderToStaticMarkup(React.createElement(FAQItem, {
    faq: {
      question: 'Synthetic question?',
      answer: 'Synthetic answer.',
      category: 'Synthetic',
    },
  }));
  const button = markup.match(/<button\b[^>]*>/)?.[0];
  assert.ok(button, 'question button is rendered');
  assert.match(button, /type="button"/);
  assert.match(button, /aria-expanded="false"/);
  assert.match(button, /aria-controls="[^"]+"/);
  assert.match(button, /\bid="[^"]+"/);
  assert.match(markup, /<h3\b[^>]*><button\b[^>]*>[\s\S]*?Synthetic question\?[\s\S]*?<\/button><\/h3>/);
  assert.match(markup, /<svg\b[^>]*aria-hidden="true"/);
  assert.doesNotMatch(markup, /Synthetic answer\./);
});

test('FAQ panels are named regions with stable IDs and visible keyboard focus', () => {
  const source = readFileSync(path.join(ROOT, 'app/faq/faq-item.tsx'), 'utf8');
  assert.match(source, /role="region"/);
  assert.match(source, /aria-labelledby=\{buttonId\}/);
  assert.match(source, /id=\{panelId\}/);
  assert.match(source, /useId/);
  assert.match(source, /focus-visible:/);
});

test('FAQ page retains the published setup timeline copy', () => {
  const source = readFileSync(path.join(ROOT, 'app/faq/page.tsx'), 'utf8');
  assert.ok(source.includes('Most labs are operational within 5-10 business days.'));
});
