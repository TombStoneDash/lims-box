import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { VideoSection } from '../../components/VideoSection';

test('Play mounts the privacy-enhanced player and focuses it once after commit', t => {
  // tsx uses classic JSX with this repository's jsx: preserve setting.
  const originalReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { value: React, configurable: true });
  t.after(() => {
    if (originalReact) Object.defineProperty(globalThis, 'React', originalReact);
    else Reflect.deleteProperty(globalThis, 'React');
  });
  let state = false;
  const playerRef = { current: null as null | { focus: () => void } };
  let previousDeps: React.DependencyList | undefined;
  let pendingEffect: React.EffectCallback | undefined;
  const focus = t.mock.fn();

  // Exercise the actual component without a DOM, iframe navigation, or network.
  t.mock.method(React, 'useState', () => [state, (next: boolean) => { state = next; }]);
  t.mock.method(React, 'useRef', () => playerRef);
  t.mock.method(React, 'useEffect', (effect: React.EffectCallback, deps?: React.DependencyList) => {
    if (!deps || !previousDeps || deps.length !== previousDeps.length ||
        deps.some((value, index) => !Object.is(value, previousDeps![index]))) {
      pendingEffect = effect;
    }
    previousDeps = deps;
  });
  const flushEffects = () => {
    const effect = pendingEffect;
    pendingEffect = undefined;
    effect?.();
  };
  const render = (props = {}) => VideoSection({ videoId: 'abcDEF012_-', ...props })
    .props.children.props.children.props.children as React.ReactElement;

  const poster = render();
  assert.equal(poster.type, 'button');
  assert.equal(poster.props.type, 'button');
  assert.equal(poster.props['aria-label'], 'Play video: LIMS BOX — 2:45 commercial');
  assert.equal(poster.props.children[0].props.src, 'https://i.ytimg.com/vi/abcDEF012_-/hqdefault.jpg');
  assert.equal(poster.props.children[0].props.alt, 'LIMS BOX commercial poster');
  assert.equal(poster.props.children[0].props.priority, false);
  flushEffects();
  assert.equal(state, false);
  assert.equal(focus.mock.callCount(), 0);
  assert.equal(render({ className: 'updated' }).type, 'button');
  flushEffects();
  assert.equal(focus.mock.callCount(), 0);

  poster.props.onClick();
  assert.equal(state, true);
  assert.equal(focus.mock.callCount(), 0);
  const player = render();
  assert.equal(player.type, 'iframe');
  assert.equal(player.props.src,
    'https://www.youtube-nocookie.com/embed/abcDEF012_-?autoplay=1&rel=0&modestbranding=1&color=white');
  assert.equal(player.props.title, 'LIMS BOX — 2:45 commercial');
  assert.equal(player.props.allowFullScreen, true);
  assert.equal(focus.mock.callCount(), 0);

  // React attaches refs during commit, before running passive effects.
  const mountedRef = (player as unknown as { ref: typeof playerRef }).ref;
  assert.equal(mountedRef, playerRef);
  mountedRef.current = { focus };
  flushEffects();
  assert.equal(focus.mock.callCount(), 1);

  for (const props of [{}, { className: 'updated' }, { title: 'Updated video title' }]) {
    const updated = render(props);
    assert.equal(updated.type, 'iframe');
    assert.equal(updated.props.src, player.props.src);
    assert.equal(updated.props.title, 'title' in props ? props.title : player.props.title);
    flushEffects();
    assert.equal(focus.mock.callCount(), 1, 'rerenders must not steal focus back');
  }
});
