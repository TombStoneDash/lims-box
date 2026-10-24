import assert from 'node:assert/strict';
import test from 'node:test';
import recorded from '../senaite-read/fixtures/recorded/senaite-2.6.0-anonymous.json';
import { createSenaiteSampleReceiver } from '../../lib/senaite-sample-receive';

// In-memory stand-in for senaite.jsonapi v1 with synthetic records only. It
// models the two behaviours this module must survive: query keys that are not
// catalog indexes are dropped silently, and `update` runs a named transition.
const ORIGIN = 'https://senaite.test.invalid';
const ROOT = '/senaite/@@API/senaite/v1';
const env = { SENAITE_BASE_URL: `${ORIGIN}/senaite`, SENAITE_SAMPLE_RECEIVE_TOKEN: 'receive-token' };

const OHWORKS = 'a'.repeat(32);
const OTHER_CLIENT = 'b'.repeat(32);
const uid = (n: number) => n.toString(16).padStart(32, 'c');

type Stored = { uid: string; id: string; client: string; state: string };
type Logged = { method: string; path: string; query: Record<string, string>; body?: unknown };
type Fault = 'lost-before' | 'lost-after' | 'http-500' | 'success-false' | 'ignored';

function standIn(samples: Stored[], options: { authenticated?: boolean; dropped?: string[]; fault?: Fault } = {}) {
  const store = new Map(samples.map(sample => [sample.uid, { ...sample }]));
  const log: Logged[] = [];
  let fault = options.fault;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, ORIGIN);
    assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer receive-token');
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    log.push({ method: init?.method ?? 'GET', path: url.pathname.slice(ROOT.length), query: Object.fromEntries(url.searchParams), body });

    if (url.pathname === `${ROOT}/users/current`) {
      return json({ count: 1, items: [{ username: 'synthetic', authenticated: options.authenticated ?? true }] });
    }
    if (url.pathname === `${ROOT}/AnalysisRequest` && init?.method === 'GET') {
      const filters: Array<[string, (sample: Stored) => string]> = [
        ['getId', sample => sample.id], ['getClientUID', sample => sample.client], ['UID', sample => sample.uid],
      ];
      const items = [...store.values()]
        .filter(sample => filters.every(([key, field]) =>
          options.dropped?.includes(key) || !url.searchParams.has(key) || url.searchParams.get(key) === field(sample)))
        .map(sample => ({
          uid: sample.uid, id: sample.id, title: sample.id, getClientUID: sample.client,
          review_state: sample.state, parent_uid: sample.client,
        }));
      return json({ count: items.length, items, page: 1, next: null });
    }
    if (url.pathname === `${ROOT}/update` && init?.method === 'POST') {
      const current = fault;
      fault = undefined;
      if (current === 'lost-before') throw new TypeError('fetch failed');
      if (current === 'http-500') return json({ success: false, message: 'Internal' }, 500);
      if (current === 'success-false') return json({ success: false, message: 'refused' });
      const sample = store.get(body.uid);
      if (current !== 'ignored' && sample && body.transition === 'receive' && sample.state === 'sample_due') {
        sample.state = 'sample_received';
      }
      if (current === 'lost-after') throw new TypeError('fetch failed');
      return json({ count: 1, items: [{ uid: body.uid }] });
    }
    return json({ success: false, message: '404 Not Found' }, 404);
  };
  return { fetchImpl, log, store, posts: () => log.filter(entry => entry.method === 'POST') };
}

const due = (n: number, id: string, client = OHWORKS): Stored => ({ uid: uid(n), id, client, state: 'sample_due' });
const lab = () => [due(1, 'WB-0001'), due(2, 'WB-0002'), due(3, 'WB-0003', OTHER_CLIENT)];
const request = { clientUid: OHWORKS, sampleId: 'WB-0001' };

test('acceptance: a due OHWorks sample is received in SENAITE and confirmed by read-back', async () => {
  const senaite = standIn(lab());
  const result = await createSenaiteSampleReceiver(env, senaite.fetchImpl).receive(request);

  assert.deepEqual(result, {
    status: 'received', sample: { uid: uid(1), id: 'WB-0001', reviewState: 'sample_received' }, transitioned: true,
  });
  assert.equal(senaite.store.get(uid(1))?.state, 'sample_received');
  assert.equal(senaite.store.get(uid(2))?.state, 'sample_due', 'no other sample moves');
  assert.equal(senaite.store.get(uid(3))?.state, 'sample_due');
  assert.deepEqual(senaite.log, [
    { method: 'GET', path: '/users/current', query: {}, body: undefined },
    { method: 'GET', path: '/AnalysisRequest', query: { getId: 'WB-0001', getClientUID: OHWORKS, complete: 'yes', limit: '10' }, body: undefined },
    { method: 'POST', path: '/update', query: {}, body: { uid: uid(1), transition: 'receive' } },
    { method: 'GET', path: '/AnalysisRequest', query: { UID: uid(1), complete: 'yes', limit: '10' }, body: undefined },
  ]);
});

