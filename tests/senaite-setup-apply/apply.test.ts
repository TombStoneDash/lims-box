import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOHWorksSenaiteSetupPlan,
  DEFAULT_OHWORKS_SYNTHETIC_CONFIG as CONFIG,
} from '../../lib/ohworks-senaite-setup-plan';
import {
  createSenaiteSetupApplier,
  type SenaiteSetupApplyOptions,
  type SenaiteSetupApplyResult,
} from '../../lib/senaite-setup-apply';

const ROOT = 'https://senaite.test.invalid/senaite';
const API = '/senaite/@@API/senaite/v1/';
const env = { SENAITE_BASE_URL: ROOT, SENAITE_SETUP_TOKEN: 'test-setup-token' };
const plan = buildOHWorksSenaiteSetupPlan(CONFIG);
const DEPARTMENT = 'd'.repeat(32);

const options: SenaiteSetupApplyOptions = {
  containers: {
    Client: '/senaite/clients',
    SampleType: '/senaite/bika_setup/bika_sampletypes',
    Instrument: '/senaite/bika_setup/bika_instruments',
    AnalysisCategory: '/senaite/bika_setup/bika_analysiscategories',
    AnalysisService: '/senaite/bika_setup/bika_analysisservices',
    AnalysisProfile: '/senaite/bika_setup/bika_analysisprofiles',
    LabContact: '/senaite/bika_setup/bika_labcontacts',
  },
  defaults: { AnalysisCategory: { Department: DEPARTMENT } },
};

type Item = Record<string, unknown> & { uid: string; title: string; portal_type: string };
type Body = Record<string, unknown>;

/**
 * In-memory senaite.jsonapi stand-in: users/current, one listing per portal
 * type (honouring `UID` like the real catalog), and `create`. Like SENAITE it
 * answers HTTP 200 for Anonymous callers and derives a person's title from
 * Firstname + Surname. `onCreate` can make it refuse, drop fields, or lose the answer.
 */
function standIn(options: {
  authenticated?: boolean;
  ignoreUidFilter?: boolean;
  onCreate?: (body: Body, count: number) => { status?: number; refuse?: boolean; loseAnswer?: boolean; drop?: string[]; title?: string } | undefined;
} = {}) {
  const folders = new Map<string, Item[]>();
  const requests: { method: string; route: string; query: Record<string, string>; body?: Body }[] = [];
  let next = 1;
  let creates = 0;
  const add = (portalType: string, fields: Record<string, unknown> & { title: string }) => {
    const item: Item = { uid: `uid-${next++}`, portal_type: portalType, review_state: 'active', ...fields };
    folders.set(portalType, [...(folders.get(portalType) ?? []), item]);
    return item;
  };
  const listing = (items: unknown[]) => Response.json({ count: items.length, items, next: null });

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, new URL(ROOT).origin);
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-setup-token');
    assert.equal(init?.redirect, 'error');
    const route = url.pathname.slice(API.length);
    const query = Object.fromEntries(url.searchParams);
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    requests.push({ method: init?.method ?? 'GET', route, query, ...(body ? { body } : {}) });
    const authenticated = options.authenticated ?? true;

    if (route === 'users/current') return listing([{ authenticated }]);
    if (!authenticated) return listing([]);
    if (route === 'create') {
      assert.equal(init?.method, 'POST');
      const behaviour = options.onCreate?.(body!, ++creates) ?? {};
      if (behaviour.status) return new Response('boom', { status: behaviour.status });
      if (behaviour.refuse) return Response.json({ success: false, message: 'refused' });
      const type = String(body!.portal_type);
      const fields: Record<string, unknown> & { title: string } = { title: String(body!.title ?? '') };
      if (body!.Firstname) fields.title = `${body!.Firstname} ${body!.Surname}`;
      if (body!.parent_uid) fields.parent_uid = body!.parent_uid;
      for (const [name, value] of Object.entries(body!)) {
        if (['portal_type', 'parent_uid', 'parent_path', 'title'].includes(name)) continue;
        fields[name] = name === 'Category' ? { uid: value } : name === 'Service'
          ? (value as string[]).map(uid => ({ uid })) : value;
      }
      for (const name of behaviour.drop ?? []) delete fields[name];
      if (behaviour.title) fields.title = behaviour.title;
      const item = add(type, fields);
      if (behaviour.loseAnswer) throw new TypeError('socket hang up');
      return listing([{ uid: item.uid, portal_type: type }]);
    }
    const rows = folders.get(route) ?? [];
    const filtered = query.UID && !options.ignoreUidFilter ? rows.filter(row => row.uid === query.UID) : rows;
    return listing(filtered.slice(0, Number(query.limit)));
  };
  const posts = () => requests.filter(request => request.method === 'POST');
  return { add, folders, requests, posts, fetchImpl };
}

