import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { tick, goTo, togglePause, type WalkthroughPlayerState } from '../../lib/walkthrough-player';

const initial: WalkthroughPlayerState = Object.freeze({
  step: 0, elapsed: 0, paused: false, finished: false,
});

test('ticks advance exactly at the step duration without mutating input', () => {
  let state = initial;
  for (let second = 1; second < 30; second++) {
    state = tick(state, 5, 30);
    assert.equal(state.step, 0);
    assert.equal(state.elapsed, second);
  }
  assert.deepEqual(tick(state, 5, 30), { ...initial, step: 1 });
  assert.deepEqual(tick(state, 5, 30), tick(state, 5, 30));
  assert.equal(state.elapsed, 29);
  assert.equal(initial.elapsed, 0);
});

test('completion pauses at the last step and further ticks do nothing', () => {
  let state = initial;
  for (let second = 0; second < 150; second++) {
    state = tick(state, 5, 30);
    assert.ok(state.step >= 0 && state.step < 5);
  }
  assert.deepEqual(state, { step: 4, elapsed: 30, paused: true, finished: true });
  assert.equal(tick(state, 5, 30), state);
  assert.deepEqual(tick(initial, 1, 1), {
    step: 0, elapsed: 1, paused: true, finished: true,
  });
});

test('paused state ignores ticks', () => {
  const state = { ...initial, paused: true, elapsed: 12 };
  assert.equal(tick(state, 5, 30), state);
});

test('goTo resets elapsed and completion while preserving pause preference', () => {
  assert.deepEqual(goTo({ ...initial, elapsed: 12 }, 3), { ...initial, step: 3 });
  assert.deepEqual(goTo({ step: 4, elapsed: 30, paused: true, finished: true }, 1), {
    step: 1, elapsed: 0, paused: true, finished: false,
  });
});

test('toggle pauses and resumes in place, and play after completion restarts', () => {
  const state = { ...initial, step: 2, elapsed: 12 };
  assert.deepEqual(togglePause(state), { ...state, paused: true });
  assert.deepEqual(togglePause(togglePause(state)), state);
  assert.deepEqual(togglePause({ step: 4, elapsed: 30, paused: true, finished: true }), initial);
});

test('page includes named playback controls, current step, heading and motion preference', () => {
  const source = readFileSync(new URL('../../app/demo/walkthrough/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /aria-label=\{paused \? 'Play walkthrough' : 'Pause walkthrough'\}/);
  assert.match(source, /aria-pressed=\{paused\}/);
  assert.match(source, /aria-current=\{i === currentStep \? 'step' : undefined\}/);
  assert.ok(source.includes('aria-label={`Step ${i + 1}: ${s.title}`}'));
  assert.match(source, /<h1 className="sr-only">LIMS BOX guided walkthrough<\/h1>/);
  assert.ok(source.includes("window.matchMedia('(prefers-reduced-motion: reduce)').matches"));
  assert.equal((source.match(/setInterval\(/g) ?? []).length, 1);
});