test('receiving twice is safe: an already received sample is reported without a write', async () => {
  const senaite = standIn(lab());
  const receiver = createSenaiteSampleReceiver(env, senaite.fetchImpl);
  await receiver.receive(request);
  const again = await receiver.receive(request);

  assert.deepEqual(again, {
    status: 'received', sample: { uid: uid(1), id: 'WB-0001', reviewState: 'sample_received' }, transitioned: false,
  });
  assert.equal(senaite.posts().length, 1);
});

test('samples outside sample_due are not receivable and nothing is written', async () => {
  for (const state of ['to_be_sampled', 'scheduled_sampling', 'to_be_preserved', 'cancelled', 'invalid', 'published']) {
    const senaite = standIn([{ ...due(1, 'WB-0001'), state }]);
    assert.deepEqual(await createSenaiteSampleReceiver(env, senaite.fetchImpl).receive(request), {
      status: 'error', code: 'not-receivable', reviewState: state,
    });
    assert.equal(senaite.posts().length, 0, state);
  }
});

test('a lost answer is settled by the read-back, and a retry never transitions twice', async () => {
  const applied = standIn(lab(), { fault: 'lost-after' });
  assert.deepEqual(await createSenaiteSampleReceiver(env, applied.fetchImpl).receive(request), {
    status: 'received', sample: { uid: uid(1), id: 'WB-0001', reviewState: 'sample_received' }, transitioned: true,
  });

  const notApplied = standIn(lab(), { fault: 'lost-before' });
  const receiver = createSenaiteSampleReceiver(env, notApplied.fetchImpl);
  assert.deepEqual(await receiver.receive(request), { status: 'error', code: 'write-unconfirmed' });
  assert.equal(notApplied.store.get(uid(1))?.state, 'sample_due');
  const retry = await receiver.receive(request);
  assert.equal(retry.status, 'received');
  assert.equal(notApplied.posts().length, 2);
  assert.equal((await receiver.receive(request)).status, 'received');
  assert.equal(notApplied.posts().length, 2, 'once received, retries send no write');
});

test('a refused write is write-failed; an accepted write that changed nothing is write-unconfirmed', async () => {
  for (const fault of ['http-500', 'success-false'] as const) {
    const senaite = standIn(lab(), { fault });
    assert.deepEqual(await createSenaiteSampleReceiver(env, senaite.fetchImpl).receive(request), {
      status: 'error', code: 'write-failed',
    }, fault);
  }
  const ignored = standIn(lab(), { fault: 'ignored' });
  assert.deepEqual(await createSenaiteSampleReceiver(env, ignored.fetchImpl).receive(request), {
    status: 'error', code: 'write-unconfirmed',
  });
});

test('ignored catalog filters fail closed as scope-mismatch before any write', async () => {
  // getId dropped: the listing carries other samples, so absence cannot be proven.
  const noId = standIn(lab(), { dropped: ['getId'] });
  assert.deepEqual(await createSenaiteSampleReceiver(env, noId.fetchImpl).receive(request), {
    status: 'error', code: 'scope-mismatch',
  });
  assert.equal(noId.posts().length, 0);

  // getClientUID dropped: the same ID also exists under another client.
  const samples = [due(1, 'WB-0001'), due(9, 'WB-0001', OTHER_CLIENT)];
  const noClient = standIn(samples, { dropped: ['getClientUID'] });
  assert.deepEqual(await createSenaiteSampleReceiver(env, noClient.fetchImpl).receive(request), {
    status: 'error', code: 'scope-mismatch',
  });
  assert.equal(noClient.posts().length, 0);
  assert.equal(noClient.store.get(uid(9))?.state, 'sample_due', 'the other client\'s sample is untouched');

  // UID dropped on the read-back: the write happened but cannot be proven for this sample.
  const noUid = standIn(lab(), { dropped: ['UID'] });
  assert.deepEqual(await createSenaiteSampleReceiver(env, noUid.fetchImpl).receive(request), {
    status: 'error', code: 'write-unconfirmed',
  });
});

