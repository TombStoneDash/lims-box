import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import UnsubscribeClient from '../../app/unsubscribe/UnsubscribeClient';

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}

function mount(t: TestContext, email = '', list = 'newsletter') {
  // Follow the repository's dependency-free hook harness. Check native form
  // attributes and the submit callback; Node does not implement browser validation.
  const states: unknown[] = [];
  let index = 0;
  t.mock.method(React, 'useState', (initial: unknown) => {
    const slot = index++;
    if (!(slot in states)) states[slot] = initial;
    return [states[slot], (next: unknown) => { states[slot] = next; }];
  });
  const originalReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { value: React, configurable: true });
  t.after(() => {
    if (originalReact) Object.defineProperty(globalThis, 'React', originalReact);
    else Reflect.deleteProperty(globalThis, 'React');
  });
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  const fetch = t.mock.method(globalThis, 'fetch', () => new Promise<Response>((yes, no) => {
    resolve = yes;
    reject = no;
  }));
  function render() {
    index = 0;
    const tree = UnsubscribeClient({ email, list });
    const nodes = elements(tree);
    return {
      tree,
      form: nodes.find(node => node.type === 'form'),
      input: nodes.find(node => node.type === 'input'),
      button: nodes.find(node => node.type === 'button'),
      label: nodes.find(node => node.type === 'label'),
      alert: nodes.find(node => node.props.role === 'alert'),
      status: nodes.find(node => node.props.role === 'status'),
    };
  }
  function submit(valid = true) {
    const form = render().form;
    assert.ok(form);
    const preventDefault = t.mock.fn();
    const checkValidity = t.mock.fn(() => valid);
    const pending = form.props.onSubmit({ preventDefault, currentTarget: { checkValidity } });
    assert.equal(preventDefault.mock.callCount(), 1);
    return pending;
  }
  return {
    render, submit, fetch,
    enter: (value: string) => render().input!.props.onChange({ target: { value } }),
    resolve: (response = new Response('{}')) => resolve(response),
    reject: () => reject(new Error('Mock network failure')),
  };
}

test('email and confirmation belong to one native form for Enter and click submission', t => {
  const view = mount(t);
  const { form, input, button, label, tree } = view.render();
  assert.ok(form && input && button && label);
  assert.ok(elements(form).some(node => node.type === 'input' && node.props === input.props));
  assert.ok(elements(form).some(node => node.type === 'button' && node.props === button.props));
  assert.equal(input.props.form, undefined);
  assert.equal(label.props.htmlFor, input.props.id);
  assert.equal(input.props.type, 'email');
  assert.equal(input.props.name, 'email');
  assert.equal(input.props.required, true);
  assert.equal(input.props.maxLength, 320);
  assert.equal(button.props.type, 'submit');
  assert.equal(button.props.onClick, undefined);
  assert.equal(input.props.onKeyDown, undefined);
  assert.equal(form.props.noValidate, undefined);
  assert.equal(button.props.formNoValidate, undefined);
  assert.equal(typeof form.props.onSubmit, 'function');
  const markup = renderToStaticMarkup(tree);
  assert.match(markup, /<form[^>]*>[\s\S]*<input[^>]*required=""[\s\S]*<button type="submit"[\s\S]*<\/form>/);
  assert.equal(view.fetch.mock.callCount(), 0);
});

test('empty or natively invalid manual input cannot request an unsubscribe', async t => {
  const view = mount(t);
  await view.submit(false);
  for (const value of ['not-an-email', 'person@', 'person@@example.test']) {
    view.enter(value);
    await view.submit(false);
  }
  assert.equal(view.fetch.mock.callCount(), 0);
  assert.equal(view.render().input!.props.disabled, false);
});

test('form submission posts trimmed manual email once and protects loading state', async t => {
  const view = mount(t);
  view.enter('  reader@example.test  ');
  const pending = view.submit();
  assert.equal(view.fetch.mock.callCount(), 1);
  assert.deepEqual(view.fetch.mock.calls[0].arguments, ['/api/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'reader@example.test', list: 'newsletter' }),
  }]);
  const loading = view.render();
  assert.equal(loading.input!.props.disabled, true);
  assert.equal(loading.button!.props.disabled, true);
  assert.equal(loading.button!.props.children, 'Processing…');
  await view.submit();
  assert.equal(view.fetch.mock.callCount(), 1);
  view.resolve();
  await pending;
  assert.ok(view.render().status);
  assert.equal(view.render().form, undefined);
  assert.match(renderToStaticMarkup(view.render().tree), /reader@example.test/);
});

test('prefilled email submits without manual entry and preserves the selected list', async t => {
  const view = mount(t, 'prefilled@example.test', 'all');
  assert.equal(view.render().input, undefined);
  assert.equal(view.render().button!.props.disabled, false);
  const pending = view.submit();
  assert.equal(view.fetch.mock.callCount(), 1);
  assert.equal(view.fetch.mock.calls[0].arguments[1]!.body,
    JSON.stringify({ email: 'prefilled@example.test', list: 'all' }));
  view.resolve();
  await pending;
  assert.ok(view.render().status);
  assert.match(renderToStaticMarkup(view.render().tree), /all LIMS BOX emails/);
});

for (const outcome of ['server', 'network'] as const) {
  test(`${outcome} error announces failure and allows another form submission`, async t => {
    const view = mount(t);
    view.enter('reader@example.test');
    const pending = view.submit();
    if (outcome === 'server') view.resolve(new Response('{"error":"Try later"}', { status: 503 }));
    else view.reject();
    await pending;
    const failed = view.render();
    assert.equal(failed.alert!.props.children,
      outcome === 'server' ? 'Try later' : 'Network error. Please try again.');
    assert.equal(failed.input!.props.value, 'reader@example.test');
    assert.equal(failed.input!.props.disabled, false);
    assert.equal(failed.button!.props.disabled, false);
    const retry = view.submit();
    assert.equal(view.fetch.mock.callCount(), 2);
    view.resolve();
    await retry;
    assert.ok(view.render().status);
  });
}
