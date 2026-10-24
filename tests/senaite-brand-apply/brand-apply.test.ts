import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SYNTHETIC_BRAND } from '../../lib/ohworks-brand';
import {
  BRAND_FIELDS_NOT_IN_SENAITE,
  createSenaiteBrandApplier,
  SenaiteBrandError,
} from '../../lib/senaite-brand-apply';

const uid = (n: number) => n.toString(16).padStart(32, '0');
const LAB = uid(0x1ab);
const env = { SENAITE_BASE_URL: 'https://senaite.test.invalid/senaite', SENAITE_BRAND_TOKEN: 'brand-token' };
const API = '/senaite/@@API/senaite/v1/';
const brand = { ...DEFAULT_SYNTHETIC_BRAND };

type StoredLab = { uid: string; portal_type: string; Name: string; EmailAddress: string; TaxNumber: string };

/**
 * In-memory stand-in for the senaite.jsonapi routes the applier uses. Like the
 * real API it answers HTTP 200 for Anonymous callers, drops query keys that are
 * not catalog indexes, and `update` changes only the fields it is sent.
 */
function senaite(options: {
  authenticated?: boolean;
  labs?: Partial<StoredLab>[];
  ignorePortalType?: boolean;
  onUpdate?: (body: Record<string, unknown>) => { ignore?: string[]; loseAnswer?: boolean; refuse?: boolean; status?: number };
} = {}) {
  const labs: StoredLab[] = (options.labs ?? [{}]).map((lab, i) => ({
    uid: i === 0 ? LAB : uid(0x2ab + i),
    portal_type: 'Laboratory',
    Name: 'Default Laboratory',
    EmailAddress: '',
    TaxNumber: 'SYNTHETIC-TAX-1',
    ...lab,
  }));
  const others = [{ uid: uid(0xc1), portal_type: 'Client', Name: 'SYNTHETIC-Client' }];
  const calls: { method: string; path: string; query: Record<string, string>; body?: Record<string, unknown> }[] = [];
  const listing = (items: unknown[]) => Response.json({ count: items.length, items, next: null, page: 1, pages: 1 });

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://senaite.test.invalid');
    assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer brand-token');
    const route = url.pathname.slice(API.length);
    const query = Object.fromEntries(url.searchParams);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: init?.method ?? 'GET', path: route, query, ...(body ? { body } : {}) });
    const authenticated = options.authenticated ?? true;

    if (route === 'users/current') {
      return listing([{ username: authenticated ? 'brand-admin' : 'Anonymous User', authenticated }]);
    }
    if (!authenticated) return listing([]);
    if (route === 'Laboratory' && init?.method === 'GET') {
      const pool = options.ignorePortalType ? [...others, ...labs] : labs;
      return listing(pool.filter(row => query.UID === undefined || row.uid === query.UID).slice(0, Number(query.limit)));
    }
    if (route === 'update' && init?.method === 'POST') {
      const quirk = options.onUpdate?.(body) ?? {};
      if (quirk.status) return new Response('Internal Server Error', { status: quirk.status });
      if (quirk.refuse) return Response.json({ success: false, message: 'Unauthorized: brand-token' });
      const lab = labs.find(row => row.uid === body.uid);
      if (!lab) return Response.json({ success: false, message: 'Object not found' });
      for (const [key, value] of Object.entries(body)) {
        if (key !== 'uid' && !quirk.ignore?.includes(key)) (lab as Record<string, unknown>)[key] = value;
      }
      if (quirk.loseAnswer) throw new TypeError('socket hang up');
      return listing([{ uid: lab.uid }]);
    }
    return Response.json({ success: false, message: '404 Not Found' });
  };
  return { fetchImpl, labs, calls };
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof SenaiteBrandError);
    assert.doesNotMatch(error.message, /token|SYNTHETIC|Unauthorized|socket|Internal/);
    return error.code;
  }
  assert.fail('expected a SenaiteBrandError');
}

const writes = <T extends { method: string }>(calls: T[]) => calls.filter(call => call.method !== 'GET');

test('acceptance: brand.yml is planned, applied to the SENAITE Laboratory, read back, and a re-run is a no-op', async () => {
  const server = senaite();
  const applier = createSenaiteBrandApplier(env, server.fetchImpl);
  assert.equal(applier.enabled, true);

  const plan = await applier.applyBrand(brand);
  assert.equal(plan.state, 'PLANNED');
  assert.equal(plan.laboratoryUid, LAB);
  assert.deepEqual(plan.fields.map(field => [field.senaiteField, field.status]), [['Name', 'planned'], ['EmailAddress', 'planned']]);
  assert.deepEqual(writes(server.calls), [], 'planning never writes');
  assert.equal(server.labs[0].Name, 'Default Laboratory');

  server.calls.length = 0;
  const done = await applier.applyBrand(brand, { apply: true });
  assert.equal(done.state, 'APPLIED');
  assert.deepEqual(done.fields.map(field => field.status), ['applied', 'applied']);
  assert.deepEqual(done.notInSenaite, BRAND_FIELDS_NOT_IN_SENAITE);
  assert.deepEqual(server.calls.map(call => `${call.method} ${call.path}`), [
    'GET users/current', 'GET Laboratory', 'POST update', 'GET Laboratory',
  ]);
  assert.deepEqual(server.calls[2].body, {
    uid: LAB, Name: 'SYNTHETIC-Laboratory', EmailAddress: 'SYNTHETIC-support@SYNTHETIC-example.invalid',
  });
  assert.equal(server.calls[3].query.UID, LAB, 'the read-back is narrowed to the record written');
  assert.equal(server.labs[0].Name, 'SYNTHETIC-Laboratory');
  assert.equal(server.labs[0].TaxNumber, 'SYNTHETIC-TAX-1', 'fields outside the brand are untouched');

  server.calls.length = 0;
  const again = await applier.applyBrand(brand, { apply: true });
  assert.equal(again.state, 'UNCHANGED');
  assert.deepEqual(writes(server.calls), []);
});

