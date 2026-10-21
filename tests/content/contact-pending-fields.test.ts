import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import ContactPage from '../../app/contact/page';

const FIELDS = ['name', 'email', 'labName', 'labSize', 'currentSystem', 'message'] as const;

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}

type Control = { id: string; disabled: boolean; value: unknown; onChange: (e: unknown) => void };

function collectControls(node: React.ReactNode, ambientDisabled: boolean, acc: Control[]) {
  if (!React.isValidElement<any>(node)) return;
  const props = node.props as Record<string, unknown>;
  const childDisabled =
    ambientDisabled || (node.type === 'fieldset' && props.disabled === true);
  if (
    typeof node.type === 'string' &&
    ['input', 'select', 'textarea'].includes(node.type) &&
    typeof props.id === 'string'
  ) {
    acc.push({
      id: props.id,
      disabled: ambientDisabled || props.disabled === true,
      value: props.value,
      onChange: props.onChange as (e: unknown) => void,
    });
  }
  React.Children.toArray(props.children as React.ReactNode).forEach(child => collectControls(child, childDisabled, acc));
}

function mount(t: TestContext) {
  const hooks: unknown[] = [];
  let index = 0;
  t.mock.method(React, 'useState', (initial: unknown) => {
    const slot = index++;
    if (!(slot in hooks)) hooks[slot] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    return [hooks[slot], (next: unknown) => {
      hooks[slot] = typeof next === 'function' ? (next as (prev: unknown) => unknown)(hooks[slot]) : next;
    }];
  });
  t.mock.method(React, 'useRef', (initial: unknown) => {
    const slot = index++;
    if (!(slot in hooks)) hooks[slot] = { current: initial };
    return hooks[slot];
  });
  t.mock.method(React, 'useEffect', () => {});

  const originalReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { value: React, configurable: true });
  t.after(() => {
    if (originalReact) Object.defineProperty(globalThis, 'React', originalReact);
    else Reflect.deleteProperty(globalThis, 'React');
  });

  function render() {
    index = 0;
    const root = (ContactPage as unknown as () => React.ReactElement)();
    const nodes = elements(root);
    const controls: Control[] = [];
    collectControls(root, false, controls);
    return {
      controls,
      control: (id: string) => controls.find(c => c.id === id),
      fieldset: nodes.find(n => n.type === 'fieldset'),
      form: nodes.find(n => n.type === 'form'),
      button: nodes.find(n => n.type === 'button'),
      status: nodes.find(n => (n.props as Record<string, unknown>).role === 'status'),
      alert: nodes.find(n => (n.props as Record<string, unknown>).role === 'alert'),
    };
  }

  function fill(values: Record<string, string>) {
    const view = render();
    for (const field of FIELDS) {
      view.control(field)!.onChange({ target: { value: values[field] ?? '' } });
    }
  }

  function submit() {
    const view = render();
    assert.ok(view.form, 'form must be present to submit');
    const preventDefault = t.mock.fn();
    const pending = (view.form!.props as { onSubmit: (e: unknown) => unknown }).onSubmit({ preventDefault });
    assert.equal(preventDefault.mock.callCount(), 1);
    return pending;
  }

  return { render, fill, submit };
}

const values = {
  name: 'Ada Lovelace',
  labName: 'Analytical Engine Lab',
  email: 'ada@example.test',
  labSize: '6-15',
  currentSystem: 'excel',
  message: 'Original message',
};

const correction = { ...values, message: 'Corrected message before the response arrived' };

function expectedRequest(form: Record<string, string>) {
  return ['/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form),
  }];
}

