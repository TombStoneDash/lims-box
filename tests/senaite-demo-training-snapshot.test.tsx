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
  assert.match(text, /All training current as of 2026-04-13/);
  assert.match(text, /All Competencies Current in Snapshot/);
  assert.match(text, /All Current in Snapshot/);
  assert.match(text, /expires May 01, 2026 \(18 days after the 2026-04-13 snapshot\)/);
  assert.doesNotMatch(text, /days from now/i);
});
