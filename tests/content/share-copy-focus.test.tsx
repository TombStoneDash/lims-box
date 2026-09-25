import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { copyShareLink } from '../../components/blog/ShareButtons';

const url = 'https://lims.bot/blog/lab-news';

function browserMocks(t: TestContext, legacyResult: boolean | Error, modernSucceeds = false) {
  const children = new Set<unknown>();
  const original = {
    isConnected: true,
    focus: t.mock.fn((options: FocusOptions) => {
      assert.deepEqual(options, { preventScroll: true });
      activeElement = original;
    }),
  };
  let activeElement: unknown = original;
  const textarea = {
    value: '',
    style: { cssText: '' },
    select: t.mock.fn(() => {
      activeElement = textarea;
    }),
    remove: t.mock.fn(() => {
      children.delete(textarea);
      if (activeElement === textarea) activeElement = null;
    }),
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
    assert.equal(activeElement, textarea);
    if (legacyResult instanceof Error) throw legacyResult;
    return legacyResult;
  });
  const document = {
    get activeElement() { return activeElement; },
    createElement,
    body: { appendChild: (child: unknown) => children.add(child) },
    execCommand,
  };
  for (const [key, value] of Object.entries({ navigator: { clipboard: { writeText } }, document })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  return { original, textarea, children, document, writeText, createElement, execCommand };
}

for (const [mode, result] of [
  ['succeeds', true],
  ['returns false', false],
  ['throws', new Error('Legacy copy denied')],
] as const) {
  test(`legacy copy ${mode}: restores focus after selection and removes textarea`, async t => {
    const browser = browserMocks(t, result);
    assert.equal(await copyShareLink(url), result === true);
    assert.equal(browser.execCommand.mock.callCount(), 1);
    assert.equal(browser.textarea.select.mock.callCount(), 1);
    assert.equal(browser.original.focus.mock.callCount(), 1);
    assert.equal(browser.document.activeElement, browser.original);
    assert.equal(browser.textarea.remove.mock.callCount(), 1);
    assert.equal(browser.children.size, 0);
    assert.match(browser.textarea.style.cssText, /position:\s*fixed/);
    assert.match(browser.textarea.style.cssText, /top:\s*0/);
    assert.match(browser.textarea.style.cssText, /left:\s*0/);
  });

  for (const failure of ['remove', 'focus'] as const) {
    test(`legacy copy ${mode}: ${failure} failure preserves the result`, async t => {
      const browser = browserMocks(t, result);
      const method = failure === 'remove' ? browser.textarea.remove : browser.original.focus;
      method.mock.mockImplementation(() => { throw new Error(`${failure} failed`); });
      assert.equal(await copyShareLink(url), result === true);
      assert.equal(browser.execCommand.mock.callCount(), 1);
      assert.equal(browser.textarea.remove.mock.callCount(), 1);
      assert.equal(browser.original.focus.mock.callCount(), 1);
      if (failure === 'remove') assert.equal(browser.document.activeElement, browser.original);
      else assert.equal(browser.children.size, 0);
    });
  }
}

test('legacy copy skips restoration if the original element disconnects during copying', async t => {
  const browser = browserMocks(t, true);
  browser.execCommand.mock.mockImplementation(() => {
    browser.original.isConnected = false;
    return true;
  });
  assert.equal(await copyShareLink(url), true);
  assert.equal(browser.textarea.select.mock.callCount(), 1);
  assert.equal(browser.original.focus.mock.callCount(), 0);
  assert.equal(browser.children.size, 0);
});

test('legacy copy skips restoration when the original element does not support focus', async t => {
  const browser = browserMocks(t, true);
  Reflect.deleteProperty(browser.original, 'focus');
  assert.equal(await copyShareLink(url), true);
  assert.equal(browser.children.size, 0);
});

test('legacy copy restores focus when the modern clipboard is unavailable', async t => {
  const browser = browserMocks(t, true);
  Reflect.deleteProperty(navigator, 'clipboard');
  assert.equal(await copyShareLink(url), true);
  assert.equal(browser.original.focus.mock.callCount(), 1);
  assert.equal(browser.document.activeElement, browser.original);
  assert.equal(browser.children.size, 0);
});

test('modern success leaves focus untouched and never creates a fallback textarea', async t => {
  const browser = browserMocks(t, false, true);
  assert.equal(await copyShareLink(url), true);
  assert.equal(browser.writeText.mock.callCount(), 1);
  assert.equal(browser.createElement.mock.callCount(), 0);
  assert.equal(browser.execCommand.mock.callCount(), 0);
  assert.equal(browser.textarea.select.mock.callCount(), 0);
  assert.equal(browser.original.focus.mock.callCount(), 0);
  assert.equal(browser.document.activeElement, browser.original);
});
