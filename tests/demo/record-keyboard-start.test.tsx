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

test('native keyboard start control and splash click enter the same playback state', async t => {
  let splashPlayback = '';
  for (const entry of ['splash', 'button']) {
    await t.test(entry, t => {
      const player = mount(t);
      const splash = player.render();
      assert.match(renderToStaticMarkup(splash), /Recording mode — click anywhere to start/);
      assert.equal(player.timers.size, 0);

      const buttons = elements(splash).filter(element => element.type === 'button');
      assert.equal(buttons.length, 1);
      const button = buttons[0];
      assert.equal(button.props.type, 'button');
      assert.equal(button.props.children, 'Start recording');
      assert.match(button.props['aria-label'] ?? button.props.children, /^start recording$/i);
      assert.ok(button.props.tabIndex === undefined || button.props.tabIndex >= 0);
      assert.ok(!button.props.disabled);
      assert.ok(!button.props.hidden);
      assert.match(button.props.className, /\bfocus-visible:outline-2\b/);
      assert.match(button.props.className, /\bfocus-visible:outline-offset-4\b/);
      assert.match(button.props.className, /\bfocus-visible:outline-white\b/);

      if (entry === 'button') {
        let stopped = false;
        button.props.onClick({ stopPropagation() { stopped = true; } });
        // Model bubbling before React flushes the event's state updates.
        if (!stopped) splash.props.onClick();
        assert.equal(stopped, true);
      } else {
        splash.props.onClick();
      }

      const playback = renderToStaticMarkup(player.render());
      assert.match(playback, />Sample Intake</);
      assert.match(playback, />0:00</);
      assert.match(playback, />1\/5</);
      assert.match(playback, /Every sample\. Tracked\./);
      assert.match(playback, /style="width:0%"/);
      assert.doesNotMatch(playback, /Start recording/);
      if (entry === 'splash') splashPlayback = playback;
      else assert.equal(playback, splashPlayback);
      player.render();
      assert.equal(player.timers.size, 1);
      assert.equal(player.interval.mock.callCount(), 1);
    });
  }
});
