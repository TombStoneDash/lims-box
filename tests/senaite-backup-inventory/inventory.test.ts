import assert from 'node:assert/strict';
import test from 'node:test';
import recorded from '../senaite-read/fixtures/recorded/senaite-2.6.0-anonymous.json';
import {
  compareSenaiteInventories,
  createSenaiteInventoryReader,
  normalizeSenaiteModified,
  SENAITE_BACKUP_PORTAL_TYPES,
  SENAITE_INVENTORY_PAGE_SIZE,
  type SenaiteInventory,
} from '../../lib/senaite-backup-inventory';

const uid = (n: number) => n.toString(16).padStart(32, '0');
const env = { SENAITE_BASE_URL: 'https://senaite.test.invalid/senaite', SENAITE_API_TOKEN: 'read-token' };
const API = '/senaite/@@API/senaite/v1/';

type Row = { uid: string; portal_type: string; id: string; title: string; modified: string };
type Store = Record<string, Row[]>;

/** A synthetic OHWorks lab: 60 samples with 5 analyses each, plus its setup. */
function syntheticLab(): Store {
  let next = 0x1000;
  const rows = (portalType: string, n: number, prefix: string) => Array.from({ length: n }, (_, i) => ({
    uid: uid(next++),
    portal_type: portalType,
    id: `${prefix}-${i + 1}`,
    title: `SYNTHETIC-${prefix}-${i + 1}`,
    modified: `2026-10-2${i % 3}T0${i % 10}:15:00+01:00`,
  }));
  return {
    Client: rows('Client', 1, 'client'),
    Contact: rows('Contact', 2, 'contact'),
    LabContact: rows('LabContact', 4, 'labcontact'),
    SampleType: rows('SampleType', 4, 'sampletype'),
    AnalysisCategory: rows('AnalysisCategory', 2, 'category'),
    AnalysisService: rows('AnalysisService', 5, 'service'),
    AnalysisProfile: rows('AnalysisProfile', 2, 'profile'),
    Instrument: [],
    AnalysisRequest: rows('AnalysisRequest', 60, 'WP'),
    Analysis: rows('Analysis', 300, 'analysis'),
  };
}

const clone = (store: Store): Store => structuredClone(store);

/**
 * In-memory stand-in for the senaite.jsonapi listing routes. Like the real API
 * it answers HTTP 200 for Anonymous callers with empty folders, pages with
 * `limit`/`b_start`, and sends unknown routes as HTTP 200 `success: false`.
 */
function senaite(store: Store, options: {
  authenticated?: boolean;
  ignoreLimit?: boolean;
  /** Called before each listing answer; may change the store mid-read. */
  onList?: (portalType: string, bStart: number) => void;
} = {}) {
  const calls: { method: string; path: string; query: Record<string, string> }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://senaite.test.invalid');
    assert.equal(init?.method, 'GET');
    assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer read-token');
    const route = url.pathname.slice(API.length);
    const query = Object.fromEntries(url.searchParams);
    calls.push({ method: init.method, path: route, query });
    const authenticated = options.authenticated ?? true;
    if (route === 'users/current') {
      return Response.json({ count: 1, items: [{ username: authenticated ? 'reader' : 'Anonymous User', authenticated }] });
    }
    if (!Object.hasOwn(store, route)) return Response.json({ success: false, message: '404 Not Found' });
    const limit = Number(query.limit ?? 25);
    const bStart = Number(query.b_start ?? 0);
    options.onList?.(route, bStart);
    const all = authenticated ? store[route] : [];
    const items = options.ignoreLimit ? all : all.slice(bStart, bStart + limit);
    return Response.json({
      count: all.length, pagesize: limit, items, page: Math.floor(bStart / limit) + 1,
      next: bStart + limit < all.length ? `https://senaite.test.invalid${API}${route}?b_start=${bStart + limit}` : null,
    });
  };
  return { fetchImpl, calls };
}

async function inventoryOf(store: Store): Promise<SenaiteInventory> {
  const result = await createSenaiteInventoryReader(env, senaite(store).fetchImpl).read();
  assert.equal(result.status, 'ok');
  return (result as { inventory: SenaiteInventory }).inventory;
}

