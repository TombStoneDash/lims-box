import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import recorded from './fixtures/recorded/senaite-2.6.0-anonymous.json';
import SenaiteLivePage, { dynamic } from '../../app/senaite-live/page';
import { isProtectedDemoPath } from '../../lib/demo-access';
import { reviewStateLabel, senaiteLiveView } from '../../lib/senaite-read/view';

// tsx uses the classic JSX runtime for this repository's preserved JSX.
Object.assign(globalThis, { React });

// The page builds its adapter from process.env and globalThis.fetch, so each
// test sets both and restores them. No test reaches a network.
const TOKEN = 'recorded-invalid-token';
const ENV = { SENAITE_BASE_URL: 'https://senaite.recorded.invalid/senaite', SENAITE_API_TOKEN: TOKEN };

async function renderWith(env: Partial<typeof ENV>, transport: typeof fetch) {
  const keys = Object.keys(ENV) as (keyof typeof ENV)[];
  const previousEnv = keys.map(key => process.env[key]);
  const previousFetch = globalThis.fetch;
  try {
    keys.forEach(key => {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    });
    globalThis.fetch = transport;
    return renderToStaticMarkup(await SenaiteLivePage());
  } finally {
    globalThis.fetch = previousFetch;
    keys.forEach((key, i) => {
      if (previousEnv[i] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[i];
    });
  }
}

const IDENTITY = '/senaite/@@API/senaite/v1/users/current';
const SAMPLES = '/senaite/@@API/senaite/v1/AnalysisRequest';

function respondingWith(byPath: Record<string, unknown>) {
  const paths: string[] = [];
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://senaite.recorded.invalid');
    assert.equal(init?.method, 'GET');
    assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${TOKEN}`);
    paths.push(url.pathname);
    const answer = byPath[url.pathname];
    assert.ok(answer !== undefined, `unexpected request to ${url.pathname}`);
    return answer instanceof Response ? answer : Response.json(answer);
  };
  return { paths, transport };
}

const recordedResponse = (name: keyof typeof recorded.responses) => {
  const { status, contentType, bodyText } = recorded.responses[name];
  return new Response(bodyText, { status, headers: { 'content-type': contentType } });
};

const state = (markup: string) => /data-senaite-state="([a-z]+)"/.exec(markup)?.[1];
const signedIn = { items: [{ username: 'synthetic-reader', authenticated: true, roles: ['Authenticated'] }] };

test('the page is protected by operator auth and never prerendered', () => {
  for (const pathname of ['/senaite-live', '/senaite-live/anything']) {
    assert.equal(isProtectedDemoPath(pathname), true, pathname);
  }
  assert.equal(isProtectedDemoPath('/senaite-livestream'), false);
  assert.equal(dynamic, 'force-dynamic');
});

test('without configuration the page sends no request and says SENAITE is not connected', async () => {
  const forbidden: typeof fetch = async () => assert.fail('no request may be sent');
  for (const env of [{}, { SENAITE_BASE_URL: ENV.SENAITE_BASE_URL }, { SENAITE_API_TOKEN: TOKEN }]) {
    const markup = await renderWith(env, forbidden);
    assert.equal(state(markup), 'unavailable');
    assert.match(markup, /SENAITE is not connected/);
    assert.doesNotMatch(markup, /<table/);
  }
});

test('real SENAITE 2.6.0 rejecting the token renders a sign-in error, never an empty lab', async () => {
  // Recorded answers from a real server: users/current says Anonymous, and the
  // sample listing (if it were asked) would be HTTP 200 with zero samples.
  const { paths, transport } = respondingWith({
    [IDENTITY]: recordedResponse('users-current-invalid-bearer'),
    [SAMPLES]: recordedResponse('analysisrequest-invalid-bearer'),
  });
  const markup = await renderWith(ENV, transport);
  assert.deepEqual(paths, [IDENTITY]);
  assert.equal(state(markup), 'error');
  assert.match(markup, /role="alert"/);
  assert.match(markup, /SENAITE did not accept the read token/);
  assert.match(markup, /This is not an empty lab/);
  assert.doesNotMatch(markup, /No samples in SENAITE/);
  assert.equal(markup.includes(TOKEN), false);
});

test('a signed-in read lists the samples SENAITE returned with readable states', async () => {
  const { paths, transport } = respondingWith({
    [IDENTITY]: signedIn,
    [SAMPLES]: { items: [
      { uid: 'u-1', id: 'W-0001', title: 'Synthetic well water', review_state: 'sample_received' },
      { uid: 'u-2', id: 'W-0002', title: null, review_state: 'to_be_verified' },
      { uid: 'u-3', id: 'W-0003', review_state: 'custom_lab_state' },
      { uid: 'u-4', id: 'W-0004' },
    ] },
  });
  const markup = await renderWith(ENV, transport);
  assert.deepEqual(paths, [IDENTITY, SAMPLES]);
  assert.equal(state(markup), 'ok');
  assert.match(markup, /4 newest SENAITE samples/);
  for (const text of ['W-0001', 'Synthetic well water', 'Received', 'W-0002', 'To be verified',
    'custom_lab_state', 'State not reported']) {
    assert.ok(markup.includes(text), text);
  }
  assert.equal(markup.includes(TOKEN), false);
});

test('a signed-in empty lab is the only path to "No samples"', async () => {
  const { transport } = respondingWith({ [IDENTITY]: signedIn, [SAMPLES]: { items: [] } });
  const markup = await renderWith(ENV, transport);
  assert.equal(state(markup), 'empty');
  assert.match(markup, /No samples in SENAITE/);
  assert.match(markup, /confirmed the read token/);
});

test('upstream failures render fixed wording without upstream text or partial data', async () => {
  const cases: [string, Record<string, unknown>, RegExp][] = [
    ['HTTP 500', { [IDENTITY]: new Response('Traceback: secret-internal-detail', { status: 500 }) }, /could not be reached/],
    ['HTTP-200 SENAITE error', { [IDENTITY]: signedIn, [SAMPLES]: { success: false, message: 'secret-internal-detail' } }, /cannot trust/],
    ['malformed sample', { [IDENTITY]: signedIn, [SAMPLES]: { items: [
      { uid: 'u-1', id: 'W-0001', title: 'secret-internal-detail' }, { uid: 7, id: 'W-0002' }] } }, /cannot trust/],
  ];
  for (const [name, byPath, wording] of cases) {
    const markup = await renderWith(ENV, respondingWith(byPath).transport);
    assert.equal(state(markup), 'error', name);
    assert.match(markup, wording, name);
    assert.equal(markup.includes('secret-internal-detail'), false, name);
    assert.doesNotMatch(markup, /<table/, name);
  }
});

test('sample text from SENAITE is escaped, not rendered as markup', async () => {
  const { transport } = respondingWith({
    [IDENTITY]: signedIn,
    [SAMPLES]: { items: [{ uid: 'u-1', id: '<img src=x onerror=alert(1)>', title: '<script>alert(1)</script>' }] },
  });
  const markup = await renderWith(ENV, transport);
  assert.doesNotMatch(markup, /<script>|<img /);
  assert.match(markup, /&lt;script&gt;/);
});

test('every adapter outcome maps to an explicit view', () => {
  for (const code of ['invalid-query', 'unauthenticated', 'request-failed', 'invalid-response'] as const) {
    const view = senaiteLiveView({ status: 'error', code });
    assert.equal(view.tone, 'error');
    assert.ok(view.heading && view.detail, code);
    assert.deepEqual(view.rows, []);
  }
  assert.equal(senaiteLiveView({ status: 'ok', samples: [{ uid: 'u', id: 'S', title: null, reviewState: null }] }).heading,
    '1 newest SENAITE sample');
  assert.equal(reviewStateLabel('published'), 'Published');
  assert.equal(reviewStateLabel(null), 'State not reported');
  // A state name that collides with an Object.prototype key is shown as-is.
  assert.equal(reviewStateLabel('constructor'), 'constructor');
});
