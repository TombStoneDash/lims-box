import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BotChat } from '../../app/bot/bot-chat';

const retryMessage = 'Connection problem — please try again.';

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}

function mount(t: TestContext) {
  const states: unknown[] = [];
  let stateIndex = 0;
  t.mock.method(React, 'useId', () => 'bot-question');
  t.mock.method(React, 'useRef', () => ({ current: null }));
  // Exercise the real handlers with the repository's minimal hook harness.
  t.mock.method(React, 'useState', (initial: unknown) => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = initial;
    return [states[index], (next: unknown) => {
      states[index] = typeof next === 'function' ? next(states[index]) : next;
    }];
  });
  function render() {
    stateIndex = 0;
    return BotChat();
  }
  function submit(question = 'What does LIMS BOX cost?') {
    elements(render()).find(node => node.type === 'input')!.props.onChange({ target: { value: question } });
    const tree = render();
    assert.equal(elements(tree).find(node => node.props.type === 'submit')!.props.disabled, false);
    elements(tree).find(node => node.type === 'form')!.props.onSubmit({ preventDefault() {} });
  }
  return { render, submit };
}

// The event handler intentionally does not return ask's promise. Flush its
// mocked fetch/JSON microtasks before inspecting the next render.
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

const invalidReplies: [string, unknown, boolean?][] = [
  ['empty object', {}],
  ['null', null],
  ['array', []],
  ['primitive', 'answer'],
  ['object answer', { answer: { text: 'unsafe' } }],
  ['empty answer', { answer: '' }],
  ['whitespace answer', { answer: ' \n ' }],
  ['sources object', { answer: 'Rejected', sources: {} }],
  ['null source', { answer: 'Rejected', sources: [null] }],
  ['source title object', { answer: 'Rejected', sources: [{ title: {}, path: '/docs' }] }],
  ['source path number', { answer: 'Rejected', sources: [{ title: 'Docs', path: 42 }] }],
  ['null sources', { answer: 'Rejected', sources: null }],
  ['empty source title', { answer: 'Rejected', sources: [{ title: ' ', path: '/docs' }] }],
  ['follow-up string', { answer: 'Rejected', followUp: 'Docs' }],
  ['null follow-up', { answer: 'Rejected', followUp: null }],
  ['follow-up label object', { answer: 'Rejected', followUp: { label: {}, path: '/docs' } }],
  ['follow-up missing path', { answer: 'Rejected', followUp: { label: 'Docs' } }],
  ['suggestions string', { answer: 'Rejected', suggestions: 'Try this' }],
  ['suggestion object', { answer: 'Rejected', suggestions: [{}] }],
  ['empty suggestion', { answer: 'Rejected', suggestions: [' '] }],
  ['null suggestions', { answer: 'Rejected', suggestions: null }],
  ['invalid grounded flag', { answer: 'Rejected', grounded: 'false' }],
  ['non-OK answer', { answer: 'Rejected' }, false],
  ['empty error', { error: '' }, false],
  ['whitespace error', { error: ' ' }, false],
  ['object error', { error: {}, answer: 'Rejected' }],
];

for (const [name, body, ok = true] of invalidReplies) {
  test(`${name} displays retry feedback and clears busy state`, async t => {
    const chat = mount(t);
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({ ok, json: async () => body }));
    chat.submit();
    assert.match(renderToStaticMarkup(chat.render()), /aria-busy="true"/);
    await settle();
    const markup = renderToStaticMarkup(chat.render());
    assert.ok(markup.includes(retryMessage));
    assert.match(markup, /aria-busy="false"/);
    assert.doesNotMatch(markup, /Thinking…|Rejected|Sources for this answer|Try asking:/);
    assert.equal(fetchMock.mock.callCount(), 1);
  });
}

for (const ok of [true, false]) {
  test(`nonempty server error is retained (ok=${ok})`, async t => {
    const chat = mount(t);
    t.mock.method(globalThis, 'fetch', async () => ({ ok, json: async () => ({ error: 'Please ask a shorter question.' }) }));
    chat.submit();
    await settle();
    const markup = renderToStaticMarkup(chat.render());
    assert.match(markup, /Please ask a shorter question\./);
    assert.match(markup, /aria-busy="false"/);
    assert.ok(!markup.includes(retryMessage));
  });
}

for (const failure of ['invalid reply', 'JSON rejection', 'network rejection']) {
  test(`${failure} allows a successful retry with validated optional content`, async t => {
    const chat = mount(t);
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
      if (failure === 'network rejection') throw new Error('offline');
      return { ok: true, json: async () => {
        if (failure === 'JSON rejection') throw new Error('invalid JSON');
        return {};
      } };
    });
    chat.submit();
    await settle();
    assert.ok(renderToStaticMarkup(chat.render()).includes(retryMessage));
    fetchMock.mock.mockImplementation(async () => ({ ok: true, json: async () => ({
      answer: 'Here is the published information.',
      grounded: false,
      sources: [{ title: 'Pricing', path: '/pricing' }],
      followUp: { label: 'Read the docs', path: '/docs' },
      suggestions: ['Does it work offline?'],
    }) }));
    chat.submit('  Try again  ');
    await settle();
    const tree = chat.render();
    const markup = renderToStaticMarkup(tree);
    assert.match(markup, /Here is the published information\./);
    assert.match(markup, /href="\/pricing"[^>]*>Pricing/);
    assert.match(markup, /href="\/docs"[^>]*>Read the docs/);
    assert.match(markup, /Does it work offline\?/);
    assert.match(markup, /aria-busy="false"/);
    assert.equal(fetchMock.mock.callCount(), 2);
    assert.deepEqual(fetchMock.mock.calls[1].arguments, ['/api/bot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Try again' }),
    }]);
    const suggestion = elements(tree).find(node => node.type === 'button' && node.props.children === 'Does it work offline?');
    assert.equal(suggestion!.props.disabled, false);
  });
}

for (const grounded of [undefined, true]) {
  test(`valid answer accepts omitted optional fields (grounded=${grounded})`, async t => {
    const chat = mount(t);
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({
      answer: 'A normal reply', grounded,
      ...(grounded ? { sources: [], suggestions: ['Hidden suggestion'] } : {}),
    }) }));
    chat.submit();
    await settle();
    const markup = renderToStaticMarkup(chat.render());
    assert.match(markup, /A normal reply/);
    assert.doesNotMatch(markup, /Hidden suggestion|Connection problem|Thinking…/);
  });
}