test('while a submission is pending, every editing control is disabled and the sent snapshot matches what was visible', async t => {
  let settle: (value: Response) => void;
  const deferred = new Promise<Response>(resolve => { settle = resolve; });
  const fetch = t.mock.method(globalThis, 'fetch', async () => deferred);

  const view = mount(t);
  view.fill(values);

  const pending = view.submit();

  const loading = view.render();
  assert.ok(loading.fieldset, 'a fieldset must wrap the editing controls');
  assert.equal(loading.fieldset!.props.disabled, true);
  for (const field of FIELDS) {
    const control = loading.control(field);
    assert.ok(control, `missing control for ${field}`);
    assert.equal(control!.disabled, true, `${field} must be disabled while loading`);
    assert.equal(control!.value, (values as Record<string, string>)[field]);
  }

  assert.equal(fetch.mock.callCount(), 1);
  assert.deepEqual(fetch.mock.calls[0].arguments, expectedRequest(values));

  settle!(new Response(JSON.stringify({}), { status: 200 }));
  await pending;
});

test('a correction typed while the request is pending is preserved, not sent, and not erased on success', async t => {
  let settle: (value: Response) => void;
  const deferred = new Promise<Response>(resolve => { settle = resolve; });
  const fetch = t.mock.method(globalThis, 'fetch', async () => deferred);

  const view = mount(t);
  view.fill(values);
  const pending = view.submit();

  assert.deepEqual(fetch.mock.calls[0].arguments, expectedRequest(values));

  const loading = view.render();
  assert.equal(loading.control('message')!.disabled, true);
  loading.control('message')!.onChange({ target: { value: correction.message } });

  const afterAttemptedEdit = view.render();
  assert.equal(
    afterAttemptedEdit.control('message')!.value,
    correction.message,
    'state updates still land even though the disabled control cannot be edited by a real user',
  );
  assert.equal(fetch.mock.callCount(), 1, 'no second request must be sent for the attempted edit');

  settle!(new Response(JSON.stringify({}), { status: 200 }));
  await pending;

  const success = view.render();
  assert.ok(success.status, 'confirmation must be announced via role="status"');
  assert.equal(success.form, undefined, 'the form is replaced by the confirmation view');
  assert.equal(fetch.mock.callCount(), 1);
});

test('success shows the confirmation and keeps the existing API payload shape', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({}), { status: 200 }));
  const view = mount(t);
  view.fill(values);
  await view.submit();

  const success = view.render();
  assert.equal(success.form, undefined);
  assert.ok(success.status, 'confirmation must be announced via role="status"');
  assert.deepEqual(fetch.mock.calls[0].arguments, expectedRequest(values));
});

for (const mode of ['HTTP failure', 'network rejection'] as const) {
  test(`${mode} restores editing with every value intact and keeps the accessible error feedback`, async t => {
    let settle: (value: Response) => void;
    let fail: (reason: unknown) => void;
    const deferred = new Promise<Response>((resolve, reject) => { settle = resolve; fail = reject; });
    const fetch = t.mock.method(globalThis, 'fetch', async () => deferred);

    const view = mount(t);
    view.fill(values);
    const pending = view.submit();

    const loading = view.render();
    assert.equal(loading.fieldset!.props.disabled, true);

    if (mode === 'HTTP failure') {
      settle!(new Response(JSON.stringify({ error: 'nope' }), { status: 500 }));
    } else {
      fail!(new Error('network unavailable'));
    }
    await pending;

    const after = view.render();
    assert.ok(after.form, 'the form must remain/return for another attempt');
    assert.ok(after.fieldset);
    assert.equal(after.fieldset!.props.disabled, false, 'editing must be restored after failure');
    for (const field of FIELDS) {
      const control = after.control(field);
      assert.ok(control);
      assert.equal(control!.disabled, false, `${field} must be editable again`);
      assert.equal(control!.value, (values as Record<string, string>)[field], `${field} must keep its submitted value`);
    }
    assert.ok(after.alert, 'an accessible alert must report the failure');
    assert.equal(typeof after.alert!.props.children, 'string');
    assert.ok((after.alert!.props.children as string).length > 0);

    assert.equal(fetch.mock.callCount(), 1);
    assert.deepEqual(fetch.mock.calls[0].arguments, expectedRequest(values));
  });
}
