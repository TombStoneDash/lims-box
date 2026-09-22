import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Match the dependency-free component harness used by the other page tests.
// The preserved JSX uses the classic runtime, including module-level scenes.
Object.assign(globalThis, { React });

type Effect = { deps?: React.DependencyList; cleanup?: () => void };
type Timer = { callback: () => void; at: number; repeat: number };

async function mount(t: TestContext) {
  const { default: RecordPage } = await import('../../app/demo/record/page');
  const states: unknown[] = [];
  const effects: Effect[] = [];
  const timers = new Map<number, Timer>();
  let stateIndex = 0;
  let effectIndex = 0;
  let pending: Array<() => void> = [];
  let dirty = true;
  let mounted = true;
  let inUpdater = false;
  let writes = 0;
  let now = 0;
  let nextId = 0;
  let tree: React.ReactElement;

  t.mock.method(React, 'useState', (initial: unknown) => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
    return [states[index], (next: unknown) => {
      assert.ok(mounted, 'no state updates after unmount');
      writes++;
      let value = next;
      if (typeof next === 'function') {
        inUpdater = true;
        try {
          value = next(states[index]);
          // React may replay an updater. It must remain pure.
          assert.deepEqual(next(states[index]), value);
        } finally {
          inUpdater = false;
        }
      }
      if (!Object.is(states[index], value)) {
        states[index] = value;
        dirty = true;
      }
    }];
  });
  t.mock.method(React, 'useCallback', (callback: unknown) => callback);
  t.mock.method(React, 'useEffect', (setup: () => void | (() => void), deps?: React.DependencyList) => {
    const index = effectIndex++;
    const previous = effects[index];
    if (!previous || !deps || !previous.deps || deps.some((dep, i) => !Object.is(dep, previous.deps![i]))) {
      pending.push(() => {
        previous?.cleanup?.();
        const cleanup = setup();
        effects[index] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined };
      });
    }
  });

  function schedule(callback: () => void, delay: number, repeat: number) {
    assert.equal(inUpdater, false, 'timers must not be scheduled inside state updaters');
    const id = ++nextId;
    timers.set(id, { callback, at: now + delay, repeat });
    return id;
  }
  t.mock.method(globalThis, 'setInterval', (callback: () => void, delay: number) => schedule(callback, delay, delay));
  t.mock.method(globalThis, 'setTimeout', (callback: () => void, delay: number) => schedule(callback, delay, 0));
  t.mock.method(globalThis, 'clearInterval', (id: number) => timers.delete(id));
  t.mock.method(globalThis, 'clearTimeout', (id: number) => timers.delete(id));

  function render() {
    let renders = 0;
    do {
      assert.ok(++renders < 20, 'render settles');
      dirty = false;
      stateIndex = 0;
      effectIndex = 0;
      pending = [];
      tree = RecordPage();
      for (const setup of pending) setup();
    } while (dirty);
    return tree;
  }
  function advance(ms: number) {
    const end = now + ms;
    while (true) {
      const entry = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry || entry[1].at > end) break;
      const [id, timer] = entry;
      now = timer.at;
      if (timer.repeat) timer.at += timer.repeat;
      else timers.delete(id);
      timer.callback();
      if (mounted && dirty) render();
    }
    now = end;
  }
  function unmount() {
    if (!mounted) return;
    for (const effect of effects) effect.cleanup?.();
    mounted = false;
  }
  t.after(unmount);
  render();
  return {
    advance, unmount,
    start() { tree.props.onClick(); render(); },
    markup: () => renderToStaticMarkup(tree),
    writes: () => writes,
    intervals: () => [...timers.values()].filter(timer => timer.repeat).length,
    timeouts: () => [...timers.values()].filter(timer => !timer.repeat).length,
  };
}

const titles = ['Sample Intake', 'Audit Trail', 'QC Dashboard', 'Reporting', 'LIMS BOT'];
const overlays = ['Every sample. Tracked.', 'Every action. Logged.', 'Enterprise-grade traceability.', 'Ready in minutes.', 'Ask in plain English.'];

function assertScene(markup: string, step: number) {
  assert.ok(markup.includes(titles[step]));
  assert.ok(markup.includes(overlays[step]));
  assert.ok(markup.includes(`>${step + 1}/5<`));
}

test('recording starts on click, plays all five scenes, and stays visible at 100 percent', async t => {
  const page = await mount(t);
  assert.match(page.markup(), /Recording mode — click anywhere to start/);
  const splash = page.markup();
  page.advance(60_000);
  assert.equal(page.markup(), splash);
  assert.equal(page.intervals(), 0);
  assert.equal(page.timeouts(), 0);
  page.start();

  for (let step = 0; step < 5; step++) {
    assertScene(page.markup(), step);
    assert.match(page.markup(), /duration-500 opacity-100/);
    assert.equal(page.intervals(), 1);
    page.advance(29_000);
    assertScene(page.markup(), step);
    assert.ok(page.markup().includes(`width:${((step * 30 + 29) / 150) * 100}%`));
    page.advance(1_000);
    assert.equal(page.intervals(), 0);
    if (step < 4) {
      assertScene(page.markup(), step);
      assert.match(page.markup(), /duration-500 opacity-0/);
      assert.equal(page.timeouts(), 1);
      page.advance(799);
      assertScene(page.markup(), step);
      page.advance(1);
      assertScene(page.markup(), step + 1);
      assert.equal(page.timeouts(), 0);
    }
  }

  const completed = page.markup();
  assertScene(completed, 4);
  assert.match(completed, /duration-500 opacity-100/);
  assert.match(completed, /width:100%/);
  assert.match(completed, /font-mono text-sm text-white">2:30<\/span>/);
  assert.equal(page.timeouts(), 0);
  const writes = page.writes();
  page.advance(300_000);
  assert.equal(page.markup(), completed);
  assert.equal(page.writes(), writes);
  assert.equal(page.intervals(), 0);
});

for (const phase of ['playing', 'transitioning'] as const) {
  test(`unmount during ${phase} cancels pending timers`, async t => {
    const page = await mount(t);
    page.start();
    page.advance(phase === 'playing' ? 5_000 : 30_000);
    assert.equal(page.intervals(), phase === 'playing' ? 1 : 0);
    assert.equal(page.timeouts(), phase === 'transitioning' ? 1 : 0);
    page.unmount();
    assert.equal(page.intervals(), 0);
    assert.equal(page.timeouts(), 0);
    const writes = page.writes();
    page.advance(300_000);
    assert.equal(page.writes(), writes);
  });
}