function apply(server: ReturnType<typeof standIn>, extra: Partial<SenaiteSetupApplyOptions> = {}) {
  return createSenaiteSetupApplier(env, server.fetchImpl).applySetup(CONFIG, { ...options, apply: true, ...extra });
}

function is<S extends SenaiteSetupApplyResult['status']>(result: SenaiteSetupApplyResult, status: S) {
  assert.equal(result.status, status, JSON.stringify(result));
  return result as Extract<SenaiteSetupApplyResult, { status: S }>;
}

function counts(server: ReturnType<typeof standIn>) {
  return Object.fromEntries([...server.folders].map(([type, items]) => [type, items.length]));
}

const plannedCounts = plan.reduce<Record<string, number>>((all, step) =>
  ({ ...all, [step.portalType]: (all[step.portalType] ?? 0) + 1 }), {});

test('acceptance: dry run writes nothing; apply creates the plan, reads every record back, and a fresh audit is ready', async () => {
  const server = standIn();
  const dry = is(await createSenaiteSetupApplier(env, server.fetchImpl).applySetup(CONFIG, options), 'planned');
  assert.equal(dry.ready, false);
  assert.equal(dry.creates.length, plan.length);
  assert.equal(server.posts().length, 0, 'a dry run never writes');

  const applied = is(await apply(server), 'applied');
  assert.equal(server.posts().length, plan.length);
  assert.deepEqual(applied.created.map(record => record.order), plan.map(step => step.order));
  assert.ok(applied.items.every(item => item.status === 'present'));
  for (const record of applied.created) {
    assert.equal(applied.items.find(item => item.order === record.order)!.uid, record.uid);
  }
  assert.deepEqual(counts(server), plannedCounts);

  // Each create is followed by a read-back of that UID before the next write.
  const writes = server.requests.flatMap((request, index) => request.method === 'POST' ? [index] : []);
  for (const index of writes) {
    const readBack = server.requests[index + 1];
    assert.equal(readBack.method, 'GET');
    assert.ok(readBack.query.UID?.startsWith('uid-'));
    assert.equal(readBack.query.complete, 'yes');
  }

  // Re-running is a no-op: audited as present, nothing created.
  const before = server.posts().length;
  const again = is(await apply(server), 'applied');
  assert.deepEqual(again.created, []);
  assert.equal(server.posts().length, before);
  assert.deepEqual(counts(server), plannedCounts);
});

