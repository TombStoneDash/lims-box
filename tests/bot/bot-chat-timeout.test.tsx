import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BOT_REQUEST_TIMEOUT_MS, requestBotReply } from '../../app/bot/bot-chat';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const reply = {
  answer: 'Read the published pricing.',
  grounded: true,
  sources: [{ title: 'Pricing', path: '/pricing' }],
  followUp: { label: 'Contact us', path: '/contact' },
};

function response(body: unknown): Response {
  return { json: async () => body } as Response;
}

for (const stage of ['fetch', 'JSON body'] as const) {
  test(`a stalled ${stage} times out, ignores late completion, and allows a successful retry`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const clear = t.mock.method(globalThis, 'clearTimeout');
    const pendingFetch = deferred<Response>();
    const pendingBody = deferred<typeof reply>();
    const signals: AbortSignal[] = [];
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
      signals.push(init.signal as AbortSignal);
      calls += 1;
      if (calls > 1) return response(reply);
      return stage === 'fetch'
        ? pendingFetch.promise
        : { json: () => pendingBody.promise } as Response;
    });

    const outcomes: unknown[] = [];
    const first = requestBotReply('First question').then(
      (data) => { outcomes.push(data); },
      (error) => { outcomes.push(error); },
    );
    // Let fetch settle and body reading start, without advancing the deadline.
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(BOT_REQUEST_TIMEOUT_MS, 15_000);
    t.mock.timers.tick(BOT_REQUEST_TIMEOUT_MS - 1);
    assert.equal(signals[0].aborted, false);
    assert.equal(outcomes.length, 0);
    t.mock.timers.tick(1);
    await first;
    assert.equal(signals[0].aborted, true);
    assert.equal(outcomes.length, 1);
    assert.ok(outcomes[0] instanceof Error);
    assert.equal(outcomes[0].message, 'The request timed out — please try again.');
    assert.equal(clear.mock.callCount(), 1);

    assert.deepEqual(await requestBotReply('Retry question'), reply);
    assert.equal(signals[1].aborted, false);
    assert.equal(clear.mock.callCount(), 2);
    pendingFetch.resolve(response(reply));
    pendingBody.resolve(reply);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(outcomes.length, 1, 'late results must not publish another answer');
    t.mock.timers.tick(BOT_REQUEST_TIMEOUT_MS);
    assert.equal(signals[1].aborted, false, 'successful retry must clear its timer');
  });
}

test('fetch and body reading share one deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fetchResult = deferred<Response>();
  const body = deferred<typeof reply>();
  t.mock.method(globalThis, 'fetch', () => fetchResult.promise);
  const pending = requestBotReply('Question');
  const rejected = assert.rejects(pending, /timed out.*try again/);
  t.mock.timers.tick(10_000);
  fetchResult.resolve({ json: () => body.promise } as Response);
  await Promise.resolve();
  t.mock.timers.tick(5_000);
  await rejected;
});

test('success preserves the request contract and links and clears the timer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clear = t.mock.method(globalThis, 'clearTimeout');
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => response(reply));
  assert.deepEqual(await requestBotReply('Pricing?'), reply);
  const [url, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
  assert.equal(url, '/api/bot');
  assert.equal(init.method, 'POST');
  assert.deepEqual(init.headers, { 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(init.body as string), { question: 'Pricing?' });
  assert.equal(clear.mock.callCount(), 1);
  t.mock.timers.tick(BOT_REQUEST_TIMEOUT_MS);
  assert.equal(init.signal?.aborted, false);
});

test('ordinary fetch and JSON failures preserve the error and clear the timer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clear = t.mock.method(globalThis, 'clearTimeout');
  const failure = new Error('Connection failed');
  let signal: AbortSignal | undefined;
  const fetchMock = t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    signal = init.signal as AbortSignal;
    throw failure;
  });
  await assert.rejects(requestBotReply('Question'), (error) => error === failure);
  assert.equal(clear.mock.callCount(), 1);
  t.mock.timers.tick(BOT_REQUEST_TIMEOUT_MS);
  assert.equal(signal?.aborted, false);
  fetchMock.mock.mockImplementation(async () => ({ json: async () => { throw failure; } }) as Response);
  await assert.rejects(requestBotReply('Question'), (error) => error === failure);
  assert.equal(clear.mock.callCount(), 2);
  fetchMock.mock.mockImplementation(async () => response({ error: 'Please rephrase.' }));
  assert.deepEqual(await requestBotReply('Question'), { error: 'Please rephrase.' });
});

test('the component awaits the bounded helper and releases busy in finally', () => {
  const source = readFileSync(new URL('../../app/bot/bot-chat.tsx', import.meta.url), 'utf8');
  assert.match(source, /const data = await requestBotReply\(q\);/);
  assert.match(source, /error instanceof BotRequestTimeoutError\s*\? error.message\s*: 'Connection problem — please try again.'/);
  assert.match(source, /finally\s*\{\s*setBusy\(false\);/);
});
