import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BotChat } from '../../app/bot/bot-chat';

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

const fallback = 'Connection problem — please try again.';
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
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
    const tree = BotChat();
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

const invalidBodies = [
  {}, null, [], [{ answer: 'Array answer' }], 'junk', 42,
  { answer: {} }, { answer: ['bad'] }, { answer: null },
  { answer: '' }, { answer: ' \n ' }, { error: {} }, { error: ' ' },
];

for (const body of invalidBodies) {
  test(`invalid reply ${JSON.stringify(body)} displays retry feedback`, async t => {
    const chat = mount(t);
    chat.render().suggestions[0].props.onClick();
    assert.equal(chat.render().log.props['aria-busy'], true);
    chat.requests[0].resolve(response(body));
    await settle();
    const completed = chat.render();
    assert.equal(completed.log.props['aria-busy'], false);
    assert.ok(completed.markup().includes(fallback));
    assert.equal((completed.markup().match(/LIMS BOT answered:/g) ?? []).length, 1);
  });
}

for (const status of [200, 503]) {
  test(`nonblank server error is rendered safely for HTTP ${status}`, async t => {
    const chat = mount(t);
    chat.render().suggestions[0].props.onClick();
    chat.requests[0].resolve(response({ error: 'Please try later.', answer: 'Ignored' }, status));
    await settle();
    assert.match(chat.render().markup(), /Please try later\./);
    assert.doesNotMatch(chat.render().markup(), /Ignored/);
  });
}

test('non-OK answer-shaped reply is rejected and form retry succeeds', async t => {
  const chat = mount(t);
  for (let attempt = 0; attempt < 2; attempt++) {
    chat.render().input.props.onChange({ target: { value: '  Pricing?  ' } });
    const preventDefault = t.mock.fn();
    chat.render().form.props.onSubmit({ preventDefault });
    assert.equal(preventDefault.mock.callCount(), 1);
    assert.equal(chat.render().log.props['aria-busy'], true);
    assert.equal(chat.render().input.props.value, '');
    assert.deepEqual(chat.fetch.mock.calls[attempt].arguments, ['/api/bot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Pricing?' }),
    }]);
    chat.requests[attempt].resolve(response({ answer: attempt ? 'Valid answer.' : 'Rejected answer.' }, attempt ? 200 : 503));
    await settle();
    assert.equal(chat.render().log.props['aria-busy'], false);
  }
  assert.equal(chat.input.focus.mock.callCount(), 0);
  const markup = chat.render().markup();
  assert.ok(markup.includes(fallback));
  assert.match(markup, /Valid answer\./);
  assert.doesNotMatch(markup, /Rejected answer\./);
  assert.equal((markup.match(/You asked:/g) ?? []).length, 2);
});

test('mixed optional fields retain only valid entries and suggestion clicks preserve focus behavior', async t => {
  const chat = mount(t);
  chat.render().suggestions[0].props.onClick();
  assert.equal(chat.input.focus.mock.callCount(), 1);
  const sourceLink = {};
  chat.document.activeElement = sourceLink;
  chat.requests[0].resolve(response({
    answer: 'Valid answer.', grounded: false,
    sources: [null, [], {}, { title: {}, path: '/bad' }, { title: 'Bad', path: {} },
      { title: ' ', path: '/bad' }, { title: 'Bad', path: '' }, { title: 'Pricing', path: '/pricing' }],
    followUp: { label: 'Contact us', path: '/contact' },
    suggestions: [null, {}, [], 42, '', '  ', 'What about setup?'],
  }));
  await settle();
  const completed = chat.render();
  assert.match(completed.markup(), /href="\/pricing"/);
  assert.match(completed.markup(), /Contact us/);
  assert.doesNotMatch(completed.markup(), /\/bad/);
  assert.deepEqual(completed.suggestions.map(button => button.props.children), ['What about setup?']);
  assert.equal(chat.document.activeElement, sourceLink);
  assert.equal(chat.input.focus.mock.callCount(), 1);
  completed.suggestions[0].props.onClick();
  assert.equal(chat.input.focus.mock.callCount(), 2);
  assert.ok(chat.render().suggestions.every(button => button.props.disabled));
  chat.requests[1].resolve(response({ answer: 'Grounded answer.', grounded: true, suggestions: ['Hidden suggestion'] }));
  await settle();
  assert.doesNotMatch(chat.render().markup(), /Hidden suggestion/);
  assert.equal(chat.render().log.props['aria-busy'], false);
});

for (const optional of [null, 'junk', 42, {}, { length: 1 }, ['bad'], { label: {}, path: '/bad' }, { label: 'Bad', path: ' ' }]) {
  test(`malformed optional fields ${JSON.stringify(optional)} do not break rendering`, async t => {
    const chat = mount(t);
    chat.render().suggestions[0].props.onClick();
    chat.requests[0].resolve(response({ answer: 'Safe answer.', sources: optional, followUp: optional, suggestions: optional }));
    await settle();
    const markup = chat.render().markup();
    assert.match(markup, /Safe answer\./);
    assert.doesNotMatch(markup, /Sources for this answer/);
    assert.doesNotMatch(markup, /href="\/bad"/);
    assert.equal(chat.render().log.props['aria-busy'], false);
  });
}

for (const failure of ['network', 'json']) {
  test(`${failure} failure resets busy and permits retry`, async t => {
    const chat = mount(t);
    chat.render().suggestions[0].props.onClick();
    if (failure === 'network') chat.requests[0].reject(new Error('Network failed'));
    else chat.requests[0].resolve(new Response('not JSON'));
    await settle();
    assert.ok(chat.render().markup().includes(fallback));
    assert.equal(chat.render().log.props['aria-busy'], false);
    chat.render().input.props.onChange({ target: { value: 'Retry' } });
    chat.render().form.props.onSubmit({ preventDefault() {} });
    chat.requests[1].resolve(response({ answer: 'Recovered.' }));
    await settle();
    assert.match(chat.render().markup(), /Recovered\./);
    assert.equal(chat.render().log.props['aria-busy'], false);
  });
}