test('create bodies carry SENAITE field names and point at the UIDs created earlier in the run', async () => {
  const server = standIn();
  const applied = is(await apply(server), 'applied');
  const uidOf = (type: string, nth = 0) => applied.created.filter(record => record.portalType === type)[nth].uid;
  const body = (type: string, nth = 0) => server.posts().map(post => post.body!).filter(b => b.portal_type === type)[nth];

  assert.deepEqual(body('Client'), {
    portal_type: 'Client', parent_path: '/senaite/clients', title: 'SYNTHETIC-Occupational Health Client',
    Name: 'SYNTHETIC-Occupational Health Client', ClientID: 'SYNTHETIC-CLIENT-001',
  });
  assert.deepEqual(body('Contact'), {
    portal_type: 'Contact', parent_uid: uidOf('Client'), Firstname: 'SYNTHETIC-Client', Surname: 'Contact',
  });
  assert.deepEqual(body('AnalysisCategory'), {
    portal_type: 'AnalysisCategory', parent_path: '/senaite/bika_setup/bika_analysiscategories',
    title: 'SYNTHETIC-Serology', Department: DEPARTMENT,
  });
  assert.equal(body('AnalysisService').Category, uidOf('AnalysisCategory'));
  assert.equal(body('AnalysisService').Keyword, 'SYNTHETIC-MEASLES-IGG');
  assert.equal(body('AnalysisService').Unit, 'AU/mL');
  assert.deepEqual(body('AnalysisProfile').Service, [uidOf('AnalysisService', 0), uidOf('AnalysisService', 1)]);
  assert.equal(body('AnalysisProfile').ProfileKey, 'SYNTHETIC-IMMUNITY-PANEL');
  assert.equal(body('Instrument').Model, 'SYNTHETIC-LIAISON XL');
  assert.deepEqual(body('LabContact'), {
    portal_type: 'LabContact', parent_path: '/senaite/bika_setup/bika_labcontacts',
    Firstname: 'SYNTHETIC-Laboratory', Surname: 'Analyst',
  });
  assert.ok(server.posts().every(post => !JSON.stringify(post.body).includes('$ref')));
});

test('a partial setup creates only what is missing and points at the existing records', async () => {
  const server = standIn();
  const client = server.add('Client', { title: 'SYNTHETIC-Occupational Health Client' });
  const category = server.add('AnalysisCategory', { title: 'SYNTHETIC-Serology' });

  const dry = is(await createSenaiteSetupApplier(env, server.fetchImpl).applySetup(CONFIG, options), 'planned');
  assert.equal(dry.creates.find(create => create.portalType === 'Contact')!.body.parent_uid, client.uid);
  // The dry run shows a not-yet-created service as a pending reference, not a guess.
  const profile = dry.creates.find(create => create.portalType === 'AnalysisProfile')!;
  assert.ok((profile.body.Service as unknown[]).every(ref => typeof ref === 'object' && '$ref' in (ref as object)));

  const applied = is(await apply(server), 'applied');
  assert.equal(applied.created.length, plan.length - 2);
  assert.ok(!server.posts().some(post => post.body!.portal_type === 'Client' || post.body!.portal_type === 'AnalysisCategory'));
  assert.ok(server.posts().filter(post => post.body!.portal_type === 'AnalysisService')
    .every(post => post.body!.Category === category.uid));
  assert.deepEqual(counts(server), plannedCounts);
});

test('only the setup token enables writes; plain HTTP and embedded credentials are refused', async () => {
  let called = false;
  const transport: typeof fetch = async () => { called = true; return Response.json({}); };
  for (const bad of [
    { SENAITE_BASE_URL: ROOT, SENAITE_API_TOKEN: 'read-only' } as Record<string, string>,
    { SENAITE_BASE_URL: 'http://senaite.test.invalid/senaite', SENAITE_SETUP_TOKEN: 't' },
    { SENAITE_BASE_URL: 'https://user:pw@senaite.test.invalid/', SENAITE_SETUP_TOKEN: 't' },
    { SENAITE_BASE_URL: ROOT, SENAITE_SETUP_TOKEN: 'two words' },
  ]) {
    const applier = createSenaiteSetupApplier(bad, transport);
    assert.equal(applier.enabled, false);
    assert.deepEqual(await applier.applySetup(CONFIG, { ...options, apply: true }), { status: 'not_configured' });
  }
  assert.equal(called, false);
});

test('an Anonymous token (HTTP 200 from SENAITE 2.6) is unauthenticated and nothing is written', async () => {
  const server = standIn({ authenticated: false });
  const result = is(await apply(server), 'error');
  assert.equal(result.code, 'unauthenticated');
  assert.equal(server.posts().length, 0);
});

