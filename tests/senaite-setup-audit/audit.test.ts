import assert from 'node:assert/strict';
import test from 'node:test';
import recorded from '../senaite-read/fixtures/recorded/senaite-2.6.0-anonymous.json';
import {
  buildOHWorksSenaiteSetupPlan,
  DEFAULT_OHWORKS_SYNTHETIC_CONFIG as CONFIG,
} from '../../lib/ohworks-senaite-setup-plan';
import {
  createSenaiteSetupAuditor,
  type SenaiteRemainingStep,
} from '../../lib/senaite-setup-audit';

const ROOT = 'https://senaite.test.invalid/senaite';
const API = '/senaite/@@API/senaite/v1/';
const env = { SENAITE_BASE_URL: ROOT, SENAITE_API_TOKEN: 'test-read-token' };

type Item = Record<string, unknown> & { uid: string; title: string; portal_type: string };

/** In-memory senaite.jsonapi stand-in: users/current plus one listing per portal type. */
function standIn(options: { authenticated?: boolean; listing?: (type: string, items: Item[]) => unknown } = {}) {
  const folders = new Map<string, Item[]>();
  const requests: { method: string; path: string; search: string }[] = [];
  let next = 1;
  const add = (portalType: string, fields: Record<string, unknown> & { title: string }) => {
    const item: Item = { uid: `uid-${next++}`, portal_type: portalType, review_state: 'active', ...fields };
    folders.set(portalType, [...(folders.get(portalType) ?? []), item]);
    return item;
  };
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, new URL(ROOT).origin);
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-read-token');
    assert.equal(init?.redirect, 'error');
    requests.push({ method: init?.method ?? 'GET', path: url.pathname, search: url.search });
    const route = url.pathname.slice(API.length);
    const body = route === 'users/current'
      ? { count: 1, items: [{ authenticated: options.authenticated ?? true }], next: null }
      : options.listing?.(route, folders.get(route) ?? [])
        ?? { count: (folders.get(route) ?? []).length, items: folders.get(route) ?? [], next: null };
    return Response.json(body);
  };

  /** What an operator would do with the remaining steps: create each, in order. */
  const create = (steps: SenaiteRemainingStep[]) => {
    const created = new Map<number, string>();
    const uid = (value: unknown) => {
      const ref = value as { $ref?: number; $uid?: string };
      return ref.$uid ?? created.get(ref.$ref!)!;
    };
    for (const { order, portalType, payload } of steps) {
      const fields: Record<string, unknown> & { title: string } = { title: String(payload.title) };
      if (payload.parent) fields.parent_uid = uid(payload.parent);
      if (portalType === 'AnalysisService') {
        Object.assign(fields, { Keyword: payload.Keyword, Unit: payload.Unit, Category: { uid: uid(payload.Category) } });
      }
      if (portalType === 'Instrument') fields.Model = payload.Model;
      if (portalType === 'AnalysisProfile') {
        fields.Service = (payload.Services as unknown[]).map(ref => ({ uid: uid(ref) }));
      }
      created.set(order, add(portalType, fields).uid);
    }
  };
  return { add, create, folders, requests, fetchImpl };
}

const plan = buildOHWorksSenaiteSetupPlan(CONFIG);

async function audit(server: ReturnType<typeof standIn>, config = CONFIG) {
  return createSenaiteSetupAuditor(env, server.fetchImpl).audit(config);
}

function ok(result: Awaited<ReturnType<typeof audit>>) {
  assert.equal(result.status, 'ok');
  return result as Extract<typeof result, { status: 'ok' }>;
}

test('acceptance: an empty SENAITE needs the whole plan, and after creating it the audit is ready', async () => {
  const server = standIn();
  const first = ok(await audit(server));
  assert.equal(first.ready, false);
  assert.deepEqual(first.items.map(item => item.status), plan.map(() => 'missing'));
  assert.deepEqual(first.remaining, plan);

  server.create(first.remaining);
  const second = ok(await audit(server));
  assert.equal(second.ready, true);
  assert.deepEqual(second.remaining, []);
  assert.deepEqual(second.items.map(item => item.status), plan.map(() => 'present'));
  assert.ok(second.items.every(item => item.uid?.startsWith('uid-')));

  // Only GETs, ever: sign-in proof, then one listing per planned portal type.
  assert.ok(server.requests.every(request => request.method === 'GET'));
  const types = [...new Set(plan.map(step => step.portalType))];
  assert.equal(server.requests.length, 2 * (1 + types.length));
  assert.equal(server.requests[0].path, `${API}users/current`);
  for (const request of server.requests.slice(1, 1 + types.length)) {
    assert.equal(new URLSearchParams(request.search).get('complete'), 'yes');
  }
});

