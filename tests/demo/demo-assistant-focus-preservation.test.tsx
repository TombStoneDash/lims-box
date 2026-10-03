import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DemoAssistantChat } from '../../app/demo/assistant/demo-assistant-chat';

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const sources = [{ title: 'Synthetic sample', path: '/demo/assistant#sample' }];
const response = () => new Response(JSON.stringify({ answer: 'Sample received.', sources }));
// Event handlers intentionally do not return ask's promise; drain their async work.
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

function mount(t: TestContext) {
  // tsx uses classic JSX for this project's jsx: preserve configuration.
  const originalReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { value: React, configurable: true });
  t.after(() => {
    if (originalReact) Object.defineProperty(globalThis, 'React', originalReact);
    else Reflect.deleteProperty(globalThis, 'React');
  });
  const states: unknown[] = [];
  let stateIndex = 0;
  const document = { activeElement: null as unknown };
  const input = { focus: t.mock.fn(() => { document.activeElement = input; }) };
  const ref = { current: input };
  const requests: ReturnType<typeof deferred<Response>>[] = [];

  t.mock.method(React, 'useId', () => 'question');
  t.mock.method(React, 'useRef', () => ref);
  t.mock.method(React, 'useState', (initial: unknown) => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = initial;
    return [states[index], (next: unknown) => {
      states[index] = typeof next === 'function' ? next(states[index]) : next;
    }];
  });
  const fetch = t.mock.method(globalThis, 'fetch', () => {
    const request = deferred<Response>();
    requests.push(request);
    return request.promise;
  });

  function render() {
    stateIndex = 0;
    const tree = DemoAssistantChat();
    const nodes = elements(tree);
    return {
      input: nodes.find(node => node.type === 'input')!,
      form: nodes.find(node => node.type === 'form')!,
      suggestions: nodes.filter(node => node.type === 'button' && node.props.type === 'button'),
      log: nodes.find(node => node.props.role === 'log')!,
      markup: () => renderToStaticMarkup(tree),
    };
  }
  return { render, input, document, requests, fetch };
}

for (const outcome of ['resolve', 'reject'] as const) {
  test(`suggestion focuses immediately and ${outcome} preserves subsequent source-link focus`, async t => {
    const chat = mount(t);
    const initial = chat.render();
    chat.document.activeElement = initial.suggestions[0];
    initial.suggestions[0].props.onClick();

    assert.equal(chat.input.focus.mock.callCount(), 1);
    assert.equal(chat.document.activeElement, chat.input);
    assert.equal(chat.requests.length, 1);
    const pending = chat.render();
    assert.equal(pending.log.props['aria-busy'], true);
    assert.ok(pending.suggestions.every(button => button.props.disabled));
    assert.equal(pending.input.props.value, '');

    const sourceLink = { tagName: 'A', href: sources[0].path };
    chat.document.activeElement = sourceLink;
    if (outcome === 'resolve') chat.requests[0].resolve(response());
    else chat.requests[0].reject(new Error('Mock network failure'));
    await settle();

    assert.equal(chat.input.focus.mock.callCount(), 1);
    assert.equal(chat.document.activeElement, sourceLink);
    const completed = chat.render();
    assert.equal(completed.log.props['aria-busy'], false);
    assert.equal(completed.suggestions.length, initial.suggestions.length);
    assert.ok(completed.suggestions.every(button => !button.props.disabled));
    assert.match(completed.markup(), /You asked:/);
    assert.match(completed.markup(), outcome === 'resolve'
      ? /Sample received\./ : /The local demo could not answer\. Try again\./);
    if (outcome === 'resolve') assert.match(completed.markup(), /href="\/demo\/assistant#sample"/);
  });
}

test('normal form submission keeps natural focus and allows a retry without stealing focus', async t => {
  const chat = mount(t);
  chat.document.activeElement = chat.input;
  for (let attempt = 0; attempt < 2; attempt++) {
    chat.render().input.props.onChange({ target: { value: '  Sample status?  ' } });
    const preventDefault = t.mock.fn();
    chat.render().form.props.onSubmit({ preventDefault });
    assert.equal(preventDefault.mock.callCount(), 1);
    assert.equal(chat.input.focus.mock.callCount(), 0);
    assert.equal(chat.document.activeElement, chat.input);
    assert.equal(chat.requests.length, attempt + 1);
    assert.deepEqual(chat.fetch.mock.calls[attempt].arguments, ['/api/demo/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Sample status?' }),
    }]);
    assert.equal(chat.render().log.props['aria-busy'], true);
    assert.equal(chat.render().input.props.value, '');

    const sourceLink = { tagName: 'A', href: sources[0].path };
    if (attempt === 0) chat.requests[attempt].reject(new Error('Mock network failure'));
    else {
      chat.document.activeElement = sourceLink;
      chat.requests[attempt].resolve(response());
    }
    await settle();
    assert.equal(chat.input.focus.mock.callCount(), 0);
    assert.equal(chat.document.activeElement, attempt === 0 ? chat.input : sourceLink);
    assert.equal(chat.render().log.props['aria-busy'], false);
    assert.ok(chat.render().suggestions.every(button => !button.props.disabled));
  }
  const markup = chat.render().markup();
  assert.equal((markup.match(/You asked:/g) ?? []).length, 2);
  assert.match(markup, /The local demo could not answer\. Try again\./);
  assert.match(markup, /Sample received\./);
});
