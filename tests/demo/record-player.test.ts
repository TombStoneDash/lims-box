import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatClock, advancePlayer } from '../../lib/demo-record-player';
import RecordPage from '../../app/demo/record/page';

test('formatClock renders m:ss and clamps bad input to 0:00', () => {
  assert.equal(formatClock(150), '2:30');
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(59), '0:59');
  assert.equal(formatClock(61), '1:01');
  assert.equal(formatClock(-5), '0:00');
  assert.equal(formatClock(NaN), '0:00');
});

test('advancePlayer ticks elapsed and rolls over to the next step', () => {
  assert.deepEqual(advancePlayer({ step: 0, elapsed: 29 }, 5, 30), { step: 1, elapsed: 0, finished: false });
  assert.deepEqual(advancePlayer({ step: 0, elapsed: 0 }, 5, 30), { step: 0, elapsed: 1, finished: false });
});

test('advancePlayer settles on the last step and stays idempotent', () => {
  const settled = advancePlayer({ step: 4, elapsed: 29 }, 5, 30);
  assert.deepEqual(settled, { step: 4, elapsed: 30, finished: true });
  const again = advancePlayer(settled, 5, 30);
  assert.equal(again.finished, true);
  assert.equal(again.step, settled.step);
});

test('the initial splash renders the same total both places and never shows 2.5', () => {
  const markup = renderToStaticMarkup(React.createElement(RecordPage));
  assert.match(markup, /= 2:30 total/);
  assert.doesNotMatch(markup, /2\.5/);
});

test('the start control is a real, keyboard-reachable button', () => {
  const markup = renderToStaticMarkup(React.createElement(RecordPage));
  assert.match(markup, /<button type="button"/);
  assert.match(markup, /press Enter/);
});

test('the page wires up the pure module, an honest end state, and reduced-motion handling', () => {
  const source = readFileSync(new URL('../../app/demo/record/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /from '@\/lib\/demo-record-player'/);
  assert.match(source, /role="status"/);
  assert.match(source, /prefers-reduced-motion/);
  assert.doesNotMatch(source, /\{totalTime \/ 60\}/);
});
