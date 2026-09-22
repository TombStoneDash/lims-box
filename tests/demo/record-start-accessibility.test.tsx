import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RecordPage from '../../app/demo/record/page';

type ElementProps = {
  children?: React.ReactNode;
  type?: string;
  className?: string;
  disabled?: boolean;
  tabIndex?: number;
  onClick?: () => void;
};

function findButton(node: React.ReactNode): React.ReactElement<ElementProps> | undefined {
  for (const child of React.Children.toArray(node)) {
    if (!React.isValidElement<ElementProps>(child)) continue;
    if (child.type === 'button') return child;
    const button = findButton(child.props.children);
    if (button) return button;
  }
}

test('splash provides a named native button with visible keyboard focus for Enter/Space activation', () => {
  const markup = renderToStaticMarkup(<RecordPage />);
  assert.match(markup, /<button type="button"[^>]*>Start recording<\/button>/);
  assert.match(markup, /focus-visible:outline /);
  assert.match(markup, /focus-visible:outline-2/);
  assert.match(markup, /focus-visible:outline-offset-4/);
  assert.match(markup, /focus-visible:outline-white/);
  assert.match(markup, /use Start recording or click anywhere to start/);
});

test('activating the start button enters the first recording screen', t => {
  const states: unknown[] = [];
  let stateIndex = 0;
  t.mock.method(React, 'useState', (initial: unknown) => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = initial;
    return [states[index], (next: unknown) => { states[index] = next; }];
  });
  // Playback timing is covered by record-player.test.tsx; this harness checks activation.
  t.mock.method(React, 'useEffect', () => {});
  const render = () => {
    stateIndex = 0;
    return RecordPage();
  };

  const button = findButton(render());
  assert.ok(button);
  // An enabled, focusable native button supplies Enter/Space activation in the browser.
  assert.equal(button.type, 'button');
  assert.equal(button.props.type, 'button');
  assert.equal(button.props.children, 'Start recording');
  assert.ok(!button.props.disabled);
  assert.ok(button.props.tabIndex === undefined || button.props.tabIndex >= 0);
  assert.equal(typeof button.props.onClick, 'function');
  button.props.onClick!();

  const markup = renderToStaticMarkup(render());
  assert.match(markup, />Sample Intake</);
  assert.match(markup, />1\/5</);
  assert.match(markup, /Every sample\. Tracked\./);
  assert.match(markup, /WS-2026-0421/);
  assert.doesNotMatch(markup, /Start recording/);
});
