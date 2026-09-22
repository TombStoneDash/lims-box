import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../../app/demo/record/page.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

// Execute the actual page with controlled hooks and timers, without adding
// unsupported exports to a Next page or duplicating its transition logic.
function mount() {
  const states: any[] = [];
  const timers = new Map<number, { callback: () => void; delay: number; repeat: boolean }>();
  let nextId = 0;
  let cursor = 0;
  let dependencies: unknown[] | undefined;
  let cleanup: (() => void) | undefined;
  let setup: (() => void | (() => void)) | undefined;
  let tree: any;
  const schedule = (callback: () => void, delay: number, repeat: boolean) => {
    const id = ++nextId;
    timers.set(id, { callback, delay, repeat });
    return id;
  };
  const module = { exports: {} as { default: () => any } };
  runInNewContext(compiled, {
    exports: module.exports,
    require: (name: string) => name === 'react' ? {
      useState(initial: unknown) {
        const index = cursor++;
        if (!(index in states)) states[index] = Object.freeze(initial);
        return [states[index], (update: any) => {
          if (typeof update === 'function') {
            const previous = states[index];
            const timerCount = timers.size;
            const first = update(previous);
            const replay = update(previous);
            assert.deepEqual(first, replay, 'updaters must be replayable');
            assert.equal(timers.size, timerCount, 'updaters must not schedule timers');
            states[index] = Object.freeze(first);
          } else states[index] = Object.freeze(update);
        }];
      },
      useEffect(effect: typeof setup, deps: unknown[]) {
        if (!dependencies || deps.some((value, i) => value !== dependencies![i])) {
          cleanup?.();
          setup = effect;
          cleanup = effect() || undefined;
          dependencies = deps;
        }
      },
    } : require(name),
    setInterval: (callback: () => void, delay: number) => schedule(callback, delay, true),
    setTimeout: (callback: () => void, delay: number) => schedule(callback, delay, false),
    clearInterval: (id: number) => timers.delete(id),
    clearTimeout: (id: number) => timers.delete(id),
  });
  const render = () => { cursor = 0; tree = module.exports.default(); };
  render();
  return {
    get state() { return states[0]; },
    get tree() { return tree; },
    timers,
    start() { tree.props.onClick(); render(); },
    fire() {
      assert.equal(timers.size, 1, 'exactly one timer should be active');
      const [id, timer] = [...timers][0];
      if (!timer.repeat) timers.delete(id);
      timer.callback();
      render();
      return timer;
    },
    render,
    replayEffect() { cleanup?.(); cleanup = setup?.() || undefined; },
    unmount() { cleanup?.(); },
  };
}

function reachLastTransition(page: ReturnType<typeof mount>) {
  page.start();
  for (let screen = 0; screen < 4; screen++) {
    const staleTick = [...page.timers.values()][0].callback;
    for (let second = 0; second < 30; second++) {
      assert.equal(page.fire().delay, 1000);
    }
    const boundary = page.state;
    staleTick();
    staleTick();
    page.render();
    assert.equal(page.state, boundary);
    assert.equal(page.timers.size, 1);
    assert.equal(page.state.current, screen);
    assert.equal(page.state.elapsed, 30);
    assert.equal(page.state.transitioning, true);
    if (screen < 3) assert.equal(page.fire().delay, 800);
  }
}

test('penultimate transition advances once despite replay and stale callbacks', () => {
  const page = mount();
  assert.equal(page.timers.size, 0);
  reachLastTransition(page);
  const staleTransition = [...page.timers.values()][0].callback;
  page.replayEffect();
  assert.equal(page.timers.size, 1);
  assert.equal(page.fire().delay, 800);
  assert.equal(page.state.current, 4);
  assert.equal(page.state.elapsed, 0);
  assert.equal(page.state.transitioning, false);
  staleTransition();
  page.render();
  assert.equal(page.state.current, 4);
  assert.equal(page.timers.size, 1);
  page.unmount();
  assert.equal(page.timers.size, 0);
});

test('final boundary reaches 150 seconds and 100%, holds the screen, and stops ticking', () => {
  const page = mount();
  reachLastTransition(page);
  page.fire();
  for (let second = 0; second < 29; second++) page.fire();
  assert.equal(page.state.current * 30 + page.state.elapsed, 149);
  const extraTick = [...page.timers.values()][0].callback;
  page.fire();
  assert.equal(page.state.current, 4);
  assert.equal(page.state.elapsed, 30);
  assert.equal(page.state.finished, true);
  assert.equal(page.state.transitioning, false);
  assert.equal(page.state.current * 30 + page.state.elapsed, 150);
  assert.match(JSON.stringify(page.tree), /"width":"100%"/);
  assert.equal(page.tree.props.children[0].props.children[1].props.children.join(''), '2:30');
  assert.equal(page.timers.size, 0);
  const terminal = page.state;
  for (let i = 0; i < 10; i++) extraTick();
  page.render();
  assert.equal(page.state, terminal);
  assert.equal(page.timers.size, 0);
  page.replayEffect();
  assert.equal(page.timers.size, 0);
  page.unmount();
});

test('cleanup clears a pending transition timeout as well as a running interval', () => {
  const running = mount();
  running.start();
  running.replayEffect();
  assert.equal(running.timers.size, 1);
  running.unmount();
  assert.equal(running.timers.size, 0);

  const transitioning = mount();
  reachLastTransition(transitioning);
  assert.equal([...transitioning.timers.values()][0].repeat, false);
  transitioning.unmount();
  assert.equal(transitioning.timers.size, 0);
  assert.equal(transitioning.state.current, 3);
});