test('a partial setup plans only what is missing, pointing at existing records by UID', async () => {
  const server = standIn();
  const client = server.add('Client', { title: 'SYNTHETIC-Occupational Health Client' });
  const category = server.add('AnalysisCategory', { title: 'SYNTHETIC-Serology' });
  const result = ok(await audit(server));

  assert.equal(result.ready, false);
  const contact = result.remaining.find(step => step.portalType === 'Contact')!;
  assert.deepEqual(contact.payload.parent, { $uid: client.uid });
  assert.deepEqual(contact.dependsOn, []);
  const services = result.remaining.filter(step => step.portalType === 'AnalysisService');
  assert.equal(services.length, 2);
  for (const service of services) {
    assert.deepEqual(service.payload.Category, { $uid: category.uid });
    assert.deepEqual(service.dependsOn, []);
  }
  // The profile still points at the services, which are themselves still to create.
  const profile = result.remaining.find(step => step.portalType === 'AnalysisProfile')!;
  assert.deepEqual(profile.payload.Services, services.map(step => ({ $ref: step.order })));
  assert.ok(!result.remaining.some(step => step.portalType === 'Client' || step.portalType === 'AnalysisCategory'));

  server.create(result.remaining);
  assert.equal(ok(await audit(server)).ready, true);
  assert.equal(server.folders.get('Client')!.length, 1, 're-running never plans a duplicate client');
});

test('a service that disagrees with the plan is a mismatch, and the profile needing it is blocked', async () => {
  const server = standIn();
  server.create(plan);
  const measles = server.folders.get('AnalysisService')!.find(item => item.Keyword === 'SYNTHETIC-MEASLES-IGG')!;
  measles.Unit = 'mIU/mL';
  server.folders.set('AnalysisProfile', []);
  const result = ok(await audit(server));

  assert.equal(result.ready, false);
  const service = result.items.find(item => item.key === 'SYNTHETIC-MEASLES-IGG')!;
  assert.deepEqual([service.status, service.mismatches, service.uid], ['mismatch', ['unit'], measles.uid]);
  assert.equal(result.items.find(item => item.portalType === 'AnalysisProfile')!.status, 'blocked');
  assert.deepEqual(result.remaining, [], 'nothing is planned on top of a record a human must fix');
});

test('wrong category, wrong instrument model and a profile with other services are each reported', async () => {
  const server = standIn();
  server.create(plan);
  const other = server.add('AnalysisCategory', { title: 'SYNTHETIC-Other' });
  const [measles, rubella] = server.folders.get('AnalysisService')!;
  measles.Category = other.uid;
  server.folders.get('Instrument')![0].Model = 'SYNTHETIC-Other Analyzer';
  server.folders.get('AnalysisProfile')![0].Service = [{ uid: rubella.uid }];
  const result = ok(await audit(server));

  const byKey = Object.fromEntries(result.items.map(item => [item.key, item]));
  assert.deepEqual(byKey['SYNTHETIC-MEASLES-IGG'].mismatches, ['category']);
  assert.deepEqual(byKey['SYNTHETIC-LIAISON XL'].mismatches, ['model']);
  assert.deepEqual(byKey['SYNTHETIC-Occupational Immunity Panel'].mismatches, ['services']);
  assert.equal(result.ready, false);
});

test('an inactive record is not counted as set up', async () => {
  const server = standIn();
  server.create(plan);
  server.folders.get('SampleType')![0].review_state = 'inactive';
  const result = ok(await audit(server));
  const sampleType = result.items.find(item => item.portalType === 'SampleType')!;
  assert.deepEqual([sampleType.status, sampleType.mismatches], ['mismatch', ['inactive']]);
  assert.equal(result.ready, false);
});

test('two records with the planned title are ambiguous and nothing is guessed', async () => {
  const server = standIn();
  server.add('SampleType', { title: 'SYNTHETIC-Serum' });
  server.add('SampleType', { title: 'SYNTHETIC-Serum' });
  const result = ok(await audit(server));
  const sampleType = result.items.find(item => item.portalType === 'SampleType')!;
  assert.deepEqual([sampleType.status, sampleType.uid], ['ambiguous', null]);
  assert.ok(!result.remaining.some(step => step.portalType === 'SampleType'));
});

test('a contact with the planned name under another client is not ours', async () => {
  const server = standIn();
  const client = server.add('Client', { title: 'SYNTHETIC-Occupational Health Client' });
  server.add('Contact', { title: 'SYNTHETIC-Client Contact', parent_uid: 'uid-someone-else' });
  const result = ok(await audit(server));
  const contact = result.items.find(item => item.portalType === 'Contact')!;
  assert.equal(contact.status, 'missing');
  assert.deepEqual(result.remaining.find(step => step.portalType === 'Contact')!.payload.parent, { $uid: client.uid });
});

