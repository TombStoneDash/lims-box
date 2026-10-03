import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RecordPage from '../../app/demo/record/page';

function mount(t: TestContext) {
  const states: unknown[] = [];
  const effects: { deps: unknown[]; cleanup?: () => void }[] = [];
  let stateIndex = 0;
  let effectIndex = 0;
  let pending: (() => void)[] = [];
  let dirty = false;
  let now = 0;
  let nextId = 0;
  let transitionCount = 0;
  const timers = new Map<number, { callback: () => void; due: number; interval?: number }>();

  t.mock.method(React, 'useState', (initial: unknown) => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = initial;
    return [states[index], (next: unknown) => {
      const previous = states[index];
      if (typeof next === 'function') {
        // React may replay updater functions; they must remain pure.
        const first = next(previous);
        next = next(previous);
        assert.deepEqual(next, first);
      }
      states[index] = next;
      dirty ||= !Object.is(previous, next);
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
  t.mock.method(globalThis, 'setInterval', (callback: () => void, delay: number) => {
    assert.equal(delay, 1000);
    timers.set(++nextId, { callback, due: now + delay, interval: delay });
    return nextId;
  });
  t.mock.method(globalThis, 'setTimeout', (callback: () => void, delay: number) => {
    assert.equal(delay, 800);
    transitionCount++;
    timers.set(++nextId, { callback, due: now + delay });
    return nextId;
  });
  t.mock.method(globalThis, 'clearInterval', (id: number) => timers.delete(id));
  t.mock.method(globalThis, 'clearTimeout', (id: number) => timers.delete(id));

  let tree: ReturnType<typeof RecordPage>;
  function render() {
    do {
      dirty = false;
      stateIndex = effectIndex = 0;
      pending = [];
      tree = RecordPage();
      pending.forEach(effect => effect());
    } while (dirty);
    return tree;
  }
  function advance(ms: number) {
    const end = now + ms;
    while (true) {
      const next = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
      if (!next || next[1].due > end) break;
      const [id, timer] = next;
      now = timer.due;
      if (timer.interval) timer.due += timer.interval;
      else timers.delete(id);
      timer.callback();
      if (dirty) render();
    }
    now = end;
  }
  function unmount() {
    effects.forEach(effect => effect.cleanup?.());
  }
  t.after(unmount);
  render();
  return {
    start() { tree.props.onClick(); render(); },
    render, advance, unmount,
    markup: () => renderToStaticMarkup(tree),
    timers,
    get transitions() { return transitionCount; },
    get hasPendingUpdate() { return dirty; },
  };
}

test('recording completes all five screens once and stays at 150 seconds with no timers', t => {
  const player = mount(t);
  assert.match(player.markup(), /click anywhere to start/);
  player.advance(10000);
  assert.equal(player.timers.size, 0);
  player.start();

  const titles = ['Sample Intake', 'Audit Trail', 'QC Dashboard', 'Reporting', 'LIMS BOT'];
  for (let step = 0; step < titles.length; step++) {
    assert.match(player.markup(), new RegExp(`>${titles[step]}<`));
    assert.ok(player.markup().includes(`>${step + 1}/5<`));
    assert.equal(player.timers.size, 1);
    player.advance(29000);
    const elapsed = step * 30 + 29;
    assert.ok(player.markup().includes(`>${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}<`));
    player.advance(1000);
    if (step < 4) {
      assert.equal(player.transitions, step + 1);
      assert.equal(player.timers.size, 1);
      assert.match(player.markup(), /duration-500 opacity-0/);
      player.render();
      player.render();
      assert.equal(player.transitions, step + 1);
      player.advance(799);
      assert.match(player.markup(), new RegExp(`>${titles[step]}<`));
      player.advance(1);
    }
  }
  const completed = player.markup();
  assert.match(completed, /text-sm text-white">2:30<\/span>/);
  assert.match(completed, /style="width:100%"/);
  assert.match(completed, />5\/5</);
  assert.match(completed, />LIMS BOT</);
  assert.match(completed, /What samples are pending verification/);
  assert.match(completed, /duration-500 opacity-100/);
  assert.equal(player.transitions, 4);
  assert.equal(player.timers.size, 0);
  player.advance(160000);
  player.render();
  assert.equal(player.markup(), completed);
  assert.equal(player.transitions, 4);
  assert.equal(player.timers.size, 0);
});

for (const seconds of [12, 30]) {
  test(`unmount at ${seconds}s clears ${seconds === 30 ? 'pending transition' : 'recording interval'}`, t => {
    const player = mount(t);
    player.start();
    player.advance(seconds * 1000);
    assert.equal(player.timers.size, 1);
    assert.equal(player.transitions, seconds === 30 ? 1 : 0);
    const before = player.markup();
    player.unmount();
    assert.equal(player.timers.size, 0);
    player.advance(160000);
    assert.equal(player.hasPendingUpdate, false);
    assert.equal(player.markup(), before);
  });
}
