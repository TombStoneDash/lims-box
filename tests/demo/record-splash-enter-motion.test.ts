import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RecordPage from '../../app/demo/record/page';

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}

function mount(t: TestContext) {
  const states: unknown[] = [];
  const effects: { deps: unknown[]; cleanup?: () => void }[] = [];
  let stateIndex = 0;
  let effectIndex = 0;
  let pending: (() => void)[] = [];
  let nextId = 0;
  const timers = new Map<number, () => void>();

  t.mock.method(React, 'useState', (initial: unknown) => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = initial;
    return [states[index], (next: unknown) => {
      states[index] = typeof next === 'function' ? next(states[index]) : next;
    }];
  });
  t.mock.method(React, 'useEffect', (setup: () => (() => void) | void, deps: unknown[]) => {
    const index = effectIndex++;
    const previous = effects[index];
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
      pending.push(() => {
        previous?.cleanup?.();
        effects[index] = { deps, cleanup: setup() || undefined };
      });
    }
  });
  const interval = t.mock.method(globalThis, 'setInterval', (callback: () => void, delay: number) => {
    assert.equal(delay, 1000);
    timers.set(++nextId, callback);
    return nextId;
  });
  t.mock.method(globalThis, 'clearInterval', (id: number) => timers.delete(id));
  t.mock.method(globalThis, 'setTimeout', () => assert.fail('No transition timer at playback start'));
  t.after(() => effects.forEach(effect => effect.cleanup?.()));

  function render() {
    stateIndex = effectIndex = 0;
    pending = [];
    const tree = RecordPage();
    pending.forEach(effect => effect());
    return tree;
  }
  return { render, timers, interval };
}

test('splash Start recording button auto-focuses and keeps the Enter caption', t => {
  const player = mount(t);
  const splash = player.render();
  const markup = renderToStaticMarkup(splash);
  assert.match(markup, /Recording mode — click anywhere to start/);
  assert.match(markup, /press Enter/);

  const buttons = elements(splash).filter(element => element.type === 'button');
  assert.equal(buttons.length, 1);
  assert.match(renderToStaticMarkup(buttons[0]), /<button[^>]*\sautofocus=""/);
});

test('playback content wrapper and progress fill disable transitions under motion-reduce', t => {
  const player = mount(t);
  const splash = player.render();

  const buttons = elements(splash).filter(element => element.type === 'button');
  let stopped = false;
  buttons[0].props.onClick({ stopPropagation() { stopped = true; } });
  if (!stopped) splash.props.onClick();

  const playback = player.render();
  const all = elements(playback);

  const wrapper = all.find(element =>
    typeof element.props.className === 'string'
    && element.props.className.includes('transition-opacity duration-500')
    && /\bopacity-(0|100)\b/.test(element.props.className)
  );
  assert.ok(wrapper, 'expected to find the main content wrapper');
  assert.match(wrapper!.props.className, /\bmotion-reduce:transition-none\b/);

  const fill = all.find(element =>
    typeof element.props.className === 'string'
    && element.props.className.includes('transition-all duration-1000 ease-linear')
  );
  assert.ok(fill, 'expected to find the progress bar fill');
  assert.match(fill!.props.className, /\bmotion-reduce:transition-none\b/);
});
