import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { NewsletterSignup } from '../../components/blog/NewsletterSignup';

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}

function mount(t: TestContext) {
  // Exercise the component's hooks and handlers without a DOM dependency.
  const hooks: unknown[] = [];
  let index = 0;
  t.mock.method(React, 'useState', (initial: unknown) => {
    const slot = index++;
    if (!(slot in hooks)) hooks[slot] = initial;
    return [hooks[slot], (next: unknown) => {
      hooks[slot] = typeof next === 'function' ? next(hooks[slot]) : next;
    }];
  });
  const originalReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { value: React, configurable: true });
  t.after(() => {
    if (originalReact) Object.defineProperty(globalThis, 'React', originalReact);
    else Reflect.deleteProperty(globalThis, 'React');
  });

  function render() {
    index = 0;
    const nodes = elements(NewsletterSignup());
    return {
      form: nodes.find(node => node.type === 'form'),
      input: nodes.find(node => node.type === 'input'),
      button: nodes.find(node => node.type === 'button'),
      status: nodes.find(node => node.props.role === 'status'),
      alert: nodes.find(node => node.props.role === 'alert'),
    };
  }
  function submit() {
    const { form, button } = render();
    assert.ok(form);
    assert.ok(button);
    assert.equal(button.props.disabled, false);
    const preventDefault = t.mock.fn();
    const pending = form.props.onSubmit({ preventDefault });
    assert.equal(preventDefault.mock.callCount(), 1);
    const loading = render();
    assert.equal(loading.button?.props.disabled, true);
    assert.equal(loading.button?.props.children, 'Subscribing…');
    assert.equal(loading.status, undefined);
    assert.equal(loading.alert, undefined);
    return pending;
  }
  return { render, submit, email: () => hooks[0] };
}

const email = 'reader@example.test';
const request = ['/api/newsletter', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, source: 'blog_newsletter' }),
}];

test('deferred subscription retains the address and supports a successful retry', async t => {
  const responses = [
    new Response(JSON.stringify({ deferred: true }), { status: 503 }),
    new Response(JSON.stringify({ success: true }), { status: 200 }),
  ];
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    const response = responses.shift();
    assert.ok(response, 'Unexpected extra request');
    return response;
  });
  const view = mount(t);
  assert.equal(view.render().input?.props['aria-label'], 'Email address');
  view.render().input!.props.onChange({ target: { value: email } });

  await view.submit();
  const deferred = view.render();
  assert.ok(deferred.form);
  assert.equal(deferred.input?.props.value, email);
  assert.equal(deferred.status?.props.children,
    "We couldn't complete your subscription. Please try again later.");
  assert.equal(deferred.alert, undefined);
  assert.equal(deferred.button?.props.disabled, false);
  assert.equal(deferred.button?.props.children, 'Subscribe');
  assert.equal(fetch.mock.callCount(), 1);
  assert.deepEqual(fetch.mock.calls[0].arguments, request);

  await view.submit();
  assert.equal(fetch.mock.callCount(), 2);
  assert.deepEqual(fetch.mock.calls[1].arguments, request);
  const success = view.render();
  assert.equal(success.status?.props.children, "You're subscribed!");
  assert.equal(success.form, undefined);
  assert.equal(success.input, undefined);
  assert.equal(success.button, undefined);
  assert.equal(success.alert, undefined);
  assert.equal(view.email(), '');
});

for (const mode of ['HTTP error', 'network error'] as const) {
  test(`${mode} retains the address and exposes a separate alert with retry available`, async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => {
      if (mode === 'network error') throw new Error('Network unavailable');
      return new Response(JSON.stringify({ error: 'Unavailable' }), { status: 500 });
    });
    const view = mount(t);
    view.render().input!.props.onChange({ target: { value: email } });
    await view.submit();

    const failed = view.render();
    assert.ok(failed.form);
    assert.equal(failed.input?.props.value, email);
    assert.equal(failed.button?.props.disabled, false);
    assert.equal(failed.button?.props.children, 'Subscribe');
    assert.equal(failed.alert?.props.children, 'Something went wrong. Try again?');
    assert.equal(failed.status, undefined);
    assert.equal(fetch.mock.callCount(), 1);
    assert.deepEqual(fetch.mock.calls[0].arguments, request);
  });
}
