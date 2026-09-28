import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BotChat } from '../../app/bot/bot-chat';

const retry = 'Unable to get a valid answer. Please try again.';
const valid = {
  answer: 'LIMS BOX works offline.',
  grounded: true,
  sources: [{ title: 'Offline guide', path: '/docs/offline' }],
  followUp: { label: 'Read more', path: '/docs' },
  suggestions: ['Should stay hidden for grounded replies'],
};

function harness(t: TestContext, respond: () => Promise<Response>) {
  const states: unknown[] = [];
  let cursor = 0;
  t.mock.method(React, 'useState', (initial: unknown) => {
    const index = cursor++;
    if (!(index in states)) states[index] = initial;
    return [states[index], (next: unknown) => {
      states[index] = typeof next === 'function' ? next(states[index]) : next;
    }];
  });
  t.mock.method(React, 'useId', () => 'question');
  // Session-history effects (#292) need a browser; this harness renders the component as a function.
  t.mock.method(React, 'useEffect', () => {});
  const focus = t.mock.fn();
  t.mock.method(React, 'useRef', () => ({ current: { focus } }));
  const fetch = t.mock.method(globalThis, 'fetch', respond);
  const render = () => {
    cursor = 0;
    return BotChat();
  };
  const form = () => render().props.children.find((child: React.ReactElement) => child.type === 'form');
  const markup = () => renderToStaticMarkup(render());
  const submit = (question = 'Does it work offline?') => {
    form().props.children.find((child: React.ReactElement) => child.type === 'input')
      .props.onChange({ target: { value: question } });
    form().props.onSubmit({ preventDefault() {} });
    assert.match(markup(), /aria-busy="true"/);
    assert.match(markup(), /role="status"/);
    assert.equal(form().props.children.find((child: React.ReactElement) => child.type === 'button').props.disabled, true);
  };
  const settle = async () => {
    // Drain the fetch/JSON promise chain and its finally block.
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.match(markup(), /aria-busy="false"/);
    assert.doesNotMatch(markup(), /Thinking…/);
    return markup();
  };
  return { render, markup, submit, settle, fetch, focus };
}

function response(payload: unknown, ok = true): Response {
  return new Response(JSON.stringify(payload), { status: ok ? 200 : 503 });
}

for (const [name, payload] of Object.entries({
  'empty object': {},
  null: null,
  array: [],
  primitive: 'answer',
  'object error': { error: { message: 'Nope' } },
  'empty error': { error: '   ' },
  'blank answer': { answer: ' ', grounded: true },
  'object answer': { answer: {}, grounded: true },
  'missing grounding': { answer: 'Hello' },
  'invalid grounding': { answer: 'Hello', grounded: 'yes' },
})) {
  test(`${name} produces safe retry feedback`, async t => {
    const chat = harness(t, async () => response(payload));
    chat.submit();
    const markup = await chat.settle();
    assert.ok(markup.includes(retry));
    assert.equal((markup.match(/LIMS BOT answered:/g) ?? []).length, 1);
    assert.equal(chat.fetch.mock.callCount(), 1);
  });
}

for (const ok of [true, false]) {
  test(`nonempty string error is displayed (HTTP ok=${ok})`, async t => {
    const chat = harness(t, async () => response({ error: 'Please retry shortly.' }, ok));
    chat.submit();
    assert.match(await chat.settle(), /Please retry shortly\./);
  });
}

test('non-OK HTTP response cannot append even a valid answer', async t => {
  const chat = harness(t, async () => response(valid, false));
  chat.submit();
  const markup = await chat.settle();
  assert.ok(markup.includes(retry));
  assert.ok(!markup.includes(valid.answer));
});

for (const optional of [
  { sources: { length: 1 }, followUp: { label: {}, path: [] }, suggestions: 'oops' },
  { sources: [null, {}, { title: {}, path: '/bad' }, { title: 'Bad', path: {} }], followUp: 'oops', suggestions: [null, {}, 7, ' '] },
]) {
  test(`malformed optional fields render safely: ${JSON.stringify(optional)}`, async t => {
    const chat = harness(t, async () => response({ ...valid, grounded: false, ...optional }));
    chat.submit();
    const markup = await chat.settle();
    assert.ok(markup.includes(valid.answer));
    assert.doesNotMatch(markup, /Sources for this answer|Read more|Try asking:/);
  });
}

test('valid grounded reply preserves sources and follow-up and hides suggestions', async t => {
  const chat = harness(t, async () => response(valid));
  chat.submit();
  const markup = await chat.settle();
  assert.ok(markup.includes(valid.answer));
  assert.match(markup, /href="\/docs\/offline"[^>]*>Offline guide/);
  assert.match(markup, /href="\/docs"[^>]*>Read more/);
  assert.doesNotMatch(markup, /Should stay hidden|Try asking:/);
  assert.deepEqual(chat.fetch.mock.calls[0].arguments, ['/api/bot', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'Does it work offline?' }),
  }]);
});

test('mixed optional arrays retain valid entries and suggestions remain usable', async t => {
  const chat = harness(t, async () => response({
    ...valid, grounded: false,
    sources: [null, ...valid.sources], suggestions: [{}, 'What does it cost?', ''],
  }));
  chat.submit();
  const markup = await chat.settle();
  assert.match(markup, /Offline guide/);
  assert.match(markup, /What does it cost\?/);
  function buttons(node: React.ReactNode): React.ReactElement[] {
    if (!React.isValidElement(node)) return [];
    return node.type === 'button' ? [node] : React.Children.toArray(node.props.children).flatMap(buttons);
  }
  const suggestion = buttons(chat.render()).find(button => button.props.children === 'What does it cost?');
  assert.ok(suggestion);
  assert.equal(suggestion.props.disabled, false);
  suggestion.props.onClick();
  await chat.settle();
  assert.equal(chat.fetch.mock.callCount(), 2);
  assert.equal(chat.focus.mock.callCount(), 1);
});

for (const failure of ['invalid payload', 'network rejection', 'JSON rejection']) {
  test(`${failure} releases busy state and allows a successful retry`, async t => {
    const chat = harness(t, async () => {
      if (failure === 'network rejection') throw new Error('offline');
      if (failure === 'JSON rejection') return new Response('invalid JSON');
      return response({});
    });
    chat.submit();
    const failed = await chat.settle();
    assert.ok(failed.includes(failure === 'network rejection' ? 'Connection problem — please try again.' : retry));
    chat.fetch.mock.mockImplementation(async () => response(valid));
    chat.submit('Try again');
    const recovered = await chat.settle();
    assert.ok(recovered.includes(valid.answer));
    assert.equal(chat.fetch.mock.callCount(), 2);
    assert.equal((recovered.match(/LIMS BOT answered:/g) ?? []).length, 2);
  });
}
