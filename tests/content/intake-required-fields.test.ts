import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { intakeValidationMessage } from '../../lib/intake-form-status';
import IntakeForm from '../../app/_intake/IntakeForm';

// tsx compiles this repository's preserved JSX in classic mode.
Object.assign(globalThis, { React });

test('intakeValidationMessage', () => {
  assert.equal(
    intakeValidationMessage({ email: 'pat@example.org', labSize: '' }),
    'Choose your lab size.',
  );
  assert.equal(
    intakeValidationMessage({ email: 'jane@localhost', labSize: '1–10' }),
    'Enter a full email address, for example name@yourlab.org.',
  );
  assert.equal(
    intakeValidationMessage({ email: '', labSize: '1–10' }),
    'Enter a full email address, for example name@yourlab.org.',
  );
  assert.equal(
    intakeValidationMessage({ email: 'pat@example.org', labSize: '1–10' }),
    null,
  );
});

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}

function mount(t: TestContext) {
  const states: unknown[] = [];
  const ids: string[] = [];
  let stateIndex = 0;
  let idIndex = 0;

  t.mock.method(React, 'useState', (initial: unknown) => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = initial;
    return [states[index], (next: unknown) => {
      states[index] = typeof next === 'function' ? next(states[index]) : next;
    }];
  });
  t.mock.method(React, 'useId', () => {
    const index = idIndex++;
    if (!(index in ids)) ids[index] = `:test-id-${index}:`;
    return ids[index];
  });

  function render() {
    stateIndex = 0;
    idIndex = 0;
    return IntakeForm({
      track: 'clinical',
      accent: 'teal',
      title: 'T',
      subtitle: 'S',
      accreditations: ['CLIA'],
      showFieldBench: false,
    });
  }
  return { render };
}

test('the intake form blocks submission until email and lab size are both valid', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({ ok: true }),
  }));

  const player = mount(t);
  let tree = player.render();

  function field(label: string) {
    const match = elements(tree).find(el => el.props && el.props.label === label);
    assert.ok(match, `expected a field labeled ${label}`);
    return match!;
  }

  field('Your name').props.onChange('Pat Jordan');
  tree = player.render();
  field('Email').props.onChange('pat@example.org');
  tree = player.render();
  field('Lab name').props.onChange('Example Lab');
  tree = player.render();

  const form = elements(tree).find(el => el.type === 'form');
  assert.ok(form);

  await form!.props.onSubmit({ preventDefault() {} });
  tree = player.render();

  assert.equal(fetchMock.mock.callCount(), 0);
  const alert = elements(tree).find(el => el.props && el.props.role === 'alert');
  assert.ok(alert, 'expected a role="alert" element');
  assert.equal(alert!.props.children, 'Choose your lab size.');

  const labSizeButton = elements(tree).find(
    el => el.type === 'button' && el.props.children === '1–10',
  );
  assert.ok(labSizeButton, 'expected a 1–10 lab size button');
  labSizeButton!.props.onClick();
  tree = player.render();

  const formAgain = elements(tree).find(el => el.type === 'form');
  await formAgain!.props.onSubmit({ preventDefault() {} });

  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(fetchMock.mock.calls[0].arguments[0], '/api/prospects');
});

test('the intake form blocks an incomplete email like jane@localhost and names the email field', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({ ok: true }),
  }));

  const player = mount(t);
  let tree = player.render();

  function field(label: string) {
    const match = elements(tree).find(el => el.props && el.props.label === label);
    assert.ok(match, `expected a field labeled ${label}`);
    return match!;
  }

  field('Your name').props.onChange('Jane Doe');
  tree = player.render();
  field('Email').props.onChange('jane@localhost');
  tree = player.render();
  field('Lab name').props.onChange('Example Lab');
  tree = player.render();
  const labSizeButton = elements(tree).find(el => el.type === 'button' && el.props.children === '1–10');
  assert.ok(labSizeButton, 'expected a 1–10 lab size button');
  labSizeButton!.props.onClick();
  tree = player.render();

  await elements(tree).find(el => el.type === 'form')!.props.onSubmit({ preventDefault() {} });
  tree = player.render();

  assert.equal(fetchMock.mock.callCount(), 0, 'nothing is sent with an incomplete email');
  const alert = elements(tree).find(el => el.props && el.props.role === 'alert');
  assert.ok(alert, 'expected a role="alert" element');
  assert.equal(alert!.props.children, 'Enter a full email address, for example name@yourlab.org.');

  field('Email').props.onChange('jane@example.org');
  tree = player.render();
  await elements(tree).find(el => el.type === 'form')!.props.onSubmit({ preventDefault() {} });

  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(fetchMock.mock.calls[0].arguments[0], '/api/prospects');
});