test('acceptance: inventory before backup equals inventory after restore, with GETs only', async () => {
  const live = syntheticLab();
  const server = senaite(live);
  const before = await createSenaiteInventoryReader(env, server.fetchImpl).read();
  assert.equal(before.status, 'ok');
  const inventory = (before as { inventory: SenaiteInventory }).inventory;
  assert.deepEqual(inventory.portalTypes, [...SENAITE_BACKUP_PORTAL_TYPES].sort());
  assert.deepEqual(inventory.counts, {
    Analysis: 300, AnalysisCategory: 2, AnalysisProfile: 2, AnalysisRequest: 60, AnalysisService: 5,
    Client: 1, Contact: 2, Instrument: 0, LabContact: 4, SampleType: 4,
  });
  assert.equal(inventory.manifest.Instrument, undefined);
  assert.equal(inventory.manifest.AnalysisRequest.count, 60);
  // Only counts and checksums: no titles, IDs or synthetic names leak into the receipt.
  assert.doesNotMatch(JSON.stringify(inventory), /SYNTHETIC|WP-|client-1/);

  // One sign-in proof, then each type: 1 page each, except 300 analyses = 2 pages.
  assert.equal(server.calls[0].path, 'users/current');
  assert.equal(server.calls.length, 1 + 9 + 2);
  assert.deepEqual(server.calls.filter(c => c.path === 'Analysis').map(c => c.query), [
    { limit: String(SENAITE_INVENTORY_PAGE_SIZE), b_start: '0', sort_on: 'created', sort_order: 'ascending' },
    { limit: String(SENAITE_INVENTORY_PAGE_SIZE), b_start: String(SENAITE_INVENTORY_PAGE_SIZE), sort_on: 'created', sort_order: 'ascending' },
  ]);

  // Backup = copy of the site; restore = a new server built from that copy,
  // on a host whose SENAITE serializes the same instants in UTC.
  const restored = clone(live);
  for (const rows of Object.values(restored)) {
    for (const row of rows) row.modified = new Date(row.modified).toISOString().replace('.000Z', '+00:00');
  }
  restored.Analysis.reverse();
  const after = await inventoryOf(restored);
  const comparison = compareSenaiteInventories(inventory, JSON.parse(JSON.stringify(after)));
  assert.deepEqual(comparison.differences, []);
  assert.equal(comparison.ok, true);
  assert.match(comparison.summary, /passed: 10 portal types, 380 records/);
});

test('a restore that lost a sample, or brought back a stale copy, is a failed restore', async () => {
  const live = syntheticLab();
  const before = await inventoryOf(live);

  const lost = clone(live);
  lost.AnalysisRequest.pop();
  const lostResult = compareSenaiteInventories(before, await inventoryOf(lost));
  assert.equal(lostResult.ok, false);
  assert.deepEqual(lostResult.differences.map(d => [d.portalType, d.kind]),
    [['AnalysisRequest', 'count'], ['AnalysisRequest', 'checksum']]);

  // Same records, but one analysis was edited after the backup was taken.
  const stale = clone(live);
  live.Analysis[17].modified = '2026-10-22T09:00:00+00:00';
  const stalePair = compareSenaiteInventories(await inventoryOf(live), await inventoryOf(stale));
  assert.deepEqual(stalePair.differences.map(d => [d.portalType, d.kind]), [['Analysis', 'checksum']]);

  // A restore that came back with no instruments, where the lab had one.
  const withInstrument = clone(stale);
  withInstrument.Instrument.push({ uid: uid(0xfff0), portal_type: 'Instrument', id: 'i', title: 'LIAISON XL', modified: '2026-10-20T00:00:00Z' });
  const noInstrument = compareSenaiteInventories(await inventoryOf(withInstrument), await inventoryOf(stale));
  assert.deepEqual(noInstrument.differences, [{ portalType: 'Instrument', kind: 'missing', before: 1, after: null }]);
});

test('a rejected token stops after the sign-in check and never reads as a wiped lab', async () => {
  const server = senaite(syntheticLab(), { authenticated: false });
  const result = await createSenaiteInventoryReader(env, server.fetchImpl).read();
  assert.deepEqual(result, { status: 'error', code: 'unauthenticated' });
  assert.deepEqual(server.calls.map(c => c.path), ['users/current']);
});

