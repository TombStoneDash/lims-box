import assert from 'node:assert/strict';
import test from 'node:test';
import { validateBotReply } from '../../app/bot/bot-chat';

const fallback = { text: 'LIMS BOT could not answer. Please try again.' };

async function reply(body: unknown, status = 200) {
  const response = new Response(JSON.stringify(body), { status });
  const data: unknown = await response.json();
  return validateBotReply(response.ok, data);
}

test('invalid JSON shapes and missing or nonblank-string answers produce a retry message', async () => {
  for (const body of [{}, null, [], ['answer'], 'answer', 42, false,
    { answer: {} }, { answer: [] }, { answer: null }, { answer: 42 },
    { answer: '' }, { answer: ' \n\t ' }]) {
    assert.deepEqual(await reply(body), fallback, JSON.stringify(body));
  }
});

test('non-OK answer-shaped responses never become normal answers', async () => {
  for (const status of [400, 429, 500]) {
    assert.deepEqual(await reply({
      answer: 'A misleading answer',
      sources: [{ title: 'Pricing', path: '/pricing' }],
      followUp: { label: 'Contact', path: '/contact' },
      suggestions: ['What does it cost?'],
    }, status), fallback);
  }
});

test('usable server errors are preserved and malformed errors get a retry message', async () => {
  for (const status of [200, 400, 500]) {
    assert.deepEqual(await reply({ answer: 'Ignore this', error: 'Please try a shorter question.' }, status), {
      text: 'Please try a shorter question.',
    });
    for (const error of ['', ' \n ', null, {}, [], 42, false]) {
      assert.deepEqual(await reply({ error }, status), fallback);
      assert.deepEqual(await reply({ error, answer: 'Ignore this' }, status), fallback);
    }
  }
});

test('non-array sources and suggestions and malformed follow-ups are discarded', async () => {
  for (const value of [null, {}, 'not an array', 42, true]) {
    const result = await reply({ answer: 'Valid answer', sources: value, suggestions: value, followUp: value });
    assert.equal(result.text, 'Valid answer');
    assert.deepEqual(result.sources, []);
    assert.equal(result.followUp, undefined);
    assert.equal(result.suggestions, undefined);
  }
  for (const followUp of [[], { label: {}, path: '/contact' }, { label: 'Contact', path: {} },
    { label: ' ', path: '/contact' }, { label: 'Contact', path: '' }, { label: 'Contact' }]) {
    assert.equal((await reply({ answer: 'Valid answer', followUp })).followUp, undefined);
  }
});

test('malformed optional array items are filtered while valid items are retained', async () => {
  const source = { title: 'Pricing', path: '/pricing' };
  const result = await reply({
    answer: 'Valid answer',
    sources: [null, [], {}, 'bad', 42, { title: {}, path: '/pricing' },
      { title: 'Pricing', path: {} }, { title: ' ', path: '/pricing' },
      { title: 'Pricing', path: '' }, source],
    suggestions: [null, [], {}, 42, false, '', ' \n ', 'What does it cost?'],
  });
  assert.deepEqual(result.sources, [source]);
  assert.deepEqual(result.suggestions, ['What does it cost?']);
});

test('valid replies retain answer, sources, follow-up, and ungrounded suggestions', async () => {
  const body = {
    answer: 'Read our pricing page.',
    grounded: false,
    sources: [{ title: 'Pricing', path: '/pricing' }],
    followUp: { label: 'Contact', path: '/contact' },
    suggestions: ['Does LIMS BOX work offline?'],
  };
  assert.deepEqual(await reply(body), {
    text: body.answer, sources: body.sources, followUp: body.followUp, suggestions: body.suggestions,
  });
  assert.equal((await reply({ ...body, grounded: true })).suggestions, undefined);
  assert.deepEqual(await reply({ answer: 'Valid answer' }), {
    text: 'Valid answer', sources: [], followUp: undefined, suggestions: undefined,
  });
});
