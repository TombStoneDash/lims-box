import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShareButtons } from '../../components/blog/ShareButtons';

function harness(t: TestContext) {
  let now = 0;
  let nextTimer = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  t.mock.method(globalThis, 'setTimeout', (run: () => void, delay: number) => {
    const id = ++nextTimer;
    timers.set(id, { at: now + delay, run });
    return id;
  });
  t.mock.method(globalThis, 'clearTimeout', (id: number) => { timers.delete(id); });
  const advance = (milliseconds: number) => {
    const target = now + milliseconds;
    while (true) {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].run();
    }
    now = target;
  };

  const writeText = t.mock.fn(async (_url: string) => {});
  for (const [key, value] of Object.entries({
    navigator: { clipboard: { writeText } },
    document: {
      createElement: () => ({ value: '', select() {}, remove() {} }),
      body: { appendChild() {} },
      execCommand: () => false,
    },
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }

  // Exercise the real handler and JSX using the repository's hook harness pattern.
  let state: unknown = 'idle';
  const setState = t.mock.fn((next: unknown) => {
    state = typeof next === 'function' ? next(state) : next;
  });
  t.mock.method(React, 'useState', () => [state, setState]);
  let ref: { current: unknown } | undefined;
  t.mock.method(React, 'useRef', (initial: unknown) => ref ??= { current: initial });
  let mounted = false;
  let cleanup: (() => void) | undefined;
  t.mock.method(React, 'useEffect', (effect: () => (() => void)) => {
    if (!mounted) {
      mounted = true;
      cleanup = effect();
    }
  });
  const render = () => ShareButtons({ title: 'Lab news', url: 'https://lims.bot/blog/lab-news' });
  const click = () => {
    const button = render().props.children.find((child: React.ReactElement) => child.type === 'button');
    return button.props.onClick();
  };
  const status = (expected: string) => {
    const tree = render();
    const live = tree.props.children.find((child: React.ReactElement) => child.props.role === 'status');
    assert.equal(live.props.children, expected);
    assert.equal(live.props['aria-live'], 'polite');
    const markup = renderToStaticMarkup(tree);
    assert.ok(markup.includes(`aria-label="${expected === 'Link copied' ? 'Link copied' : 'Copy link'}"`));
  };
  return { click, status, advance, timers, writeText, setState, unmount: () => cleanup?.() };
}

test('successes 1.5 seconds apart each receive a full two-second confirmation', async t => {
  const h = harness(t);
  await h.click();
  h.status('Link copied');
  h.advance(1500);
  await h.click();
  assert.equal(h.timers.size, 1);
  h.advance(500);
  h.status('Link copied');
  h.advance(1499);
  h.status('Link copied');
  h.advance(1);
  h.status('');
  assert.equal(h.timers.size, 0);
});

test('a failed attempt cancels the previous reset and retains its failure message', async t => {
  const h = harness(t);
  await h.click();
  h.advance(1500);
  h.writeText.mock.mockImplementation(async () => { throw new Error('Clipboard denied'); });
  const failedAttempt = h.click();
  assert.equal(h.timers.size, 0, 'cancel the reset before clipboard work completes');
  await failedAttempt;
  h.status("Couldn't copy link. Try again.");
  h.advance(2500);
  h.status("Couldn't copy link. Try again.");
});

test('unmount cancels the pending confirmation reset', async t => {
  const h = harness(t);
  await h.click();
  assert.equal(h.timers.size, 1);
  const updates = h.setState.mock.callCount();
  h.unmount();
  assert.equal(h.timers.size, 0);
  h.advance(2000);
  assert.equal(h.setState.mock.callCount(), updates);
});

test('clipboard completion after unmount cannot schedule a reset or update status', async t => {
  const h = harness(t);
  let finish!: () => void;
  h.writeText.mock.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  const pending = h.click();
  h.unmount();
  const updates = h.setState.mock.callCount();
  finish();
  await pending;
  assert.equal(h.timers.size, 0);
  assert.equal(h.setState.mock.callCount(), updates);
});