test('recorded real SENAITE 2.6.0: an invalid token gives unauthenticated after one request', async () => {
  const replay = recorded.responses['users-current-invalid-bearer'];
  const paths: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    paths.push(new URL(String(input)).pathname);
    return new Response(replay.bodyText, { status: replay.status, headers: { 'content-type': replay.contentType } });
  };
  const result = await createSenaiteInventoryReader(
    { SENAITE_BASE_URL: 'https://senaite.recorded.invalid/senaite', SENAITE_API_TOKEN: 'recorded-invalid-token' }, fetchImpl,
  ).read();
  assert.deepEqual(result, { status: 'error', code: 'unauthenticated' });
  assert.deepEqual(paths, ['/senaite/@@API/senaite/v1/users/current']);
});

test('recorded real SENAITE 2.6.0: an HTTP-200 success:false answer is invalid-response', async () => {
  const replay = recorded.responses['analysisrequest-unknown-path-no-auth'];
  const fetchImpl: typeof fetch = async (input) => new URL(String(input)).pathname.endsWith('users/current')
    ? Response.json({ items: [{ authenticated: true }] })
    : new Response(replay.bodyText, { status: 200, headers: { 'content-type': replay.contentType } });
  const result = await createSenaiteInventoryReader(env, fetchImpl).read(['AnalysisRequest']);
  assert.deepEqual(result, { status: 'error', code: 'invalid-response', portalType: 'AnalysisRequest' });
});

test('records added or removed while reading make the inventory unprovable, not partial', async () => {
  // 400 analyses: page 2 is still a full page after one is added, so only
  // the changed count shows the list is no longer whole.
  const added = syntheticLab();
  added.Analysis.push(...added.Analysis.map((row, i) => ({ ...row, uid: uid(0x200000 + i) })).slice(0, 100));
  const grow = senaite(added, {
    onList: (type, bStart) => {
      if (type === 'Analysis' && bStart > 0) {
        added.Analysis.push({ ...added.Analysis[0], uid: uid(0xeeee) });
      }
    },
  });
  assert.deepEqual(await createSenaiteInventoryReader(env, grow.fetchImpl).read(),
    { status: 'error', code: 'inventory-changed', portalType: 'Analysis' });

  // One added at the front and one deleted at the end: count is unchanged but
  // the second page repeats a record.
  const shifted = syntheticLab();
  const shift = senaite(shifted, {
    onList: (type, bStart) => {
      if (type === 'Analysis' && bStart > 0) {
        shifted.Analysis.pop();
        shifted.Analysis.unshift({ ...shifted.Analysis[0], uid: uid(0xdddd) });
      }
    },
  });
  assert.deepEqual(await createSenaiteInventoryReader(env, shift.fetchImpl).read(),
    { status: 'error', code: 'inventory-changed', portalType: 'Analysis' });
});

test('a server that ignores the page size, or a lab too large to inventory, fails closed', async () => {
  const lab = syntheticLab();
  assert.deepEqual(await createSenaiteInventoryReader(env, senaite(lab, { ignoreLimit: true }).fetchImpl).read(),
    { status: 'error', code: 'invalid-response', portalType: 'Analysis' });

  lab.Analysis = Array.from({ length: 10_001 }, (_, i) =>
    ({ uid: uid(0x100000 + i), portal_type: 'Analysis', id: `a${i}`, title: '', modified: '2026-10-20T00:00:00Z' }));
  const big = senaite(lab);
  assert.deepEqual(await createSenaiteInventoryReader(env, big.fetchImpl).read(['Analysis']),
    { status: 'error', code: 'inventory-too-large', portalType: 'Analysis' });
  assert.equal(big.calls.length, 2);
});

test('malformed records fail the inventory', async () => {
  const cases: [string, (lab: Store) => void][] = [
    ['foreign portal type', lab => { lab.Client[0].portal_type = 'Contact'; }],
    ['bad UID', lab => { lab.Client[0].uid = 'not-a-uid'; }],
    ['missing modified', lab => { delete (lab.Client[0] as Partial<Row>).modified; }],
    ['impossible date', lab => { lab.Client[0].modified = '2026-02-30T00:00:00+00:00'; }],
    ['one UID under two types', lab => { lab.Contact[0].uid = lab.Client[0].uid; }],
  ];
  for (const [name, mutate] of cases) {
    const lab = syntheticLab();
    mutate(lab);
    const result = await createSenaiteInventoryReader(env, senaite(lab).fetchImpl).read();
    assert.equal(result.status, 'error', name);
    assert.equal((result as { code: string }).code, 'invalid-response', name);
  }
});

