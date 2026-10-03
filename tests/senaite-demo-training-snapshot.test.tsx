import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TrainingPage from '../app/senaite-demo/training/page';

test('training page qualifies statuses and reminders with the fixed synthetic snapshot date', () => {
  const markup = renderToStaticMarkup(<TrainingPage />);
  const text = markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  assert.match(text, /Synthetic training snapshot as of 2026-04-13\./);
  assert.match(text, /All training statuses and reminders reflect this fixed demo date\./);
  // Status is derived from the competency dates (LIMS-SENAITE-DEMO-TRAINING-STATUS-DERIVED): one competency
  // expires 18 days after the fixed date, so the page must no longer claim that all training is current.
  assert.doesNotMatch(text, /All training current as of/);
  assert.match(text, /4 staff — 0 expired, 1 expiring within 60 days \(as of April 13, 2026, synthetic\)/);
  assert.match(text, /1 expiring soon/);
  assert.match(text, /All current/);
  assert.match(text, /Expires in 18 days/);
  assert.match(text, /expires May 01, 2026, 18 days after the demo(?:'|&#x27;)s fixed date of April 13, 2026/);
  assert.doesNotMatch(text, /days from now/i);
});