test('a sample that belongs to another client is not found, and duplicates are not guessed', async () => {
  const foreign = standIn(lab());
  assert.deepEqual(await createSenaiteSampleReceiver(env, foreign.fetchImpl).receive({ ...request, sampleId: 'WB-0003' }), {
    status: 'error', code: 'sample-not-found',
  });
  assert.equal(foreign.store.get(uid(3))?.state, 'sample_due');

  const twice = standIn([due(1, 'WB-0001'), due(2, 'WB-0001')]);
  assert.deepEqual(await createSenaiteSampleReceiver(env, twice.fetchImpl).receive(request), {
    status: 'error', code: 'ambiguous-sample',
  });
  assert.equal(twice.posts().length, 0);
});

test('a rejected token stops after users/current, in the stand-in and against the recorded SENAITE 2.6.0 answer', async () => {
  const senaite = standIn(lab(), { authenticated: false });
  assert.deepEqual(await createSenaiteSampleReceiver(env, senaite.fetchImpl).receive(request), {
    status: 'error', code: 'unauthenticated',
  });
  assert.deepEqual(senaite.log.map(entry => entry.path), ['/users/current']);

  const paths: string[] = [];
  const replay: typeof fetch = async input => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    const { status, contentType, bodyText } = recorded.responses['users-current-invalid-bearer'];
    return new Response(bodyText, { status, headers: { 'content-type': contentType } });
  };
  assert.deepEqual(await createSenaiteSampleReceiver(env, replay).receive(request), {
    status: 'error', code: 'unauthenticated',
  });
  assert.deepEqual(paths, ['/senaite/@@API/senaite/v1/users/current']);
});

test('malformed or HTTP-200 error listings are invalid-response with no write', async () => {
  const bodies = [
    { success: false, message: 'boom' },
    { items: [{ uid: uid(1), id: 'WB-0001', getClientUID: OHWORKS }] },
    { items: [{ uid: 'not-a-uid', id: 'WB-0001', getClientUID: OHWORKS, review_state: 'sample_due' }] },
    { items: [{ uid: uid(1), id: 'WB-0001', getClientUID: OHWORKS, review_state: 'Sample Due!' }] },
    { items: 'nope' },
  ];
  for (const body of bodies) {
    const methods: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      methods.push(init?.method ?? 'GET');
      const path = new URL(String(input)).pathname;
      const payload = path.endsWith('/users/current') ? { items: [{ authenticated: true }] } : body;
      return new Response(JSON.stringify(payload), { status: 200 });
    };
    assert.deepEqual(await createSenaiteSampleReceiver(env, fetchImpl).receive(request), {
      status: 'error', code: 'invalid-response',
    }, JSON.stringify(body));
    assert.ok(!methods.includes('POST'));
  }
});

test('only the receive token over HTTPS enables writes; bad requests send nothing', async () => {
  const senaite = standIn(lab());
  const disabled = [
    { SENAITE_BASE_URL: env.SENAITE_BASE_URL },
    { SENAITE_BASE_URL: env.SENAITE_BASE_URL, SENAITE_API_TOKEN: 'read-only-token' },
    { ...env, SENAITE_BASE_URL: 'http://senaite.test.invalid/senaite' },
    { ...env, SENAITE_BASE_URL: 'https://user:pass@senaite.test.invalid/senaite' },
    { ...env, SENAITE_BASE_URL: 'https://senaite.test.invalid/senaite?x=1' },
    { ...env, SENAITE_SAMPLE_RECEIVE_TOKEN: 'two words' },
    { ...env, SENAITE_SAMPLE_RECEIVE_TOKEN: '   ' },
  ];
  for (const config of disabled) {
    const receiver = createSenaiteSampleReceiver(config, senaite.fetchImpl);
    assert.equal(receiver.enabled, false);
    assert.deepEqual(await receiver.receive(request), { status: 'not_configured' });
  }

  const receiver = createSenaiteSampleReceiver(env, senaite.fetchImpl);
  const invalid: unknown[] = [
    null, 'WB-0001', {}, { ...request, clientUid: OHWORKS.toUpperCase() }, { ...request, clientUid: 'x' },
    { ...request, sampleId: '' }, { ...request, sampleId: '../WB-0001' }, { ...request, sampleId: 'WB 0001' },
    { ...request, sampleId: 7 },
  ];
  for (const value of invalid) {
    assert.deepEqual(await receiver.receive(value as typeof request), { status: 'error', code: 'invalid-request' });
  }
  assert.equal(senaite.log.length, 0);
});
