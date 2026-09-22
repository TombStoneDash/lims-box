import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { copyShareLink } from '../../components/blog/ShareButtons';

const url = 'https://lims.bot/blog/lab-news';

function browserMocks(t: TestContext, modernSucceeds: boolean, legacyResult: boolean | Error) {
  const children = new Set<unknown>();
  const body = { appendChild: (child: unknown) => children.add(child) };
  const copyButton = {
    focus: t.mock.fn((options: unknown) => {
      assert.deepEqual(options, { preventScroll: true });
      assert.equal(children.size, 0, 'remove the temporary control before restoring focus');
      documentStub.activeElement = copyButton;
    }),
  };
  const textarea = {
    value: '',
    className: '',
    select: t.mock.fn(() => {
      assert.ok(children.has(textarea));
      // Model browsers where selecting a textarea transfers keyboard focus.
      documentStub.activeElement = textarea;
    }),
    remove: t.mock.fn(() => {
      children.delete(textarea);
      if (documentStub.activeElement === textarea) documentStub.activeElement = body;
    }),
  };
  const documentStub = {
    activeElement: copyButton as unknown,
    body,
    createElement: t.mock.fn((tag: string) => {
      assert.equal(tag, 'textarea');
      return textarea;
    }),
    execCommand: t.mock.fn((command: string) => {
      assert.equal(command, 'copy');
      assert.equal(textarea.value, url);
      assert.equal(documentStub.activeElement, textarea);
      assert.ok(children.has(textarea));
      assert.equal(textarea.className, 'fixed left-[-9999px] top-0');
      assert.doesNotMatch(textarea.className, /hidden|invisible/);
      if (legacyResult instanceof Error) throw legacyResult;
      return legacyResult;
    }),
  };
  const writeText = t.mock.fn(async (value: string) => {
    assert.equal(value, url);
    if (!modernSucceeds) throw new Error('Clipboard denied');
  });
  for (const [key, value] of Object.entries({
    navigator: { clipboard: { writeText } },
    document: documentStub,
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  return { children, copyButton, textarea, documentStub, writeText };
}

for (const [mode, result] of [
  ['succeeds', true],
  ['returns false', false],
  ['throws', new Error('Legacy copy denied')],
] as const) {
  test(`fallback ${mode}: removes the offscreen textarea and restores focus without scrolling`, async t => {
    const browser = browserMocks(t, false, result);
    assert.equal(await copyShareLink(url), result === true);
    assert.equal(browser.writeText.mock.callCount(), 1);
    assert.equal(browser.documentStub.execCommand.mock.callCount(), 1);
    assert.equal(browser.textarea.select.mock.callCount(), 1);
    assert.equal(browser.textarea.className, 'fixed left-[-9999px] top-0');
    assert.deepEqual(browser.copyButton.focus.mock.calls[0]?.arguments, [{ preventScroll: true }]);
    assert.equal(browser.textarea.remove.mock.callCount(), 1);
    assert.equal(browser.children.size, 0);
    assert.equal(browser.copyButton.focus.mock.callCount(), 1);
    assert.equal(browser.documentStub.activeElement, browser.copyButton);
  });
}

test('modern Clipboard API success leaves focus untouched and creates no temporary control', async t => {
  const browser = browserMocks(t, true, false);
  assert.equal(await copyShareLink(url), true);
  assert.equal(browser.writeText.mock.callCount(), 1);
  assert.equal(browser.documentStub.createElement.mock.callCount(), 0);
  assert.equal(browser.documentStub.execCommand.mock.callCount(), 0);
  assert.equal(browser.textarea.select.mock.callCount(), 0);
  assert.equal(browser.textarea.remove.mock.callCount(), 0);
  assert.equal(browser.children.size, 0);
  assert.equal(browser.copyButton.focus.mock.callCount(), 0);
  assert.equal(browser.documentStub.activeElement, browser.copyButton);
});
