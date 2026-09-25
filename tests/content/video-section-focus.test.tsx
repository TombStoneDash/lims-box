import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { VideoSection } from '../../components/VideoSection';

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}

function mount(t: TestContext) {
  const hooks: unknown[] = [];
  let index = 0;
  t.mock.method(React, 'useState', (initial: unknown) => {
    const slot = index++;
    if (!(slot in hooks)) hooks[slot] = initial;
    return [hooks[slot], (next: unknown) => { hooks[slot] = next; }];
  });
  t.mock.method(React, 'useRef', (initial: unknown) => {
    const slot = index++;
    if (!(slot in hooks)) hooks[slot] = { current: initial };
    return hooks[slot];
  });
  t.mock.method(globalThis, 'setTimeout', () => assert.fail('Focus must not wait for a timer'));

  const ownerDocument = { activeElement: null as unknown };
  function focusable() {
    return {
      ownerDocument,
      focusCalls: 0,
      focus() {
        this.focusCalls++;
        ownerDocument.activeElement = this;
      },
    };
  }
  const button = focusable();
  const iframe = focusable();
  const other = focusable();
  let previousRef: React.RefCallback<HTMLIFrameElement> | undefined;

  function render(title = 'Lab walkthrough') {
    index = 0;
    const nodes = elements(VideoSection({ videoId: 'abcDEF012_-', title }));
    const player = nodes.find(node => node.type === 'iframe');
    const ref = (player as (React.ReactElement & {
      ref?: React.RefCallback<HTMLIFrameElement>;
    }) | undefined)?.ref;
    // Model React's callback-ref detach/attach during the commit, without a browser.
    if (ref !== previousRef) {
      previousRef?.(null);
      if (player && ownerDocument.activeElement === button) ownerDocument.activeElement = null;
      ref?.(iframe as unknown as HTMLIFrameElement);
      previousRef = ref;
    }
    return { nodes, player };
  }
  function activate() {
    const play = render().nodes.find(node => node.type === 'button');
    assert.ok(play);
    play.props.onClick({ currentTarget: button });
    return render();
  }
  return { render, activate, button, iframe, other, ownerDocument };
}

test('activation hands focus from the focused play button to the mounted titled iframe', t => {
  const view = mount(t);
  view.button.focus();
  const { nodes, player } = view.activate();
  assert.ok(player);
  assert.equal(nodes.some(node => node.type === 'button'), false);
  assert.equal(view.ownerDocument.activeElement, view.iframe);
  assert.equal(view.iframe.focusCalls, 1);
  assert.equal(player.props.title, 'Lab walkthrough');
  assert.equal(player.props.src,
    'https://www.youtube-nocookie.com/embed/abcDEF012_-?autoplay=1&rel=0&modestbranding=1&color=white');
  assert.equal(player.props.onLoad, undefined);
});

test('before activation the iframe stays unmounted and focus stays unchanged', t => {
  const view = mount(t);
  view.button.focus();
  for (let i = 0; i < 3; i++) {
    assert.equal(view.render().player, undefined);
    assert.equal(view.ownerDocument.activeElement, view.button);
    assert.equal(view.iframe.focusCalls, 0);
    assert.equal(view.button.focusCalls, 1);
  }
});

test('programmatic activation of an unfocused button preserves existing focus', t => {
  const view = mount(t);
  view.other.focus();
  assert.ok(view.activate().player);
  view.render();
  assert.equal(view.ownerDocument.activeElement, view.other);
  assert.equal(view.iframe.focusCalls, 0);
});

test('rerenders do not repeat the focus handoff after the visitor moves away', t => {
  const view = mount(t);
  view.button.focus();
  view.activate();
  assert.equal(view.iframe.focusCalls, 1);
  view.other.focus();
  view.render();
  const { player } = view.render('Updated walkthrough');
  assert.equal(player?.props.title, 'Updated walkthrough');
  assert.equal(view.ownerDocument.activeElement, view.other);
  assert.equal(view.iframe.focusCalls, 1);
});