test('bad queries and configuration send no request', async () => {
  let requests = 0;
  const counting: typeof fetch = async () => { requests++; return Response.json({}); };
  for (const query of [[], ['AnalysisRequest', 'AnalysisRequest'], ['Batch'], ['../users']]) {
    assert.deepEqual(await createSenaiteInventoryReader(env, counting).read(query), { status: 'error', code: 'invalid-query' });
  }
  for (const bad of [
    {}, { ...env, SENAITE_BASE_URL: 'http://senaite.test.invalid/senaite' },
    { ...env, SENAITE_BASE_URL: 'https://u:p@senaite.test.invalid/senaite' }, { ...env, SENAITE_API_TOKEN: 'a b' },
  ]) {
    const reader = createSenaiteInventoryReader(bad, counting);
    assert.equal(reader.enabled, false);
    assert.deepEqual(await reader.read(), { status: 'not_configured' });
  }
  assert.equal(requests, 0);
});

test('transport failures return fixed codes without upstream detail', async () => {
  const failing: typeof fetch = async () => { throw new Error('connect ECONNREFUSED secret-host read-token'); };
  assert.deepEqual(await createSenaiteInventoryReader(env, failing).read(), { status: 'error', code: 'request-failed' });
  const status500: typeof fetch = async () => new Response('boom', { status: 500 });
  assert.deepEqual(await createSenaiteInventoryReader(env, status500).read(), { status: 'error', code: 'request-failed' });
  const notJson: typeof fetch = async () => new Response('<html>', { status: 200 });
  assert.deepEqual(await createSenaiteInventoryReader(env, notJson).read(), { status: 'error', code: 'invalid-response' });
});

test('modification times compare by instant, not by how the server wrote them', () => {
  assert.equal(normalizeSenaiteModified('2026-10-21T18:16:57+01:00'), '2026-10-21T17:16:57.000Z');
  assert.equal(normalizeSenaiteModified('2026-10-21T17:16:57Z'), '2026-10-21T17:16:57.000Z');
  assert.equal(normalizeSenaiteModified('2026-10-21T17:16:57.123456+00:00'), '2026-10-21T17:16:57.123Z');
  for (const bad of ['2026-10-21', '2026-10-21 17:16:57', '2026-13-01T00:00:00Z', '2026-02-29T00:00:00Z', 1, null]) {
    assert.equal(normalizeSenaiteModified(bad), null, String(bad));
  }
});

test('comparison fails closed on malformed, empty or tampered inventories', async () => {
  const good = await inventoryOf(syntheticLab());
  const emptyLab = Object.fromEntries(Object.keys(syntheticLab()).map(type => [type, []]));
  const empty = await inventoryOf(emptyLab);
  for (const [before, after] of [
    [good, null], [null, good], [good, empty], [empty, empty],
    [good, { ...good, counts: { ...good.counts, Analysis: 299 } }],
    [good, { ...good, portalTypes: [...good.portalTypes, 'Batch'], counts: { ...good.counts, Batch: 0 } }],
    [good, { ...good, counts: { ...good.counts, Instrument: 1 } }],
  ] as [unknown, unknown][]) {
    const result = compareSenaiteInventories(before, after);
    assert.equal(result.ok, false);
    assert.equal(result.differences[0].portalType, null);
  }

  // A narrower re-read is reported per missing type, never as a pass.
  const narrow = await createSenaiteInventoryReader(env, senaite(syntheticLab()).fetchImpl)
    .read(['AnalysisRequest', 'Analysis']);
  assert.equal(narrow.status, 'ok');
  const result = compareSenaiteInventories(good, (narrow as { inventory: SenaiteInventory }).inventory);
  assert.equal(result.ok, false);
  assert.deepEqual(result.differences.map(d => d.portalType),
    ['AnalysisCategory', 'AnalysisProfile', 'AnalysisService', 'Client', 'Contact', 'Instrument', 'LabContact', 'SampleType']);
  assert.deepEqual(result.differences.find(d => d.portalType === 'Instrument'),
    { portalType: 'Instrument', kind: 'missing', before: 0, after: null });
});