test('only the fields that differ are sent', async () => {
  const server = senaite({ labs: [{ Name: 'SYNTHETIC-Laboratory' }] });
  const done = await createSenaiteBrandApplier(env, server.fetchImpl).applyBrand(brand, { apply: true });
  assert.deepEqual(done.fields.map(field => [field.brandField, field.status]), [['labName', 'unchanged'], ['supportEmail', 'applied']]);
  assert.deepEqual(writes(server.calls).map(call => call.body), [
    { uid: LAB, EmailAddress: 'SYNTHETIC-support@SYNTHETIC-example.invalid' },
  ]);
});

test('an invalid brand.yml sends no request and names fields, not values', async () => {
  const server = senaite();
  const applier = createSenaiteBrandApplier(env, server.fetchImpl);
  for (const bad of [{ ...brand, supportEmail: 'not-an-email' }, { ...brand, labName: '<script>' }, { ...brand, extra: 'x' }, null, 'brand']) {
    const error = await applier.applyBrand(bad).catch(caught => caught);
    assert.ok(error instanceof SenaiteBrandError);
    assert.equal(error.code, 'invalid-brand');
    assert.doesNotMatch(JSON.stringify(error.issues), /not-an-email|script/);
  }
  assert.deepEqual(server.calls, []);
});

test('missing or unsafe configuration sends no request; the read-only token never enables writes', async () => {
  const server = senaite();
  for (const bad of [
    {},
    { SENAITE_BASE_URL: env.SENAITE_BASE_URL },
    { SENAITE_BASE_URL: env.SENAITE_BASE_URL, SENAITE_API_TOKEN: 'read-token' } as never,
    { ...env, SENAITE_BASE_URL: 'http://senaite.test.invalid/senaite' },
    { ...env, SENAITE_BASE_URL: 'https://user:pw@senaite.test.invalid/senaite' },
    { ...env, SENAITE_BASE_URL: 'https://senaite.test.invalid/senaite?x=1' },
    { ...env, SENAITE_BRAND_TOKEN: 'two words' },
  ]) {
    const applier = createSenaiteBrandApplier(bad, server.fetchImpl);
    assert.equal(applier.enabled, false);
    assert.equal(await codeOf(applier.applyBrand(brand, { apply: true })), 'not-configured');
  }
  assert.deepEqual(server.calls, []);
});

test('a token SENAITE treats as Anonymous is refused before any read or write', async () => {
  const server = senaite({ authenticated: false });
  assert.equal(await codeOf(createSenaiteBrandApplier(env, server.fetchImpl).applyBrand(brand, { apply: true })), 'unauthenticated');
  assert.deepEqual(server.calls.map(call => call.path), ['users/current']);
});

test('the Laboratory read fails closed on zero, two or foreign records', async () => {
  const cases: [Parameters<typeof senaite>[0], string][] = [
    [{ labs: [] }, 'invalid-response'],
    [{ labs: [{}, {}] }, 'invalid-response'],
    [{ ignorePortalType: true }, 'scope-mismatch'],
    [{ labs: [{ uid: 'not-a-uid' }] }, 'invalid-response'],
    [{ labs: [{ Name: 42 as never }] }, 'invalid-response'],
  ];
  for (const [options, code] of cases) {
    const server = senaite(options);
    assert.equal(await codeOf(createSenaiteBrandApplier(env, server.fetchImpl).applyBrand(brand, { apply: true })), code);
    assert.deepEqual(writes(server.calls), []);
  }
});

test('a field SENAITE silently ignores is reported unconfirmed, not applied', async () => {
  const server = senaite({ onUpdate: () => ({ ignore: ['EmailAddress'] }) });
  assert.equal(await codeOf(createSenaiteBrandApplier(env, server.fetchImpl).applyBrand(brand, { apply: true })), 'write-unconfirmed');
});

test('a refused or failed update is write-failed and leaks nothing', async () => {
  for (const quirk of [{ refuse: true }, { status: 500 }]) {
    const server = senaite({ onUpdate: () => quirk });
    assert.equal(await codeOf(createSenaiteBrandApplier(env, server.fetchImpl).applyBrand(brand, { apply: true })), 'write-failed');
  }
});

test('a lost update answer is unconfirmed; the re-run reads it back and does not write twice', async () => {
  const server = senaite({ onUpdate: () => ({ loseAnswer: true }) });
  const applier = createSenaiteBrandApplier(env, server.fetchImpl);
  assert.equal(await codeOf(applier.applyBrand(brand, { apply: true })), 'write-unconfirmed');
  server.calls.length = 0;
  const again = await applier.applyBrand(brand, { apply: true });
  assert.equal(again.state, 'UNCHANGED');
  assert.deepEqual(writes(server.calls), []);
});

test('a read-back that returns another record is a scope mismatch', async () => {
  const server = senaite();
  const realFetch = server.fetchImpl;
  let reads = 0;
  const swapped: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/Laboratory') && url.searchParams.get('UID') && ++reads === 1) {
      return Response.json({ items: [{ uid: uid(0x999), portal_type: 'Laboratory', Name: brand.labName, EmailAddress: brand.supportEmail }] });
    }
    return realFetch(input, init);
  };
  assert.equal(await codeOf(createSenaiteBrandApplier(env, swapped).applyBrand(brand, { apply: true })), 'scope-mismatch');
});
