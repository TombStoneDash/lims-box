import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShareButtons, copyShareLink } from '../../components/blog/ShareButtons';

const url = 'https://lims.bot/blog/lab-news';

function browserMocks(t: TestContext, modernSucceeds: boolean, legacyResult: boolean | Error) {
  const children = new Set<unknown>();
  const textarea = {
    value: '',
    select: t.mock.fn(),
    remove: t.mock.fn(() => children.delete(textarea)),
  };
  const writeText = t.mock.fn(async (value: string) => {
    assert.equal(value, url);
    if (!modernSucceeds) throw new Error('Clipboard denied');
  });
  const createElement = t.mock.fn((tag: string) => {
    assert.equal(tag, 'textarea');
    return textarea;
  });
  const execCommand = t.mock.fn((command: string) => {
    assert.equal(command, 'copy');
    assert.equal(textarea.value, url);
    assert.ok(children.has(textarea));
    assert.equal(textarea.select.mock.callCount(), 1);
    if (legacyResult instanceof Error) throw legacyResult;
    return legacyResult;
  });
  for (const [key, value] of Object.entries({
    navigator: { clipboard: { writeText } },
    document: {
      createElement,
      body: { appendChild: (child: unknown) => children.add(child) },
      execCommand,
    },
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  return { children, textarea, writeText, createElement, execCommand };
}

test('modern copy succeeds without creating a legacy textarea', async t => {
  const browser = browserMocks(t, true, false);
  assert.equal(await copyShareLink(url), true);
  assert.equal(browser.writeText.mock.callCount(), 1);
  assert.equal(browser.createElement.mock.callCount(), 0);
  assert.equal(browser.execCommand.mock.callCount(), 0);
});

test('successful legacy fallback reports success and removes its textarea', async t => {
  const browser = browserMocks(t, false, true);
  assert.equal(await copyShareLink(url), true);
  assert.equal(browser.writeText.mock.callCount(), 1);
  assert.equal(browser.execCommand.mock.callCount(), 1);
  assert.equal(browser.textarea.remove.mock.callCount(), 1);
  assert.equal(browser.children.size, 0);
});

for (const [mode, result] of [
  ['returns false', false],
  ['throws', new Error('Legacy copy denied')],
] as const) {
  test(`legacy copy ${mode}: reports failure and cleans up`, async t => {
    const browser = browserMocks(t, false, result);
    assert.equal(await copyShareLink(url), false);
    assert.equal(browser.execCommand.mock.callCount(), 1);
    assert.equal(browser.textarea.remove.mock.callCount(), 1);
    assert.equal(browser.children.size, 0);
  });

  test(`legacy copy ${mode}: announces failure, keeps retry available, and recovers`, async t => {
    const browser = browserMocks(t, false, result);
    // A minimal state harness exercises the actual handler and rendered feedback
    // without adding a DOM or renderer dependency.
    let state: unknown = 'idle';
    const feedback = { current: { timer: null, attempt: 0 } };
    t.mock.method(React, 'useRef', () => feedback);
    t.mock.method(React, 'useEffect', () => {});
    t.mock.method(React, 'useState', () => [state, (next: unknown) => {
      state = typeof next === 'function' ? next(state) : next;
    }]);
    const timers = t.mock.method(globalThis, 'setTimeout', () => 0);
    const render = () => ShareButtons({ title: 'Lab news', url });
    const click = () => {
      const button = render().props.children.find((child: React.ReactElement) => child.type === 'button');
      assert.equal(button.props.disabled, undefined);
      return button.props.onClick();
    };

    await click();
    const failed = renderToStaticMarkup(render());
    assert.match(failed, /title="Couldn&#x27;t copy link\. Try again\."/);
    assert.match(failed, /role="status" aria-live="polite">Couldn&#x27;t copy link\. Try again\.<\/span>/);
    assert.match(failed, /aria-label="Copy link"/);
    assert.doesNotMatch(failed, /Link copied|Copied!/);
    assert.equal(timers.mock.callCount(), 0);
    assert.equal(browser.children.size, 0);

    browser.writeText.mock.mockImplementation(async () => {});
    await click();
    const recovered = renderToStaticMarkup(render());
    assert.match(recovered, /aria-label="Link copied"/);
    assert.match(recovered, /title="Copied!"/);
    assert.match(recovered, /role="status" aria-live="polite">Link copied<\/span>/);
    assert.doesNotMatch(recovered, /Try again/);
    assert.equal(timers.mock.callCount(), 1);
    assert.equal(timers.mock.calls[0].arguments[1], 2000);
    assert.equal(browser.writeText.mock.callCount(), 2);
    assert.equal(browser.execCommand.mock.callCount(), 1);
  });
}