test('a field the audit cannot read is reported, never assumed to match', async () => {
  const server = standIn();
  server.create(plan);
  delete server.folders.get('AnalysisService')![0].Unit;
  delete server.folders.get('AnalysisProfile')![0].Service;
  const result = ok(await audit(server));
  assert.deepEqual(result.items.find(item => item.key === 'SYNTHETIC-MEASLES-IGG')!.mismatches, ['unreadable-field']);
  assert.deepEqual(result.items.find(item => item.portalType === 'AnalysisProfile')!.mismatches, ['unreadable-field']);
  assert.equal(result.ready, false);
});

test('a rejected sign-in stops before any setup listing is read', async () => {
  const server = standIn({ authenticated: false });
  assert.deepEqual(await audit(server), { status: 'error', code: 'unauthenticated' });
  assert.deepEqual(server.requests.map(request => request.path), [`${API}users/current`]);
});

test('recorded real SENAITE 2.6.0: an invalid token is unauthenticated, not an empty lab to recreate', async () => {
  const paths: string[] = [];
  const fetchImpl: typeof fetch = async input => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    assert.equal(url.pathname, '/senaite/@@API/senaite/v1/users/current');
    const { status, contentType, bodyText } = recorded.responses['users-current-invalid-bearer'];
    return new Response(bodyText, { status, headers: { 'content-type': contentType } });
  };
  const result = await createSenaiteSetupAuditor(
    { SENAITE_BASE_URL: 'https://senaite.recorded.invalid/senaite', SENAITE_API_TOKEN: 'recorded-invalid-token' },
    fetchImpl,
  ).audit(CONFIG);
  assert.deepEqual(result, { status: 'error', code: 'unauthenticated' });
  assert.equal(paths.length, 1);
});

test('recorded real SENAITE 2.6.0: an HTTP-200 success:false answer is invalid, not an empty folder', async () => {
  const error = JSON.parse(recorded.responses['analysisrequest-unknown-path-no-auth'].bodyText);
  const server = standIn({ listing: type => (type === 'SampleType' ? error : undefined) });
  assert.deepEqual(await audit(server), { status: 'error', code: 'invalid-response' });
});

test('a listing that is only one page of the folder fails closed', async () => {
  for (const listing of [
    (_: string, items: Item[]) => ({ count: items.length + 1, items, next: null }),
    (_: string, items: Item[]) => ({ count: items.length, items, next: `${ROOT}/@@API/senaite/v1/Client?b_start=500` }),
  ]) {
    const server = standIn({ listing });
    assert.deepEqual(await audit(server), { status: 'error', code: 'incomplete-listing' });
  }
});

test('a listing with another portal type or a malformed record fails closed', async () => {
  for (const bad of [
    { uid: 'uid-x', title: 'SYNTHETIC-Serum', portal_type: 'AnalysisRequest' },
    { uid: '', title: 'SYNTHETIC-Serum', portal_type: 'SampleType' },
    { uid: 'uid-x', portal_type: 'SampleType' },
  ]) {
    const server = standIn({ listing: type => (type === 'SampleType' ? { count: 1, items: [bad], next: null } : undefined) });
    assert.deepEqual(await audit(server), { status: 'error', code: 'invalid-response' });
  }
});

test('HTTP and transport failures return fixed codes without upstream detail', async () => {
  const failing = (response: () => Promise<Response>): typeof fetch => async input =>
    String(input).endsWith('users/current') ? Response.json({ items: [{ authenticated: true }] }) : response();
  const cases: [typeof fetch, string][] = [
    [failing(async () => new Response('secret upstream detail', { status: 500 })), 'request-failed'],
    [failing(async () => { throw new Error('https://user:pass@host'); }), 'request-failed'],
    [failing(async () => new Response('not json', { status: 200 })), 'invalid-response'],
  ];
  for (const [fetchImpl, code] of cases) {
    const result = await createSenaiteSetupAuditor(env, fetchImpl).audit(CONFIG);
    assert.deepEqual(result, { status: 'error', code });
  }
});

test('unsafe configuration or a non-synthetic plan sends no request', async () => {
  for (const unsafe of [
    {},
    { SENAITE_BASE_URL: 'http://senaite.test.invalid/senaite', SENAITE_API_TOKEN: 't' },
    { SENAITE_BASE_URL: 'https://user:pass@senaite.test.invalid/senaite', SENAITE_API_TOKEN: 't' },
    { SENAITE_BASE_URL: ROOT, SENAITE_API_TOKEN: 'two words' },
  ]) {
    const server = standIn();
    const auditor = createSenaiteSetupAuditor(unsafe, server.fetchImpl);
    assert.equal(auditor.enabled, false);
    assert.deepEqual(await auditor.audit(CONFIG), { status: 'not_configured' });
    assert.equal(server.requests.length, 0);
  }
  const server = standIn();
  const realName = { ...CONFIG, client: { ...CONFIG.client, title: 'Real Customer Ltd' } };
  assert.deepEqual(await audit(server, realName), { status: 'error', code: 'invalid-plan' });
  assert.equal(server.requests.length, 0);
});