test('a record that disagrees with the plan stops the run before any write', async () => {
  const server = standIn();
  const category = server.add('AnalysisCategory', { title: 'SYNTHETIC-Serology' });
  server.add('AnalysisService', {
    title: 'SYNTHETIC-Measles IgG Immunity Titre', Keyword: 'SYNTHETIC-MEASLES-IGG', Unit: 'mIU/mL',
    Category: { uid: category.uid },
  });
  const result = is(await apply(server), 'error');
  assert.equal(result.code, 'setup-conflict');
  assert.equal(server.posts().length, 0);
  assert.deepEqual(result.items!.find(item => item.key === 'SYNTHETIC-MEASLES-IGG')!.mismatches, ['unit']);
});

test('bad options are refused before the first write, even when only the last step needs them', async () => {
  const { LabContact: _omit, ...withoutLabContact } = options.containers;
  for (const bad of [
    { containers: withoutLabContact },
    { containers: { ...options.containers, Client: '/senaite/../etc' } },
    { containers: { ...options.containers, Client: 'senaite/clients' } },
    { containers: { ...options.containers, Contact: '/senaite/clients' } },
    { defaults: { AnalysisService: { Keyword: 'OVERRIDE' } } },
    { defaults: { AnalysisCategory: { title: 'OVERRIDE' } } },
    { defaults: { AnalysisCategory: { ApiToken: 'x' } } },
    { defaults: { AnalysisCategory: { Department: '' } } },
  ] as Partial<SenaiteSetupApplyOptions>[]) {
    const server = standIn();
    const result = is(await apply(server, bad), 'error');
    assert.equal(result.code, 'invalid-options', JSON.stringify(bad));
    assert.equal(server.posts().length, 0, JSON.stringify(bad));
  }
});

test('a field SENAITE silently ignores is caught by the final audit, never reported as applied', async () => {
  const server = standIn({ onCreate: body => body.portal_type === 'AnalysisService' ? { drop: ['Unit'] } : undefined });
  const result = is(await apply(server), 'error');
  assert.equal(result.code, 'write-unconfirmed');
  assert.equal(result.created.length, plan.length);
  assert.ok(result.items!.some(item => item.mismatches.includes('unreadable-field')));
});

test('a stored title that differs from the plan is unconfirmed at read-back and later steps are not sent', async () => {
  const server = standIn({ onCreate: body => body.portal_type === 'SampleType' ? { title: 'Serum' } : undefined });
  const result = is(await apply(server), 'error');
  assert.equal(result.code, 'write-unconfirmed');
  const sampleType = plan.find(step => step.portalType === 'SampleType')!;
  assert.deepEqual(result.created.map(record => record.order), plan.filter(step => step.order < sampleType.order).map(step => step.order));
  assert.equal(server.posts().length, result.created.length + 1);
});

test('a lost create answer is write-unconfirmed, and re-running finishes without a duplicate', async () => {
  let lose = true;
  const server = standIn({ onCreate: (_body, count) => {
    if (count === 3 && lose) { lose = false; return { loseAnswer: true }; }
  } });
  const first = is(await apply(server), 'error');
  assert.equal(first.code, 'write-unconfirmed');
  assert.equal(first.created.length, 2);

  is(await apply(server), 'applied');
  assert.deepEqual(counts(server), plannedCounts);
});

test('refused and failing creates are write-failed', async () => {
  for (const behaviour of [{ refuse: true }, { status: 500 }]) {
    const server = standIn({ onCreate: () => behaviour });
    const result = is(await apply(server), 'error');
    assert.equal(result.code, 'write-failed');
    assert.deepEqual(result.created, []);
    assert.equal(server.posts().length, 1);
  }
});

test('a read-back that ignores the UID filter and returns another record is unconfirmed', async () => {
  const server = standIn({ ignoreUidFilter: true });
  server.add('Client', { title: 'SYNTHETIC-Some Other Client' });
  const result = is(await apply(server), 'error');
  assert.equal(result.code, 'write-unconfirmed');
  assert.deepEqual(result.created, []);
});
